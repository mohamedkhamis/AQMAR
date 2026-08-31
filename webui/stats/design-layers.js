// webui/stats/design-layers.js — «الطبقات» / "The Layers"
//
// Composition and change together: a stacked area shows each brigade's share
// of every month, so the question it answers is "from where, and when?"
// rather than "how many?" alone.
//
// The stack is the one chart here with five series at once, so it ships a
// legend AND a table view — identity is never carried by colour alone.
(function (global) {
  "use strict";

  var CSS = [
    '.std-layers .std-sec{margin-top:40px}',
    '.std-layers .std-note{color:var(--faint);font-size:var(--text-xs);margin-top:10px}'
  ].join('\n');

  function render(agg, lang) {
    var ar = lang !== 'en';
    if (!agg.months.length) return '';
    var h = '<div class="std-layers">';

    if (agg.brigadeSeries.length) {
      h += '<section><h3 class="st-title">' +
        (ar ? 'التوزيع حسب اللواء عبر الزمن' : 'By brigade over time') + '</h3>' +
        '<p class="st-sub">' +
        (ar ? 'ارتفاع الشريط كاملًا هو مجموع الشهر، وكل طبقة نصيب لواء.'
            : 'Full height is the month total; each layer is one brigade.') +
        '</p><div class="st-card">' +
        statsStacked(agg.months, agg.brigadeSeries, 320, lang) +
        statsLegend(agg.brigadeSeries, lang) + '</div>' +
        statsTable(ar ? 'عرض الأرقام كجدول' : 'Show the numbers as a table',
          [ar ? 'الشهر' : 'Month'].concat(agg.brigadeSeries.map(function (d) { return d.name; })),
          agg.months.map(function (m, i) {
            return [statsMonthLabel(m, lang)].concat(agg.brigadeSeries.map(function (d) {
              return statsNum(d.values[i], lang);
            }));
          })) +
        '</section>';

      h += '<section class="std-sec"><h3 class="st-title">' +
        (ar ? 'المجموع لكل لواء' : 'Total per brigade') + '</h3>' +
        '<p class="st-sub">' + (ar ? 'بنفس ألوان الطبقات أعلاه.' : 'Same colours as the layers above.') + '</p>' +
        '<div class="st-card">' +
        statsBars(agg.brigades, function (i) { return STATS_SERIES[i % STATS_SERIES.length]; }, lang) +
        '</div></section>';
    }

    if (agg.years.length) {
      h += '<section class="std-sec"><h3 class="st-title">' +
        (ar ? 'المجموع لكل سنة' : 'Total per year') + '</h3>' +
        '<div class="st-card">' +
        statsBars(agg.years.map(function (y) { return [statsNum(y[0], lang), y[1]]; }),
                  function () { return 'var(--olive)'; }, lang) +
        '</div><p class="std-note">' +
        (ar ? 'السنة الأولى ناقصة: السجل يبدأ من أول منشور في القناة، لا من أول يناير.'
            : 'The first year is partial — the record starts at the channel’s first post.') +
        '</p></section>';
    }

    return h + '</div>';
  }

  global.AQMAR_STATS_DESIGNS = global.AQMAR_STATS_DESIGNS || {};
  global.AQMAR_STATS_DESIGNS.layers = { css: CSS, render: render };
})(window);
