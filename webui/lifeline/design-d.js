// webui/lifeline/design-d.js — "فصول العمر" / Life chapters
//
// One selectable lifespan-line design. Registers itself on
// window.AQMAR_LIFELINE_DESIGNS; lifeline-designs.js adapts that into
// window.AQMAR_LIFELINE and attaches the display name.
//
// Styles: this module carries its own CSS, scoped to .lfd-d, and the
// adapter injects it once at boot. That is a deliberate exception to
// the "CSS lives in styles.css" rule — a design is a pluggable unit
// and splitting its markup from its styles across two files makes
// adding or retiring one a two-file edit. Tokens are still the only
// source of color/'type': no literal colors appear below.
//
// DESKTOP ONLY. Below the mobile breakpoint app.js renders the existing
// vertical layout instead of any design, so this file has no mobile
// story to tell.
//
// Helpers available as globals (app.js / filter-logic.js): esc,
// computeAge, eventsForPerson, eventDisplayName, formatDate, toArDigits.
// variant_d.js — Direction D: "فصول العمر" / Chapters.
//
// Instead of enumerating 15 equally-weighted events on one axis, this variant
// GROUPS them into a small number of life chapters keyed on the person's age
// at each event (early childhood / childhood / adolescence / adulthood). The
// whole section collapses to 3-4 scannable lines; each chapter expands (a real
// <button>, aria-expanded, keyboard-operable) to reveal its events with names,
// dates and ages.
//
// Why this survives 15 events where the axis design fails: no event NAME is
// ever positioned by date. Names live in an ordered list inside their chapter,
// so they wrap freely and can never overlap or displace off their true date.
// The only date-positioned things are decorative dots on (a) a slim full-life
// bar at the top and (b) a per-chapter mini strip — both aria-hidden, no text.
//
// Every event is a single point in time. There are NO duration bands (the
// finalized 18 events all have end_date:null; a band from the event to the
// death date was the current design's bug — this variant never draws one).
//
// Positions along any strip/bar are PHYSICAL left percentages computed here in
// JS (RTL flips birth to the right); gradients that have no logical direction
// get an html[dir="rtl"] override in CSS, mirroring the existing codebase.
//
// Harness globals used (not reimplemented): esc, computeAge, formatDate,
// toArDigits, eventsForPerson. Standalone — no imports, no build step.

(function () {
  "use strict";

  var KEY = "d";

  // Age bands. Boundaries chosen to match how a life is actually remembered,
  // not round decades:
  //   0-6   طفولته الأولى  — before conscious, formative memory (school age ~7)
  //   7-12  طفولته         — childhood proper, up to the edge of adolescence
  //   13-17 فتوّته          — adolescence, up to legal/social adulthood at 18
  //   18+   شبابه          — adulthood, open-ended, clamped to age-at-martyrdom
  // These four give at most four collapsed rows even for the 56-year worst
  // case, and they carry the narrative the events already tell: a boy through
  // the early wars, a youth through the intifadas, a man at the Flood.
  var BANDS = [
    { lo: 0,  hi: 6,  ar: "طفولته الأولى", en: "Early childhood" },
    { lo: 7,  hi: 12, ar: "طفولته",         en: "Childhood" },
    { lo: 13, hi: 17, ar: "فتوّته",          en: "Adolescence" },
    { lo: 18, hi: Infinity, ar: "شبابه",     en: "Adulthood" }
  ];

  function bandIndexForAge(age) {
    if (age == null) return 3;
    if (age <= 6) return 0;
    if (age <= 12) return 1;
    if (age <= 17) return 2;
    return 3;
  }

  // Event display name for the active language; Arabic is the required source
  // field, English optional and falls back to Arabic. Mirrors the codebase's
  // eventDisplayName without depending on it being present in the harness.
  function pickName(e, lang) {
    if (!e) return "";
    if (lang === "en" && typeof e.name_en === "string" && e.name_en.trim()) {
      return e.name_en;
    }
    return e.name_ar || "";
  }

  // Local-midnight ms for a "YYYY-MM-DD" string; both endpoints use the same
  // construction so fractions are consistent.
  function ymdTime(iso) {
    var s = String(iso).slice(0, 10);
    var p = s.split("-");
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1).getTime();
  }
  // Date that is `years` after the birth date (for age-band boundaries).
  function birthPlusYears(birthIso, years) {
    var s = String(birthIso).slice(0, 10).split("-");
    return new Date(+s[0] + years, (+s[1] || 1) - 1, +s[2] || 1).getTime();
  }

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  // Arabic count-noun agreement for "حدث" (event); English is trivial.
  function countLabel(n, lang, num) {
    if (lang !== "ar") return n === 1 ? "1 event" : num(n) + " events";
    if (n === 1) return "حدث واحد";
    if (n === 2) return "حدثان";
    if (n >= 3 && n <= 10) return num(n) + " أحداث";
    return num(n) + " حدثاً";
  }

  var CSS = "\n" +
  /* ---- everything scoped under .lfd-d so five variants coexist ---- */
  ".lfd-d { font-family: var(--font-body); }\n" +

  /* headline */
  ".lfd-d .vd-head { display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:8px 16px; margin-bottom:16px; }\n" +
  ".lfd-d .vd-kicker { font-family: var(--font-latin-sans); font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color: var(--olive); }\n" +
  ".lfd-d .vd-lived { font-family: var(--font-display); font-size: clamp(1.15rem, 1rem + 0.9vw, 1.5rem); font-weight:500; margin-top:4px; }\n" +
  ".lfd-d .vd-lived b { color: var(--forest); font-weight:700; }\n" +
  ".lfd-d .vd-days { color: var(--muted); font-size:0.8em; }\n" +
  ".lfd-d .vd-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:11.5px; color: var(--muted); }\n" +
  ".lfd-d .vd-legend span { display:inline-flex; align-items:center; gap:6px; }\n" +
  ".lfd-d .vd-sw { flex:none; display:inline-block; }\n" +
  ".lfd-d .vd-sw-birth { width:9px; height:9px; border-radius:50%; background: var(--olive); }\n" +
  ".lfd-d .vd-sw-mart { width:9px; height:9px; background: var(--forest); transform: rotate(45deg); }\n" +
  ".lfd-d .vd-sw-ev { width:9px; height:9px; border-radius:50%; background: var(--paper); border:1.5px solid var(--ink-2); }\n" +

  /* full-life bar (decorative, aria-hidden) — the whole life at a glance,
     no text on it. Inset so edge markers (translateX(-50%)) overflow into the
     margin, never past the card. */
  ".lfd-d .vd-lifebar { position:relative; height:10px; margin:14px 9px 26px; border-radius:999px; background: var(--divider); }\n" +
  ".lfd-d .vd-lifebar-fill { position:absolute; inset:0; border-radius:999px; background: linear-gradient(to right, var(--olive), var(--forest)); }\n" +
  /* linear-gradient has no logical direction: flip so olive stays on the birth
     (right in RTL) side. */
  "html[dir=\"rtl\"] .lfd-d .vd-lifebar-fill { background: linear-gradient(to left, var(--olive), var(--forest)); }\n" +
  ".lfd-d .vd-div { position:absolute; top:-3px; bottom:-3px; width:1px; background: var(--bg); transform: translateX(-50%); }\n" +
  ".lfd-d .vd-ev { position:absolute; top:50%; width:8px; height:8px; border-radius:50%; background: var(--paper); border:1.5px solid var(--ink-2); transform: translate(-50%, -50%); }\n" +
  ".lfd-d .vd-birth { position:absolute; top:50%; width:13px; height:13px; border-radius:50%; background: var(--olive); box-shadow:0 0 0 2px var(--bg-2); transform: translate(-50%, -50%); }\n" +
  ".lfd-d .vd-mart { position:absolute; top:50%; width:11px; height:11px; background: var(--forest); box-shadow:0 0 0 2px var(--bg-2); transform: translate(-50%, -50%) rotate(45deg); }\n" +

  /* chapters */
  ".lfd-d .vd-chapters { display:flex; flex-direction:column; gap:10px; }\n" +
  ".lfd-d .vd-empty { color: var(--muted); font-size:13px; }\n" +
  ".lfd-d .vd-chapter { border:1px solid var(--divider); border-radius:12px; background: var(--bg-2); overflow:hidden; }\n" +
  ".lfd-d .vd-chhead { width:100%; display:flex; align-items:center; gap:12px; text-align:start; background:transparent; border:0; color:inherit; padding:13px 14px; }\n" +
  ".lfd-d .vd-chhead:hover { background: color-mix(in srgb, var(--forest) 5%, transparent); }\n" + /* faint gold wash on hover, derived from the accent */
  ".lfd-d .vd-chmain { flex:1; min-width:0; }\n" +
  ".lfd-d .vd-chtop { display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; }\n" +
  ".lfd-d .vd-chname { font-family: var(--font-display); font-size:16px; font-weight:600; color: var(--ink); }\n" +
  ".lfd-d .vd-chcount { font-size:12.5px; color: var(--forest); flex:none; }\n" +
  ".lfd-d .vd-chrange { font-size:12px; color: var(--muted); margin-top:2px; }\n" +
  /* mini within-chapter strip (decorative, aria-hidden) */
  ".lfd-d .vd-strip { position:relative; height:12px; margin-top:9px; border-radius:999px; background: color-mix(in srgb, var(--divider) 55%, transparent); }\n" + /* recessed track: divider softened so the dots read as the figure */
  ".lfd-d .vd-strip-dot { position:absolute; top:50%; width:7px; height:7px; border-radius:50%; background: var(--paper); border:1.5px solid var(--ink-2); transform: translate(-50%, -50%); }\n" +
  ".lfd-d .vd-chev { flex:none; width:14px; height:14px; color: var(--muted); transform: rotate(0deg); transition: transform .2s ease; }\n" +
  ".lfd-d .vd-chhead[aria-expanded=\"true\"] .vd-chev { transform: rotate(-180deg); }\n" +

  /* expanded panel — an ordered list, the honest chronological structure */
  ".lfd-d .vd-panel { padding:2px 14px 12px; }\n" +
  ".lfd-d .vd-evlist { list-style:none; margin:0; padding:0; }\n" +
  ".lfd-d .vd-evitem { display:flex; gap:10px; padding-block:9px; border-top:1px solid var(--divider); }\n" +
  ".lfd-d .vd-evmk { flex:none; width:9px; height:9px; margin-top:6px; border-radius:50%; background: var(--paper); border:1.5px solid var(--ink-2); }\n" +
  ".lfd-d .vd-evbody { flex:1; min-width:0; }\n" +
  /* names WRAP (no white-space:nowrap) — this is what makes 45-char Arabic
     names safe at 360px. */
  ".lfd-d .vd-evname { font-size:14px; line-height:1.5; color: var(--ink); overflow-wrap:break-word; }\n" +
  ".lfd-d .vd-evmeta { margin-top:4px; display:flex; gap:8px; flex-wrap:wrap; align-items:center; }\n" +
  ".lfd-d .vd-evdate { font-size:12px; color: var(--muted); font-variant-numeric: tabular-nums; }\n" +
  ".lfd-d .vd-pill { font-size:11.5px; color: var(--forest); background: var(--gold-dim); border:1px solid var(--gold-dim-2); border-radius:999px; padding:1px 9px 2px; }\n" +

  "@media (prefers-reduced-motion: reduce) {\n" +
  "  .lfd-d .vd-chev { transition: none; }\n" +
  "}\n";

  function render(person, events, lang) {
    var ar = lang === "ar";
    var num = function (n) { return ar ? toArDigits(n) : String(n); };

    if (!person || !person.birth || !person.martyrdom) return '<div class="lfd-d"></div>';
    var t0 = ymdTime(person.birth);
    var tMart = ymdTime(person.martyrdom);
    if (!isFinite(t0) || !isFinite(tMart) || tMart <= t0) return '<div class="lfd-d"></div>';
    var span = tMart - t0;
    var ageAtDeath = computeAge(person.birth, person.martyrdom);
    var days = Math.floor(span / 86400000);

    var evs = eventsForPerson(events, person.birth, person.martyrdom); // ascending, age_at_start attached

    // physical left% for a life-fraction 0..1
    var physPct = function (frac) {
      var p = clamp01(frac) * 100;
      return (ar ? 100 - p : p);
    };

    // ---- headline ----
    var lived = ar
      ? ("عاش <b>" + num(ageAtDeath == null ? "—" : ageAtDeath) + "</b> عامًا " +
         '<span class="vd-days">(' + days.toLocaleString("ar-EG") + " يوماً)</span>")
      : ("Lived <b>" + (ageAtDeath == null ? "—" : ageAtDeath) + "</b> years " +
         '<span class="vd-days">(' + days.toLocaleString() + " days)</span>");

    var legend =
      '<div class="vd-legend" aria-hidden="true">' +
        '<span><span class="vd-sw vd-sw-birth"></span>' + (ar ? "الميلاد" : "Birth") + "</span>" +
        (evs.length ? '<span><span class="vd-sw vd-sw-ev"></span>' + (ar ? "حدث" : "Event") + "</span>" : "") +
        '<span><span class="vd-sw vd-sw-mart"></span>' + (ar ? "الاستشهاد" : "Martyrdom") + "</span>" +
      "</div>";

    var h = '<div class="lfd-d">';
    h += '<div class="vd-head"><div>' +
           '<div class="vd-kicker">' + (ar ? "فصول العمر" : "Chapters of a life") + "</div>" +
           '<div class="vd-lived">' + lived + "</div>" +
         "</div>" + legend + "</div>";

    // ---- full-life bar (decorative) ----
    var bar = '<div class="vd-lifebar" aria-hidden="true"><div class="vd-lifebar-fill"></div>';
    // chapter boundaries at ages 7 / 13 / 18 that fall inside the life
    [7, 13, 18].forEach(function (b) {
      if (ageAtDeath != null && b > 0 && b < ageAtDeath) {
        var frac = (birthPlusYears(person.birth, b) - t0) / span;
        bar += '<div class="vd-div" style="left:' + physPct(frac) + '%;"></div>';
      }
    });
    // every event as a single point
    evs.forEach(function (e) {
      var frac = (ymdTime(e.start_date) - t0) / span;
      bar += '<div class="vd-ev" style="left:' + physPct(frac) + '%;"></div>';
    });
    bar += '<div class="vd-birth" style="left:' + physPct(0) + '%;"></div>';
    bar += '<div class="vd-mart" style="left:' + physPct(1) + '%;"></div>';
    bar += "</div>";
    h += bar;

    // ---- group events into non-empty chapters ----
    var groups = BANDS.map(function (band, i) {
      return { band: band, idx: i, evs: [] };
    });
    evs.forEach(function (e) { groups[bandIndexForAge(e.age_at_start)].evs.push(e); });
    var chapters = groups.filter(function (g) { return g.evs.length > 0; });

    if (!chapters.length) {
      h += '<div class="vd-empty">' + (ar ? "لا أحداث بارزة في حياته." : "No notable events during his life.") + "</div>";
      return h + "</div>";
    }

    var lastRendered = chapters.length - 1; // most-recent chapter = expanded by default

    h += '<div class="vd-chapters">';
    chapters.forEach(function (g, ci) {
      var band = g.band;
      var isLast = ci === lastRendered;
      var expanded = isLast; // the chapter holding his final years is the most relevant
      var hiAge = isLast ? ageAtDeath : band.hi;

      // strip window in real dates: birth+lo .. (birth+hi+1 | martyrdom)
      var winStart = birthPlusYears(person.birth, band.lo);
      var winEnd = isLast ? tMart : birthPlusYears(person.birth, band.hi + 1);
      var winSpan = winEnd - winStart;

      // range label — bidi-safe (numbers separated by Arabic words / LTR context)
      var range;
      if (ar) {
        range = band.lo === 0
          ? ("من الميلاد إلى " + num(hiAge) + " عامًا")
          : ("من " + num(band.lo) + " إلى " + num(hiAge) + " عامًا");
      } else {
        range = band.lo === 0 ? ("Birth to " + hiAge) : ("Age " + band.lo + "–" + hiAge);
      }

      var panelId = "vd-panel-" + person.id + "-" + band.lo;

      var head =
        '<button type="button" class="vd-chhead" aria-expanded="' + (expanded ? "true" : "false") +
          '" aria-controls="' + panelId + '">' +
          '<span class="vd-chmain">' +
            '<span class="vd-chtop">' +
              '<span class="vd-chname">' + esc(ar ? band.ar : band.en) + "</span>" +
              '<span class="vd-chcount">' + esc(countLabel(g.evs.length, lang, num)) + "</span>" +
            "</span>" +
            '<span class="vd-chrange">' + esc(range) + "</span>" +
            // mini proportional strip (decorative)
            (function () {
              var s = '<span class="vd-strip" aria-hidden="true">';
              g.evs.forEach(function (e) {
                var frac = winSpan > 0 ? (ymdTime(e.start_date) - winStart) / winSpan : 0.5;
                s += '<span class="vd-strip-dot" title="' + esc(pickName(e, lang)) +
                     '" style="left:' + physPct(frac) + '%;"></span>';
              });
              return s + "</span>";
            })() +
          "</span>" +
          // chevron
          '<svg class="vd-chev" viewBox="0 0 16 16" aria-hidden="true" fill="none" ' +
            'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M4 6l4 4 4-4"/></svg>' +
        "</button>";

      // panel: an ordered list — the honest chronological structure
      var items = g.evs.map(function (e) {
        var agePill = e.age_at_start != null
          ? '<span class="vd-pill">' + esc(ar ? ("عمره " + num(e.age_at_start) + " عامًا") : ("Age " + e.age_at_start)) + "</span>"
          : "";
        return '<li class="vd-evitem">' +
                 '<span class="vd-evmk" aria-hidden="true"></span>' +
                 '<span class="vd-evbody">' +
                   '<span class="vd-evname">' + esc(pickName(e, lang)) + "</span>" +
                   '<span class="vd-evmeta">' +
                     '<span class="vd-evdate">' + esc(formatDate(e.start_date, lang)) + "</span>" +
                     agePill +
                   "</span>" +
                 "</span>" +
               "</li>";
      }).join("");

      var panel = '<div class="vd-panel" id="' + panelId + '"' + (expanded ? "" : " hidden") + ">" +
                    '<ol class="vd-evlist">' + items + "</ol>" +
                  "</div>";

      h += '<div class="vd-chapter">' + head + panel + "</div>";
    });
    h += "</div>"; // .vd-chapters

    return h + "</div>"; // .lfd-d
  }

  // mount: wire the disclosure buttons. Idempotent — guarded by data-bound so a
  // resize re-mount never double-binds. Positions are percentage-based inline,
  // so nothing needs re-measuring on resize.
  function mount(rootEl /*, person, events, lang */) {
    if (!rootEl) return;
    var heads = rootEl.querySelectorAll(".lfd-d .vd-chhead");
    Array.prototype.forEach.call(heads, function (btn) {
      if (btn.dataset.vdBound === "1") return;
      btn.dataset.vdBound = "1";
      btn.addEventListener("click", function () {
        var open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", open ? "false" : "true");
        var id = btn.getAttribute("aria-controls");
        var panel = id && rootEl.querySelector("#" + (window.CSS && CSS.escape ? CSS.escape(id) : id));
        if (panel) { if (open) panel.setAttribute("hidden", ""); else panel.removeAttribute("hidden"); }
      });
    });
  }

  window.AQMAR_LIFELINE_DESIGNS = window.AQMAR_LIFELINE_DESIGNS || {};
  window.AQMAR_LIFELINE_DESIGNS[KEY] = {
    key: KEY,
    labelAr: "فصول العمر",
    labelEn: "Chapters",
    blurbAr: "يَجمع الأحداث في فصولٍ حسب عُمره — طفولةً وفتوةً وشبابًا — فيُختصر العمر في ثلاثة أسطر تُوسَّع بنقرة.",
    blurbEn: "Groups the events into life chapters by his age — childhood, adolescence, adulthood — so the whole life reads in three lines and expands on a click.",
    tradeoffAr: "الموضع الدقيق لكل حدث على التاريخ يصبح على بُعد نقرةٍ لا أمام العين، وفصلُ شبابه قد يطول عند الرجل الذي عاش طويلًا.",
    tradeoffEn: "Each event's exact position in time is one interaction away rather than immediately visible, and the adulthood chapter can grow long for a man who lived many years.",
    css: CSS,
    render: render,
    mount: mount
  };
})();
