/* AQMAR lifespan line — variant B: "المحور العمودي المتناسب" / Proportional
   vertical spine.

   Design premise: the horizontal axis is the source of every measured failure
   (labels dodge away from their dates, 15 names cannot fit in two rows, long
   Arabic names cannot wrap). So the axis is rotated. One vertical spine runs
   top→bottom, birth → events → martyrdom, and the VERTICAL GAP between two
   consecutive entries is proportional to the elapsed time between them.

   Consequences that matter:
   - Every row owns its own line. A name can be 45 Arabic characters or 66
     Latin ones and simply wraps. Zero collisions are possible by construction,
     so there is no post-layout dodging pass and no leader lines — a label can
     never be displaced from the date it names, because position along the
     spine IS the row.
   - Proportion is preserved but budgeted: the sum of all gaps is capped, then
     distributed by elapsed days with a min (legibility) and max (no 20-year
     void) clamp. The empty childhood reads as a long quiet stretch, the dense
     final years as a drumbeat.
   - Long stretches are labelled with their span ("٧ سنوات"), so the emptiness
     is information rather than a void.
   - Events are POINTS. No duration bands — all 18 finalized events have
     end_date: null, and the old band code turned that into a gold slab.
   - One representation only: the ages live in a fixed-width gutter column
     beside the spine, nowhere else. There is no summary list below and the
     header does not restate the age — the total age appears exactly once, as
     the terminal pill of the age column on the martyrdom row.
   - Zero physical-direction values: everything is inset-inline-start /
     margin-inline / padding-inline, so RTL↔LTR needs no JS conversion and no
     html[dir="rtl"] override. Time reads top→bottom, which is direction-neutral.
*/
window.VARIANTS = window.VARIANTS || {};
(function (global) {
  "use strict";

  var KEY = "b";

  // ---- harness globals (esc / fmtDate / toArDigits / eventsForPerson) with
  // small defensive fallbacks so the file is valid standalone JS. ----
  function _esc(s) {
    if (typeof global.esc === "function") return global.esc(s);
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function _date(iso, lang) {
    if (typeof global.fmtDate === "function") return global.fmtDate(iso, lang);
    return String(iso || "").slice(0, 10);
  }
  function _num(n, ar) {
    if (ar && typeof global.toArDigits === "function") return global.toArDigits(n);
    return String(n);
  }
  function _events(events, birth, mart) {
    if (typeof global.eventsForPerson === "function") {
      return global.eventsForPerson(events, birth, mart) || [];
    }
    return [];
  }

  var DAY = 86400000;
  function tOf(iso) { return Date.parse(String(iso).slice(0, 10) + "T00:00:00Z"); }

  // Calendar-accurate span between two ISO days → { y, months }.
  function calSpan(aIso, bIso) {
    var a = String(aIso).slice(0, 10).split("-").map(Number);
    var b = String(bIso).slice(0, 10).split("-").map(Number);
    var y = b[0] - a[0], m = b[1] - a[1], d = b[2] - a[2];
    if (d < 0) m--;
    if (m < 0) { y--; m += 12; }
    return { y: y, months: y * 12 + m };
  }

  // Label for a long quiet stretch. Arabic pluralisation is explicit:
  // 2 → سنتان, 3–10 → سنوات, 11+ → سنة (the counted-noun singular).
  function gapLabel(aIso, bIso, ar) {
    var s = calSpan(aIso, bIso);
    if (s.y >= 2) {
      if (!ar) return s.y + " years";
      if (s.y === 2) return "سنتان";
      if (s.y <= 10) return _num(s.y, ar) + " سنوات";
      return _num(s.y, ar) + " سنة";
    }
    if (s.months >= 4) {
      if (!ar) return s.months + " months";
      if (s.months <= 10) return _num(s.months, ar) + " أشهر";
      return _num(s.months, ar) + " شهراً";
    }
    return "";
  }

  function countLabel(n, ar) {
    if (!ar) return n + (n === 1 ? " global event" : " global events");
    if (n === 1) return "حدثٌ عالميٌّ واحد";
    if (n === 2) return "حدثان عالميّان";
    if (n <= 10) return _num(n, ar) + " أحداث عالميّة";
    return _num(n, ar) + " حدثاً عالميّاً";
  }

  /* Distribute a fixed pixel budget across the gaps in proportion to elapsed
     days, clamping each to [minPx, maxPx]. Water-filling: whatever clamps is
     frozen and the remaining budget is re-shared among the rest, so the total
     stays on budget and the proportion survives inside the free set.
     This is what keeps total height deterministic — the page height depends on
     the number of rows, never on how lopsided the person's life was. */
  function allocGaps(daysArr, budget, minPx, maxPx) {
    var n = daysArr.length, out = new Array(n), fixed = new Array(n), i;
    for (i = 0; i < n; i++) { out[i] = minPx; fixed[i] = false; }
    if (!n) return out;
    var B = Math.max(budget, minPx * n);
    var guard = 0;
    while (guard++ < 24) {
      var freeDays = 0, freeCount = 0, fixedSum = 0;
      for (i = 0; i < n; i++) {
        if (fixed[i]) fixedSum += out[i];
        else { freeDays += Math.max(daysArr[i], 0); freeCount++; }
      }
      if (freeCount === 0) break;
      var freeBudget = Math.max(B - fixedSum, minPx * freeCount);
      var clamped = false;
      for (i = 0; i < n; i++) {
        if (fixed[i]) continue;
        var share = freeDays > 0
          ? (Math.max(daysArr[i], 0) / freeDays) * freeBudget
          : freeBudget / freeCount;
        if (share < minPx) { out[i] = minPx; fixed[i] = true; clamped = true; }
        else if (share > maxPx) { out[i] = maxPx; fixed[i] = true; clamped = true; }
        else out[i] = share;
      }
      if (!clamped) break;
    }
    for (i = 0; i < n; i++) out[i] = Math.round(out[i] * 10) / 10;
    return out;
  }

  var CSS = `
/* ===== variant B — proportional vertical spine =================== */
.v-b {
  /* geometry knobs. --vb-gs scales the whole gap budget per breakpoint,
     so narrow screens get the same proportions in less height. */
  --vb-ind: 28px;        /* row indent: clears the marker box */
  --vb-mc: 10px;         /* marker centre, measured from the row content top */
  --vb-age-w: 78px;      /* fixed age gutter */
  --vb-gs: 1;
  font-family: var(--font-body);
  color: var(--ink-2);
}
.v-b[data-lang="en"] { font-family: var(--font-latin-sans); }

.v-b .vb-head {
  display: flex; align-items: flex-end; justify-content: space-between;
  flex-wrap: wrap; gap: 10px 16px; margin-bottom: 18px;
}
.v-b .vb-kicker {
  font-family: var(--font-latin-sans); font-size: 11px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--olive);
}
.v-b .vb-count { font-size: 13px; color: var(--muted); margin-top: 5px; }

.v-b .vb-modes { display: inline-flex; gap: 6px; }
.v-b .vb-mode {
  font: inherit; font-size: 11.5px; line-height: 1.6;
  color: var(--muted); background: transparent;
  border: 1px solid var(--divider); border-radius: 999px;
  padding: 2px 12px 3px; cursor: pointer;
  transition: color .15s ease, background .15s ease, border-color .15s ease;
}
.v-b .vb-mode:hover { color: var(--ink-2); border-color: var(--olive); }
.v-b .vb-mode[aria-pressed="true"] {
  color: var(--forest); background: var(--gold-dim); border-color: var(--gold-dim-2);
}
.v-b .vb-mode:focus-visible { outline: 2px solid var(--olive-2); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .v-b .vb-mode { transition: none; }
}

.v-b .vb-list { list-style: none; margin: 0; padding: 0; }

.v-b .vb-row {
  --gp: 0px;                       /* resolved gap for this row */
  position: relative;
  padding-inline-start: var(--vb-ind);
  padding-block-end: 3px;
}
/* Only rows that follow another row carry a gap. max() keeps the scaled gap
   legible on narrow screens where --vb-gs shrinks the budget. */
.v-b .vb-row.has-gap {
  --gp: max(10px, calc(var(--g, 0px) * var(--vb-gs, 1)));
  padding-block-start: var(--gp);
}

/* The spine. One segment per row so it stays continuous through variable-
   height content; the two end rows trim it back to their own marker. */
.v-b .vb-rail {
  position: absolute; inset-block: 0; inset-inline-start: 8px;
  width: 2px; background: var(--divider); pointer-events: none;
}
.v-b .vb-row.is-birth .vb-rail { top: calc(var(--gp) + var(--vb-mc)); }
.v-b .vb-row.is-mart  .vb-rail { bottom: auto; height: calc(var(--gp) + var(--vb-mc)); }

.v-b .vb-mark {
  position: absolute; inset-inline-start: 0;
  top: calc(var(--gp) + var(--vb-mc) - 9px);
  width: 18px; height: 18px;
  display: flex; align-items: center; justify-content: center;
}
.v-b .vb-dot { display: block; }
.v-b .vb-dot-birth {
  width: 11px; height: 11px; border-radius: 50%;
  background: var(--olive); box-shadow: 0 0 0 3px var(--paper), 0 0 0 4px var(--olive);
}
.v-b .vb-dot-ev {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--paper); border: 2px solid var(--ink-2);
  box-shadow: 0 0 0 3px var(--paper);
}
.v-b .vb-dot-mart {
  width: 10px; height: 10px; background: var(--forest);
  transform: rotate(45deg); box-shadow: 0 0 0 3px var(--paper), 0 0 0 4px var(--forest);
}

/* Span label for a long quiet stretch. Sits inside the gap, tied to the spine
   by a hairline tick. aria-hidden: it is derived from the two dates the rows
   already announce — a visual annotation of the emptiness, not new content. */
.v-b .vb-span {
  position: absolute; inset-inline-start: 10px; top: 0; height: var(--gp);
  display: flex; align-items: center; overflow: hidden;
  font-size: 10.5px; line-height: 1.3; color: var(--faint);
  letter-spacing: .02em; white-space: nowrap; pointer-events: none;
}
.v-b .vb-span::before {
  content: ""; display: block; width: 11px; height: 1px;
  background: var(--divider); margin-inline-end: 7px; flex: none;
}

/* Body. margin-inline-start reserves the age gutter on wide screens. */
.v-b .vb-body { margin-inline-start: calc(var(--vb-age-w) + 12px); min-width: 0; }
.v-b .vb-name {
  font-size: 14px; line-height: 1.45; font-weight: 600; color: var(--ink);
  overflow-wrap: anywhere;      /* the whole point: long names wrap, never overflow */
}
.v-b .vb-row.is-birth .vb-name,
.v-b .vb-row.is-mart  .vb-name { font-family: var(--font-display); font-size: 15px; }
.v-b .vb-row.is-birth .vb-name { color: var(--olive-2); }
.v-b .vb-row.is-mart  .vb-name { color: var(--forest); }
.v-b .vb-meta {
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px;
  margin-top: 1px; min-width: 0;
}
.v-b .vb-date {
  font-size: 12px; line-height: 1.45; color: var(--muted);
  font-variant-numeric: tabular-nums; overflow-wrap: anywhere;
}
.v-b .vb-days { font-size: 11.5px; color: var(--faint); font-variant-numeric: tabular-nums; }

/* Age gutter — pulled out of the meta line into its own fixed column so the
   ages stack into a scannable vertical column of their own. */
.v-b .vb-age {
  position: absolute; inset-inline-start: var(--vb-ind);
  top: calc(var(--gp) + 1px); width: var(--vb-age-w);
}
.v-b .vb-pill {
  display: inline-block; white-space: nowrap;
  font-size: 11.5px; line-height: 1.5; color: var(--forest);
  background: var(--gold-dim); border: 1px solid var(--gold-dim-2);
  border-radius: 999px; padding: 1px 8px 2px;
  font-variant-numeric: tabular-nums;
}
.v-b .vb-pill .u { font-size: 10px; opacity: .82; margin-inline-start: 3px; }
.v-b .vb-row.is-mart .vb-pill {
  color: var(--forest); background: var(--gold-dim-2);
  border-color: var(--forest-2); font-weight: 600;
}

/* Compact mode — uniform minimal gaps. Same rows, ~40% less page height,
   for readers who want the list and not the proportion. */
.v-b.is-compact .vb-row.has-gap { --gp: 14px; }
.v-b.is-compact .vb-span { display: none; }

/* Narrow: drop the gutter, let the age pill rejoin the meta line, and shrink
   the gap budget. Nothing reflows sideways — rows only ever get taller. */
@media (max-width: 560px) {
  .v-b { --vb-gs: .6; --vb-ind: 26px; }
  .v-b .vb-body { margin-inline-start: 0; }
  .v-b .vb-age { position: static; width: auto; }
  .v-b .vb-name { font-size: 13.5px; }
  .v-b .vb-row.is-birth .vb-name,
  .v-b .vb-row.is-mart  .vb-name { font-size: 14.5px; }
  .v-b .vb-head { margin-bottom: 14px; }
}
@media (max-width: 380px) {
  .v-b { --vb-gs: .5; }
}
`;

  function render(person, events, lang) {
    var ar = lang !== "en";
    if (!person || !person.birth || !person.martyrdom) return '<div class="v-b"></div>';
    var tB = tOf(person.birth), tM = tOf(person.martyrdom);
    if (!isFinite(tB) || !isFinite(tM) || tM <= tB) return '<div class="v-b"></div>';

    var evs = _events(events, person.birth, person.martyrdom);
    var totalDays = Math.floor((tM - tB) / DAY);
    var totalAge = calSpan(person.birth, person.martyrdom).y;

    // entries: birth, …events…, martyrdom
    var entries = [{ kind: "birth", iso: String(person.birth).slice(0, 10) }];
    evs.forEach(function (e) {
      entries.push({
        kind: "ev",
        iso: String(e.start_date).slice(0, 10),
        name: (lang === "en" && e.name_en && String(e.name_en).trim()) ? e.name_en : (e.name_ar || ""),
        age: e.age_at_start
      });
    });
    entries.push({ kind: "mart", iso: String(person.martyrdom).slice(0, 10) });

    // gaps[i] belongs to entries[i+1]
    var days = [];
    for (var i = 1; i < entries.length; i++) {
      days.push(Math.max((tOf(entries[i].iso) - tOf(entries[i - 1].iso)) / DAY, 0));
    }
    var budget = Math.min(560, Math.max(220, days.length * 30));
    var gaps = allocGaps(days, budget, 16, 132);

    var h = '<div class="v-b" data-lang="' + (ar ? "ar" : "en") + '">';

    h += '<div class="vb-head"><div>' +
      '<div class="vb-kicker">' + (ar ? "خطّ الحياة" : "Lifespan") + "</div>" +
      (evs.length ? '<div class="vb-count">' +
        (ar ? countLabel(evs.length, ar) + " وقعت في حياته"
            : countLabel(evs.length, ar) + " fell within his lifetime") + "</div>" : "") +
      "</div>" +
      '<div class="vb-modes" role="group" aria-label="' +
        (ar ? "كثافة الخط" : "Spine density") + '">' +
        '<button type="button" class="vb-mode" data-mode="scaled" aria-pressed="true">' +
          (ar ? "متناسب" : "Proportional") + "</button>" +
        '<button type="button" class="vb-mode" data-mode="compact" aria-pressed="false">' +
          (ar ? "مضغوط" : "Compact") + "</button>" +
      "</div></div>";

    h += '<ol class="vb-list" aria-label="' +
      (ar ? "من الميلاد إلى الاستشهاد" : "From birth to martyrdom") + '">';

    entries.forEach(function (en, idx) {
      var g = idx > 0 ? gaps[idx - 1] : 0;
      var cls = "vb-row" + (idx > 0 ? " has-gap" : "") +
        (en.kind === "birth" ? " is-birth" : en.kind === "mart" ? " is-mart" : " is-ev");
      h += '<li class="' + cls + '"' + (idx > 0 ? ' style="--g:' + g + 'px"' : "") + ">";
      h += '<span class="vb-rail" aria-hidden="true"></span>';
      h += '<span class="vb-mark" aria-hidden="true"><span class="vb-dot vb-dot-' +
        (en.kind === "birth" ? "birth" : en.kind === "mart" ? "mart" : "ev") + '"></span></span>';

      if (idx > 0 && g >= 34) {
        var gl = gapLabel(entries[idx - 1].iso, en.iso, ar);
        if (gl) h += '<span class="vb-span" aria-hidden="true">' + _esc(gl) + "</span>";
      }

      h += '<div class="vb-body">';
      if (en.kind === "birth") {
        h += '<div class="vb-name">' + (ar ? "الميلاد" : "Birth") + "</div>";
        h += '<div class="vb-meta"><span class="vb-date">' + _esc(_date(en.iso, lang)) + "</span></div>";
      } else if (en.kind === "mart") {
        h += '<div class="vb-name">' + (ar ? "الاستشهاد" : "Martyrdom") + "</div>";
        h += '<div class="vb-meta"><span class="vb-date">' + _esc(_date(en.iso, lang)) + "</span>" +
          '<span class="vb-days">' +
            (ar ? totalDays.toLocaleString("ar-EG") + " يوماً" : totalDays.toLocaleString("en-US") + " days") +
          "</span>" +
          '<span class="vb-age"><span class="vb-pill">' + _num(totalAge, ar) +
            '<span class="u">' + (ar ? "عاماً" : "yrs") + "</span></span></span>" +
          "</div>";
      } else {
        h += '<div class="vb-name">' + _esc(en.name) + "</div>";
        h += '<div class="vb-meta"><span class="vb-date">' + _esc(_date(en.iso, lang)) + "</span>" +
          (en.age != null
            ? '<span class="vb-age"><span class="vb-pill">' + _num(en.age, ar) +
              '<span class="u">' + (ar ? "عاماً" : "yrs") + "</span></span></span>"
            : "") +
          "</div>";
      }
      h += "</div></li>";
    });

    h += "</ol></div>";
    return h;
  }

  // No measurement pass exists in this design — layout is entirely declarative,
  // so mount() only wires the density toggle. Delegated listener + a dataset
  // flag make it idempotent and safe to re-call on resize.
  function mount(rootEl) {
    if (!rootEl) return;
    var root = (rootEl.classList && rootEl.classList.contains("v-b"))
      ? rootEl : rootEl.querySelector(".v-b");
    if (!root || root.dataset.vbWired === "1") return;
    root.dataset.vbWired = "1";
    root.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest(".vb-mode") : null;
      if (!btn || !root.contains(btn)) return;
      var compact = btn.getAttribute("data-mode") === "compact";
      root.classList.toggle("is-compact", compact);
      Array.prototype.forEach.call(root.querySelectorAll(".vb-mode"), function (b) {
        b.setAttribute("aria-pressed",
          String((b.getAttribute("data-mode") === "compact") === compact));
      });
    });
  }

  global.VARIANTS[KEY] = {
    key: KEY,
    labelAr: "المحور العمودي المتناسب",
    labelEn: "Proportional vertical spine",
    blurbAr: "يقلب الخط رأسياً فيصير لكل حدث سطرٌ خاص، وتُرسم المسافة بين حدثين بمقدار السنوات الفاصلة بينهما، فتُقرأ سنوات الطفولة الهادئة طولاً وتُقرأ السنوات الأخيرة تلاحقاً.",
    blurbEn: "Rotates the axis to vertical so every event owns a line, and sizes the space between two entries by the years that actually separate them — the quiet childhood reads long, the final years read fast.",
    tradeoffAr: "الثمن هو الطول: خمسة عشر حدثاً تعني نحو ١٢٣٠ بكسل من التمرير، ويختفي الإحساس بالحياة كلها في لمحة واحدة.",
    tradeoffEn: "The cost is height: fifteen events means roughly 1230px of scrolling, and you lose the single-glance read of a whole life.",
    css: CSS,
    render: render,
    mount: mount
  };
})(window);
