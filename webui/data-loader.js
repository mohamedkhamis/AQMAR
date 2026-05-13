// webui/data-loader.js
// Loads martyrs.json + overrides.json from disk, merges them.

(function (global) {
  "use strict";

  function mergeOverrides(baseMartyrs, overridesEdits) {
    // overridesEdits: { "20": { birth_date: "...", _manual_edit_at: "..." }, ... }
    const norm = {};
    for (const k of Object.keys(overridesEdits || {})) norm[String(k)] = overridesEdits[k];

    return baseMartyrs.map(row => {
      const ov = norm[String(row.msg_id)];
      if (!ov) return { ...row, _overridden_fields: [] };
      const merged = { ...row, ...ov };
      const overriddenFields = Object.keys(ov).filter(k => !k.startsWith("_"));
      merged._overridden_fields = overriddenFields;
      return merged;
    });
  }

  async function loadData(martyrsUrl, overridesUrl) {
    const [martyrsResp, overridesResp] = await Promise.all([
      fetch(martyrsUrl),
      fetch(overridesUrl).catch(() => null),  // overrides may not exist yet
    ]);

    if (!martyrsResp.ok) {
      throw new Error(`Cannot load ${martyrsUrl}: ${martyrsResp.status}. ` +
        `Run 'python scripts/excel_to_json.py' first.`);
    }
    const martyrsData = await martyrsResp.json();

    let overridesData = { version: 1, edits: {} };
    if (overridesResp && overridesResp.ok) {
      try {
        overridesData = await overridesResp.json();
      } catch (e) {
        console.warn("Invalid JSON in overrides — ignoring", e);
      }
    }
    return {
      generated_at: martyrsData.generated_at,
      channel: martyrsData.channel,
      martyrs: martyrsData.martyrs,
      overrides: overridesData.edits || {},
      allRows: mergeOverrides(martyrsData.martyrs, overridesData.edits || {}),
    };
  }

  global.mergeOverrides = mergeOverrides;
  global.loadData = loadData;
})(window);
