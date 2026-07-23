/* ============================================================================
   AQMAR lifespan line — Direction C: "محور العمر" / Age axis with lollipop lanes
   ----------------------------------------------------------------------------
   Two changes from the current renderTimeline():

   1) The axis is an AGE axis, not a date axis. It runs 0 → age-at-martyrdom and
      always fills the plot width (today's axis runs birth→today, so a 2023
      martyrdom wastes a 3-year tail and every person gets a different scale).
      A secondary calendar year sits under each age tick so the calendar stays
      recoverable.

   2) Every event owns one horizontal lane. Name + age live in a fixed label
      gutter; the plot cell holds a lollipop — a bar from age 0 to the event and
      a dot at its true x — plus a faint stem climbing back to the axis dot.
      One event per lane ⇒ labels CANNOT collide, and no label is ever moved
      away from the date it names: the name never encodes position at all, and
      the date chip is anchored to its own dot.

   Every event is a POINT. No duration bands (all 18 events have end_date:null,
   which is what produced the stacked-gold-slab bug).

   Height grows linearly with event count — the accepted trade.
   ========================================================================== */

window.VARIANTS = window.VARIANTS || {};

(function (global) {
  'use strict';

  var KEY = 'c';
  var DAY = 86400000;

  // Fail closed: if the harness helper is missing we emit nothing rather than
  // raw admin-authored text.
  function E(s) {
    return typeof esc === 'function' ? esc(s) : '';
  }
  function D(iso, lang) {
    return typeof fmtDate === 'function' ? fmtDate(iso, lang) : String(iso || '');
  }
  function tMs(iso) {
    if (!iso) return NaN;
    return new Date(String(iso).slice(0, 10) + 'T00:00:00').getTime();
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // Digit policy for this variant (deliberate, documented):
  //   prose numbers (ages, counts)  → Arabic-Indic via the harness toArDigits
  //   calendar numbers (years, full dates) → Latin + tabular-nums, matching the
  //   existing .mk-year / .ev-row .d idiom in styles.css.
  function num(n, ar) {
    if (ar && typeof toArDigits === 'function') return toArDigits(n);
    return String(n);
  }

  // Proper Arabic number agreement — this is a memorial, "١ عاماً" is wrong.
  function ageLabel(n, ar) {
    if (n == null || !isFinite(n)) return '';
    if (!ar) return n === 0 ? 'under 1' : 'age ' + n;
    if (n === 0) return 'أقلّ من عام';
    if (n === 1) return 'عام واحد';
    if (n === 2) return 'عامان';
    if (n <= 10) return num(n, true) + ' أعوام';
    return num(n, true) + ' عاماً';
  }
  function eventCount(n, ar) {
    if (!ar) return n === 1 ? '1 world event' : n + ' world events';
    if (n === 1) return 'حدث واحد';
    if (n === 2) return 'حدثان';
    if (n <= 10) return num(n, true) + ' أحداث';
    return num(n, true) + ' حدثاً';
  }
  function eventName(e, lang) {
    if (!e) return '';
    if (lang === 'en' && typeof e.name_en === 'string' && e.name_en.trim()) return e.name_en;
    return e.name_ar || '';
  }

  // ---- shared context ------------------------------------------------------
  function ctxFor(person, events, lang) {
    if (!person) return null;
    var ar = lang === 'ar';
    var t0 = tMs(person.birth);
    var tM = tMs(person.martyrdom);
    if (!isFinite(t0) || !isFinite(tM) || tM <= t0) return null;
    var span = tM - t0;
    var evs = (typeof eventsForPerson === 'function')
      ? eventsForPerson(events || [], person.birth, person.martyrdom)
      : [];
    var age = (typeof computeAge === 'function')
      ? computeAge(person.birth, person.martyrdom)
      : Math.floor(span / DAY / 365.2425);
    return {
      ar: ar, lang: lang, person: person, evs: evs, age: age,
      t0: t0, tM: tM, span: span,
      days: Math.round(span / DAY),
      birthY: String(person.birth).slice(0, 4),
      martY: String(person.martyrdom).slice(0, 4),
      // logical 0..100 from birth; phys() converts to a physical left %
      pct: function (iso) { return clamp(((tMs(iso) - t0) / span) * 100, 0, 100); },
      phys: function (p) { return ar ? 100 - p : p; }
    };
  }

  // ---- age scale rail ------------------------------------------------------
  // Ticks are placed at real birthdays (birth + a years), so leap years never
  // drift. The 0 and final-age groups double as the birth / martyrdom year
  // labels, so nothing is printed twice.
  var STEPS = [1, 2, 5, 10, 20, 25, 50];

  function pickStep(maxAge, maxTicks) {
    for (var i = 0; i < STEPS.length; i++) {
      if (maxAge / STEPS[i] <= maxTicks) return STEPS[i];
    }
    return 100;
  }

  function tickGroup(c, ageVal, year, kind) {
    var p = kind === 'end' ? 100 : (kind === 'start' ? 0 : ageVal.p);
    var x = c.phys(p);
    var shift;
    if (kind === 'mid') shift = 'translateX(-50%)';
    else if (kind === 'start') shift = c.ar ? 'translateX(-100%)' : 'none';
    else shift = c.ar ? 'none' : 'translateX(-100%)';
    var cls = 'vc-tick' + (kind === 'start' ? ' vc-tick-birth' : (kind === 'end' ? ' vc-tick-mart' : ''));
    var a = kind === 'mid' ? ageVal.a : ageVal;
    return '<span class="' + cls + '" style="left:' + x.toFixed(3) + '%;transform:' + shift + ';">' +
             '<b class="vc-tick-age">' + E(num(a, c.ar)) + '</b>' +
             '<i class="vc-tick-year">' + E(year) + '</i>' +
           '</span>';
  }

  function railHtml(c, maxTicks, edgePad) {
    var maxAge = Math.max(c.age || 0, 1);
    var step = pickStep(maxAge, Math.max(2, maxTicks));
    var parts = String(c.person.birth).slice(0, 10).split('-');
    var by = parseInt(parts[0], 10), bm = parseInt(parts[1], 10), bd = parseInt(parts[2], 10);
    var h = tickGroup(c, 0, c.birthY, 'start') + tickGroup(c, c.age, c.martY, 'end');
    for (var a = step; a < maxAge; a += step) {
      var d = new Date(by + a, bm - 1, bd);
      var p = ((d.getTime() - c.t0) / c.span) * 100;
      if (p < edgePad || p > 100 - edgePad) continue;
      h += tickGroup(c, { a: a, p: p }, String(by + a), 'mid');
    }
    return h;
  }

  // ---- axis block ----------------------------------------------------------
  function axisHtml(c) {
    var h = '<div class="vc-row vc-axis" aria-hidden="true">';
    h += '<div class="vc-gutter">' +
           '<div class="vc-scale-note">' +
             (c.ar
               ? 'المحور بالأعمار — الرقم الصغير تحته هو السنة الميلادية.'
               : 'Axis in years of age — the small number below each tick is the calendar year.') +
           '</div>' +
         '</div>';
    h += '<div class="vc-plot">';
    h += '<div class="vc-rail">' + railHtml(c, 6, 9) + '</div>';
    h += '<div class="vc-track"></div>';
    h += '<span class="vc-mk vc-mk-birth" style="left:' + c.phys(0) + '%;"></span>';
    h += '<span class="vc-mk vc-mk-mart" style="left:' + c.phys(100) + '%;"></span>';
    c.evs.forEach(function (e, i) {
      var x = c.phys(c.pct(e.start_date));
      h += '<span class="vc-axis-dot" data-i="' + i + '" style="left:' + x.toFixed(3) + '%;"></span>';
    });
    h += '</div></div>';
    return h;
  }

  // ---- lanes ---------------------------------------------------------------
  // The date chip is emitted twice — once inside the plot cell (shown when the
  // event's bar is long enough to carry it) and once inline after the name.
  // Exactly one is ever `display:block`, so the fact is printed once on screen
  // and read once by AT. Same responsive-swap pattern the current renderTimeline
  // already uses for its horizontal / vertical layouts.
  var LANE_H = 34;      // must match .vc-lane min-height in the CSS below
  var AXIS_TO_LANE = 26; // fallback stem length before mount() measures

  function lanesHtml(c) {
    if (!c.evs.length) {
      return '<p class="vc-empty">' +
        (c.ar ? 'لا توجد أحداث عالمية مسجّلة ضمن حياته.' : 'No recorded world events fell within his lifetime.') +
        '</p>';
    }
    var h = '<ol class="vc-lanes" role="list">';
    c.evs.forEach(function (e, i) {
      var p = c.pct(e.start_date);
      var x = c.phys(p);
      var off = (100 - p);                     // distance from the "future" edge
      var onBar = p >= 46;                     // bar long enough to hold the chip
      var dateTxt = D(e.start_date, c.lang);
      // gradient scaled so the bar's end colour equals the axis colour at x
      var bgSize = (100 / Math.max(p, 0.4)) * 100;
      var barLeft = c.ar ? (100 - p) : 0;
      var stemFallback = AXIS_TO_LANE + (i * LANE_H) + (LANE_H / 2);

      h += '<li class="vc-row vc-lane' + (onBar ? ' has-plot-date' : '') + '" data-i="' + i + '"' +
             ' style="--vc-stem:' + stemFallback + 'px;">';
      h += '<div class="vc-lbl">' +
             '<span class="vc-age">' + E(ageLabel(e.age_at_start, c.ar)) + '</span>' +
             '<span class="vc-name">' + E(eventName(e, c.lang)) + '</span>' +
             '<span class="vc-date-inline">' + E(dateTxt) + '</span>' +
           '</div>';
      h += '<div class="vc-cell">' +
             '<span class="vc-stem" aria-hidden="true" style="left:' + x.toFixed(3) + '%;"></span>' +
             '<span class="vc-bar" aria-hidden="true" style="left:' + barLeft.toFixed(3) + '%;width:' + p.toFixed(3) + '%;background-size:' + bgSize.toFixed(1) + '% 100%;"></span>' +
             '<span class="vc-dot" aria-hidden="true" style="left:' + x.toFixed(3) + '%;"></span>' +
             '<span class="vc-date" style="' + (c.ar ? 'left' : 'right') + ':calc(' + off.toFixed(3) + '% + 9px);max-width:calc(' + p.toFixed(3) + '% - 14px);">' + E(dateTxt) + '</span>' +
           '</div>';
      h += '</li>';
    });
    return h + '</ol>';
  }

  // ==========================================================================
  global.VARIANTS[KEY] = {
    key: KEY,
    labelAr: 'محور العمر',
    labelEn: 'Age axis with lanes',

    blurbAr: 'المحور يقيس العمر من صفر إلى سنّ الاستشهاد، ولكل حدث سطرٌ خاصّ به فيه نقطته على موضعها الحقيقي واسمه في عمود ثابت.',
    blurbEn: 'The axis measures age (0 → age at martyrdom) and every event gets its own lane, with its dot at the true position and its name in a fixed label column.',

    tradeoffAr: 'الارتفاع ينمو مع عدد الأحداث — خمسة عشر حدثاً تعني نحو ٦٧٠ بكسل على الشاشات الواسعة وأكثر من ألف على الهاتف.',
    tradeoffEn: 'Height grows with the event count — 15 events is roughly 670px on a wide card and over 1,100px on a phone.',

    css: [
      /* everything scoped under .v-c */
      '.v-c, .v-c *, .v-c *::before, .v-c *::after { box-sizing: border-box; }',
      '.v-c {',
      '  container-type: inline-size;',                 /* lets the lanes respond to the CARD, not the viewport */
      '  --vc-label: clamp(168px, 40%, 400px);',
      '  --vc-gap: 14px;',
      /* derived shades: 15 stems / 15 bars must read as texture, not as lines.
         color-mix from --divider keeps them on the existing neutral ramp. */
      '  --vc-stem-color: color-mix(in srgb, var(--divider) 85%, transparent);',
      '  --vc-hair: color-mix(in srgb, var(--divider) 55%, transparent);',
      '  --vc-hover: color-mix(in srgb, var(--forest) 7%, transparent);',
      '  font-family: var(--font-body);',
      '  padding-inline: 8px;',                          /* room for the ±6px marker overhang at 0% / 100% */
      '}',
      '.v-c .vc-sr { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }',

      /* ---- header ---- */
      '.v-c .vc-head { display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:6px 20px; margin-bottom:16px; }',
      '.v-c .vc-kicker { font-family: var(--font-latin-sans); font-size:11px; letter-spacing:.2em; text-transform:uppercase; color: var(--olive); }',
      '.v-c .vc-lived { font-family: var(--font-display); font-size:22px; font-weight:500; line-height:1.35; color: var(--ink); margin-top:3px; }',
      '.v-c .vc-lived b { color: var(--forest); font-weight:600; }',
      '.v-c .vc-lived .vc-days { color: var(--muted); font-size:15px; font-family: var(--font-body); }',
      '.v-c .vc-count { font-size:12.5px; color: var(--muted); }',

      /* ---- the one grid the axis and every lane share (so x-positions line up) ---- */
      '.v-c .vc-row { display:grid; grid-template-columns: var(--vc-label) minmax(0,1fr); column-gap: var(--vc-gap); }',

      /* ---- axis ---- */
      '.v-c .vc-axis { align-items:end; margin-bottom:12px; }',
      '.v-c .vc-gutter { padding-bottom:6px; }',
      '.v-c .vc-scale-note { font-size:11px; line-height:1.55; color: var(--faint); }',
      '.v-c .vc-plot { position:relative; height:52px; }',
      '.v-c .vc-rail { position:absolute; inset-inline:0; top:0; height:34px; }',
      '.v-c .vc-tick { position:absolute; bottom:0; white-space:nowrap; }',
      '.v-c .vc-tick-age { display:block; font-size:12px; font-weight:600; font-style:normal; line-height:1.25; color: var(--ink-2); text-align:center; }',
      '.v-c .vc-tick-year { display:block; font-family: var(--font-latin-sans); font-size:9.5px; font-style:normal; line-height:1.3; color: var(--faint); font-variant-numeric: tabular-nums; text-align:center; }',
      '.v-c .vc-tick::after { content:""; position:absolute; bottom:-6px; left:50%; width:1px; height:6px; background: var(--vc-hair); }',
      '.v-c .vc-tick-birth::after, .v-c .vc-tick-mart::after { display:none; }',
      '.v-c .vc-tick-birth .vc-tick-age, .v-c .vc-tick-birth .vc-tick-year { color: var(--olive-2); text-align:start; }',
      '.v-c .vc-tick-mart .vc-tick-age, .v-c .vc-tick-mart .vc-tick-year { color: var(--forest); text-align:end; }',
      '.v-c .vc-track { position:absolute; inset-inline:0; top:40px; height:4px; border-radius:999px; background: linear-gradient(to right, var(--olive), var(--forest)); }',
      /* linear-gradient has no logical direction — flip it so olive is always the birth end */
      'html[dir="rtl"] .v-c .vc-track { background: linear-gradient(to left, var(--olive), var(--forest)); }',
      '.v-c .vc-mk { position:absolute; transform: translateX(-50%); }',
      '.v-c .vc-mk-birth { top:36px; width:12px; height:12px; border-radius:50%; background: var(--olive); box-shadow: 0 0 0 3px var(--paper); }',
      '.v-c .vc-mk-mart { top:37px; width:10px; height:10px; background: var(--forest); transform: translateX(-50%) rotate(45deg); box-shadow: 0 0 0 3px var(--paper); }',
      '.v-c .vc-axis-dot { position:absolute; top:37px; width:10px; height:10px; border-radius:50%; background: var(--paper); border:2px solid var(--ink-2); box-shadow: 0 0 0 2px var(--paper); transform: translateX(-50%); }',
      '.v-c .vc-axis-dot.is-on { border-color: var(--forest); box-shadow: 0 0 0 2px var(--paper), 0 0 0 4px var(--gold-dim-2); }',

      /* ---- lanes ---- */
      '.v-c .vc-lanes { list-style:none; margin:0; padding:0; }',
      '.v-c .vc-lane { position:relative; align-items:center; min-height:34px; padding-block:5px; padding-inline:6px; margin-inline:-6px; border-radius:7px; }',
      '.v-c .vc-lbl { display:flex; align-items:baseline; flex-wrap:wrap; gap:3px 8px; min-width:0; }',
      '.v-c .vc-age { flex:none; font-size:11.5px; line-height:1.6; color: var(--forest); background: var(--gold-dim); border:1px solid var(--gold-dim-2); border-radius:999px; padding:0 9px 1px; white-space:nowrap; }',
      '.v-c .vc-name { font-size:13.5px; font-weight:600; line-height:1.45; color: var(--ink); min-width:0; }',
      '.v-c .vc-date-inline { font-size:11.5px; line-height:1.5; color: var(--muted); font-variant-numeric: tabular-nums; white-space:nowrap; }',
      '.v-c .vc-cell { position:relative; align-self:stretch; min-height:22px; }',
      '.v-c .vc-stem { position:absolute; bottom:50%; width:1px; height: var(--vc-stem, 40px); background: var(--vc-stem-color); transform: translateX(-50%); }',
      '.v-c .vc-bar { position:absolute; top:50%; height:2px; border-radius:999px; transform: translateY(-50%); opacity:.5;',
      '  background-image: linear-gradient(to right, var(--olive), var(--forest)); background-repeat:no-repeat; background-position: left center; }',
      'html[dir="rtl"] .v-c .vc-bar { background-image: linear-gradient(to left, var(--olive), var(--forest)); background-position: right center; }',
      '.v-c .vc-dot { position:absolute; top:50%; width:9px; height:9px; border-radius:50%; background: var(--paper); border:2px solid var(--ink-2); transform: translate(-50%,-50%); }',
      /* the chip always sits on the PAST side of its own dot, above the bar —
         a region no other lane's stem can ever enter (x is monotonic), so it
         needs no mask and can never be pushed off its date. */
      '.v-c .vc-date { position:absolute; bottom:50%; margin-bottom:3px; font-size:11px; line-height:1.35; color: var(--muted); font-variant-numeric: tabular-nums; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }',
      '.v-c .vc-date { display:none; }',
      '.v-c .vc-lane.has-plot-date .vc-date { display:block; }',
      '.v-c .vc-lane.has-plot-date .vc-date-inline { display:none; }',
      '.v-c .vc-empty { font-size:13px; color: var(--muted); padding-block:8px; }',

      /* ---- hover: link a lane to its dot on the axis ---- */
      '.v-c .vc-lane:hover { background: var(--vc-hover); }',
      '.v-c .vc-lane:hover .vc-bar { opacity:1; }',
      '.v-c .vc-lane:hover .vc-dot { border-color: var(--forest); }',
      '.v-c .vc-lane:hover .vc-stem { background: color-mix(in srgb, var(--forest) 55%, transparent); }',
      '.v-c .vc-lane:hover .vc-date { color: var(--ink-2); }',
      /* transitions only exist when motion is welcome — no override needed */
      '@media (prefers-reduced-motion: no-preference) {',
      '  .v-c .vc-lane, .v-c .vc-bar, .v-c .vc-dot, .v-c .vc-stem, .v-c .vc-date, .v-c .vc-axis-dot { transition: background-color .16s ease, background .16s ease, border-color .16s ease, opacity .16s ease, box-shadow .16s ease, color .16s ease; }',
      '}',

      /* ---- narrow card: lanes stack, stems go away, dates come inline ----
         Container query, not a viewport media query: the card is what runs out
         of room, not the window. */
      '@container (max-width: 620px) {',
      '  .v-c .vc-row { grid-template-columns: minmax(0,1fr); row-gap:7px; }',
      '  .v-c .vc-axis { align-items:start; }',
      '  .v-c .vc-gutter { padding-bottom:10px; }',
      '  .v-c .vc-lane { align-items:start; min-height:0; padding-block:9px; border-radius:0; }',
      '  .v-c .vc-lane + .vc-lane { border-top:1px solid var(--vc-hair); }',
      '  .v-c .vc-cell { align-self:auto; min-height:0; height:12px; }',
      '  .v-c .vc-stem { display:none; }',
      '  .v-c .vc-lane.has-plot-date .vc-date { display:none; }',
      '  .v-c .vc-lane.has-plot-date .vc-date-inline { display:inline; }',
      '  .v-c .vc-lived { font-size:19px; }',
      '}'
    ].join('\n'),

    // ------------------------------------------------------------------------
    render: function (person, events, lang) {
      var ar = lang === 'ar';
      var c = ctxFor(person, events, lang);
      if (!c) {
        return '<div class="v-c"><p class="vc-empty">' +
          (ar ? 'لا يمكن رسم خطّ الحياة — تاريخ الميلاد أو الاستشهاد ناقص.'
              : 'Lifespan line unavailable — birth or martyrdom date is missing.') +
          '</p></div>';
      }

      var h = '<div class="v-c">';

      // header
      h += '<div class="vc-head">' +
             '<div>' +
               '<div class="vc-kicker">' + (ar ? 'محور العمر' : 'Age axis') + '</div>' +
               '<div class="vc-lived">' +
                 (ar
                   ? 'عاشَ <b>' + E(ageLabel(c.age, true)) + '</b> <span class="vc-days">(' + E(c.days.toLocaleString('ar-EG')) + ' يوماً)</span>'
                   : 'Lived <b>' + E(c.age) + ' years</b> <span class="vc-days">(' + E(c.days.toLocaleString('en-US')) + ' days)</span>') +
               '</div>' +
             '</div>' +
             '<div class="vc-count">' +
               (ar ? E(eventCount(c.evs.length, true)) + ' مرّت في حياته'
                   : E(eventCount(c.evs.length, false)) + ' fell within his lifetime') +
             '</div>' +
           '</div>';

      // one honest sentence for AT; the axis itself is decorative
      h += '<p class="vc-sr">' +
             (ar
               ? 'محور بالأعمار من الولادة في ' + E(D(person.birth, lang)) + ' إلى الاستشهاد في ' + E(D(person.martyrdom, lang)) +
                 '. الأحداث التالية مرتّبة زمنياً، ومع كلٍّ منها عمره حين وقع.'
               : 'An age axis from birth on ' + E(D(person.birth, lang)) + ' to martyrdom on ' + E(D(person.martyrdom, lang)) +
                 '. The events below are in chronological order, each with his age at the time.') +
           '</p>';

      h += axisHtml(c);
      h += lanesHtml(c);
      h += '</div>';
      return h;
    },

    // ------------------------------------------------------------------------
    // Idempotent. Does three things, none of which move a label:
    //   1. rebuilds the age rail at a tick density the measured width can hold
    //   2. sets each lane's stem length from the measured axis→dot distance
    //   3. wires lane hover → the matching dot on the axis (delegated, bound once)
    mount: function (rootEl, person, events, lang) {
      if (!rootEl || typeof document === 'undefined') return;
      var c = ctxFor(person, events, lang);
      if (!c) return;

      function layout() {
        var plot = rootEl.querySelector('.vc-plot');
        var rail = rootEl.querySelector('.vc-rail');
        var track = rootEl.querySelector('.vc-track');
        if (plot && rail) {
          var w = plot.clientWidth || 320;
          // ~78px per tick group, and keep interior ticks clear of the two end labels
          rail.innerHTML = railHtml(c, Math.max(2, Math.floor(w / 78)), (46 / w) * 100);
        }
        if (track) {
          var tr = track.getBoundingClientRect();
          var mid = tr.top + tr.height / 2;
          var lanes = rootEl.querySelectorAll('.vc-lane');
          for (var i = 0; i < lanes.length; i++) {
            var dot = lanes[i].querySelector('.vc-dot');
            if (!dot) continue;
            var dr = dot.getBoundingClientRect();
            var hpx = Math.max(0, Math.round((dr.top + dr.height / 2) - mid));
            lanes[i].style.setProperty('--vc-stem', hpx + 'px');
          }
        }
      }

      layout();

      if (!rootEl.__vcBound) {
        rootEl.__vcBound = true;
        var flag = function (el, on) {
          if (!el) return;
          var i = el.getAttribute('data-i');
          var d = rootEl.querySelector('.vc-axis-dot[data-i="' + i + '"]');
          if (d) d.classList.toggle('is-on', on);
        };
        var pick = function (ev) {
          return ev.target && ev.target.closest ? ev.target.closest('.vc-lane') : null;
        };
        rootEl.addEventListener('pointerover', function (ev) { flag(pick(ev), true); });
        rootEl.addEventListener('pointerout', function (ev) { flag(pick(ev), false); });
      }

      // Re-measure on resize. Nothing layout() writes affects the root's size
      // (stems are absolutely positioned, the rail has a fixed height), so this
      // cannot loop. rAF-guarded so a drag-resize coalesces.
      if (!rootEl.__vcRO && typeof ResizeObserver === 'function') {
        var queued = false;
        rootEl.__vcRO = new ResizeObserver(function () {
          if (queued) return;
          queued = true;
          requestAnimationFrame(function () { queued = false; layout(); });
        });
        rootEl.__vcRO.observe(rootEl);
      }
    }
  };
})(window);
