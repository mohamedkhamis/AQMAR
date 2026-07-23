// webui/lifeline/design-w.js — "الخطّ المتدرّج" / Tiered line
//
// One selectable lifespan-line design. Registers itself on
// window.AQMAR_LIFELINE_DESIGNS; lifeline-designs.js adapts that into
// window.AQMAR_LIFELINE and attaches the display name.
//
// Styles: this module carries its own CSS, scoped to .lfd-w, and the
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
// Option W — the minimal fix the user asked for: keep the CURRENT horizontal
// line, wrap each event name onto ~2 lines, and make it actually FIT the real
// 18-event data.
//
// Three changes, in order of how much they buy:
//   1. Wrap: white-space:normal + a capped width, so a name is ~2 short lines
//      instead of one 180px run.
//   2. Shorten: the on-line label drops the trailing parenthetical
//      ("معركة الفرقان (الحرب على غزة الأولى)" → "معركة الفرقان"); the full
//      name stays in the title attribute. This is what makes 2 lines enough.
//   3. Stack: labels are packed into as many rows as the local density needs
//      (above1/below1/above2/below2/…) instead of exactly two. A label is
//      placed at its TRUE x — it is never slid sideways to make room, so the
//      label can no longer lie about the date. Only the two end labels are
//      clamped so they don't run outside the card.
//
// The band bug is gone: every event is a single point, no duration bars.
// Scoped under .lfd-w.
window.AQMAR_LIFELINE_DESIGNS = window.AQMAR_LIFELINE_DESIGNS || {};
window.AQMAR_LIFELINE_DESIGNS['w'] = {
  key: 'w',
  labelAr: 'الحالي + لفّ سطرين',
  labelEn: 'Current + 2-line wrap',
  blurbAr: 'نفس الخط الأفقي الحالي، لكن اسم الحدث يُلفّ على سطرين، ويُختصر ما بين القوسين، وتُرصّ الأسماء في صفوف متعددة حسب الازدحام — فيبقى كل اسم فوق تاريخه تماماً بلا انزياح ولا تراكب.',
  blurbEn: 'The same horizontal line as today, but each event name wraps onto two lines, the parenthetical is trimmed, and labels stack into as many rows as the crowding needs — so every name sits exactly over its own date, with no drift and no overlap.',
  tradeoffAr: 'الثمن هو الارتفاع: الحالات المزدحمة (١٣–١٥ حدثاً) تحتاج صفوفاً أكثر فيطول القسم؛ والاسم المختصر يحتاج المرور بالفأرة لرؤية النص الكامل.',
  tradeoffEn: 'The cost is height: crowded cases (13–15 events) need more rows so the section gets taller, and the shortened name needs a hover to reveal the full text.',

  css: `
.lfd-w .lifeline-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 22px; }
.lfd-w .lifeline-kicker { font-family: var(--font-latin-sans); font-size: 11px; letter-spacing: 0.2em; color: var(--olive); text-transform: uppercase; }
.lfd-w .lifeline-lived { font-family: var(--font-display); font-size: 22px; font-weight: 500; margin-top: 4px; }
.lfd-w .lifeline-lived b { color: var(--forest); }
.lfd-w .lifeline-lived .days { color: var(--muted); font-size: 16px; }
.lfd-w .lifeline-legend { display: flex; gap: 18px; font-size: 12px; color: var(--muted); flex-wrap: wrap; align-items: center; }
.lfd-w .lifeline-legend > span { display: inline-flex; align-items: center; gap: 6px; }
.lfd-w .sw { flex: none; display: inline-block; }
.lfd-w .sw-birth { width: 10px; height: 10px; border-radius: 50%; background: var(--olive); box-shadow: 0 0 0 3px var(--paper), 0 0 0 4px var(--olive); }
.lfd-w .sw-mart { width: 10px; height: 10px; background: var(--forest); transform: rotate(45deg); }
.lfd-w .sw-event { width: 10px; height: 10px; border-radius: 50%; background: var(--paper); border: 2px solid var(--ink-2); }

/* Height is set by mount() from the number of rows actually used. --axis is
   the y of the line inside .lifeline, also written by mount(). */
.lfd-w .lifeline { position: relative; margin-inline: 12px; --axis: 140px; }
.lfd-w .lifeline-leaders { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.lfd-w .lifeline-leaders line { stroke: var(--faint); stroke-width: 1; }
.lfd-w .lifeline-base { position: absolute; inset-inline: 0; top: var(--axis); height: 2px; background: var(--divider); }
.lfd-w .lifeline-life { position: absolute; top: calc(var(--axis) - 2px); height: 6px; border-radius: 999px; background: linear-gradient(to right, var(--olive), var(--forest)); }
html[dir="rtl"] .lfd-w .lifeline-life { background: linear-gradient(to left, var(--olive), var(--forest)); }
.lfd-w .lifeline-tick { position: absolute; top: calc(var(--axis) - 3px); width: 1px; height: 8px; background: var(--faint); transform: translateX(-50%); }
.lfd-w .lifeline-tick span { position: absolute; top: 11px; left: 50%; transform: translateX(-50%); font-family: var(--font-latin-sans); font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums; }
.lfd-w .lifeline .mk { position: absolute; transform: translateX(-50%); }
.lfd-w .lifeline .mk-birth { top: calc(var(--axis) - 8px); width: 16px; height: 16px; border-radius: 50%; background: var(--olive); border: 3px solid var(--paper); box-shadow: 0 0 0 1px var(--olive); }
.lfd-w .lifeline .mk-mart { top: calc(var(--axis) - 7px); width: 14px; height: 14px; background: var(--forest); box-shadow: 0 0 0 3px var(--paper), 0 0 0 4px var(--forest); transform: translateX(-50%) rotate(45deg); }
.lfd-w .lifeline .mk-event { top: calc(var(--axis) - 6px); width: 12px; height: 12px; border-radius: 50%; background: var(--paper); border: 2px solid var(--ink-2); box-shadow: 0 0 0 2px var(--paper); }
.lfd-w .mk-year { position: absolute; transform: translateX(-50%); white-space: nowrap; font-family: var(--font-naskh); font-size: 12px; font-weight: 700; }
.lfd-w .mk-year-birth { top: calc(var(--axis) - 32px); color: var(--olive); }
.lfd-w .mk-year-mart { top: calc(var(--axis) + 16px); color: var(--forest); }

/* THE CHANGE: wrap within a capped width instead of white-space:nowrap. */
.lfd-w .lifeline .ev-label { position: absolute; text-align: center; white-space: normal;
  width: 108px; line-height: 1.25; visibility: hidden; overflow-wrap: break-word; }
.lfd-w .lifeline .ev-label .n { font-size: 12px; font-weight: 600; color: var(--ink-2); }
.lfd-w .lifeline .ev-label .a { font-size: 10.5px; color: var(--forest); margin-top: 1px; }
/* mount() flags anything it could not place honestly (edge clamp > 1 year). */


/* ≤480px the current design already swaps to the vertical list; unchanged. */
.lfd-w .below480-note { display: none; color: var(--muted); font-size: 13px; padding: 8px 0; }
@media (max-width: 480px) {
  .lfd-w .lifeline { display: none; }
  .lfd-w .below480-note { display: block; }
}
`,

  render(m, allEvents, lang) {
    const ar = lang === 'ar';
    const num = (n) => ar ? toArDigits(n) : String(n);
    // Drop a trailing parenthetical for the on-line label — this is what makes
    // two lines sufficient. Full name is kept in title=.
    const shortName = (s) => String(s).replace(/\s*[（(][^)）]*[)）]\s*$/, '').trim() || String(s);

    const t0 = new Date(String(m.birth).slice(0, 10) + 'T00:00:00').getTime();
    const tMart = new Date(String(m.martyrdom).slice(0, 10) + 'T00:00:00').getTime();
    if (!Number.isFinite(t0) || !Number.isFinite(tMart) || tMart <= t0) return '';
    const t1 = Math.max(Date.now(), tMart);
    const span = Math.max(t1 - t0, 86400000);
    const pct = (iso) => {
      const t = new Date(String(iso).slice(0, 10) + 'T00:00:00').getTime();
      return Math.min(Math.max(((t - t0) / span) * 100, 0), 100);
    };
    const phys = (p) => (ar ? 100 - p : p);
    const pBirth = pct(m.birth), pMart = pct(m.martyrdom);
    const birthY = String(m.birth).slice(0, 4), martY = String(m.martyrdom).slice(0, 4);
    const days = Math.floor((tMart - t0) / 86400000);
    const age = computeAge(m.birth, m.martyrdom);
    const evs = eventsForPerson(allEvents, m.birth, m.martyrdom);

    let h = `<div class="lfd-w">
      <div class="lifeline-head">
        <div>
          <div class="lifeline-kicker">${ar ? 'خطّ الحياة' : 'Lifespan'}</div>
          <div class="lifeline-lived">
            ${ar
              ? `عاشَ <b>${num(age)}</b> عاماً <span class="days">(${num(days)} يوماً)</span>`
              : `Lived <b>${age}</b> years <span class="days">(${days.toLocaleString()} days)</span>`}
          </div>
        </div>
        <div class="lifeline-legend">
          <span><span class="sw sw-birth"></span>${ar ? 'الميلاد' : 'Birth'}</span>
          <span><span class="sw sw-mart"></span>${ar ? 'الاستشهاد' : 'Martyrdom'}</span>
          ${evs.length ? `<span><span class="sw sw-event"></span>${ar ? 'حدث' : 'Event'}</span>` : ''}
        </div>
      </div>`;

    h += `<div class="lifeline" data-span="${span}">
      <svg class="lifeline-leaders" aria-hidden="true"></svg>
      <div class="lifeline-base"></div>
      <div class="lifeline-life" style="left:${Math.min(phys(pBirth), phys(pMart))}%; width:${Math.abs(pMart - pBirth)}%;"></div>`;
    // NO bands — every event is a single point in time.
    const markerPcts = [pBirth, pMart, ...evs.map(e => pct(e.start_date))];
    const yStart = Math.ceil(parseInt(birthY, 10) / 5) * 5;
    const yEnd = new Date().getFullYear();
    for (let y = yStart; y <= yEnd; y += 5) {
      const tp = pct(`${y}-01-01`);
      if (markerPcts.some(mp => Math.abs(mp - tp) < 3)) continue;
      h += `<div class="lifeline-tick" style="left:${phys(tp)}%;"><span>${y}</span></div>`;
    }
    h += `<div class="mk mk-birth" style="left:${phys(pBirth)}%;"></div>
          <div class="mk-year mk-year-birth" style="left:${phys(pBirth)}%;">${birthY}</div>
          <div class="mk mk-mart" style="left:${phys(pMart)}%;"></div>
          <div class="mk-year mk-year-mart" style="left:${phys(pMart)}%;">${martY}</div>`;
    evs.forEach((e) => {
      const x = phys(pct(e.start_date));
      const full = eventDisplayName(e, lang);
      // Tooltip carries what the line itself no longer repeats: the untrimmed
      // name and the exact date. That is why there is no duplicate list below.
      const tip = `${full} — ${formatDate(e.start_date, lang)}`;
      h += `<div class="mk mk-event" style="left:${x}%;"></div>
            <div class="ev-label" data-x="${x}" title="${esc(tip)}">
              <div class="n">${esc(shortName(full))}</div>
              ${e.age_at_start != null
                ? `<div class="a">${ar ? `عمره ${num(e.age_at_start)}` : `Age ${e.age_at_start}`}</div>`
                : ''}
            </div>`;
    });
    h += `</div>`;
    h += `<div class="below480-note">${ar
      ? '≤٤٨٠px: يختفي الخط الأفقي وتظهر القائمة العمودية (كما هو الحال اليوم).'
      : '≤480px: the horizontal line is hidden and the vertical list takes over (unchanged).'}</div>`;
    h += `</div>`;
    return h;
  },

  // Pack labels into rows at their TRUE x. Rows alternate above/below and grow
  // outward only as far as the crowding demands. Idempotent.
  mount(root) {
    const tl = root.querySelector('.lifeline');
    if (!tl || tl.offsetParent === null) return;
    const svg = tl.querySelector('.lifeline-leaders');
    const labels = Array.from(tl.querySelectorAll('.ev-label'));
    if (!svg) return;
    const W = tl.clientWidth;
    const yearsSpan = (parseFloat(tl.dataset.span) || 1) / (365.25 * 86400000);
    const GAP = 10;

    labels.forEach(l => { l.classList.remove('drifted'); l.style.visibility = 'hidden'; });
    if (!labels.length) return;

    // Measure each label at its natural (capped) width.
    const items = labels.map(l => ({
      el: l,
      x: (parseFloat(l.dataset.x) / 100) * W,
      w: l.offsetWidth,
      h: l.offsetHeight,
    })).sort((a, b) => a.x - b.x);

    // Greedy first-fit into rows, keeping x exact. Only the extreme ends are
    // clamped so a label cannot render outside the card.
    const rows = [];   // rows[i] = right edge consumed so far
    items.forEach((it) => {
      let left = it.x - it.w / 2;
      let clamped = 0;
      if (left < 0) { clamped = -left; left = 0; }
      if (left + it.w > W) { clamped = (left + it.w) - W; left = W - it.w; }
      let r = 0;
      while (r < rows.length && left < rows[r] + GAP) r++;
      if (r === rows.length) rows.push(0);
      rows[r] = left + it.w;
      it.row = r;
      it.left = left;
      it.driftYears = Math.abs((left + it.w / 2) - it.x) / W * yearsSpan;
    });

    const rowCount = rows.length;
    const maxH = Math.max(...items.map(i => i.h));
    const rowH = maxH + 12;
    // CLEAR reserves the band immediately around the axis for the birth /
    // martyrdom year labels, so an event at age 0-1 can't collide with the
    // birth year (measured: a 13x10px overlap before this was reserved).
    const CLEAR = 40;
    // Rows alternate above / below, expanding outward from the axis.
    const above = Math.ceil(rowCount / 2), below = Math.floor(rowCount / 2);
    const axis = above * rowH + CLEAR + 12;
    const height = axis + Math.max(below * rowH + CLEAR + 12, 60);
    tl.style.setProperty('--axis', axis + 'px');
    tl.style.height = height + 'px';
    svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
    svg.innerHTML = '';

    items.forEach((it) => {
      const isAbove = it.row % 2 === 0;
      const depth = Math.floor(it.row / 2);           // 0 = closest to the axis
      it.el.style.left = it.left + 'px';
      if (isAbove) {
        it.el.style.top = (axis - CLEAR - (depth + 1) * rowH + (rowH - it.h)) + 'px';
        it.el.style.bottom = 'auto';
      } else {
        it.el.style.top = (axis + CLEAR + depth * rowH) + 'px';
        it.el.style.bottom = 'auto';
      }
      it.el.style.visibility = 'visible';
      if (it.driftYears > 1) it.el.classList.add('drifted');
      // Leader from the marker to the label edge nearest the axis.
      const y1 = isAbove ? axis - 10 : axis + 10;
      const y2 = isAbove
        ? axis - CLEAR - (depth + 1) * rowH + (rowH - it.h) + it.h
        : axis + CLEAR + depth * rowH;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', it.x);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', it.left + it.w / 2);
      line.setAttribute('y2', y2);
      svg.appendChild(line);
    });

  },
};
