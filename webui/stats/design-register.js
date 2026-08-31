// webui/stats/design-register.js — «السجلّ» / "The Register"
//
// Editorial treatment, read top-to-bottom: one large figure opens the page,
// then a wide monthly curve, then ranked lists. The quietest of the three and
// the closest in tone to the rest of the memorial, which is why it is the
// default in src/settings_store.py.
//
// Registers on window.AQMAR_STATS_DESIGNS; stats-designs.js adapts it.
// Scoped CSS (.std-register) travels with the design — the same deliberate
// exception to "CSS lives in styles.css" that the lifeline designs make.
(function (global) {
  "use strict";

  var CSS = [
    '.std-register .std-hero{display:flex;align-items:baseline;gap:20px;flex-wrap:wrap;',
    '  padding:8px 0 30px;border-bottom:1px solid var(--divider)}',
    '.std-register .std-big{font-family:var(--font-display);font-weight:700;color:var(--forest);',
    '  font-size:clamp(3rem, 1.8rem + 6vw, 5.5rem);line-height:.95}',
    '.std-register .std-cap{color:var(--muted);max-width:36ch;font-size:var(--text-base)}',
    '.std-register .std-sec{margin-top:44px}'
  ].join('\n');

  function render(agg, lang) {
    var ar = lang !== 'en';
    if (!agg.months.length) return '';
    var first = statsMonthLabel(agg.months[0], lang);
    var last  = statsMonthLabel(agg.months[agg.months.length - 1], lang);

    var h = '<div class="std-register">';

    h += '<div class="std-hero"><div class="std-big num">' + statsNum(agg.total, lang) + '</div>' +
         '<div class="std-cap">' +
         (ar ? 'شهيدًا موثّقًا في السجل، من ' + first + ' إلى ' + last + '.'
             : 'martyrs recorded, from ' + first + ' to ' + last + '.') +
         '</div></div>';

    h += '<section class="std-sec"><h3 class="st-title">' +
         (ar ? 'الشهداء شهريًّا' : 'Martyrs per month') + '</h3>' +
         '<p class="st-sub">' +
         (ar ? 'من ' + first + ' إلى ' + last + '.' : first + ' – ' + last + '.') + '</p>' +
         '<div class="st-card">' +
         statsArea(agg.months, agg.monthly, 'var(--forest)', 230, lang, 'stg-reg') + '</div>' +
         statsTable(ar ? 'عرض الأرقام كجدول' : 'Show the numbers as a table',
                    [ar ? 'الشهر' : 'Month', ar ? 'العدد' : 'Count'],
                    agg.months.map(function (m, i) {
                      return [statsMonthLabel(m, lang), statsNum(agg.monthly[i], lang)];
                    }), 'month', agg.months) +
         '</section>';

    if (agg.brigades.length) {
      h += '<section class="std-sec"><h3 class="st-title">' +
           (ar ? 'حسب اللواء' : 'By brigade') + '</h3>' +
           '<p class="st-sub">' + statsNum(agg.brigades.length, lang) + ' ' +
           (ar ? 'ألوية' : 'brigades') + '</p>' +
           '<div class="st-card">' +
           statsBars(agg.brigades, function (i) { return STATS_SERIES[i % STATS_SERIES.length]; },
                     lang, 'brigade') +
           '</div></section>';
    }

    if (agg.birthYears.length) {
      h += '<section class="std-sec"><h3 class="st-title">' +
           (ar ? 'سنة الميلاد' : 'Year of birth') + '</h3>' +
           '<p class="st-sub">' +
           (ar ? 'من ' + statsNum(agg.birthYears[0][0], lang) + ' إلى ' +
                 statsNum(agg.birthYears[agg.birthYears.length - 1][0], lang) +
                 (agg.topBirthYear ? '، وأكثرها ' + statsNum(agg.topBirthYear[0], lang) : '') + '.'
               : agg.birthYears[0][0] + '–' + agg.birthYears[agg.birthYears.length - 1][0] +
                 (agg.topBirthYear ? ', commonest ' + agg.topBirthYear[0] : '') + '.') +
           '</p><div class="st-card">' +
           statsHist(agg.birthYears, 'var(--stat-1)', lang,
                     { dim: 'birth-year',
                       label: ar ? 'توزيع سنوات الميلاد' : 'Birth year distribution' }) +
           '</div>' +
           statsTable(ar ? 'عرض الأرقام كجدول' : 'Show the numbers as a table',
                      [ar ? 'السنة' : 'Year', ar ? 'العدد' : 'Count'],
                      agg.birthYears.map(function (e) {
                        return [statsNum(e[0], lang), statsNum(e[1], lang)];
                      }), 'birth-year', agg.birthYears.map(function (e) { return e[0]; })) +
           '</section>';

      h += '<section class="std-sec"><h3 class="st-title">' +
           (ar ? 'حسب العقد' : 'By decade') + '</h3>' +
           '<div class="st-card">' +
           statsBars(agg.birthDecades, function () { return 'var(--stat-1)'; },
                     lang, 'birth-decade') +
           '</div></section>';
    }

    if (agg.battalionsTop.length) {
      h += '<section class="std-sec"><h3 class="st-title">' +
           (ar ? 'أكبر الكتائب' : 'Largest battalions') + '</h3>' +
           '<p class="st-sub">' +
           (ar ? 'أعلى ' + statsNum(agg.battalionsTop.length, lang) + ' من أصل ' +
                 statsNum(agg.battalions.length, lang) + ' كتيبة'
               : 'Top ' + agg.battalionsTop.length + ' of ' + agg.battalions.length) +
           '</p><div class="st-card">' +
           statsBars(agg.battalionsTop, function () { return 'var(--olive)'; }, lang, 'battalion') +
           '</div></section>';
    }

    return h + '</div>';
  }

  global.AQMAR_STATS_DESIGNS = global.AQMAR_STATS_DESIGNS || {};
  global.AQMAR_STATS_DESIGNS.register = { css: CSS, render: render };
})(window);
