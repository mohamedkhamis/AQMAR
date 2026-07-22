// webui/admin-edit.js
// Admin edit + verify + reject logic, backed by the local FastAPI server.

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

  // SPA-side field names → SQL Server `dbo.martyrs` column names. Only the
  // editable columns (no msg_id / verification_status / audit timestamps
  // / ocr_* fields). UI-only fields (draft.age computed in app.js init,
  // draft.bio with no DB column) are silently filtered out.
  const FIELD_REVERSE_MAP = {
    name:          "name",
    birth:         "birth_date",
    martyrdom:     "martyrdom_date",
    city:          "city",
    rank:          "military_rank",
    weapon:        "weapon",
    battalion:     "battalion",
    brigade:       "brigade",
    photo:         "photo_path",
    source:        "message_link",
    // Phase 1 cover-image feature (2026-05-25). draft.featuredFrame is set
    // from the current carousel position in saveEdit / saveAndNext; values
    // are kept in raw DB format ("data/frames/X_Y.jpg") so this is a direct
    // pass-through. Null means "no cover" (row has no frames or admin
    // explicitly cleared it).
    featuredFrame: "featured_frame_path",
  };

  function translateToDbSchema(diffInNewSchema) {
    const out = {};
    for (const k of Object.keys(diffInNewSchema)) {
      if (k === "id") continue;            // id maps to msg_id (URL path), not body
      const dbKey = FIELD_REVERSE_MAP[k];
      if (!dbKey) continue;                // drop SPA-only fields (age, bio, _meta)
      out[dbKey] = diffInNewSchema[k];
    }
    return out;
  }

  // Apply admin edits + mark row 'verified' in one round-trip to the
  // local API. PUT /api/martyrs/{msgId}. Throws on auth / 404 / 5xx.
  async function saveEditViaApi(msgId, diffInNewSchema) {
    if (!global.AQMAR_API) throw new Error("API client not initialized.");
    const dbDiff = translateToDbSchema(diffInNewSchema);
    // Even with empty diff, we still want to allow "verify-only" via the
    // PUT call (so admin can mark a row OK without editing anything).
    return await global.AQMAR_API.put(`/martyrs/${msgId}`, dbDiff);
  }

  // Mark a row 'rejected' so it won't be published.
  async function rejectViaApi(msgId) {
    if (!global.AQMAR_API) throw new Error("API client not initialized.");
    return await global.AQMAR_API.post(`/martyrs/${msgId}/reject`);
  }

  // Save the global settings (events list). PUT /api/settings with
  // {version, events}; the server validates, merges over the existing
  // data/settings.json (preserving unknown top-level keys) and returns the
  // saved document. Throws on auth / validation / network errors.
  async function saveSettingsViaApi(settings) {
    if (!global.AQMAR_API) throw new Error("API client not initialized.");
    return await global.AQMAR_API.put("/settings", settings);
  }

  global.buildEditDiff = buildEditDiff;
  global.translateToDbSchema = translateToDbSchema;
  global.saveEditViaApi = saveEditViaApi;
  global.rejectViaApi = rejectViaApi;
  global.saveSettingsViaApi = saveSettingsViaApi;
})(window);
