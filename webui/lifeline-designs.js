// webui/lifeline-designs.js
//
// Adapter over the design modules in webui/lifeline/. Same IIFE-module
// pattern as api-client.js / filter-logic.js. Load AFTER the design modules.
//
// Each design module registers itself on window.AQMAR_LIFELINE_DESIGNS with:
//     css                            scoped stylesheet text (.lfd-<key>)
//     render(m, events, lang)        -> html string
//     mount(root, m, events, lang)   optional, runs after insertion
//
// This file attaches display names, injects each design's CSS once, and
// resolves which design to draw from the admin settings + visitor choice.
(function (global) {
  "use strict";

  // Display names live here, not in the design modules, so a design file
  // stays purely presentational and a rename never edits six files.
  var NAMES = {
    w: { ar: 'الخطّ المتدرّج', en: 'Tiered line' },
    a: { ar: 'الخطّ المرقّم', en: 'Numbered line' },
    b: { ar: 'العمود الزمني', en: 'Vertical spine' },
    c: { ar: 'محور العمر', en: 'Age axis' },
    d: { ar: 'فصول العمر', en: 'Life chapters' },
    e: { ar: 'الشريط الهادئ', en: 'Quiet bar' }
  };

  // Display order in the visitor's switcher and in the admin's list.
  var ORDER = ['w', 'a', 'b', 'c', 'd', 'e'];

  function raw() { return global.AQMAR_LIFELINE_DESIGNS || {}; }

  // Inject every loaded design's scoped CSS once. Called on first use; safe
  // to call again (the <style> id guards it).
  function injectStyles() {
    if (document.getElementById('lifeline-design-css')) return;
    var parts = [];
    ORDER.forEach(function (k) {
      var d = raw()[k];
      if (d && d.css) parts.push('/* ' + k + ' */\n' + d.css);
    });
    if (!parts.length) return;
    var el = document.createElement('style');
    el.id = 'lifeline-design-css';
    el.textContent = parts.join('\n');
    document.head.appendChild(el);
  }

  function has(key) { return !!raw()[key]; }

  function get(key) {
    var d = raw()[key];
    if (!d) return null;
    var n = NAMES[key] || { ar: key, en: key };
    return { key: key, nameAr: n.ar, nameEn: n.en, render: d.render, mount: d.mount };
  }

  // Keys the admin offers, filtered to designs that actually loaded and put
  // back into display order. Empty/absent config means "offer everything".
  function offeredKeys(settings) {
    var cfg = (settings && settings.lifeline) || {};
    var keys = (cfg.enabled || []).filter(has);
    if (!keys.length) keys = ORDER.filter(has);
    return ORDER.filter(function (k) { return keys.indexOf(k) !== -1; });
  }

  global.AQMAR_LIFELINE = {
    ORDER: ORDER,
    injectStyles: injectStyles,
    has: has,
    get: get,
    all: function () { return ORDER.map(get).filter(Boolean); },
    name: function (key, lang) {
      var n = NAMES[key];
      return n ? (lang === 'en' ? n.en : n.ar) : key;
    },
    // Designs a visitor may switch between, given the admin's settings.
    offered: function (settings) { return offeredKeys(settings).map(get); },
    // What to actually draw: the visitor's pick when the admin still offers
    // it, else the admin default, else the first offered. Never returns a key
    // with no module behind it.
    resolve: function (chosen, settings) {
      var offered = offeredKeys(settings);
      if (chosen && offered.indexOf(chosen) !== -1) return chosen;
      var def = ((settings && settings.lifeline) || {}).default;
      if (def && offered.indexOf(def) !== -1) return def;
      return offered[0] || null;
    },
  };
})(window);
