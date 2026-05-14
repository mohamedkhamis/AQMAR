// webui/admin-edit.js
// Admin edit logic: diff computation, override accumulation, export.

(function (global) {
  "use strict";

  function buildEditDiff(original, edited) {
    const diff = {};
    const keys = new Set([...Object.keys(original), ...Object.keys(edited)]);
    for (const k of keys) {
      if (k.startsWith("_")) continue;     // skip internal/meta
      if (original[k] !== edited[k]) diff[k] = edited[k];
    }
    return diff;
  }

  // Translates the SPA's NEW-schema field names (id, birth, martyrdom, rank,
  // photo, source) back to the Supabase OLD-schema column names. The other
  // five fields (name, city, weapon, battalion, brigade) pass through.
  const FIELD_REVERSE_MAP = {
    birth:     "birth_date",
    martyrdom: "martyrdom_date",
    rank:      "military_rank",
    photo:     "photo_path",
    source:    "message_link",
  };

  function translateToDbSchema(diffInNewSchema) {
    const out = {};
    for (const k of Object.keys(diffInNewSchema)) {
      if (k === "id") continue;       // id maps to msg_id, which is the WHERE filter, not a column to set
      const dbKey = FIELD_REVERSE_MAP[k] || k;
      out[dbKey] = diffInNewSchema[k];
    }
    return out;
  }

  // Writes an edit-diff to Supabase. Returns the updated row on success,
  // throws on failure. Caller handles the UI optimistic update.
  async function saveEditToSupabase(msgId, diffInNewSchema) {
    if (!global.AQMAR_SB) throw new Error("Supabase client not initialized.");
    const dbDiff = translateToDbSchema(diffInNewSchema);
    if (Object.keys(dbDiff).length === 0) return null;
    const payload = {
      ...dbDiff,
      manual_edited_at: new Date().toISOString(),
      manual_edited_by: "admin",
    };
    const { data, error } = await global.AQMAR_SB
      .from("martyrs")
      .update(payload)
      .eq("msg_id", msgId)
      .select()
      .single();
    if (error) throw new Error(`Supabase update: ${error.message}`);
    return data;
  }

  function addEdit(existingOverrides, msgId, diff, timestampIso, editor) {
    if (Object.keys(diff).length === 0) return existingOverrides;
    const key = String(msgId);
    const prior = existingOverrides[key] || {};
    return {
      ...existingOverrides,
      [key]: {
        ...prior,
        ...diff,
        _manual_edit_at: timestampIso,
        _editor: editor || "admin",
      },
    };
  }

  function buildExportPayload(overridesEdits) {
    return { version: 1, edits: overridesEdits };
  }

  function downloadOverridesJson(overridesEdits) {
    const payload = buildExportPayload(overridesEdits);
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "overrides.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  global.buildEditDiff = buildEditDiff;
  global.addEdit = addEdit;
  global.buildExportPayload = buildExportPayload;
  global.downloadOverridesJson = downloadOverridesJson;
  global.saveEditToSupabase = saveEditToSupabase;
})(window);
