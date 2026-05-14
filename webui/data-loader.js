// webui/data-loader.js
// Loads martyrs from Supabase. Replaces the old fetch-from-JSON path.

(function (global) {
  "use strict";

  function mergeOverrides(baseMartyrs, overridesEdits) {
    // Kept for backward compat with any leftover overrides.json files.
    // In the Supabase world, baseMartyrs are already the canonical merged rows,
    // so callers typically pass overridesEdits={} and this is a near-no-op.
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

  // Mark rows whose manual_edited_at column is non-null with
  // _overridden_fields: ["manual_edit"]. Currently consumed only via the
  // `allRows` key in loadData()'s return; Task 10 (admin-edit) will wire
  // this into the Alpine state so the ✏️ badge surfaces edits made through
  // the new Supabase admin flow (the legacy badge reads localStorage
  // edits[m.id] instead — see index.html).
  function annotateManualEdits(rows) {
    return rows.map(r => ({
      ...r,
      _overridden_fields: r.manual_edited_at ? ["manual_edit"] : [],
    }));
  }

  async function loadData() {
    if (!global.AQMAR_SB) {
      throw new Error("Supabase client not initialized. Check webui/config.js " +
        "for valid supabaseUrl + supabaseAnonKey.");
    }
    const { data, error } = await global.AQMAR_SB
      .from("martyrs")
      .select("*")
      .order("posted_date", { ascending: false });
    if (error) throw new Error(`Supabase: ${error.message}`);
    const rows = annotateManualEdits(data || []);
    return {
      generated_at: new Date().toISOString(),
      channel: "AqmarTofan",
      martyrs: data || [],
      overrides: {},      // no longer used; kept for compat with callers
      allRows: rows,
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
