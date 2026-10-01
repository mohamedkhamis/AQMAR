// webui/stats/design-layers.js — «الطبقات» / "The Layers"
//
// Composition and change together: a stacked area shows each brigade's share
// of every month, so the question it answers is "from where, and when?"
// rather than "how many?" alone.
//
// The stack is the one chart here with five series at once, so it ships a
// legend AND a table view — identity is never carried by colour alone. The
// legend also carries each brigade's total, which is why there is no second
// "total per brigade" list under it.
(function (global) {
  "use strict";

  var CSS = [
    '.std-layers .std-sec{margin-top:40px}'
  ].join('\n');

  function render(agg, lang) {
    var ar = lang !== 'en';
    if (!agg.months.length) return '';
    var h = '<div class="std-layers">';

    if (agg.brigadeSeries.length) {
      h += '<section><h3 class="st-title">' +
        (ar ? 'التوزيع حسب اللواء عبر الزمن' : 'By brigade over time') + '</h3>' +
        '<p class="st-sub">' +
        (ar ? 'ارتفاع الشريط كاملًا هو مجموع الشهر، وكل طبقة نصيب لواء؛ والصفّ أسفله مجموع كل سنة.'
            : 'Full height is the month total; each layer is one brigade; the row beneath totals each year.') +
        '</p><div class="st-card">' +
        statsStacked(agg.months, agg.brigadeSeries, 320, lang) +
        statsYearStrip(agg.years, lang) +
        statsLegend(agg.brigadeSeries, lang) + '</div>' +
        '<p class="st-note">' +
        (ar ? 'السنة الأولى ناقصة: السجل يبدأ من أول منشور في القناة، لا من أول يناير.'
            : 'The first year is partial — the record starts at the channel’s first post.') +
        '</p>' +
        statsTable(ar ? 'عرض الأرقام كجدول' : 'Show the numbers as a table',
          [ar ? 'الشهر' : 'Month'].concat(agg.brigadeSeries.map(function (d) { return d.name; })),
          agg.months.map(function (m, i) {
            return [statsMonthLabel(m, lang)].concat(agg.brigadeSeries.map(function (d) {
              return statsNum(d.values[i], lang);
            }));
          }), 'month', agg.months) +
        '</section>';
    }

    if (agg.birthYearsRanked.length) {
      h += '<section class="std-sec"><h3 class="st-title">' +
        (ar ? 'أكثر سنوات الميلاد' : 'Most common birth years') + '</h3>' +
        statsBirthYears(agg, lang, 10) +
        '</section>';
    }

    return h + '</div>';
  }

  global.AQMAR_STATS_DESIGNS = global.AQMAR_STATS_DESIGNS || {};
  global.AQMAR_STATS_DESIGNS.layers = { css: CSS, render: render };
})(window);
