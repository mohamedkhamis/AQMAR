// webui/stats/design-board.js — «اللوحة» / "The Board"
//
// Dense, scanned rather than read: a figure strip across the top, then one
// small-multiple card per brigade so the brigades can be compared directly,
// then the age distribution and the ranks.
//
// Every brigade sparkline is drawn over the SAME month span (stats-core fills
// empty months with zeros), so the cards really are comparable — a sparkline
// per card on its own local axis would not be.
(function (global) {
  "use strict";

  var CSS = [
    '.std-board .std-figs{display:grid;gap:1px;background:var(--divider);',
    '  grid-template-columns:repeat(auto-fit,minmax(148px,1fr));',
    '  border:1px solid var(--divider);border-radius:12px;overflow:hidden}',
    '.std-board .std-fig{background:var(--paper);padding:18px 16px}',
    '.std-board .std-fv{font-family:var(--font-display);font-weight:700;line-height:1.1;',
    '  font-size:var(--text-xl);color:var(--forest)}',
    '.std-board .std-fl{color:var(--muted);font-size:var(--text-sm);margin-top:6px}',
    '.std-board .std-fh{color:var(--faint);font-size:var(--text-xs);margin-top:2px}',
    '.std-board .std-sm{display:grid;gap:1px;background:var(--divider);',
    '  grid-template-columns:repeat(auto-fit,minmax(200px,1fr));',
    '  border:1px solid var(--divider);border-radius:12px;overflow:hidden}',
    '.std-board .std-smc{background:var(--paper);padding:16px}',
    '.std-board .std-smh{display:flex;justify-content:space-between;align-items:baseline;',
    '  gap:8px;font-size:var(--text-sm);color:var(--ink-2)}',
    '.std-board .std-smt{font-family:var(--font-display);font-weight:700;font-size:var(--text-lg)}',
    '.std-board .std-sec{margin-top:40px}'
  ].join('\n');

  function fig(value, label, hint) {
    return '<div class="std-fig"><div class="std-fv num">' + value + '</div>' +
      '<div class="std-fl">' + label + '</div>' +
      (hint ? '<div class="std-fh">' + hint + '</div>' : '') + '</div>';
  }

  function render(agg, lang) {
    var ar = lang !== 'en';
    if (!agg.months.length) return '';

    var h = '<div class="std-board">';

    h += '<div class="std-figs">' +
      fig(statsNum(agg.total, lang), ar ? 'شهيد موثّق' : 'recorded') +
      fig(statsNum(agg.brigades.length, lang), ar ? 'ألوية' : 'brigades') +
      fig(statsNum(agg.battalions.length, lang), ar ? 'كتيبة' : 'battalions') +
      (agg.medAge ? fig(statsNum(agg.medAge, lang), ar ? 'وسيط العمر' : 'median age',
                        ar ? 'عامًا' : 'years') : '') +
      (agg.topBirthYear
        ? fig(statsNum(agg.topBirthYear[0], lang),
              ar ? 'أكثر سنة ميلاد' : 'commonest birth year',
              statsNum(agg.topBirthYear[1], lang) + (ar ? ' شهيدًا' : '')) : '') +
      '</div>';

    if (agg.brigadeSeries.length) {
      h += '<section class="std-sec"><h3 class="st-title">' +
        (ar ? 'كل لواء على حدة' : 'Each brigade') + '</h3>' +
        '<p class="st-sub">' +
        (ar ? 'كل منحنى يغطي نفس المدى الزمني، فالمقارنة بين البطاقات مباشرة.'
            : 'Every sparkline spans the same months, so the cards compare directly.') +
        '</p><div class="std-sm">' + agg.brigadeSeries.map(function (d, i) {
          var c = STATS_SERIES[i % STATS_SERIES.length];
          return '<div class="std-smc st-hit st-drill" role="button" tabindex="0"' +
            ' data-t="' + esc(d.name) + '" data-v="' + statsNum(d.total, lang) + '"' +
            ' data-drill-dim="brigade" data-drill-val="' + esc(d.name) + '">' +
            '<div class="std-smh"><span>' + esc(d.name) +
            '</span><span class="std-smt num" style="color:' + c + '">' +
            statsNum(d.total, lang) + '</span></div>' + statsSpark(d.values, c) + '</div>';
        }).join('') + '</div>' +
        statsTable(ar ? 'عرض الأرقام كجدول' : 'Show the numbers as a table',
                   [ar ? 'اللواء' : 'Brigade', ar ? 'العدد' : 'Count'],
                   agg.brigades.map(function (b) { return [b[0], statsNum(b[1], lang)]; }),
                   'brigade', agg.brigades.map(function (b) { return b[0]; })) +
        '</section>';
    }

    if (agg.ages.length) {
      h += '<section class="std-sec"><h3 class="st-title">' +
        (ar ? 'الأعمار عند الاستشهاد' : 'Age at martyrdom') + '</h3>' +
        '<p class="st-sub">' + (agg.medAge
          ? (ar ? 'الوسيط ' + statsNum(agg.medAge, lang) + ' عامًا.'
                : 'Median ' + agg.medAge + ' years.') : '') + '</p>' +
        '<div class="st-card">' +
        statsHist(agg.ages, 'var(--forest)', lang,
                  { dim: 'age', suffix: ar ? ' عامًا' : ' yrs' }) +
        '</div></section>';
    }

    if (agg.birthYears.length) {
      h += '<section class="std-sec"><h3 class="st-title">' +
        (ar ? 'سنة الميلاد' : 'Year of birth') + '</h3>' +
        '<p class="st-sub">' +
        (ar ? statsNum(agg.withBirth, lang) + ' شهيدًا لهم تاريخ ميلاد مسجَّل، من ' +
              statsNum(agg.birthYears[0][0], lang) + ' إلى ' +
              statsNum(agg.birthYears[agg.birthYears.length - 1][0], lang) + '.'
            : agg.withBirth + ' with a recorded birth date, ' +
              agg.birthYears[0][0] + '–' + agg.birthYears[agg.birthYears.length - 1][0] + '.') +
        '</p><div class="st-card">' +
        statsHist(agg.birthYears, 'var(--stat-1)', lang,
                  { dim: 'birth-year', suffix: '',
                    label: ar ? 'توزيع سنوات الميلاد' : 'Birth year distribution' }) +
        '</div></section>';

      h += '<section class="std-sec"><h3 class="st-title">' +
        (ar ? 'حسب العقد' : 'By decade') + '</h3>' +
        '<div class="st-card">' +
        statsBars(statsDecades(agg, lang), function () { return 'var(--stat-1)'; },
                  lang, 'birth-decade') +
        '</div></section>';
    }

    if (agg.ranks.length) {
      h += '<section class="std-sec"><h3 class="st-title">' +
        (ar ? 'الرتب' : 'Ranks') + '</h3>' +
        '<div class="st-card">' +
        statsBars(agg.ranks.slice(0, 8), function () { return 'var(--stat-3)'; }, lang, 'rank') +
        '</div></section>';
    }

    return h + '</div>';
  }

  global.AQMAR_STATS_DESIGNS = global.AQMAR_STATS_DESIGNS || {};
  global.AQMAR_STATS_DESIGNS.board = { css: CSS, render: render };
})(window);
