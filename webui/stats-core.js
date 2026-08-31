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
// The five series colours are design tokens (--stat-1..--stat-5 in
// styles.css). That palette was validated with the data-viz colour checks
// against this site's dark-forest surface: every pair clears the
// colour-blind separation floor and the 3:1 contrast floor. Do not swap a
// hue for a prettier one without re-validating the set.
(function (global) {
  "use strict";

  var SERIES = ['var(--stat-1)', 'var(--stat-2)', 'var(--stat-3)',
                'var(--stat-4)', 'var(--stat-5)'];

  // Brigade spellings that OCR splits but which name the same brigade. The
  // canon pass fixes military_rank/battalion in the DB; brigade is not in
  // CANON_COLUMNS, so the fold happens here for display only.
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

    // Age at martyrdom, as a histogram of whole years.
    var ageCount = new Map();
    rows.forEach(function (r) {
      if (!r.birth || !r.martyrdom) return;
      var a = ageAtDeath(r.birth, r.martyrdom);
      if (a === null || a < 10 || a > 80) return;
      ageCount.set(a, (ageCount.get(a) || 0) + 1);
    });
    var ages = Array.from(ageCount.entries()).sort(function (a, b) { return a[0] - b[0]; });

    var flat = [];
    ages.forEach(function (a) { for (var i = 0; i < a[1]; i++) flat.push(a[0]); });
    var medAge = flat.length ? flat[Math.floor(flat.length / 2)] : null;

    var years = new Map();
    months.forEach(function (m, i) {
      var y = m.slice(0, 4);
      years.set(y, (years.get(y) || 0) + monthly[i]);
    });

    var peak = 0;
    monthly.forEach(function (v, i) { if (v > monthly[peak]) peak = i; });

    var battalions = countBy(rows, function (r) { return r.battalion; });
    return {
      total: rows.length,
      months: months, monthly: monthly,
      brigades: brigades, brigadeSeries: brigadeSeries,
      battalions: battalions, battalionsTop: battalions.slice(0, 14),
      ranks: countBy(rows, function (r) { return r.rank; }),
      ages: ages, medAge: medAge,
      years: Array.from(years.entries()),
      peakIndex: months.length ? peak : -1,
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

  // ---- SVG builders -------------------------------------------------------
  // All charts are hand-authored SVG on a fixed viewBox and scale with their
  // container. Hover targets are transparent full-height rects so the hit
  // area is far larger than the mark itself.

  function yAxis(P, W, ih, max, steps, lang) {
    var g = '';
    for (var i = 0; i <= steps; i++) {
      var v = Math.round(max * i / steps);
      var yy = P.t + ih - (v / max) * ih;
      g += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + yy.toFixed(1) +
           '" y2="' + yy.toFixed(1) + '"/>' +
           '<text x="' + (P.l - 8) + '" y="' + (yy + 4).toFixed(1) +
           '" text-anchor="end">' + nfmt(v, lang) + '</text>';
    }
    return g;
  }

  function yearTicks(months, x, h, lang) {
    var out = '';
    months.forEach(function (m, i) {
      if (m.slice(5) === '01' || i === 0) {
        out += '<text x="' + x(i).toFixed(1) + '" y="' + (h - 8) +
               '" text-anchor="middle">' + nfmt(m.slice(0, 4), lang) + '</text>';
      }
    });
    return out;
  }

  function statsArea(months, vals, color, h, lang, gid) {
    if (!months.length) return '';
    var W = 900, P = { t: 14, r: 8, b: 26, l: 42 };
    var iw = W - P.l - P.r, ih = h - P.t - P.b;
    var max = Math.max.apply(null, vals) || 1, n = vals.length;
    var x = function (i) { return P.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw); };
    var y = function (v) { return P.t + ih - (v / max) * ih; };
    var line = vals.map(function (v, i) {
      return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
    }).join(' ');
    var area = line + ' L' + x(n - 1).toFixed(1) + ' ' + (P.t + ih) +
               ' L' + x(0).toFixed(1) + ' ' + (P.t + ih) + ' Z';
    var hot = '';
    vals.forEach(function (v, i) {
      hot += '<rect class="st-hit" x="' + (x(i) - iw / n / 2).toFixed(1) + '" y="' + P.t +
             '" width="' + (iw / n).toFixed(1) + '" height="' + ih + '" fill="transparent"' +
             ' data-t="' + esc(statsMonthLabel(months[i], lang)) + '"' +
             ' data-v="' + esc(nfmt(v, lang)) + '"></rect>';
    });
    gid = gid || 'stg';
    return '<svg viewBox="0 0 ' + W + ' ' + h + '" role="img" aria-label="' +
      (lang === 'en' ? 'Martyrs per month' : 'الشهداء شهريًّا') + '">' +
      '<defs><linearGradient id="' + gid + '" x1="0" x2="0" y1="0" y2="1">' +
      '<stop offset="0" stop-color="' + color + '" stop-opacity=".38"/>' +
      '<stop offset="1" stop-color="' + color + '" stop-opacity=".02"/></linearGradient></defs>' +
      '<g class="st-grid st-axis">' + yAxis(P, W, ih, max, 4, lang) + '</g>' +
      '<g class="st-axis">' + yearTicks(months, x, h, lang) + '</g>' +
      '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
      '<path d="' + line + '" fill="none" stroke="' + color +
      '" stroke-width="2" stroke-linejoin="round"/><g>' + hot + '</g></svg>';
  }

  function statsStacked(months, series, h, lang) {
    if (!months.length) return '';
    var W = 900, P = { t: 14, r: 8, b: 26, l: 42 };
    var iw = W - P.l - P.r, ih = h - P.t - P.b, n = months.length;
    var totals = months.map(function (m, i) {
      return series.reduce(function (s, d) { return s + d.values[i]; }, 0);
    });
    var max = Math.max.apply(null, totals) || 1;
    var x = function (i) { return P.l + (i / (n - 1)) * iw; };
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
               '" fill-opacity=".82" stroke="var(--paper)" stroke-width="2"/>';
      acc = top;
    });
    var hot = '';
    months.forEach(function (m, i) {
      var parts = series.map(function (d) { return d.name + ' ' + nfmt(d.values[i], lang); }).join(' · ');
      hot += '<rect class="st-hit" x="' + (x(i) - iw / n / 2).toFixed(1) + '" y="' + P.t +
             '" width="' + (iw / n).toFixed(1) + '" height="' + ih + '" fill="transparent"' +
             ' data-t="' + esc(statsMonthLabel(m, lang)) + '"' +
             ' data-v="' + esc(nfmt(totals[i], lang) + ' — ' + parts) + '"></rect>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + h + '" role="img" aria-label="' +
      (lang === 'en' ? 'By brigade over time' : 'التوزيع حسب اللواء عبر الزمن') + '">' +
      '<g class="st-grid st-axis">' + yAxis(P, W, ih, max, 4, lang) + '</g>' +
      '<g class="st-axis">' + yearTicks(months, x, h, lang) + '</g>' +
      paths + '<g>' + hot + '</g></svg>';
  }

  function statsBars(items, colorFn, lang) {
    if (!items.length) return '';
    var max = Math.max.apply(null, items.map(function (i) { return i[1]; })) || 1;
    return '<div class="st-rank">' + items.map(function (it, i) {
      return '<div><div class="st-row"><div class="st-lbl">' + esc(it[0]) + '</div>' +
        '<div class="st-val num">' + nfmt(it[1], lang) + '</div></div>' +
        '<div class="st-track"><div class="st-bar st-hit" style="width:' +
        (it[1] / max * 100).toFixed(1) + '%;background:' + colorFn(i) + '"' +
        ' data-t="' + esc(it[0]) + '" data-v="' + esc(nfmt(it[1], lang)) + '"></div></div></div>';
    }).join('') + '</div>';
  }

  function statsSpark(vals, color) {
    if (!vals.length) return '';
    var W = 200, H = 42, max = Math.max.apply(null, vals) || 1, n = vals.length;
    var x = function (i) { return (i / (n - 1)) * W; };
    var y = function (v) { return H - 2 - (v / max) * (H - 6); };
    var line = vals.map(function (v, i) {
      return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
    }).join(' ');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true" class="st-spark">' +
      '<path d="' + line + ' L' + W + ' ' + H + ' L0 ' + H + ' Z" fill="' + color + '" fill-opacity=".14"/>' +
      '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2"/></svg>';
  }

  function statsHist(ages, color, lang) {
    if (!ages.length) return '';
    var W = 900, H = 200, P = { t: 12, r: 8, b: 28, l: 42 };
    var iw = W - P.l - P.r, ih = H - P.t - P.b;
    var max = Math.max.apply(null, ages.map(function (a) { return a[1]; })) || 1;
    var bw = iw / ages.length, bars = '', xl = '';
    ages.forEach(function (a, i) {
      var bh = (a[1] / max) * ih, bx = P.l + i * bw, by = P.t + ih - bh;
      bars += '<rect class="st-hit" x="' + (bx + 1).toFixed(1) + '" y="' + by.toFixed(1) +
              '" width="' + Math.max(1, bw - 2).toFixed(1) + '" height="' + bh.toFixed(1) +
              '" rx="3" fill="' + color + '" fill-opacity=".8"' +
              ' data-t="' + esc(nfmt(a[0], lang) + (lang === 'en' ? ' yrs' : ' عامًا')) + '"' +
              ' data-v="' + esc(nfmt(a[1], lang)) + '"></rect>';
      if (a[0] % 10 === 0) {
        xl += '<text x="' + (bx + bw / 2).toFixed(1) + '" y="' + (H - 8) +
              '" text-anchor="middle">' + nfmt(a[0], lang) + '</text>';
      }
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      (lang === 'en' ? 'Age distribution' : 'توزيع الأعمار') + '">' +
      '<g class="st-grid st-axis">' + yAxis(P, W, ih, max, 3, lang) + '</g>' +
      '<g class="st-axis">' + xl + '</g>' + bars + '</svg>';
  }

  // Every chart ships a table view: identity must never be colour-alone, and
  // a screen-reader user needs the numbers.
  function statsTable(caption, head, rows) {
    return '<details class="st-table"><summary>' + esc(caption) + '</summary>' +
      '<div class="st-tw"><table><thead><tr>' +
      head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr>' + r.map(function (c, i) {
          return '<td' + (i ? ' class="num"' : '') + '>' + esc(c) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div></details>';
  }

  function statsLegend(series, lang) {
    return '<div class="st-legend">' + series.map(function (d, i) {
      return '<span class="st-lg"><i class="st-sw" style="background:' +
        SERIES[i % SERIES.length] + '"></i>' + esc(d.name) +
        ' <b class="num">' + nfmt(d.total, lang) + '</b></span>';
    }).join('') + '</div>';
  }

  global.STATS_SERIES     = SERIES;
  global.aggregateStats   = aggregateStats;
  global.statsMonthLabel  = statsMonthLabel;
  global.statsNum         = nfmt;
  global.statsArea        = statsArea;
  global.statsStacked     = statsStacked;
  global.statsBars        = statsBars;
  global.statsSpark       = statsSpark;
  global.statsHist        = statsHist;
  global.statsTable       = statsTable;
  global.statsLegend      = statsLegend;
})(window);
