// Baseline for the preview page: a faithful port of the CURRENT lifespan line
// (renderTimeline + dodgeTimelineLabels in app.js, the "Lifespan line + global
// events" block in styles.css), with every selector scoped under .v-now so it
// can sit beside the proposed options. Behaviour is unchanged on purpose —
// including the band bug (end_date null draws a band to the death date), which
// is what the redesign has to remove.
window.VARIANTS = window.VARIANTS || {};
window.VARIANTS['now'] = {
  key: 'now',
  labelAr: 'الشكل الحالي',
  labelEn: 'Current design',
  blurbAr: 'ما هو منشور اليوم: محور أفقي، أسماء الأحداث فوق الخط وتحته، ثم نفس الأحداث مكرّرة في قائمة بالأسفل.',
  blurbEn: 'What is live today: a horizontal axis with event names above and below the line, then the same events repeated in a list underneath.',
  tradeoffAr: 'مع ١٥ حدثاً تخرج الأسماء خارج البطاقة ويبتعد الاسم عن تاريخه الحقيقي حتى ٣٧ سنة، وتتراكب ١٥ شريطاً ذهبياً فوق خط العمر كاملاً.',
  tradeoffEn: 'At 15 events the labels overflow the card, a name can sit up to 37 years away from the date it marks, and 15 gold bands stack over the whole life bar.',

  css: `
.v-now .lifeline-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 26px; }
.v-now .lifeline-kicker { font-family: var(--font-latin-sans); font-size: 11px; letter-spacing: 0.2em; color: var(--olive); text-transform: uppercase; }
.v-now .lifeline-lived { font-family: var(--font-display); font-size: 22px; font-weight: 500; margin-top: 4px; }
.v-now .lifeline-lived b { color: var(--forest); }
.v-now .lifeline-lived .days { color: var(--muted); font-size: 16px; }
.v-now .lifeline-legend { display: flex; gap: 18px; font-size: 12px; color: var(--muted); flex-wrap: wrap; align-items: center; }
.v-now .lifeline-legend > span { display: inline-flex; align-items: center; gap: 6px; }
.v-now .sw { flex: none; display: inline-block; }
.v-now .sw-birth { width: 10px; height: 10px; border-radius: 50%; background: var(--olive); box-shadow: 0 0 0 3px var(--paper), 0 0 0 4px var(--olive); }
.v-now .sw-mart { width: 10px; height: 10px; background: var(--forest); transform: rotate(45deg); }
.v-now .sw-event { width: 10px; height: 10px; border-radius: 50%; background: var(--paper); border: 2px solid var(--ink-2); }
.v-now .sw-band { width: 18px; height: 8px; border-radius: 4px; background: var(--gold-dim); border: 1px solid var(--gold-dim-2); }
.v-now .lifeline { position: relative; height: 210px; margin-inline: 12px; }
.v-now .lifeline-leaders { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.v-now .lifeline-leaders line { stroke: var(--faint); stroke-width: 1; }
.v-now .lifeline-base { position: absolute; inset-inline: 0; top: 112px; height: 2px; background: var(--divider); }
.v-now .lifeline-life { position: absolute; top: 110px; height: 6px; border-radius: 999px; background: linear-gradient(to right, var(--olive), var(--forest)); }
html[dir="rtl"] .v-now .lifeline-life { background: linear-gradient(to left, var(--olive), var(--forest)); }
.v-now .lifeline-band { position: absolute; top: 107px; height: 12px; border-radius: 6px; background: var(--gold-dim); border: 1px solid var(--gold-dim-2); }
.v-now .lifeline-tick { position: absolute; top: 109px; width: 1px; height: 8px; background: var(--faint); transform: translateX(-50%); }
.v-now .lifeline-tick span { position: absolute; top: 11px; left: 50%; transform: translateX(-50%); font-family: var(--font-latin-sans); font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums; }
.v-now .lifeline .mk { position: absolute; transform: translateX(-50%); }
.v-now .lifeline .mk-birth { top: 104px; width: 16px; height: 16px; border-radius: 50%; background: var(--olive); border: 3px solid var(--paper); box-shadow: 0 0 0 1px var(--olive); }
.v-now .lifeline .mk-mart { top: 105px; width: 14px; height: 14px; background: var(--forest); box-shadow: 0 0 0 3px var(--paper), 0 0 0 4px var(--forest); transform: translateX(-50%) rotate(45deg); }
.v-now .lifeline .mk-event { top: 106px; width: 12px; height: 12px; border-radius: 50%; background: var(--paper); border: 2px solid var(--ink-2); box-shadow: 0 0 0 2px var(--paper); }
.v-now .mk-year { position: absolute; transform: translateX(-50%); white-space: nowrap; font-family: var(--font-naskh); font-size: 12px; font-weight: 700; }
.v-now .mk-year-birth { top: 80px; color: var(--olive); }
.v-now .mk-year-mart { top: 128px; color: var(--forest); }
.v-now .lifeline .ev-label { position: absolute; text-align: center; white-space: nowrap; visibility: hidden; }
.v-now .lifeline .ev-label[data-side="above"] { top: 40px; }
.v-now .lifeline .ev-label[data-side="below"] { top: 142px; }
.v-now .lifeline .ev-label .n { font-size: 12.5px; font-weight: 600; color: var(--ink-2); }
.v-now .lifeline .ev-label .a { font-size: 11px; color: var(--forest); margin-top: 1px; }
.v-now .ev-list { display: flex; flex-direction: column; gap: 10px; margin-top: 24px; }
.v-now .ev-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.v-now .ev-row .bullet { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--paper); border: 2px solid var(--ink-2); }
.v-now .ev-row .n { font-size: 14.5px; font-weight: 600; color: var(--ink); }
.v-now .ev-row .d { font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.v-now .age-pill { font-size: 12px; color: var(--forest); background: var(--gold-dim); border: 1px solid var(--gold-dim-2); border-radius: 999px; padding: 1px 10px 2px; }
.v-now .tag-ongoing { font-size: 11px; color: var(--olive-2); background: var(--olive-dim); border: 1px solid var(--olive-dim-2); border-radius: 999px; padding: 1px 9px 2px; }
.v-now .lifeline-v { display: none; position: relative; padding-inline-start: 34px; }
.v-now .lifeline-v::before { content: ""; position: absolute; inset-block: 8px; inset-inline-start: 10px; width: 2px; background: var(--divider); }
.v-now .lifeline-v .v-entry { position: relative; padding-block: 10px 14px; }
.v-now .lifeline-v .v-mk { position: absolute; inset-inline-start: -30px; top: 16px; }
.v-now .lifeline-v .v-year { font-family: var(--font-naskh); font-size: 15px; font-weight: 700; }
.v-now .lifeline-v .v-year-birth { color: var(--olive); }
.v-now .lifeline-v .v-year-mart { color: var(--forest); }
.v-now .lifeline-v .v-name { font-size: 14.5px; font-weight: 600; color: var(--ink); }
.v-now .lifeline-v .v-date { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; margin-top: 1px; }
.v-now .lifeline-v .v-meta { margin-top: 5px; display: flex; gap: 8px; flex-wrap: wrap; }
@media (max-width: 480px) {
  .v-now .lifeline, .v-now .ev-list { display: none; }
  .v-now .lifeline-v { display: block; }
}
`,

  render(m, allEvents, lang) {
    const ar = lang === 'ar';
    const fmtRange = (s, e) => {
      const fs = fmtDate(s, lang), fe = fmtDate(e, lang);
      if (fs === '—' || fe === '—') return fs !== '—' ? fs : fe;
      if (String(s).slice(0, 7) === String(e).slice(0, 7)) return `${parseInt(String(s).slice(8, 10), 10)} – ${fe}`;
      return lang === 'en' ? `${fs} → ${fe}` : `${fs} ← ${fe}`;
    };
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
    const ageStr = Number.isFinite(age) ? age : '—';
    const evs = eventsForPerson(allEvents, m.birth, m.martyrdom);
    const ageLine = (n) => n == null ? '' : (ar ? `عمره ${n} عاماً` : `Age ${n}`);

    let h = `<div class="v-now">
      <div class="lifeline-head">
        <div>
          <div class="lifeline-kicker">${ar ? 'خطّ الحياة' : 'Lifespan'}</div>
          <div class="lifeline-lived">
            ${ar
              ? `عاشَ <b>${ageStr}</b> عاماً <span class="days">(${days.toLocaleString('ar-EG')} يوماً)</span>`
              : `Lived <b>${ageStr}</b> years <span class="days">(${days.toLocaleString()} days)</span>`}
          </div>
        </div>
        <div class="lifeline-legend">
          <span><span class="sw sw-birth"></span>${ar ? 'الميلاد' : 'Birth'}</span>
          <span><span class="sw sw-mart"></span>${ar ? 'الاستشهاد' : 'Martyrdom'}</span>
          ${evs.length ? `
          <span><span class="sw sw-event"></span>${ar ? 'حدث' : 'Event'}</span>
          <span><span class="sw sw-band"></span>${ar ? 'فترة حدث' : 'Event period'}</span>` : ''}
        </div>
      </div>`;

    h += `<div class="lifeline"><svg class="lifeline-leaders" aria-hidden="true"></svg>`;
    h += `<div class="lifeline-base"></div>`;
    h += `<div class="lifeline-life" style="left:${Math.min(phys(pBirth), phys(pMart))}%; width:${pMart - pBirth}%;"></div>`;
    evs.forEach((e) => {
      const ps = pct(e.start_date);
      const pe = Math.min(pct(e.end_date || m.martyrdom), pMart);
      h += `<div class="lifeline-band" style="left:${Math.min(phys(ps), phys(pe))}%; width:${Math.abs(pe - ps)}%;"></div>`;
    });
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
    evs.forEach((e, i) => {
      const x = phys(pct(e.start_date));
      const side = i % 2 === 0 ? 'above' : 'below';
      h += `<div class="mk mk-event" style="left:${x}%;"></div>
            <div class="ev-label" data-x="${x}" data-side="${side}">
              <div class="n">${esc(eventDisplayName(e, lang))}</div>
              ${e.age_at_start != null ? `<div class="a">${ageLine(e.age_at_start)}</div>` : ''}
            </div>`;
    });
    h += `</div>`;

    if (evs.length) {
      h += `<div class="ev-list">` + evs.map((e) => `
        <div class="ev-row">
          <span class="bullet"></span>
          <span class="n">${esc(eventDisplayName(e, lang))}</span>
          <span class="d">${e.end_date
            ? fmtRange(e.start_date, e.end_date)
            : `${fmtDate(e.start_date, lang)} — ${ar ? 'مستمر' : 'ongoing'}`}</span>
          ${e.age_at_start != null ? `<span class="age-pill">${ageLine(e.age_at_start)}</span>` : ''}
        </div>`).join('') + `</div>`;
    }

    h += `<div class="lifeline-v">
      <div class="v-entry">
        <span class="v-mk"><span class="sw sw-birth"></span></span>
        <div class="v-year v-year-birth">${birthY}</div>
        <div class="v-date">${ar ? 'وُلد في' : 'Born'} ${fmtDate(m.birth, lang)}</div>
      </div>`;
    evs.forEach((e) => {
      h += `<div class="v-entry">
        <span class="v-mk"><span class="sw sw-event"></span></span>
        <div class="v-name">${esc(eventDisplayName(e, lang))}</div>
        <div class="v-date">${e.end_date ? fmtRange(e.start_date, e.end_date) : fmtDate(e.start_date, lang)}</div>
        <div class="v-meta">
          ${e.age_at_start != null ? `<span class="age-pill">${ageLine(e.age_at_start)}</span>` : ''}
          ${!e.end_date ? `<span class="tag-ongoing">${ar ? 'استمرّ حتى استشهاده' : 'Ongoing at his martyrdom'}</span>` : ''}
        </div>
      </div>`;
    });
    h += `<div class="v-entry">
        <span class="v-mk"><span class="sw sw-mart"></span></span>
        <div class="v-year v-year-mart">${martY}</div>
        <div class="v-date">${ar ? 'استُشهد في' : 'Martyred'} ${fmtDate(m.martyrdom, lang)}</div>
        ${Number.isFinite(age) ? `<div class="v-meta"><span class="age-pill">${ar ? `عن عمر ${age} عاماً` : `Aged ${age}`}</span></div>` : ''}
      </div>
    </div></div>`;
    return h;
  },

  // Port of dodgeTimelineLabels() — the two-sweep horizontal push plus SVG
  // leader lines. This is the code that produces the measured displacement.
  mount(root) {
    const LIFELINE_TOP = 112;
    const tl = root.querySelector('.lifeline');
    if (!tl || tl.offsetParent === null) return;
    const svg = tl.querySelector('.lifeline-leaders');
    const labels = Array.from(tl.querySelectorAll('.ev-label'));
    if (!svg || labels.length === 0) return;
    const W = tl.clientWidth;
    svg.setAttribute('viewBox', `0 0 ${W} ${tl.clientHeight}`);
    svg.innerHTML = '';
    const GAP = 14;
    ['above', 'below'].forEach((side) => {
      const group = labels
        .filter((l) => l.dataset.side === side)
        .map((l) => ({ el: l, target: (parseFloat(l.dataset.x) / 100) * W, w: l.offsetWidth }))
        .sort((a, b) => a.target - b.target);
      let prevRight = 0;
      group.forEach((g) => { g.c = Math.max(g.target, prevRight + g.w / 2); prevRight = g.c + g.w / 2 + GAP; });
      let nextLeft = W;
      for (let i = group.length - 1; i >= 0; i--) {
        const g = group[i];
        g.c = Math.min(g.c, nextLeft - g.w / 2);
        nextLeft = g.c - g.w / 2 - GAP;
      }
      group.forEach((g) => {
        g.el.style.left = `${g.c - g.w / 2}px`;
        g.el.style.visibility = 'visible';
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', g.target);
        line.setAttribute('y1', side === 'above' ? LIFELINE_TOP - 12 : LIFELINE_TOP + 12);
        line.setAttribute('x2', g.c);
        line.setAttribute('y2', side === 'above' ? LIFELINE_TOP - 34 : LIFELINE_TOP + 28);
        svg.appendChild(line);
      });
    });
  },
};
