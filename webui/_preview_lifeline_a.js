/* ============================================================================
   AQMAR lifespan line — Variant A: "الخط المرقّم" / Numbered ledger.

   The axis carries ONLY proportion + order: a dot and a small ordinal at each
   event's exact date. The words (name / date / age) live once, in a numbered
   ledger below. The ordinal is the join. Nothing is printed twice.

   Why this survives 15 events where the current design does not:
     - An ordinal is ~10-16px wide instead of ~180px, so horizontal collision
       is rare instead of guaranteed.
     - Where two events ARE too close (2004-03-22 / 2004-09-30 = 0.92% apart),
       the second ordinal moves UP one row — perpendicular to the axis — and
       keeps a hairline down to its own dot. It is never moved ALONG the axis,
       so it never names a date it does not sit on.
     - Row assignment is computed in percent from a conservative minimum gap
       (5.4% ~= 16px on a 300px-wide plot = the 360px viewport). It needs no
       measurement, so the static render is already correct: no mount(), no
       resize pass, no layout thrash. mount() only adds the highlight link.
     - The axis spans birth -> martyrdom exactly (not birth -> today). The old
       "today" tail wasted ~6% of the width on a stretch no event can occupy.
     - Every event is a POINT. No duration bands, so the null end_date bug
       (band drawn from the event all the way to the death date) cannot occur,
       and the legend no longer advertises a band type that never appears.

   Positions are emitted as calc(PAD + (100% - 2*PAD) * f) so the plot has a
   12px gutter at each end: an event on the birth day lands at the gutter, not
   half-outside the card. RTL is converted in JS (phys()) exactly as
   renderTimeline() does; only the life gradient needs a physical CSS override.
   ========================================================================== */

window.VARIANTS = window.VARIANTS || {};

window.VARIANTS['a'] = {
  key: 'a',
  labelAr: 'الخطّ المرقّم',
  labelEn: 'Numbered ledger',
  blurbAr: 'يحمل الخطّ الأرقام ومواضعها الدقيقة فقط، وتنزل الأسماء والتواريخ والأعمار إلى قائمة مرقّمة تحته، فلا يُزاح اسمٌ عن تاريخه أبداً.',
  blurbEn: 'The axis carries only small ordinals at their exact dates; the names, dates and ages live once in a numbered ledger below, so no label is ever displaced from the date it names.',
  tradeoffAr: 'لا يُقرأ اسم الحدث من الخطّ مباشرة؛ يحتاج القارئ نقلة بصرية من الرقم على الخطّ إلى سطره في القائمة.',
  tradeoffEn: 'No event name is readable from the axis itself — the reader must glance from the ordinal on the line down to its row in the ledger.',

  css: `
.v-a { font-family: var(--font-body); color: var(--ink); }
.v-a *, .v-a *::before, .v-a *::after { box-sizing: border-box; }

/* ---- header: the one sentence the whole component is about ---- */
.v-a .va-head { margin-bottom: 14px; }
.v-a .va-kicker {
  font-family: var(--font-latin-sans); font-size: 11px; line-height: 14px;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--olive);
}
.v-a[data-lang="ar"] .va-kicker { font-family: var(--font-body); letter-spacing: 0.08em; }
.v-a .va-lived {
  font-family: var(--font-display); font-size: 22px; line-height: 30px;
  font-weight: 500; margin-top: 3px;
}
.v-a .va-lived b { color: var(--forest); font-weight: 700; }
.v-a .va-lived .va-days { color: var(--muted); font-size: 15px; }

/* ---- the plot: ordinals above, axis, year ruler below ---- */
.v-a .va-plot { position: relative; }
.v-a .va-life {
  position: absolute; inset-inline: 12px; height: 4px; border-radius: 999px;
  background: linear-gradient(to right, var(--olive), var(--forest));
}
/* linear-gradient has no logical direction — flip it so olive always sits on
   the birth end (right in Arabic, left in English). */
html[dir="rtl"] .v-a .va-life { background: linear-gradient(to left, var(--olive), var(--forest)); }

.v-a .va-mk { position: absolute; transform: translateX(-50%); }
.v-a .va-mk-birth {
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--olive); border: 3px solid var(--paper);
  box-shadow: 0 0 0 1px var(--olive);
}
.v-a .va-mk-mart {
  width: 10px; height: 10px; background: var(--forest);
  transform: translateX(-50%) rotate(45deg);
  box-shadow: 0 0 0 3px var(--paper), 0 0 0 4px var(--forest);
}
.v-a .va-dot {
  position: absolute; transform: translateX(-50%);
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--paper); border: 2px solid var(--ink-2);
  box-shadow: 0 0 0 2px var(--paper);
  transition: background-color 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
}
.v-a .va-dot.is-on {
  background: var(--forest); border-color: var(--forest);
  box-shadow: 0 0 0 2px var(--paper), 0 0 0 4px var(--gold-dim-2);
}

/* Ordinals. Displacement is vertical only (row = perpendicular to the axis);
   the horizontal centre is always the event's true date. */
.v-a .va-num {
  position: absolute; transform: translateX(-50%);
  height: 14px; line-height: 12px; padding-inline: 3px;
  border: 1px solid transparent; border-radius: 999px;
  font-size: 10.5px; font-weight: 600; color: var(--muted);
  font-variant-numeric: tabular-nums; white-space: nowrap;
  transition: color 0.14s ease, background-color 0.14s ease, border-color 0.14s ease;
}
.v-a[data-lang="en"] .va-num { font-family: var(--font-latin-sans); }
.v-a .va-num::after {
  content: ""; position: absolute; left: 50%; top: 100%;
  width: 1px; height: var(--va-drop, 8px);
  background: var(--divider); transform: translateX(-50%);
  transition: background-color 0.14s ease;
}
.v-a .va-num.is-on {
  color: var(--forest); background: var(--gold-dim); border-color: var(--gold-dim-2);
}
.v-a .va-num.is-on::after { background: var(--forest); }

/* Year ruler — major ticks are labelled, minor ticks are half-step hairlines.
   Suppressed only within 8% of either end, where the endpoint captions sit. */
.v-a .va-tick {
  position: absolute; width: 1px; background: var(--divider);
  transform: translateX(-50%);
}
.v-a .va-tick-minor { opacity: 0.6; }
.v-a .va-ylab {
  position: absolute; transform: translateX(-50%); white-space: nowrap;
  font-size: 10px; line-height: 12px; color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.v-a[data-lang="en"] .va-ylab { font-family: var(--font-latin-sans); }

/* ---- endpoint captions: pinned to the two ends by logical properties ---- */
.v-a .va-ends {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 12px; padding-inline: 12px; margin-top: 4px;
}
.v-a .va-end { display: flex; align-items: baseline; gap: 6px; }
.v-a .va-end-mart { text-align: end; }
.v-a .va-end-k { font-size: 11px; color: var(--faint); }
.v-a .va-end-y { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
.v-a .va-end-birth .va-end-y { color: var(--olive-2); }
.v-a .va-end-mart .va-end-y { color: var(--forest); }

/* ---- the ledger: the only place words live ---- */
.v-a .va-lg-h {
  margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--divider);
  font-size: 12px; letter-spacing: 0.06em; color: var(--olive);
}
.v-a .va-lg-h .va-count { color: var(--muted); }
.v-a .va-ledger {
  list-style: none; margin: 10px 0 0; padding: 0;
  columns: 280px 4; column-gap: 26px;
  column-rule: 1px solid var(--divider);
}
.v-a .va-item { break-inside: avoid; margin: 0 0 2px; }
.v-a .va-row {
  display: flex; align-items: flex-start; gap: 9px; width: 100%;
  margin: 0; padding: 5px 8px; text-align: start;
  background: transparent; border: 1px solid transparent; border-radius: 8px;
  font: inherit; color: inherit; cursor: pointer;
  transition: background-color 0.14s ease, border-color 0.14s ease;
}
.v-a .va-row:hover, .v-a .va-row:focus-visible, .v-a .va-row.is-on {
  background: var(--gold-dim); border-color: var(--gold-dim-2);
}
.v-a .va-row:focus-visible { outline: 2px solid var(--forest); outline-offset: 1px; }
.v-a .va-badge {
  flex: none; min-width: 20px; height: 20px; padding-inline: 4px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 999px; background: var(--bg-3); border: 1px solid var(--divider);
  font-size: 11px; font-weight: 700; color: var(--muted);
  font-variant-numeric: tabular-nums;
  transition: background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease;
}
.v-a[data-lang="en"] .va-badge { font-family: var(--font-latin-sans); }
.v-a .va-row.is-on .va-badge,
.v-a .va-row:hover .va-badge { background: var(--gold-dim-2); border-color: var(--forest); color: var(--forest); }
.v-a .va-body { min-width: 0; flex: 1 1 auto; }
.v-a .va-name {
  display: block; font-size: 13.5px; line-height: 20px; font-weight: 600;
  color: var(--ink); overflow-wrap: anywhere;
}
.v-a .va-meta {
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; margin-top: 2px;
}
.v-a .va-date { font-size: 11.5px; line-height: 16px; color: var(--muted); font-variant-numeric: tabular-nums; }
.v-a .va-age {
  font-size: 11px; line-height: 16px; color: var(--forest);
  background: var(--gold-dim); border: 1px solid var(--gold-dim-2);
  border-radius: 999px; padding: 0 8px 1px;
}
.v-a .va-empty { margin-top: 18px; font-size: 13px; color: var(--muted); }

@media (max-width: 480px) {
  .v-a .va-lived { font-size: 19px; line-height: 26px; }
  .v-a .va-lived .va-days { font-size: 13px; }
  .v-a .va-ledger { column-gap: 0; column-rule: none; }
}

@media (prefers-reduced-motion: reduce) {
  .v-a .va-dot, .v-a .va-num, .v-a .va-num::after, .v-a .va-row, .v-a .va-badge {
    transition: none;
  }
}
`,

  render(person, events, lang) {
    var ar = lang !== 'en';
    if (!person || !person.birth || !person.martyrdom) return '<div class="v-a"></div>';

    var ms = function (iso) {
      return new Date(String(iso).slice(0, 10) + 'T00:00:00').getTime();
    };
    var t0 = ms(person.birth);
    var t1 = ms(person.martyrdom);
    if (!isFinite(t0) || !isFinite(t1) || t1 <= t0) return '<div class="v-a"></div>';

    var span = Math.max(t1 - t0, 86400000);
    var pct = function (iso) {
      return Math.min(Math.max(((ms(iso) - t0) / span) * 100, 0), 100);
    };
    // RTL: time reads right -> left, so the physical x is mirrored here (the
    // same conversion renderTimeline() does) and CSS stays direction-agnostic.
    var phys = function (p) { return ar ? 100 - p : p; };
    var PAD = 12;
    var X = function (p) {
      return 'calc(' + PAD + 'px + (100% - ' + (PAD * 2) + 'px) * ' + (phys(p) / 100).toFixed(5) + ')';
    };
    var N = function (n) { return ar ? toArDigits(n) : String(n); };
    var nameOf = function (e) {
      if (!ar && typeof e.name_en === 'string' && e.name_en.trim()) return e.name_en;
      return e.name_ar || '';
    };
    var ageTxt = function (n) {
      return ar ? ('عمره ' + toArDigits(n) + ' عاماً') : ('Age ' + n);
    };

    var evs = eventsForPerson(events || [], person.birth, person.martyrdom);
    var age = computeAge(person.birth, person.martyrdom);
    var days = Math.floor((t1 - t0) / 86400000);

    // ---- row assignment ------------------------------------------------
    // Conservative, measurement-free: 5.4% is ~16px on a 300px plot, which is
    // the narrowest case we support (360px viewport). Deterministic across all
    // widths, so nothing reflows on resize and the pre-JS render is final.
    var MIN_GAP = 5.4;
    var lastAt = [];
    var rowOf = evs.map(function (e) {
      var p = pct(e.start_date);
      var r = 0;
      while (lastAt[r] != null && Math.abs(p - lastAt[r]) < MIN_GAP) r++;
      lastAt[r] = p;
      return r;
    });
    var R = Math.max(1, lastAt.length);

    var NUM_H = 15;
    var AXIS_Y = R * NUM_H + 10;   // top edge of the 4px life band
    var PLOT_H = AXIS_Y + 30;

    var h = '';

    // ---- header ---------------------------------------------------------
    h += '<div class="va-head">' +
      '<div class="va-kicker">' + (ar ? 'خطّ الحياة' : 'Lifespan') + '</div>' +
      '<div class="va-lived">' +
      (ar
        ? ('عاشَ <b>' + (age == null ? '—' : toArDigits(age)) + '</b> عاماً ' +
           '<span class="va-days">(' + days.toLocaleString('ar-EG') + ' يوماً)</span>')
        : ('Lived <b>' + (age == null ? '—' : age) + '</b> years ' +
           '<span class="va-days">(' + days.toLocaleString('en-US') + ' days)</span>')) +
      '</div></div>';

    // ---- plot (decorative: every word in it is repeated, in order, below) --
    h += '<div class="va-plot" aria-hidden="true" style="height:' + PLOT_H + 'px">';
    h += '<div class="va-life" style="top:' + AXIS_Y + 'px"></div>';

    // year ruler — minor half-step hairlines first so majors paint over them
    var y0 = new Date(t0).getFullYear();
    var y1 = new Date(t1).getFullYear();
    var spanY = (t1 - t0) / (365.2425 * 86400000);
    var STEPS = [1, 2, 5, 10, 20, 25, 50, 100];
    var step = STEPS[STEPS.length - 1];
    for (var si = 0; si < STEPS.length; si++) {
      if (Math.ceil(spanY / STEPS[si]) <= 7) { step = STEPS[si]; break; }
    }
    var first = Math.ceil(y0 / step) * step;
    var EDGE = 8;   // % kept clear at each end for the endpoint captions
    if (step >= 2) {
      var half = step / 2;
      for (var ym = first - step; ym <= y1; ym += step) {
        if (ym + half < y0 || ym + half > y1) continue;
        var pm = pct((ym + half) + '-01-01');
        if (pm < EDGE || pm > 100 - EDGE) continue;
        h += '<div class="va-tick va-tick-minor" style="left:' + X(pm) +
             ';top:' + (AXIS_Y + 10) + 'px;height:3px"></div>';
      }
    }
    for (var y = first; y <= y1; y += step) {
      var py = pct(y + '-01-01');
      if (py < EDGE || py > 100 - EDGE) continue;
      h += '<div class="va-tick" style="left:' + X(py) +
           ';top:' + (AXIS_Y + 10) + 'px;height:5px"></div>' +
           '<div class="va-ylab" style="left:' + X(py) + ';top:' + (AXIS_Y + 17) + 'px">' +
           N(y) + '</div>';
    }

    // endpoint markers
    h += '<div class="va-mk va-mk-birth" style="left:' + X(0) +
         ';top:' + (AXIS_Y - 4) + 'px"></div>';
    h += '<div class="va-mk va-mk-mart" style="left:' + X(100) +
         ';top:' + (AXIS_Y - 3) + 'px"></div>';

    // event dots + ordinals
    evs.forEach(function (e, i) {
      var p = pct(e.start_date);
      h += '<div class="va-dot" data-ev="' + i + '" style="left:' + X(p) +
           ';top:' + (AXIS_Y - 3) + 'px"></div>';
    });
    evs.forEach(function (e, i) {
      var p = pct(e.start_date);
      var r = rowOf[i];
      var top = (R - 1 - r) * NUM_H;
      var drop = AXIS_Y - 17 - top;   // hairline from the ordinal down to its dot
      h += '<div class="va-num" data-ev="' + i + '" style="left:' + X(p) +
           ';top:' + top + 'px;--va-drop:' + drop + 'px">' + N(i + 1) + '</div>';
    });
    h += '</div>';

    // ---- endpoint captions (kept in the a11y tree) ----------------------
    h += '<div class="va-ends">' +
      '<div class="va-end va-end-birth">' +
      '<span class="va-end-k">' + (ar ? 'الميلاد' : 'Birth') + '</span>' +
      '<span class="va-end-y">' + esc(fmtDate(person.birth, ar ? 'ar' : 'en')) + '</span>' +
      '</div>' +
      '<div class="va-end va-end-mart">' +
      '<span class="va-end-k">' + (ar ? 'الاستشهاد' : 'Martyrdom') + '</span>' +
      '<span class="va-end-y">' + esc(fmtDate(person.martyrdom, ar ? 'ar' : 'en')) + '</span>' +
      '</div></div>';

    // ---- ledger ---------------------------------------------------------
    var hid = 'va-h-' + (person.id == null ? 'x' : person.id);
    if (!evs.length) {
      h += '<div class="va-empty">' +
        (ar ? 'لا أحداث عالمية مسجّلة داخل هذه الحياة.' : 'No global events recorded inside this lifetime.') +
        '</div>';
    } else {
      h += '<div class="va-lg-h" id="' + hid + '">' +
        (ar ? 'الأحداث التي عاصرها ' : 'Events he lived through ') +
        '<span class="va-count">(' + N(evs.length) + ')</span></div>';
      h += '<ol class="va-ledger" aria-labelledby="' + hid + '">';
      evs.forEach(function (e, i) {
        h += '<li class="va-item">' +
          '<button type="button" class="va-row" data-ev="' + i + '" aria-pressed="false">' +
          '<span class="va-badge" aria-hidden="true">' + N(i + 1) + '</span>' +
          '<span class="va-body">' +
          '<span class="va-name">' + esc(nameOf(e)) + '</span>' +
          '<span class="va-meta">' +
          '<span class="va-date">' + esc(fmtDate(e.start_date, ar ? 'ar' : 'en')) + '</span>' +
          (e.age_at_start == null ? '' : '<span class="va-age">' + ageTxt(e.age_at_start) + '</span>') +
          '</span></span></button></li>';
      });
      h += '</ol>';
    }

    return '<div class="v-a" data-lang="' + (ar ? 'ar' : 'en') + '">' + h + '</div>';
  },

  // Enhancement only — the render above is already complete and correct.
  // Links a ledger row to its dot + ordinal on the axis: hover/focus previews,
  // click pins (aria-pressed). Needs no measurement, so it is a no-op on
  // resize; the __vaBound guard makes repeat calls idempotent.
  mount(rootEl) {
    if (!rootEl) return;
    var root = rootEl.classList && rootEl.classList.contains('v-a')
      ? rootEl : rootEl.querySelector('.v-a');
    if (!root || root.__vaBound) return;
    root.__vaBound = true;

    var hov = null, foc = null, pin = null;

    var apply = function () {
      var nodes = root.querySelectorAll('[data-ev]');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var k = el.getAttribute('data-ev');
        el.classList.toggle('is-on', k === hov || k === foc || k === pin);
        if (el.hasAttribute('aria-pressed')) {
          el.setAttribute('aria-pressed', k === pin ? 'true' : 'false');
        }
      }
    };
    var keyFrom = function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return null;
      var n = t.closest('[data-ev]');
      return n ? n.getAttribute('data-ev') : null;
    };

    root.addEventListener('pointerover', function (e) { hov = keyFrom(e); apply(); });
    root.addEventListener('pointerleave', function () { hov = null; apply(); });
    root.addEventListener('focusin', function (e) { foc = keyFrom(e); apply(); });
    root.addEventListener('focusout', function () { foc = null; apply(); });
    root.addEventListener('click', function (e) {
      var k = keyFrom(e);
      if (k == null) return;
      pin = (pin === k) ? null : k;
      apply();
    });
  }
};
