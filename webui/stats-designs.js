// webui/stats-designs.js
//
// Adapter over the design modules in webui/stats/. Mirrors lifeline-designs.js
// exactly — same IIFE pattern, same admin-settings/visitor-choice contract.
// Load AFTER the design modules.
//
// Each design module registers itself on window.AQMAR_STATS_DESIGNS with:
//     css                  scoped stylesheet text (.std-<key>)
//     render(agg, lang)    -> html string, where `agg` is aggregateStats(rows)
//
// Adding a design = new webui/stats/design-<key>.js + a <script> tag in
// index.html + its key in STATS_DESIGNS (src/settings_store.py) and ORDER
// below. Miss the server-side key and the admin cannot offer it.
(function (global) {
  "use strict";

  // Display names live here, not in the design modules, so a design file stays
  // purely presentational.
  var NAMES = {
    register: { ar: 'السجلّ',   en: 'Register' },
    board:    { ar: 'اللوحة',   en: 'Board' },
    layers:   { ar: 'الطبقات',  en: 'Layers' }
  };

  // Display order in the visitor's switcher and the admin's list. MUST match
  // STATS_DESIGNS in src/settings_store.py.
  var ORDER = ['register', 'board', 'layers'];

  function raw() { return global.AQMAR_STATS_DESIGNS || {}; }

  function injectStyles() {
    if (document.getElementById('stats-design-css')) return;
    var parts = [];
    ORDER.forEach(function (k) {
      var d = raw()[k];
      if (d && d.css) parts.push('/* ' + k + ' */\n' + d.css);
    });
    if (!parts.length) return;
    var el = document.createElement('style');
    el.id = 'stats-design-css';
    el.textContent = parts.join('\n');
    document.head.appendChild(el);
  }

  function has(key) { return !!raw()[key]; }

  function get(key) {
    var d = raw()[key];
    if (!d) return null;
    var n = NAMES[key] || { ar: key, en: key };
    return { key: key, nameAr: n.ar, nameEn: n.en, render: d.render };
  }

  // Keys the admin offers, filtered to designs that actually loaded and put
  // back into display order. Empty/absent config means "offer everything".
  function offeredKeys(settings) {
    var cfg = (settings && settings.stats) || {};
    var keys = (cfg.enabled || []).filter(has);
    if (!keys.length) keys = ORDER.filter(has);
    return ORDER.filter(function (k) { return keys.indexOf(k) !== -1; });
  }

  global.AQMAR_STATS = {
    ORDER: ORDER,
    injectStyles: injectStyles,
    has: has,
    get: get,
    all: function () { return ORDER.map(get).filter(Boolean); },
    name: function (key, lang) {
      var n = NAMES[key];
      return n ? (lang === 'en' ? n.en : n.ar) : key;
    },
    offered: function (settings) { return offeredKeys(settings).map(get); },
    // What to actually draw: the visitor's pick while the admin still offers
    // it, else the admin default, else the first offered. Never returns a key
    // with no module behind it.
    resolve: function (chosen, settings) {
      var offered = offeredKeys(settings);
      if (chosen && offered.indexOf(chosen) !== -1) return chosen;
      var def = ((settings && settings.stats) || {}).default;
      if (def && offered.indexOf(def) !== -1) return def;
      return offered[0] || null;
    },
  };
})(window);
