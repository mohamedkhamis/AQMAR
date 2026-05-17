// webui/data-loader.js
// Loads martyrs from the local AQMAR admin API.
//
// Falls back to the on-disk data/martyrs.json file when the API is
// unreachable (e.g. running the SPA from GitHub Pages where the API
// server isn't available, or before `python scripts/admin_server.py`
// is started locally).

(function (global) {
  "use strict";

  function mergeOverrides(baseMartyrs, overridesEdits) {
    // Kept for backward compat with any leftover overrides.json files.
    // In the SQL Server world, baseMartyrs are already the canonical merged
    // rows, so callers typically pass overridesEdits={} and this is a near-no-op.
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

  // Annotate each row with a `_verification` shorthand the templates can
  // check ('unverified' | 'verified' | 'rejected'). _overridden_fields is
  // kept for the older ✏️ badge logic in case anything still consumes it.
  function annotateVerification(rows) {
    return rows.map(r => {
      const status = r.verification_status || "unverified";
      return {
        ...r,
        _verification: status,
        _overridden_fields: status === "verified" ? ["verified"] : [],
      };
    });
  }

  // Try the local admin API first; fall back to the on-disk JSON snapshot.
  async function loadData() {
    if (global.AQMAR_API) {
      try {
        const rows = await global.AQMAR_API.get("/martyrs");
        const annotated = annotateVerification(rows);
        return {
          generated_at: new Date().toISOString(),
          channel: "AqmarTofan",
          source: "api",
          martyrs: rows,
          overrides: {},
          allRows: annotated,
        };
      } catch (e) {
        console.warn("API load failed, falling back to data/martyrs.json:", e.message);
      }
    }
    // Fallback: the static JSON snapshot last published by export_to_json.py
    const res = await fetch("../data/martyrs.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`Cannot load data/martyrs.json: ${res.status}`);
    const raw = await res.json();
    const rows = Array.isArray(raw) ? raw : (raw.martyrs || []);
    const annotated = annotateVerification(rows);
    return {
      generated_at: raw.generated_at || new Date().toISOString(),
      channel: raw.channel || "AqmarTofan",
      source: "static-json",
      version: raw.version,
      martyrs: rows,
      overrides: {},
      allRows: annotated,
    };
  }

  function adaptMartyrToNewSchema(row) {
    if (!row || row.msg_id === undefined || row.msg_id === null) return null;
    return {
      id:        row.msg_id,
      name:      row.name || "",
      birth:     row.birth_date || "",
      martyrdom: row.martyrdom_date || "",
      city:      row.city || "",
      rank:      row.military_rank || "",
      weapon:    row.weapon || "",
      battalion: row.battalion || "",
      brigade:   row.brigade || "",
      photo:     row.photo_path || "",
      source:    row.message_link || "",
      verification: row.verification_status || "unverified",
    };
  }

  // Field-name remap used inside override entries — mirrors the martyr adapter.
  const OVERRIDE_FIELD_MAP = {
    birth_date:     "birth",
    martyrdom_date: "martyrdom",
    military_rank:  "rank",
    photo_path:     "photo",
  };

  function adaptOverridesToNewSchema(v1) {
    if (!v1 || !v1.edits) return {};
    const out = {};
    for (const id of Object.keys(v1.edits)) {
      const edit = v1.edits[id];
      const mapped = {};
      for (const k of Object.keys(edit)) {
        if (k.startsWith("_")) continue;  // drop meta fields
        const newKey = OVERRIDE_FIELD_MAP[k] || k;
        mapped[newKey] = edit[k];
      }
      out[id] = mapped;
    }
    return out;
  }

  global.mergeOverrides = mergeOverrides;
  global.loadData = loadData;
  global.adaptMartyrToNewSchema = adaptMartyrToNewSchema;
  global.adaptOverridesToNewSchema = adaptOverridesToNewSchema;
})(window);
