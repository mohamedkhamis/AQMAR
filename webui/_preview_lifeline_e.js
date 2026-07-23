/* AQMAR — lifespan line redesign, variant E: "الشريط الهادئ" / Quiet bar.
 *
 * The axis stays horizontal and proportional but goes silent: a slim life bar
 * with dots only, plus birth year, martyrdom year and a decade ruler. No
 * duration bands (every event is a single point in time), no labels on the
 * line, therefore no label dodging and no displaced text that lies about its
 * date. Every name is written exactly once, in the numbered list below; the
 * dots are a secondary, spatial index into that list.
 *
 * Marks that would land closer than MIN_GAP px are merged into one capsule
 * (measured in mount(), so clustering is width-aware). Hover/focus reveals a
 * clamped tooltip; click/tap highlights and scrolls to the matching row(s), so
 * a touch user is never left holding a tooltip they cannot dismiss.
 */
window.VARIANTS = window.VARIANTS || {};
(function (global) {
  'use strict';

  var MIN_GAP = 28;   // px — minimum distance between two marks; also caps the
                      // width of a cluster capsule so capsules can touch but
                      // never overlap.
  var TIP_MAX = 3;    // events printed inside a tooltip before "+N".
  var TIPS = new WeakMap();
  var seq = 0;

  // ---- harness helpers -------------------------------------------------
  // esc / computeAge / fmtDate / toArDigits / eventsForPerson are provided by
  // the preview harness. The tiny fallbacks below exist only so the file never
  // throws if it is evaluated before the harness (esc in particular must never
  // be missing — everything below goes through innerHTML).
  function esc(s) {
    if (typeof global.esc === 'function') return global.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v, ar) {
    if (!ar) return String(v);
    if (typeof global.toArDigits === 'function') return global.toArDigits(v);
    var map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    return String(v).replace(/\d/g, function (d) { return map[+d]; });
  }
  function fmt(iso, lang) {
    var f = global.fmtDate || global.formatDate;
    return f ? f(iso, lang) : String(iso || '');
  }
  function ageAt(birth, at) {
    return typeof global.computeAge === 'function' ? global.computeAge(birth, at) : null;
  }
  function eventsOf(events, birth, mart) {
    if (typeof global.eventsForPerson === 'function') {
      return global.eventsForPerson(events || [], birth, mart) || [];
    }
    return [];
  }
  function nameOf(e, lang) {
    if (typeof global.eventDisplayName === 'function') return global.eventDisplayName(e, lang);
    if (lang === 'en' && e && typeof e.name_en === 'string' && e.name_en.trim()) return e.name_en;
    return (e && e.name_ar) || '';
  }

  // ---- small utilities --------------------------------------------------
  function tOf(iso) {
    if (!iso) return NaN;
    return new Date(String(iso).slice(0, 10) + 'T00:00:00').getTime();
  }
  function ageLine(n, ar) { return ar ? ('عمره ' + num(n, ar) + ' عاماً') : ('Age ' + n); }
  function reduceMotion() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // Percent along the life (0 = birth, 100 = martyrdom) and its physical
  // counterpart. The axis is mapped to the lifespan itself — not birth→today —
  // so the full width of the card is spent on the part that has events in it.
  // `phys()` is the one place RTL is converted: everything downstream (inline
  // left, clustering order, tooltip clamping) is physical pixels from the left.
  function geom(person) {
    var t0 = tOf(person && person.birth);
    var tm = tOf(person && person.martyrdom);
    if (!isFinite(t0) || !isFinite(tm) || tm <= t0) return null;
    var span = Math.max(tm - t0, 86400000);
    return {
      t0: t0, tm: tm, span: span,
      days: Math.round((tm - t0) / 86400000),
      pct: function (iso) {
        var t = tOf(iso);
        if (!isFinite(t)) return null;
        return Math.min(100, Math.max(0, ((t - t0) / span) * 100));
      }
    };
  }

  function markAria(items, lang) {
    var ar = lang !== 'en';
    var parts = items.map(function (pt) {
      var a = pt.e.age_at_start;
      return nameOf(pt.e, lang) + '، ' + num(fmt(pt.e.start_date, lang), ar) +
        (a != null ? '، ' + ageLine(a, ar) : '');
    });
    if (items.length === 1) return parts[0];
    return ar
      ? num(items.length, ar) + ' أحداث متقاربة: ' + parts.join('؛ ')
      : items.length + ' nearby events: ' + items.map(function (pt) {
        var a = pt.e.age_at_start;
        return nameOf(pt.e, lang) + ', ' + fmt(pt.e.start_date, lang) + (a != null ? ', ' + ageLine(a, false) : '');
      }).join('; ');
  }

  function tipHTML(items, lang) {
    var ar = lang !== 'en';
    var shown = items.slice(0, TIP_MAX);
    var h = shown.map(function (pt) {
      var a = pt.e.age_at_start;
      return '<div class="t-it"><div class="t-n">' + esc(nameOf(pt.e, lang)) + '</div>' +
        '<div class="t-m">' + esc(num(fmt(pt.e.start_date, lang), ar)) +
        (a != null ? ' · ' + esc(ageLine(a, ar)) : '') + '</div></div>';
    }).join('');
    if (items.length > shown.length) {
      var k = items.length - shown.length;
      h += '<div class="t-more">' +
        (ar ? '+' + num(k, ar) + ' في القائمة أدناه' : '+' + k + ' more in the list below') +
        '</div>';
    }
    return h;
  }

  // ---- interaction ------------------------------------------------------
  function markOf(node) {
    if (!node || !node.closest) return null;
    return node.closest('.v-e-mark');
  }
  function idxOf(el) {
    return String(el.getAttribute('data-idx') || '').split(',')
      .filter(function (s) { return s !== ''; })
      .map(Number);
  }

  function clearAll(root) {
    var i;
    var marks = root.querySelectorAll('.v-e-mark');
    for (i = 0; i < marks.length; i++) marks[i].classList.remove('is-on');
    var lis = root.querySelectorAll('.v-e-li');
    for (i = 0; i < lis.length; i++) lis[i].classList.remove('is-hit');
    hideTip(root);
  }

  function hideTip(root) {
    var tip = root.querySelector('.v-e-tip');
    var stem = root.querySelector('.v-e-stem');
    if (tip) tip.classList.remove('is-open');
    if (stem) stem.classList.remove('is-open');
  }

  function showTip(root, mark) {
    var tip = root.querySelector('.v-e-tip');
    var stem = root.querySelector('.v-e-stem');
    var axis = root.querySelector('.v-e-axis');
    if (!tip || !axis) return;
    var html = TIPS.get(mark);
    if (!html) return;                       // pre-mount fallback marks
    var W = axis.clientWidth;
    if (!W) return;
    tip.innerHTML = html;
    tip.style.maxWidth = Math.max(140, Math.min(260, W)) + 'px';
    tip.style.left = '0px';
    tip.classList.add('is-open');
    var x = parseFloat(mark.getAttribute('data-x'));
    if (!isFinite(x)) return;
    var tw = tip.offsetWidth;
    var l = Math.max(0, Math.min(x - tw / 2, W - tw));
    tip.style.left = l.toFixed(2) + 'px';
    // Arrow x is relative to the tooltip box and clamped so it stays on it.
    tip.style.setProperty('--ax', Math.max(12, Math.min(x - l, tw - 12)).toFixed(2) + 'px');
    if (stem) {
      stem.style.left = x.toFixed(2) + 'px';
      stem.classList.add('is-open');
    }
  }

  // Single entry point for state: highlight these list rows, light the mark
  // that owns the first of them, optionally reveal the tooltip and scroll.
  function activate(root, idxs, opts) {
    opts = opts || {};
    clearAll(root);
    if (!idxs || !idxs.length) return;
    var i;
    var first = null;
    for (i = 0; i < idxs.length; i++) {
      var li = root.querySelector('.v-e-li[data-i="' + idxs[i] + '"]');
      if (li) { li.classList.add('is-hit'); if (!first) first = li; }
    }
    var owner = opts.mark || null;
    if (!owner) {
      var marks = root.querySelectorAll('.v-e-mark');
      for (i = 0; i < marks.length && !owner; i++) {
        if (idxOf(marks[i]).indexOf(idxs[0]) !== -1) owner = marks[i];
      }
    }
    if (owner) owner.classList.add('is-on');
    if (opts.tip && owner) showTip(root, owner);
    if (opts.scroll && first && first.scrollIntoView) {
      first.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
    }
  }

  function bind(root) {
    if (root.getAttribute('data-bound') === '1') return;
    root.setAttribute('data-bound', '1');
    var axis = root.querySelector('.v-e-axis');
    if (!axis) return;

    // pointerover/out (they bubble; pointerenter/leave do not) — mouse only,
    // so a tap never leaves an undismissable tooltip behind.
    axis.addEventListener('pointerover', function (ev) {
      if (ev.pointerType && ev.pointerType !== 'mouse') return;
      var b = markOf(ev.target);
      if (!b || markOf(ev.relatedTarget) === b) return;
      activate(root, idxOf(b), { mark: b, tip: true });
    });
    axis.addEventListener('pointerout', function (ev) {
      if (ev.pointerType && ev.pointerType !== 'mouse') return;
      var b = markOf(ev.target);
      if (!b || markOf(ev.relatedTarget) === b) return;
      hideTip(root);                          // highlight persists; tooltip goes
    });

    root.addEventListener('click', function (ev) {
      var b = markOf(ev.target);
      if (b) {
        // Tap/click: the list row is the durable answer, the tooltip is a
        // mouse-only bonus.
        activate(root, idxOf(b), { mark: b, tip: ev.pointerType === 'mouse', scroll: true });
        return;
      }
      var row = ev.target.closest && ev.target.closest('.v-e-row');
      if (row) activate(root, [Number(row.getAttribute('data-i'))], {});
    });

    root.addEventListener('focusin', function (ev) {
      var b = markOf(ev.target);
      if (b) { activate(root, idxOf(b), { mark: b, tip: true }); return; }
      var row = ev.target.closest && ev.target.closest('.v-e-row');
      if (row) activate(root, [Number(row.getAttribute('data-i'))], {});
    });

    root.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') clearAll(root);
    });

    var outside = function (ev) {
      if (!root.isConnected) { document.removeEventListener('pointerdown', outside, true); return; }
      if (!root.contains(ev.target)) clearAll(root);
    };
    document.addEventListener('pointerdown', outside, true);
  }

  // ---- layout passes (mount) -------------------------------------------
  // Decade ruler: keep every tick that clears the previous kept one by 46px
  // and both endpoint years by 30px. Purely a visibility pass over markup the
  // renderer already emitted, so it is idempotent.
  function layoutTicks(root, W) {
    var ticks = root.querySelectorAll('.v-e-tick');
    var prev = -1e9;
    for (var i = 0; i < ticks.length; i++) {
      var p = parseFloat(ticks[i].getAttribute('data-p'));
      var x = (p / 100) * W;
      var keep = isFinite(x) && x - prev >= 46 && x >= 30 && x <= W - 30;
      ticks[i].classList.toggle('is-off', !keep);
      if (keep) prev = x;
    }
  }

  function layoutMarks(root, person, events, lang, W) {
    var g = geom(person);
    var layer = root.querySelector('.v-e-marks');
    if (!g || !layer) return;
    var ar = root.getAttribute('data-lang') !== 'en';
    var evs = eventsOf(events, person.birth, person.martyrdom);

    var pts = evs.map(function (e, i) {
      var p = g.pct(e.start_date);
      if (p == null) return null;
      return { i: i, e: e, px: ((ar ? 100 - p : p) / 100) * W };
    }).filter(Boolean).sort(function (a, b) { return a.px - b.px; });

    // Anchor-based grouping: a group swallows every point within MIN_GAP of
    // its FIRST member, so two anchors are always >= MIN_GAP apart (a chained
    // "distance to previous point" rule would collapse the whole post-2000
    // half into one blob at 360px).
    var groups = [];
    pts.forEach(function (pt) {
      var last = groups[groups.length - 1];
      if (last && pt.px - last.anchor < MIN_GAP) { last.items.push(pt); last.end = pt.px; }
      else groups.push({ anchor: pt.px, end: pt.px, items: [pt] });
    });

    var html = '';
    var tips = [];
    groups.forEach(function (grp) {
      var multi = grp.items.length > 1;
      var w = multi ? Math.min(Math.max(grp.end - grp.anchor + 12, 26), MIN_GAP) : 26;
      var left = multi ? grp.anchor - 6 : grp.anchor - 13;
      // Allow up to 8px of overhang — .v-e-rail reserves 12px of inline
      // padding for exactly this, so nothing ever leaves the card.
      left = Math.max(-8, Math.min(left, W - w + 8));
      var byDate = grp.items.slice().sort(function (a, b) {
        return a.e.start_date < b.e.start_date ? -1 : a.e.start_date > b.e.start_date ? 1 : 0;
      });
      var ids = byDate.map(function (p) { return root.getAttribute('data-uid') + '-r' + p.i; }).join(' ');
      html += '<button type="button" class="v-e-mark' + (multi ? ' is-multi' : '') + '"' +
        ' data-idx="' + byDate.map(function (p) { return p.i; }).join(',') + '"' +
        ' data-x="' + grp.anchor.toFixed(2) + '"' +
        ' aria-controls="' + esc(ids) + '"' +
        ' aria-label="' + esc(markAria(byDate, lang)) + '"' +
        ' style="left:' + left.toFixed(2) + 'px;width:' + w.toFixed(2) + 'px">' +
        (multi
          ? '<span class="v-e-cluster"><span class="c">' + num(grp.items.length, ar) + '</span></span>'
          // The visible dot keeps its exact date even when the 26px hit box
          // was clamped at the edge of the axis.
          : '<span class="v-e-pt" style="left:' + (grp.anchor - left).toFixed(2) + 'px"></span>') +
        '</button>';
      tips.push(tipHTML(byDate, lang));
    });

    layer.innerHTML = html;
    var btns = layer.querySelectorAll('.v-e-mark');
    for (var i = 0; i < btns.length; i++) TIPS.set(btns[i], tips[i]);
  }

  // ---- variant ----------------------------------------------------------
  global.VARIANTS.e = {
    key: 'e',
    labelAr: 'الشريط الهادئ',
    labelEn: 'Quiet bar',
    blurbAr: 'شريطٌ صامتٌ بلا نصّ: النقاط وحدها على الخطّ، وكلّ الأسماء في قائمةٍ مرقّمةٍ أسفله تُضاء عند لمس نقطتها.',
    blurbEn: 'The axis carries dots only — every name lives once, in a numbered list below that lights up when you touch its dot.',
    tradeoffAr: 'لا يظهر اسمٌ على الخطّ إلّا بالتفاعل، فمن ينظر نظرةً واحدةً أو يطبع الصفحة يرى نقاطًا بلا أسماء.',
    tradeoffEn: 'Nothing on the line is readable without interacting — a single glance, or a printed page, shows dots but no names.',

    css: `
/* ===== variant E — quiet bar ========================================= */
/* Every selector is scoped under .v-e. Percent/px "left" values are PHYSICAL
   (converted in JS); everything else uses logical properties. */
.v-e {
  position: relative;
  container: veE / inline-size;
  font-family: var(--font-body);
  color: var(--ink);
}
.v-e *, .v-e *::before, .v-e *::after { box-sizing: border-box; }
.v-e .v-e-sr {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
.v-e .v-e-empty { font-size: 13px; color: var(--muted); margin: 0; }

/* --- head ------------------------------------------------------------ */
.v-e .v-e-head {
  display: flex; align-items: flex-end; justify-content: space-between;
  flex-wrap: wrap; gap: 6px 18px; margin-block-end: 18px;
}
.v-e .v-e-kicker {
  font-family: var(--font-latin-sans); font-size: 11px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--olive);
}
.v-e .v-e-lived {
  font-family: var(--font-display); font-size: 20px; font-weight: 500;
  margin-block-start: 3px; line-height: 1.4;
}
.v-e .v-e-lived b { color: var(--forest); font-weight: 600; }
.v-e .v-e-lived .d { color: var(--muted); font-size: 14px; }
.v-e .v-e-count { font-size: 12px; color: var(--muted); }

/* --- rail ------------------------------------------------------------ */
/* 12px inline padding holds the half-markers that overhang each end. */
.v-e .v-e-rail { padding-inline: 12px; }
.v-e .v-e-axis { position: relative; height: 84px; }

.v-e .v-e-track {
  position: absolute; inset-inline: 0; top: 40px; height: 7px;
  border-radius: 999px; z-index: 2;
  background: linear-gradient(to right, var(--olive), var(--forest));
}
/* linear-gradient has no logical direction — flip it so olive always sits on
   the birth side. */
.v-e[dir="rtl"] .v-e-track { background: linear-gradient(to left, var(--olive), var(--forest)); }

/* Endpoint markers. inset-inline-start:0 resolves to left:0 in LTR and
   right:0 in RTL, so the centring translate has to flip sign per direction. */
.v-e .v-e-cap { position: absolute; top: 43.5px; z-index: 3; }
.v-e .v-e-cap-b {
  inset-inline-start: 0; width: 13px; height: 13px; border-radius: 50%;
  background: var(--olive); transform: translate(-50%, -50%);
  box-shadow: 0 0 0 3px var(--paper);   /* ring masks the track, same idiom as .mk-birth */
}
.v-e .v-e-cap-m {
  inset-inline-end: 0; width: 11px; height: 11px; background: var(--forest);
  transform: translate(50%, -50%) rotate(45deg);
  box-shadow: 0 0 0 3px var(--paper);
}
.v-e[dir="rtl"] .v-e-cap-b { transform: translate(50%, -50%); }
.v-e[dir="rtl"] .v-e-cap-m { transform: translate(-50%, -50%) rotate(45deg); }

.v-e .v-e-end {
  position: absolute; top: 58px; font-family: var(--font-naskh);
  font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.v-e .v-e-end-b { inset-inline-start: 0; color: var(--olive-2); }
.v-e .v-e-end-m { inset-inline-end: 0; color: var(--forest); }

.v-e .v-e-tick {
  position: absolute; top: 51px; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center;
}
.v-e .v-e-tick.is-off { display: none; }
.v-e .v-e-tick .tk { width: 1px; height: 6px; background: var(--faint); }
/* --font-body (IBM Plex Sans Arabic) rather than --font-latin-sans: these
   years are rendered with Arabic-Indic digits in ar. */
.v-e .v-e-tick .ty {
  margin-block-start: 3px; font-family: var(--font-body); font-size: 10px;
  color: var(--faint); font-variant-numeric: tabular-nums; white-space: nowrap;
}

/* --- marks ----------------------------------------------------------- */
.v-e .v-e-marks { position: absolute; inset-inline: 0; top: 0; height: 30px; z-index: 4; }
.v-e .v-e-mark {
  position: absolute; top: 1px; height: 28px;      /* >= 24px touch target */
  padding: 0; margin: 0; border: 0; background: none;
  -webkit-appearance: none; appearance: none; cursor: pointer;
}
.v-e .v-e-pt {
  position: absolute; top: 50%; width: 10px; height: 10px; margin-top: -5px;
  border-radius: 50%; transform: translateX(-50%);
  background: var(--paper); border: 1.5px solid var(--ink-2);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.v-e .v-e-cluster {
  position: absolute; inset: 7px 0; border-radius: 999px;
  background: var(--paper); border: 1.5px solid var(--ink-2);
  display: flex; align-items: center; justify-content: center;
  transition: border-color 0.15s ease;
}
.v-e .v-e-cluster .c {
  font-family: var(--font-body); font-size: 9.5px; line-height: 1;
  color: var(--muted); font-variant-numeric: tabular-nums;
  transition: color 0.15s ease;
}
.v-e .v-e-mark:hover .v-e-pt,
.v-e .v-e-mark.is-on .v-e-pt { background: var(--forest); border-color: var(--forest); }
.v-e .v-e-mark:hover .v-e-cluster,
.v-e .v-e-mark.is-on .v-e-cluster { border-color: var(--forest); }
.v-e .v-e-mark:hover .v-e-cluster .c,
.v-e .v-e-mark.is-on .v-e-cluster .c { color: var(--forest); }
.v-e .v-e-mark:focus-visible { outline: 2px solid var(--forest); outline-offset: 2px; border-radius: 10px; }

/* Leader from the active dot down to the tooltip. Sits at z-index 1 so the
   track hides its middle — it is exactly vertical, so it can never point at
   the wrong date. */
.v-e .v-e-stem {
  position: absolute; top: 30px; bottom: 0; width: 1px; z-index: 1;
  background: var(--gold-dim-2); transform: translateX(-50%);
  opacity: 0; transition: opacity 0.12s ease;
}
.v-e .v-e-stem.is-open { opacity: 1; }

/* --- tooltip --------------------------------------------------------- */
/* Opens BELOW the axis: there is always list underneath it, so it can never
   escape the top of the card. aria-hidden — the button's aria-label already
   carries the same words. */
.v-e .v-e-tip {
  position: absolute; top: calc(100% + 8px); left: 0; z-index: 6;
  pointer-events: none; opacity: 0; visibility: hidden;
  background: var(--bg-2); border: 1px solid var(--divider);
  border-radius: 10px; padding: 8px 11px;
  transition: opacity 0.12s ease;
}
.v-e .v-e-tip.is-open { opacity: 1; visibility: visible; }
/* Rotated square — physical border-left/top on purpose: after rotate(45deg)
   those two edges form the upward point in either direction. */
.v-e .v-e-tip::before {
  content: ""; position: absolute; top: -5px; left: var(--ax, 16px);
  width: 9px; height: 9px; background: var(--bg-2);
  border-left: 1px solid var(--divider); border-top: 1px solid var(--divider);
  transform: translateX(-50%) rotate(45deg);
}
.v-e .v-e-tip .t-it + .t-it {
  margin-block-start: 7px; padding-block-start: 7px; border-top: 1px solid var(--divider);
}
.v-e .v-e-tip .t-n { font-size: 12.5px; font-weight: 600; color: var(--ink); line-height: 1.5; }
.v-e .v-e-tip .t-m { font-size: 11px; color: var(--muted); margin-block-start: 2px; }
.v-e .v-e-tip .t-more { margin-block-start: 6px; font-size: 11px; color: var(--faint); }

.v-e .v-e-hint {
  margin: 10px 0 0; padding-inline: 12px; font-size: 11.5px; color: var(--faint);
}

/* --- list (the only place the words live) ---------------------------- */
.v-e .v-e-list { list-style: none; margin: 22px 0 0; padding: 0; }
.v-e .v-e-li {
  container: veRow / inline-size;   /* rows adapt to their column, not the page */
  break-inside: avoid;
  border-block-end: 1px solid var(--divider);
}
.v-e .v-e-li:last-child { border-block-end: 0; }
.v-e .v-e-row {
  display: grid; grid-template-columns: 1.9em minmax(0, 1fr);
  align-items: baseline; gap: 2px 8px; width: 100%;
  padding: 7px 6px; margin: 0; border: 0;
  border-inline-start: 2px solid transparent;
  background: none; font: inherit; color: inherit; text-align: start;
  cursor: pointer; -webkit-appearance: none; appearance: none;
  transition: background 0.18s ease, border-color 0.18s ease;
}
.v-e .v-e-idx {
  grid-column: 1; grid-row: 1; font-size: 11px; color: var(--faint);
  font-variant-numeric: tabular-nums;
}
.v-e .v-e-n {
  grid-column: 2; grid-row: 1; font-size: 14px; font-weight: 600;
  color: var(--ink-2); line-height: 1.5;
}
.v-e .v-e-meta {
  grid-column: 2; grid-row: 2; display: flex; align-items: center;
  gap: 8px; flex-wrap: wrap;
}
.v-e .v-e-d { font-size: 11.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.v-e .v-e-pill {
  font-size: 11px; color: var(--forest); background: var(--gold-dim);
  border: 1px solid var(--gold-dim-2); border-radius: 999px;
  padding: 1px 9px 2px; white-space: nowrap;
}
.v-e .v-e-row:hover { background: var(--bg-2); }
.v-e .v-e-row:focus-visible { outline: 2px solid var(--forest); outline-offset: -2px; }
.v-e .v-e-li.is-hit .v-e-row { background: var(--gold-dim); border-inline-start-color: var(--forest); }

/* Mobile-first: the two-line row above is the fallback everywhere. When a row
   has room it collapses to a single line; when the whole component has room
   the list runs in columns. */
@container veRow (min-width: 360px) {
  .v-e .v-e-row { grid-template-columns: 1.9em minmax(0, 1fr) auto; }
  .v-e .v-e-meta { grid-column: 3; grid-row: 1; }
}
@container veE (min-width: 820px) {
  .v-e .v-e-list { column-count: 2; column-gap: 34px; }
}
@container veE (min-width: 1240px) {
  .v-e .v-e-list { column-count: 3; }
}

@media (prefers-reduced-motion: reduce) {
  .v-e .v-e-pt, .v-e .v-e-cluster, .v-e .v-e-cluster .c,
  .v-e .v-e-row, .v-e .v-e-tip, .v-e .v-e-stem { transition: none; }
}
`,

    render: function (person, events, lang) {
      var ar = lang !== 'en';
      var dir = ar ? 'rtl' : 'ltr';
      var g = geom(person);
      if (!g) {
        return '<div class="v-e" dir="' + dir + '"><p class="v-e-empty">' +
          (ar ? 'لا يمكن رسم خطّ الحياة — التاريخان غير مكتملين.' : 'Lifespan unavailable — dates are incomplete.') +
          '</p></div>';
      }
      var uid = 've' + (++seq);
      var phys = function (p) { return ar ? 100 - p : p; };
      var evs = eventsOf(events, person.birth, person.martyrdom);
      var age = ageAt(person.birth, person.martyrdom);
      var birthY = String(person.birth).slice(0, 4);
      var martY = String(person.martyrdom).slice(0, 4);
      var bDate = num(fmt(person.birth, lang), ar);
      var mDate = num(fmt(person.martyrdom, lang), ar);
      var daysStr = num(g.days.toLocaleString(ar ? 'ar-EG' : 'en-US'), ar);

      var head =
        '<div class="v-e-head"><div>' +
          '<div class="v-e-kicker">' + (ar ? 'خطّ الحياة' : 'Lifespan') + '</div>' +
          '<div class="v-e-lived">' + (ar
            ? 'عاشَ <b>' + num(age == null ? '—' : age, ar) + '</b> عاماً <span class="d">(' + daysStr + ' يوماً)</span>'
            : 'Lived <b>' + (age == null ? '—' : age) + '</b> years <span class="d">(' + daysStr + ' days)</span>') +
          '</div></div>' +
          '<div class="v-e-count">' + (ar
            ? num(evs.length, ar) + ' حدثاً في حياته'
            : evs.length + ' events in his lifetime') +
          '</div></div>' +
        '<p class="v-e-sr">' + (ar
          ? 'وُلد في ' + esc(bDate) + '، واستُشهد في ' + esc(mDate) + '.'
          : 'Born ' + esc(bDate) + ', martyred ' + esc(mDate) + '.') + '</p>';

      // Decade ruler. mount() decides which of these survive at the measured
      // width; they are decorative, so the whole block is aria-hidden.
      var ticks = '';
      var by = parseInt(birthY, 10);
      var my = parseInt(martY, 10);
      if (isFinite(by) && isFinite(my)) {
        for (var y = Math.ceil(by / 10) * 10; y <= my; y += 10) {
          var tp = g.pct(y + '-01-01');
          if (tp == null) continue;
          var px = phys(tp).toFixed(3);
          ticks += '<span class="v-e-tick" data-p="' + px + '" style="left:' + px + '%">' +
            '<span class="tk"></span><span class="ty">' + num(y, ar) + '</span></span>';
        }
      }

      // Pre-mount fallback marks: one per event, exact position, no clustering
      // and no tooltip. mount() replaces this layer with the clustered pass.
      var fallback = evs.map(function (e, i) {
        var p = g.pct(e.start_date);
        if (p == null) return '';
        var a = e.age_at_start;
        var lbl = nameOf(e, lang) + '، ' + num(fmt(e.start_date, lang), ar) + (a != null ? '، ' + ageLine(a, ar) : '');
        return '<button type="button" class="v-e-mark" data-idx="' + i + '"' +
          ' aria-controls="' + uid + '-r' + i + '"' +
          ' aria-label="' + esc(lbl) + '"' +
          ' style="left:calc(' + phys(p).toFixed(3) + '% - 13px);width:26px">' +
          '<span class="v-e-pt" style="left:13px"></span></button>';
      }).join('');

      var rail =
        '<div class="v-e-rail"><div class="v-e-axis">' +
          '<div class="v-e-stem" aria-hidden="true"></div>' +
          '<div class="v-e-track" aria-hidden="true"></div>' +
          '<div class="v-e-ruler" aria-hidden="true">' + ticks + '</div>' +
          '<span class="v-e-cap v-e-cap-b" aria-hidden="true"></span>' +
          '<span class="v-e-cap v-e-cap-m" aria-hidden="true"></span>' +
          '<span class="v-e-end v-e-end-b" aria-hidden="true" title="' + esc(bDate) + '">' + num(birthY, ar) + '</span>' +
          '<span class="v-e-end v-e-end-m" aria-hidden="true" title="' + esc(mDate) + '">' + num(martY, ar) + '</span>' +
          '<div class="v-e-marks">' + fallback + '</div>' +
          '<div class="v-e-tip" aria-hidden="true"></div>' +
        '</div></div>';

      var hint = evs.length
        ? '<p class="v-e-hint">' + (ar
            ? 'مرّر فوق أيّ نقطة أو اضغطها؛ يُضاء حدثها في القائمة أدناه.'
            : 'Hover or tap any point — its event lights up in the list below.') + '</p>'
        : '';

      var list = evs.length
        ? '<ol class="v-e-list">' + evs.map(function (e, i) {
            var a = e.age_at_start;
            return '<li class="v-e-li" data-i="' + i + '">' +
              '<button type="button" class="v-e-row" id="' + uid + '-r' + i + '" data-i="' + i + '">' +
                '<span class="v-e-idx">' + num(i + 1, ar) + '</span>' +
                '<span class="v-e-n">' + esc(nameOf(e, lang)) + '</span>' +
                '<span class="v-e-meta">' +
                  '<span class="v-e-d">' + esc(num(fmt(e.start_date, lang), ar)) + '</span>' +
                  (a != null ? '<span class="v-e-pill">' + esc(ageLine(a, ar)) + '</span>' : '') +
                '</span>' +
              '</button></li>';
          }).join('') + '</ol>'
        : '<p class="v-e-empty" style="margin-top:18px">' +
            (ar ? 'لا أحداث مسجّلة داخل هذه الحياة.' : 'No recorded events fall inside this lifetime.') + '</p>';

      return '<div class="v-e" dir="' + dir + '" data-lang="' + (ar ? 'ar' : 'en') + '" data-uid="' + uid + '">' +
        head + rail + hint + list + '</div>';
    },

    // Idempotent: re-measures, rebuilds the (derived) ruler visibility and the
    // (derived) mark layer, and only touches the mark layer when the width
    // actually changed — so repeat calls are cheap and never eat open state.
    mount: function (rootEl, person, events, lang) {
      if (!rootEl) return;
      var root = (rootEl.classList && rootEl.classList.contains('v-e'))
        ? rootEl : rootEl.querySelector('.v-e');
      if (!root) return;
      var axis = root.querySelector('.v-e-axis');
      if (!axis) return;
      var W = axis.clientWidth;
      if (!W) return;                       // hidden / not laid out yet
      bind(root);
      layoutTicks(root, W);
      if (root.getAttribute('data-w') !== String(W)) {
        root.setAttribute('data-w', String(W));
        clearAll(root);                     // old anchors are stale at a new width
        layoutMarks(root, person, events, lang, W);
      }
    }
  };
})(window);
