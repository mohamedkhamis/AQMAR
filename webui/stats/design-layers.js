// webui/stats/design-layers.js — «الطبقات» / "The Layers"
//
// Composition and change together: a brigade × year grid shows, for every
// brigade, how its count moved year by year, with every bar on one shared
// scale — so the question it answers is "from where, and when?" rather than
// "how many?" alone. (The stacked area it replaced was unreadable on a
// phone; the user picked this form from a three-way preview on 2026-10-01.)
//
// Each row carries its own swatch, name and total, so there is no separate
// legend; the table keeps the month-by-month detail the yearly cells fold
// away. Identity is never carried by colour alone.
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
        (ar ? 'صفّ لكل لواء وخانة لكل سنة: الرقم، وشريط بمقياس واحد للشبكة كلها.'
            : 'A row per brigade and a cell per year: the count, and a bar on one scale shared by the whole grid.') +
        '</p><div class="st-card">' +
        statsBrigadeGrid(agg, lang) + '</div>' +
        '<p class="st-note">' +
        (ar ? 'السنة الأولى ناقصة: السجل يبدأ من أول منشور في القناة، لا من أول يناير.'
            : 'The first year is partial — the record starts at the channel’s first post.') +
        '</p>' +
        statsTable(ar ? 'الأرقام شهريًّا كجدول' : 'The monthly figures as a table',
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
