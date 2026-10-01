// webui/stats-core.js
//
// Pure aggregation + SVG chart builders for the statistics page. Same IIFE
// module pattern as filter-logic.js / data-loader.js, and like those it
// exposes its helpers as bare globals so the design modules in webui/stats/
// can call them without any Alpine context.
//
// Everything here is computed CLIENT-SIDE from the rows the SPA already
// loaded, so the statistics work identically on the live admin API and on the
// published data/martyrs.json snapshot (GitHub Pages / Cloudflare Pages).
//
// Every clickable mark carries data-drill-dim + data-drill-val. app.js has a
// single delegated click handler that turns those into the ordinary registry
// filters, so a chart click lands the visitor in the same grid they would
// have reached by setting the filters by hand - no parallel result list.
//
// The five series colours are design tokens (--stat-1..--stat-5 in
// styles.css). That palette was validated with the data-viz colour checks
// against this site's dark-forest surface: every pair clears the
// colour-blind separation floor and the 3:1 contrast floor. Do not swap a
// hue for a prettier one without re-validating the set.
//
// The time charts carry NO grid and NO axis (removed 2026-10-01). The axis
// labels were the one thing that forced a 560px minimum width on phones -
// a 900-unit viewBox squeezed into 375px rendered them at 3px - and the
// scrolling card that worked around it hid the start of every chart. The
// curves now scale to their card; the hover readout and the table view carry
// the exact figures, and statsYearStrip() beneath a chart is its time anchor.
(function (global) {
  "use strict";

  var SERIES = ['var(--stat-1)', 'var(--stat-2)', 'var(--stat-3)',
                'var(--stat-4)', 'var(--stat-5)'];

  // Brigade spellings that OCR splits but which name the same brigade. The
  // nightly canon pass merges them in the DB too; this is the display-time
  // safety net for rows scraped since the last pass.
  var BRIGADE_FOLD = { 'لواء خان يونس': 'لواء خانيونس' };

  function fold(name) { return BRIGADE_FOLD[name] || name; }
  function clean(v) { return (v || '').trim(); }

  function countBy(rows, pick) {
    var m = new Map();
    rows.forEach(function (r) {
      var k = clean(pick(r));
      if (k) m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m.entries()).sort(function (a, b) {
      return b[1] - a[1] || a[0].localeCompare(b[0], 'ar');
    });
  }

  // Every month between the first and last martyrdom date, so a month with
  // no entries is a real zero on the axis rather than a missing point.
  function monthSpan(first, last) {
    var out = [];
    var y = +first.slice(0, 4), m = +first.slice(5, 7);
    var ly = +last.slice(0, 4), lm = +last.slice(5, 7);
    while (y < ly || (y === ly && m <= lm)) {
      out.push(y + '-' + (m < 10 ? '0' + m : m));
      m++; if (m > 12) { m = 1; y++; }
    }
    return out;
  }

  function aggregateStats(rows) {
    rows = (rows || []).filter(Boolean);
    var dated = rows.filter(function (r) { return /^\d{4}-\d{2}/.test(r.martyrdom || ''); });
    var keys = dated.map(function (r) { return r.martyrdom.slice(0, 7); }).sort();

    var months = keys.length ? monthSpan(keys[0], keys[keys.length - 1]) : [];
    var idx = new Map(months.map(function (m, i) { return [m, i]; }));
    var monthly = months.map(function () { return 0; });
    dated.forEach(function (r) {
      var i = idx.get(r.martyrdom.slice(0, 7));
      if (i !== undefined) monthly[i]++;
    });

    var brigades = countBy(rows, function (r) { return fold(r.brigade); });
    var byBrigMonth = new Map();
    dated.forEach(function (r) {
      var b = fold(clean(r.brigade));
      if (!b) return;
      if (!byBrigMonth.has(b)) byBrigMonth.set(b, months.map(function () { return 0; }));
      var i = idx.get(r.martyrdom.slice(0, 7));
      if (i !== undefined) byBrigMonth.get(b)[i]++;
    });
    var brigadeSeries = brigades.map(function (b) {
      return { name: b[0], total: b[1],
               values: byBrigMonth.get(b[0]) || months.map(function () { return 0; }) };
    });

    // Age at martyrdom in five-year bands (20-24, 25-29, ...) plus the median.
    // One bar per whole year was unreadable on a phone and, with no axis,
    // meaningless; a band is a figure a reader can hold. [lo, count] - the
    // band is lo..lo+4 and the renderer labels it.
    var bandCount = new Map(), allAges = [];
    rows.forEach(function (r) {
      if (!r.birth || !r.martyrdom) return;
      var a = ageAtDeath(r.birth, r.martyrdom);
      if (a === null || a < 10 || a > 80) return;
      allAges.push(a);
      var lo = Math.floor(a / 5) * 5;
      bandCount.set(lo, (bandCount.get(lo) || 0) + 1);
    });
    var ageBands = Array.from(bandCount.entries()).sort(function (a, b) { return a[0] - b[0]; });
    allAges.sort(function (a, b) { return a - b; });
    var medAge = allAges.length ? allAges[Math.floor(allAges.length / 2)] : null;

    // [year, count, months-in-span] in time order. The third element is how
    // many charted months fall in that year, so statsYearStrip() can give each
    // year its true share of the time axis - the first and last years are
    // partial, and a cell that is visibly shorter says so.
    var yearMap = new Map();
    months.forEach(function (m, i) {
      var y = m.slice(0, 4);
      var e = yearMap.get(y) || [y, 0, 0];
      e[1] += monthly[i]; e[2]++;
      yearMap.set(y, e);
    });
    var years = Array.from(yearMap.values());

    // Birth year: ascending for the span, and ranked - most common first,
    // older year first on a tie - for the "most common birth years" list.
    // Rows with no birth date are simply absent; they are not a zero year.
    var byYear = new Map();
    rows.forEach(function (r) {
      var y = parseInt(String(r.birth || '').slice(0, 4), 10);
      if (!y || y < 1900 || y > 2100) return;
      byYear.set(y, (byYear.get(y) || 0) + 1);
    });
    var birthYears = Array.from(byYear.entries()).sort(function (a, b) { return a[0] - b[0]; });
    var birthYearsRanked = birthYears.slice().sort(function (a, b) {
      return b[1] - a[1] || a[0] - b[0];
    });

    var battalions = countBy(rows, function (r) { return r.battalion; });
    return {
      birthYears: birthYears,
      birthYearsRanked: birthYearsRanked,
      withBirth: birthYears.reduce(function (n, e) { return n + e[1]; }, 0),
      total: rows.length,
      months: months, monthly: monthly,
      brigades: brigades, brigadeSeries: brigadeSeries,
      battalions: battalions, battalionsTop: battalions.slice(0, 14),
      ranks: countBy(rows, function (r) { return r.rank; }),
      ageBands: ageBands, medAge: medAge,
      years: years,
    };
  }

  function ageAtDeath(birth, death) {
    var b = new Date(birth), d = new Date(death);
    if (isNaN(b) || isNaN(d)) return null;
    var a = d.getFullYear() - b.getFullYear();
    var mm = d.getMonth() - b.getMonth();
    if (mm < 0 || (mm === 0 && d.getDate() < b.getDate())) a--;
    return a;
  }

  var AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                   'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  var EN_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun',
                   'Jul','Aug','Sep','Oct','Nov','Dec'];

  function statsMonthLabel(ym, lang) {
    var y = ym.slice(0, 4), m = +ym.slice(5, 7) - 1;
    return lang === 'en' ? EN_MONTHS[m] + ' ' + y
                         : AR_MONTHS[m] + ' ' + toArDigits(y);
  }
  function nfmt(n, lang) { return lang === 'en' ? String(n) : toArDigits(n); }

  // "٩٠ شهيدًا" / "90 martyrs". Arabic counts inflect the noun: 1 and 2 are
  // their own words, 3-10 take the plural, 11-99 the accusative singular,
  // and a round hundred the bare singular. The remainder mod 100 decides,
  // which is exact for everything this register will ever count.
  function statsCount(n, lang) {
    if (lang === 'en') return n + (n === 1 ? ' martyr' : ' martyrs');
    if (n === 1) return 'شهيد واحد';
    if (n === 2) return 'شهيدان';
    var r = n % 100;
    var word = (r >= 3 && r <= 10) ? 'شهداء' : (r === 0 ? 'شهيد' : 'شهيدًا');
    return toArDigits(n) + ' ' + word;
  }

  // ---- SVG builders -------------------------------------------------------
  // The time charts are hand-authored SVG on a fixed 900-unit-wide viewBox
  // with preserveAspectRatio="none", so CSS can give them a height that suits
  // the screen (styles.css does, under 640px) while the width follows the
  // card. Strokes are non-scaling so that stretch never thickens a line.
  // Hover targets are transparent full-height rects, so the hit area is far
  // larger than the mark itself.

  function statsArea(months, vals, color, h, lang, gid) {
    if (!months.length) return '';
    var W = 900, P = { t: 3, b: 3 };
    var ih = h - P.t - P.b, n = vals.length;
    var max = Math.max.apply(null, vals) || 1;
    var x = function (i) { return n === 1 ? W / 2 : (i / (n - 1)) * W; };
    var y = function (v) { return P.t + ih - (v / max) * ih; };
    var line = vals.map(function (v, i) {
      return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
    }).join(' ');
    var area = line + ' L' + x(n - 1).toFixed(1) + ' ' + (P.t + ih) +
               ' L' + x(0).toFixed(1) + ' ' + (P.t + ih) + ' Z';
    // Each month's hit area reaches halfway to its neighbours, clamped to the
    // viewBox so the first and last never poke outside the card.
    var hw = W / Math.max(1, n - 1), hot = '';
    vals.forEach(function (v, i) {
      if (!v) return;   // an empty month has nothing to drill into
      var x0 = Math.max(0, x(i) - hw / 2), x1 = Math.min(W, x(i) + hw / 2);
      hot += '<rect class="st-hit st-drill" x="' + x0.toFixed(1) + '" y="0" width="' +
             (x1 - x0).toFixed(1) + '" height="' + h + '" fill="transparent"' +
             ' data-t="' + esc(statsMonthLabel(months[i], lang)) + '"' +
             ' data-v="' + esc(nfmt(v, lang)) + '"' +
             ' data-drill-dim="month" data-drill-val="' + months[i] + '"></rect>';
    });
    gid = gid || 'stg';
    return '<svg class="st-area" viewBox="0 0 ' + W + ' ' + h + '" preserveAspectRatio="none"' +
      ' role="img" aria-label="' + (lang === 'en' ? 'Martyrs per month' : 'الشهداء شهريًّا') + '">' +
      '<defs><linearGradient id="' + gid + '" x1="0" x2="0" y1="0" y2="1">' +
      '<stop offset="0" stop-color="' + color + '" stop-opacity=".38"/>' +
      '<stop offset="1" stop-color="' + color + '" stop-opacity=".02"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
      '<path d="' + line + '" fill="none" stroke="' + color +
      '" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
      '<g>' + hot + '</g></svg>';
  }

  function statsStacked(months, series, h, lang) {
    if (!months.length) return '';
    var W = 900, P = { t: 3, b: 3 };
    var ih = h - P.t - P.b, n = months.length;
    var totals = months.map(function (m, i) {
      return series.reduce(function (s, d) { return s + d.values[i]; }, 0);
    });
    var max = Math.max.apply(null, totals) || 1;
    var x = function (i) { return n === 1 ? W / 2 : (i / (n - 1)) * W; };
    var y = function (v) { return P.t + ih - (v / max) * ih; };
    var acc = months.map(function () { return 0; }), paths = '';
    series.forEach(function (d, si) {
      var top = d.values.map(function (v, i) { return acc[i] + v; });
      var up = top.map(function (v, i) {
        return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
      }).join(' ');
      var dn = '';
      for (var i = n - 1; i >= 0; i--) dn += 'L' + x(i).toFixed(1) + ' ' + y(acc[i]).toFixed(1) + ' ';
      // A 2px surface-coloured stroke is the gap between stacked segments.
      paths += '<path d="' + up + ' ' + dn + 'Z" fill="' + SERIES[si % SERIES.length] +
               '" fill-opacity=".82" stroke="var(--paper)" stroke-width="2"' +
               ' vector-effect="non-scaling-stroke"/>';
      acc = top;
    });
    // One hit area per (brigade, month) segment rather than one per month, so
    // clicking a layer drills into that brigade in that month. Segments below
    // ~6px get a 6px tall target centred on the band - otherwise the thin
    // layers in quiet months are unclickable.
    var hw = W / Math.max(1, n - 1), hot = '', base = months.map(function () { return 0; });
    series.forEach(function (d, si) {
      d.values.forEach(function (v, i) {
        var lo = base[i], hi = base[i] + v;
        base[i] = hi;
        if (!v) return;
        var yTop = y(hi), yBot = y(lo), hgt = Math.max(6, yBot - yTop);
        var yy = (yBot - yTop) >= 6 ? yTop : (yTop + yBot) / 2 - 3;
        var x0 = Math.max(0, x(i) - hw / 2), x1 = Math.min(W, x(i) + hw / 2);
        hot += '<rect class="st-hit st-drill" x="' + x0.toFixed(1) +
               '" y="' + yy.toFixed(1) + '" width="' + (x1 - x0).toFixed(1) +
               '" height="' + hgt.toFixed(1) + '" fill="transparent"' +
               ' data-t="' + esc(d.name + ' — ' + statsMonthLabel(months[i], lang)) + '"' +
               ' data-v="' + esc(nfmt(v, lang) + ' / ' + nfmt(totals[i], lang)) + '"' +
               ' data-drill-dim="brigade-month" data-drill-val="' +
               esc(d.name + '|' + months[i]) + '"></rect>';
      });
    });
    return '<svg class="st-stack" viewBox="0 0 ' + W + ' ' + h + '" preserveAspectRatio="none"' +
      ' role="img" aria-label="' +
      (lang === 'en' ? 'By brigade over time' : 'التوزيع حسب اللواء عبر الزمن') + '">' +
      paths + '<g>' + hot + '</g></svg>';
  }

  // Row of year cells beneath a time chart. Each cell is as wide as that
  // year's share of the charted months, so it sits under the stretch of curve
  // it totals - and a partial first or last year is visibly shorter. LTR like
  // the chart itself: time runs left to right in both. Every cell drills into
  // its year. `years` is agg.years: [year, count, months-in-span].
  function statsYearStrip(years, lang) {
    if (!years || !years.length) return '';
    return '<div class="st-years" dir="ltr">' + years.map(function (y) {
      return '<div class="st-year st-hit st-drill" role="button" tabindex="0"' +
        ' style="flex:' + y[2] + ' 1 0"' +
        ' data-t="' + esc(nfmt(y[0], lang)) + '" data-v="' + esc(nfmt(y[1], lang)) + '"' +
        ' data-drill-dim="year" data-drill-val="' + esc(y[0]) + '">' +
        '<span class="st-year-y num">' + nfmt(y[0], lang) + '</span>' +
        '<span class="st-year-n num">' + nfmt(y[1], lang) + '</span></div>';
    }).join('') + '</div>';
  }

  // `dim` is the drill dimension these bars represent ('brigade', 'battalion',
  // 'rank', 'age'); pass null for a non-drillable list. Each bar is a real
  // button so the keyboard reaches it - there are few enough of them for that
  // to be reasonable, unlike the dense month marks.
  function statsBars(items, colorFn, lang, dim) {
    if (!items.length) return '';
    var max = Math.max.apply(null, items.map(function (i) { return i[1]; })) || 1;
    return '<div class="st-rank">' + items.map(function (it, i) {
      var drill = dim
        ? ' data-drill-dim="' + dim + '" data-drill-val="' + esc(it[2] != null ? it[2] : it[0]) + '"' +
          ' role="button" tabindex="0"'
        : '';
      return '<div><div class="st-row"><div class="st-lbl">' + esc(it[0]) + '</div>' +
        '<div class="st-val num">' + nfmt(it[1], lang) + '</div></div>' +
        '<div class="st-track"><div class="st-bar st-hit' + (dim ? ' st-drill' : '') +
        '" style="width:' + (it[1] / max * 100).toFixed(1) + '%;background:' + colorFn(i) + '"' +
        ' data-t="' + esc(it[0]) + '" data-v="' + esc(nfmt(it[1], lang)) + '"' +
        drill + '></div></div></div>';
    }).join('') + '</div>';
  }

  // A numbered ranking: "١ · ١٩٩٣ · ▇▇▇▇ · ٩٠ شهيدًا". Items are [label, count,
  // drillVal], already in rank order. An <ol> because the order IS the
  // statistic; the whole row is the hit target so the number, the label and
  // the bar all drill the same way.
  function statsRanked(items, color, lang, dim) {
    if (!items.length) return '';
    var max = Math.max.apply(null, items.map(function (i) { return i[1]; })) || 1;
    return '<ol class="st-ranked">' + items.map(function (it, i) {
      var count = statsCount(it[1], lang);
      var drill = dim
        ? ' role="button" tabindex="0" data-drill-dim="' + dim +
          '" data-drill-val="' + esc(it[2] != null ? it[2] : it[0]) + '"'
        : '';
      return '<li><div class="st-rk st-hit' + (dim ? ' st-drill' : '') + '"' +
        ' data-t="' + esc(it[0]) + '" data-v="' + esc(count) + '"' + drill + '>' +
        '<span class="st-rk-n num">' + nfmt(i + 1, lang) + '</span>' +
        '<span class="st-rk-l num">' + esc(it[0]) + '</span>' +
        '<span class="st-rk-track"><span class="st-rk-bar" style="width:' +
        (it[1] / max * 100).toFixed(1) + '%;background:' + color + '"></span></span>' +
        '<span class="st-rk-v">' + esc(count) + '</span></div></li>';
    }).join('') + '</ol>';
  }

  // The "most common birth years" block every design shows: the top `n` as a
  // numbered list, then a table view that carries EVERY year in rank order so
  // the sequence continues past the cut. Returns the subtitle, the card and
  // the table; the design supplies the <section> and its heading.
  function statsBirthYears(agg, lang, n) {
    var ar = lang !== 'en';
    var ranked = agg.birthYearsRanked || [];
    if (!ranked.length) return '';
    var first = agg.birthYears[0][0], last = agg.birthYears[agg.birthYears.length - 1][0];
    var top = ranked.slice(0, n || 10).map(function (e) {
      return [nfmt(e[0], lang), e[1], e[0]];
    });
    return '<p class="st-sub">' +
      (ar ? statsCount(agg.withBirth, lang) + ' لهم تاريخ ميلاد مسجَّل، من ' +
            nfmt(first, lang) + ' إلى ' + nfmt(last, lang) + '. الأكثر أولًا.'
          : statsCount(agg.withBirth, lang) + ' with a recorded birth date, ' +
            first + '–' + last + '. Most common first.') + '</p>' +
      '<div class="st-card">' + statsRanked(top, 'var(--stat-1)', lang, 'birth-year') + '</div>' +
      statsTable(ar ? 'كل السنوات بالترتيب' : 'Every year, in order',
                 ['#', ar ? 'السنة' : 'Year', ar ? 'العدد' : 'Count'],
                 ranked.map(function (e, i) {
                   return [nfmt(i + 1, lang), nfmt(e[0], lang), nfmt(e[1], lang)];
                 }), 'birth-year', ranked.map(function (e) { return e[0]; }));
  }

  function statsSpark(vals, color) {
    if (!vals.length) return '';
    var W = 200, H = 42, max = Math.max.apply(null, vals) || 1, n = vals.length;
    var x = function (i) { return n === 1 ? W / 2 : (i / (n - 1)) * W; };
    var y = function (v) { return H - 2 - (v / max) * (H - 6); };
    var line = vals.map(function (v, i) {
      return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
    }).join(' ');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true" class="st-spark">' +
      '<path d="' + line + ' L' + W + ' ' + H + ' L0 ' + H + ' Z" fill="' + color + '" fill-opacity=".14"/>' +
      '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2"' +
      ' vector-effect="non-scaling-stroke"/></svg>';
  }

  // Every chart ships a table view: identity must never be colour-alone, and
  // a screen-reader user needs the numbers.
  // `dim` + a per-row raw value make the table the accessible equivalent of a
  // dense chart: the month marks are mouse-only, but every month is a
  // focusable row here. Pass rows as [label, ...cells] and vals aligned to them.
  function statsTable(caption, head, rows, dim, vals) {
    return '<details class="st-table"><summary>' + esc(caption) + '</summary>' +
      '<div class="st-tw"><table><thead><tr>' +
      head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r, ri) {
        var v = (dim && vals && vals[ri] != null) ? vals[ri] : null;
        var attrs = v != null
          ? ' class="st-drill st-hit" role="button" tabindex="0"' +
            ' data-drill-dim="' + dim + '" data-drill-val="' + esc(v) + '"'
          : '';
        return '<tr' + attrs + '>' + r.map(function (c, i) {
          return '<td' + (i ? ' class="num"' : '') + '>' + esc(c) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div></details>';
  }

  function statsLegend(series, lang) {
    return '<div class="st-legend">' + series.map(function (d, i) {
      return '<span class="st-lg st-hit st-drill" role="button" tabindex="0"' +
        ' data-t="' + esc(d.name) + '" data-v="' + esc(nfmt(d.total, lang)) + '"' +
        ' data-drill-dim="brigade" data-drill-val="' + esc(d.name) + '">' +
        '<i class="st-sw" style="background:' + SERIES[i % SERIES.length] + '"></i>' +
        esc(d.name) + ' <b class="num">' + nfmt(d.total, lang) + '</b></span>';
    }).join('') + '</div>';
  }

  // Exported so the registry filter can fold the same way the charts do -
  // otherwise clicking a brigade bar showing 369 would list only 365 rows.
  global.foldBrigadeName  = function (n) { return fold(clean(n)); };
  global.STATS_SERIES     = SERIES;
  global.aggregateStats   = aggregateStats;
  global.statsMonthLabel  = statsMonthLabel;
  global.statsNum         = nfmt;
  global.statsCount       = statsCount;
  global.statsArea        = statsArea;
  global.statsStacked     = statsStacked;
  global.statsYearStrip   = statsYearStrip;
  global.statsBars        = statsBars;
  global.statsRanked      = statsRanked;
  global.statsBirthYears  = statsBirthYears;
  global.statsSpark       = statsSpark;
  global.statsTable       = statsTable;
  global.statsLegend      = statsLegend;
})(window);
