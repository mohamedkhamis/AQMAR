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
})(window);
