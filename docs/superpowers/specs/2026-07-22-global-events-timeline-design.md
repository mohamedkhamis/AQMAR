# Global events on the lifespan timeline — design

**Date:** 2026-07-22
**Status:** approved by user (preview page reviewed; merged variant chosen)
**Preview:** https://claude.ai/code/artifact/903239be-81b0-4f3b-8fc3-8cb79a34410e

## Goal

Let the admin maintain a global list of historical events (e.g. معركة طوفان
الأقصى, start 2023-10-07) in a settings JSON, and render those events on every
person's lifespan line in the detail view — ordered by date, each showing the
person's age when the event started. Fix the lifespan line's existing RTL and
mobile bugs in the same pass.

## Decisions made with the user

1. Events render **on the existing lifespan line** (the horizontal year axis
   under the dates strip), not as a separate section.
2. A person's line shows **only events whose start date falls inside their
   lifetime** (birth ≤ event start ≤ martyrdom). Events outside the lifetime
   are simply omitted for that person.
3. Event names are **Arabic (required) + English (optional)**; when English is
   empty the Arabic name is shown in both languages.
4. Storage is a **settings JSON file** (`data/settings.json`), not a SQL table.
5. Desktop layout is the **merged variant**: name + age labels directly on the
   line, alternating above/below, with horizontal dodging when labels would
   overlap (a slanted leader line points back to the true position), **plus** a
   detail list under the line (name, date range, age-at-start pill).
6. Mobile (≤480px) switches to a **vertical timeline**: birth at top, events in
   ascending date order, martyrdom at bottom.
7. Site-wide age computation switches from year-subtraction to **calendar-
   accurate** age so the event ages and the displayed العمر عند الاستشهاد can
   never contradict each other. Some displayed ages may drop by one year
   (becoming correct).

## 1. Settings file — `data/settings.json` (new, tracked in git)

```json
{
  "version": 1,
  "events": [
    {
      "id": "evt-1",
      "name_ar": "معركة طوفان الأقصى",
      "name_en": "7 October War",
      "start_date": "2023-10-07",
      "end_date": null
    }
  ]
}
```

- `id`: stable string, generated server-side (`evt-<n>`), unique.
- `name_ar` required non-empty; `name_en` optional (empty string or null).
- `start_date` required `YYYY-MM-DD`; `end_date` optional `YYYY-MM-DD`,
  must be ≥ `start_date` when present.
- The file is the **source of truth**. It is tracked by git, so committing it
  publishes it to Cloudflare Pages / GitHub Pages automatically (both deploy
  the whole tracked tree). `scripts/publish.ps1` gains a
  `git add data/settings.json` alongside the existing `martyrs.json` add.
- Future global settings can be added as sibling top-level keys.

## 2. Server — `src/admin_app.py`

Two new routes (no DB involvement; the file is read/written directly):

| Method | Path | Auth | Behavior |
|---|---|---|---|
| GET | `/api/settings` | none | Return parsed `data/settings.json`; if the file is missing return `{"version": 1, "events": []}`. |
| PUT | `/api/settings` | `Depends(require_admin)` | Validate the full settings body and atomically overwrite the file (UTF-8, `ensure_ascii=False`, `indent=2`, trailing newline). Returns the saved payload. |

Validation (422 on failure, FastAPI `detail` message):
- `events` is a list; each event has non-empty `name_ar`, valid ISO
  `start_date`; `end_date` null or valid ISO and ≥ `start_date`;
  `name_en` optional string.
- Server assigns `id` for events that arrive without one; ids must be unique.
- `version` defaults to 1 when absent; reject non-integer values. Reject
  request bodies over 256 KB so the file can't be abused as a blob store.
- **Merge semantics:** the client sends `{version, events}` only. The server
  loads the existing file, replaces `version` + `events`, preserves any other
  top-level keys already in the file, and writes the result — so future
  settings keys survive an events-only save.
- The file path is a module-level constant resolved from the project root
  (`SETTINGS_PATH = _PROJECT_ROOT / "data" / "settings.json"`, mirroring
  `exporter.DEFAULT_JSON_PATH`), monkeypatched to `tmp_path` in tests —
  never a CWD-relative string.

Settings I/O lives in a small new module `src/settings_store.py`
(`load_settings(path) -> dict`, `save_settings(path, data)`, validation
helpers) so it is unit-testable without FastAPI.

## 3. SPA — loading (`webui/data-loader.js`)

New `loadSettings()` mirroring `loadData()`'s strategy:

1. On localhost with `AQMAR_API` present → `AQMAR_API.get('/settings')`.
2. Fallback → `fetch("../data/settings.json", {cache: "no-cache"})` — works
   immediately on `serve.ps1`/IIS (they serve the working tree) and on Pages
   once the file is committed and pushed. On the Pages hosts this fallback is
   the primary path (the API step is localhost-gated).
3. Fallback → `{version: 1, events: []}` — **settings failures never block or
   break the site**.

`sw.js` (the offline cache) adds `/data/settings.json` to the same
network-first class as `data/martyrs.json`, so events survive offline reloads.

`app.js` `init()` calls it alongside the martyrs load and stores `this.events`
(sorted by `start_date` ascending). Admin saves **await the PUT** and replace
`this.events` from the response on success; on any failure (422, 403, network)
the form shows the error inline and state is unchanged — same pattern as
`saveEdit` for martyr rows (which is not optimistic either).

## 4. SPA — per-person computation (`webui/filter-logic.js`)

New pure functions (exposed on `window`, tested in `webui/tests.html`):

- `eventsForPerson(events, birthIso, martyrdomIso)` → events whose
  `start_date` is within `[birth, martyrdom]`, sorted ascending, each
  annotated with `age_at_start` via the calendar-accurate
  `computeAge(birth, start_date)`. Dates are validated and compared on the
  first-10-characters `YYYY-MM-DD` prefix (mirroring `formatDate`'s prefix
  regex); missing or non-conforming birth/martyrdom → `[]`.
- `eventDisplayName(event, lang)` → `name_en` when `lang === 'en'` and
  non-empty, else `name_ar`.

**Age unification:** the Alpine method `computeAge` in `app.js` (year-only)
is changed to delegate to filter-logic's calendar-accurate `computeAge`,
keeping the existing 0–120 sanity bound and null handling. `m.age`, the age
filter buckets, `ageLabel`, and the lifespan header all pick the corrected
value up automatically. The `?demo` sample rows in `webui/config.js` drop
their hardcoded year-only `age` so demo mode recomputes too (the
`age: m.age != null ? m.age : …` guard in `app.js` otherwise preserves it).

## 5. SPA — the line (`renderTimeline` rewrite in `app.js` + `styles.css`)

Rewrite `renderTimeline(m)` and add a companion that runs after insertion
(label dodging needs measured widths):

- **Structure/styles move to `styles.css`** per the design-token convention;
  the JS emits markup only. Root class is `.lifeline` (NOT `.tl` — a bare
  `.tl` would collide with the portrait corner spans `.corner.tl` at
  `app.js:1324` / `styles.css:359`), with compound children `.lifeline-base`,
  `.lifeline-life`, `.lifeline-band`, `.lifeline-tick`, `.mk-*`, `.ev-label`,
  `.ev-list`, ….
- **Escaping (security):** every event-name interpolation in the rendered
  HTML — both desktop and vertical layouts, and the detail list — MUST go
  through the existing `esc()` helper (`app.js:1440`), since event names are
  the first user-authored strings to enter this `x-html` markup; a crafted
  name in `settings.json` would otherwise be stored XSS served to every
  visitor. The admin panel renders names with `x-text` (no HTML path at all).
- **Positioning fix (RTL bug):** percentages are computed day-precise from
  ISO dates, then converted to a **physical** `left` (`rtl ? 100 − p : p`)
  with physical `translateX(-50%)`. This replaces the broken
  `inset-inline-start` + physical-transform mix. The lifespan gradient
  direction is emitted as `to left` / `to right` based on `lang`.
- **Day-precision axis** (birth date → today), replacing the year-quantized
  positions; year ticks every 5 years, and any tick within ~3% of a marker is
  skipped (fixes the existing 2025-tick/martyrdom collision).
- **Event markers:** small ring dots (`.mk-event`, ivory `--ink-2` outline —
  distinct from the olive birth circle and gold martyrdom diamond) at the
  event start positions. Legend gains حدث and فترة حدث entries.
- **Period bands:** an event with `end_date` renders a translucent gold band
  from start to end; an event without one is ongoing and its band extends to
  the martyrdom marker. Bands are clamped to the birth–martyrdom span.
- **Labels with dodging:** each in-lifetime event gets a two-line label
  (name, عمره N عاماً / age N), alternating above/below the line by index.
  After insertion, a layout pass measures label widths per side, sweeps
  left→right then right→left enforcing a minimum gap, so labels slide
  horizontally instead of overlapping; an SVG leader line connects each label
  to its true marker position. (The algorithm was validated in the preview
  page.)
- **Dodge-pass wiring:** the bare `x-html` binding at `index.html:770` is
  replaced with an `x-effect` that sets `$el.innerHTML =
  renderTimeline(current)` and then `$nextTick(() =>
  dodgeTimelineLabels($el))` — Alpine re-runs it whenever `current` or `lang`
  changes (renderTimeline reads both), covering open/navigate/language
  toggle. A single `resize` listener added in `init()` re-runs the dodge pass
  only. The pass skips labels hidden by the mobile breakpoint.
- **Detail list:** under the line, one row per event — ring bullet, name,
  date or date range (`24 – 30 نوفمبر 2023` same-month compaction, `— مستمر`
  for ongoing), and an age pill (عمره N عاماً). Dates keep Western digits per
  the site convention (`formatDate`).
- **Martyrdom year label moves below the line** so the above-line space
  belongs to event labels.
- **No events / no settings:** the line renders exactly as today (minus the
  fixed bugs).

### Mobile (≤480px)

The horizontal line and dodged labels are replaced by a **vertical timeline**
(the preview's الخيار ب): a start-side rail, entries top-to-bottom in date
order — birth (year + وُلد في date), each event (name, date range, age pill,
and an استمرّ حتى استشهاده tag when ongoing), martyrdom (year + استُشهد في
date + عن عمر N عاماً pill). Implementation: `renderTimeline` emits both
layouts; CSS at the 480px breakpoint shows one and hides the other, so no JS
media-query logic is needed. The dodging pass simply skips hidden labels.

### Dates-strip fixes (same pass, `index.html` + `styles.css`)

- Move the per-cell `border-inline-start` / `-1px` inline styles into
  `.dates-strip` CSS (`> div` rule), copying the `.ai-stats-strip` pattern.
- At ≤768px (2-column wrap): suppress the edge cell's start border and add a
  `border-top` on wrapped cells (`nth-child` rules like styles.css:578-580).
- At ≤480px: single column — each cell becomes a full-width row (centered
  text as today), separated by `border-top`; no `!important`.

## 6. Admin portal — Events panel (`index.html`, `app.js`, `admin-edit.js`)

A new card in the admin section (`view === 'admin' && isAdmin`), following the
existing admin styling:

- **List:** table of events sorted by start date — name (ar), name (en),
  start date, end date, edit + delete buttons. Empty state text.
- **Form** (add or edit, inline in the card): الاسم بالعربية (required),
  English name (optional), تاريخ البداية (required, `<input type="date">`),
  تاريخ النهاية (optional, `<input type="date">`, cleared by a button).
  Client-side checks mirror server validation; errors shown inline.
- **Save:** the SPA sends `{version, events}` via
  `AQMAR_API.put('/settings', …)` (helper `saveSettingsViaApi` in
  `admin-edit.js`); the server merges over the existing file (section 2).
  Delete = remove from the array + same PUT. On success, `this.events` is
  replaced from the response and profile lines update immediately; on failure
  the error shows inline and nothing changes.
- Publishing to the public site stays manual: export/commit via the usual
  publish flow (git approval rules unchanged).

## 7. Error handling summary

| Failure | Behavior |
|---|---|
| `settings.json` missing/unreachable/invalid JSON in SPA | `events: []`, site unaffected |
| PUT validation failure | 422 with an English `detail` (the SPA's client-side checks show Arabic for the common cases); form shows it, file untouched |
| Concurrent admin edits | Last write wins (single-admin tool; acceptable) |
| Person missing birth or martyrdom | No line today → still no line; no events computed |
| Event outside lifetime | Omitted for that person |

## 8. Testing

- **Python (`tests/test_settings_store.py`, `tests/test_admin_app_settings.py`):**
  load/save round-trip incl. Arabic text, missing-file default, validation
  matrix (bad dates, end < start, empty name_ar, duplicate ids, id
  assignment), GET without auth, PUT auth required (403/500 token cases),
  atomic write (temp-file rename), unknown-key round-trip.
- **JS (`webui/tests.html`):** `eventsForPerson` (inside/outside/boundary
  dates, missing dates, sorting, age annotation), `eventDisplayName`
  fallback, calendar `computeAge` edge cases (birthday on event day,
  Dec-birth/Oct-event year boundary).
- **Manual:** admin CRUD flow on localhost; profile line on desktop + 480px;
  Arabic and English toggles; a person martyred before 2023-10-07 shows no
  events.

## Out of scope

- Attaching events to specific martyrs individually.
- Rendering events anywhere other than the detail view line (no home-page
  strip changes).
- Migrating `data/overrides.json` or other legacy config into settings.json.
