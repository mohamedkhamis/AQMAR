// webui/data-loader.js
// Loads martyrs from the local AQMAR admin API.
//
// Falls back to the on-disk data/martyrs.json file when the API is
// unreachable (e.g. running the SPA from GitHub Pages where the API
// server isn't available, or before `python scripts/admin_server.py`
// is started locally).

(function (global) {
  "use strict";

  // Try the local admin API first; fall back to the on-disk JSON snapshot.
  async function loadData() {
    if (global.AQMAR_API) {
      try {
        const rows = await global.AQMAR_API.get("/martyrs");
        return {
          generated_at: new Date().toISOString(),
          channel: "AqmarTofan",
          source: "api",
          martyrs: rows,
          overrides: {},
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
    return {
      generated_at: raw.generated_at || new Date().toISOString(),
      channel: raw.channel || "AqmarTofan",
      source: "static-json",
      version: raw.version,
      martyrs: rows,
      overrides: {},
    };
  }

  // Photo paths in the DB are stored as "data/photos/N.jpg" — and on Windows
  // pyodbc occasionally returns them with backslashes ("data/photos\N.jpg")
  // because that's how os.path.join concatenated them in phase3_daily.py.
  // Two normalizations:
  //   1. Convert \ → / so URLs are valid (browsers URL-encode \ to %5C
  //      which StaticFiles doesn't resolve)
  //   2. Prepend "../" if the path is relative. The SPA is served from /webui/
  //      so a bare relative path resolves to /webui/data/photos/N.jpg — wrong.
  //      Prepending "../" makes the browser resolve up to /data/photos/N.jpg
  //      which is where IIS / GitHub Pages actually serve photos from.
  // Absolute URLs and already-prefixed paths pass through unchanged.
  function normalizePhotoPath(p) {
    if (!p) return p;
    p = p.replace(/\\/g, "/");
    if (p.startsWith("http") || p.startsWith("/") || p.startsWith("../")) return p;
    return "../" + p;
  }

  // Splits the semicolon-separated frame_paths string into an array of
  // browser-resolvable URLs. Same backslash→forward normalization +
  // "../" prefix as photo paths (frames live at /data/frames/ which IIS
  // mounts alongside /data/photos/).
  function normalizeFramePaths(s) {
    if (!s) return [];
    return s.split(/;\s*/).filter(Boolean).map(normalizePhotoPath);
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
      photo:     normalizePhotoPath(row.photo_path || ""),
      // OCR source frames — shown in the admin edit form so the admin can
      // see what OCR actually extracted from the video before accepting
      // or correcting the structured fields.
      frames:    normalizeFramePaths(row.frame_paths),
      // featuredFrame: the single frame the admin picked as the "cover"
      // (Phase 1 cover-image feature, 2026-05-25). Kept in RAW DB format
      // ("data/frames/41_28.jpg" — no "../" prefix) so buildEditDiff can
      // compare it apples-to-apples with what the save path sends back.
      // Null until the admin picks one. To compare against a normalized
      // carousel src, strip the leading "../" with denormalizePath().
      featuredFrame: row.featured_frame_path || null,
      source:    row.message_link || "",
      // Telegram post-embed URL derived from the message link. Renders an
      // inline preview (channel header + blurred video thumbnail + caption +
      // "VIEW IN TELEGRAM"). NOTE: Telegram refuses inline playback for these
      // large memorial videos — clicking play opens Telegram. True inline play
      // comes from archiveOrgId below. Empty string when there's no source.
      tgEmbed:   row.message_link
                   ? row.message_link.replace(/\/+$/, "") + "?embed=1&mode=tme"
                   : "",
      // Archive.org item identifier (Phase 2 — hybrid video hosting). When set,
      // the SPA renders an Archive.org <iframe> player that plays INLINE on the
      // page instead of the Telegram preview. Null/"" until a row's video is
      // mirrored by scripts/mirror_to_archive_org.py, so every row currently
      // falls back to the Telegram embed above. See docs/hybrid-video-hosting.md.
      archiveOrgId: row.archive_org_id || "",
      // When the scraper inserted this row into SQL Server (UTC ISO string).
      // Used by the admin grid's "Added" column + sort. Null on rows that
      // came from the published JSON snapshot (the exporter strips this).
      addedAt:   row.created_at || null,
      verification: row.verification_status || "unverified",
      // Boolean shorthand the admin grid sorts by. Default false for any
      // row that isn't explicitly 'verified' (including unverified +
      // rejected), so new rows from the scraper land at the top of the
      // verification queue automatically.
      //
      // Note: rows loaded from the static data/martyrs.json fallback (used
      // by the public site / GitHub Pages) won't carry verification_status —
      // the exporter strips it. Those rows will all have isVerified=false,
      // but the public browse grid doesn't sort or display the flag, so
      // this is invisible to visitors. Only the admin grid reads it.
      isVerified: (row.verification_status || "unverified") === "verified",
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

  global.loadData = loadData;
  global.adaptMartyrToNewSchema = adaptMartyrToNewSchema;
  global.adaptOverridesToNewSchema = adaptOverridesToNewSchema;
})(window);
