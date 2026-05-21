# AQMAR Codebase Review — 2026-05-20

Read-only audit of the full codebase: `src/` (14 modules), `scripts/` (24 scripts),
`tests/` (11 files, 92 tests), `webui/` (vanilla-JS SPA), and cross-cutting config.
The audit phase modified nothing — findings + suggested fixes only. A follow-up
implementation pass has since been applied; see the **Implementation status** box below.

The codebase is ~4,600 LOC Python + ~1,600 LOC JS/CSS. It was recently migrated from an
Excel/Supabase storage layer to SQL Server (commit `ad21dca`, "Batch 7", 2026-05-17).
**That migration is the single biggest source of findings below** — it deleted the
Supabase/Excel *core* but left a large tail of Excel-era *scripts* behind.

> ## ✅ Implementation status — "Quick wins + triage" applied 2026-05-20
>
> The **Quick wins + triage** subset of this report has since been implemented in a
> follow-up pass (the audit itself modified nothing). Applied:
> - **Deleted dead code:** `adminHeaders`/`initials`/`sha256` (`app.js`),
>   `mergeOverrides`/`annotateVerification`/`allRows` (`data-loader.js`), the light-theme
>   `:root` palette + `.portrait .monogram` + `.bg-page` + `.badge-crimson` (`styles.css`),
>   unused imports `Alignment`/`asdict` (`excel_writer.py`) + `JSONResponse` (`admin_app.py`).
> - **Deleted 7 Excel-dead scripts:** `fill_birth_dates{,_v2}.py`, `phase2_backfill{,_v2}.py`,
>   `phase2_photos_only.py`, `recover_photos.py`, `phase1_test.py`.
> - **Archived 4 PoC scripts** to `scripts/archive/` (+ a `README.md`).
> - **Fixes:** `serve.ps1` (dropped deleted `excel_to_json.py` call), `status.py` (rewritten
>   to query SQL Server), `report_gaps.py` (dropped stale tool references), broken
>   `tests.html` blocks removed, `pytest.ini` added (`testpaths = tests`),
>   `Optional`-style annotations in `state.py`/`exporter.py`, and the `draftDirty()`
>   key-union bug in `app.js`.
> - **Verified:** all 92 tests pass; changed Python byte-compiles; changed JS passes
>   `node --check`.
>
> **Not yet done** (see Part 3 for the full plan): the structural refactors (R1–R6,
> incl. the `app.js` decomposition), and the new test files for
> `pipeline`/`ocr_engine`/`telegram_client`. The High-severity SQL f-string hardening in
> §1.5 was also left as-is (zero-risk today; flagged for defense-in-depth).

## Severity legend

- **High** — bug risk, broken behaviour, or large maintenance burden (e.g. a whole dead file).
- **Medium** — duplication, structural drift, clarity problems.
- **Low** — cosmetic / nitpick.

## At a glance

| Area | High | Medium | Low |
|---|---|---|---|
| Part 1 — Code smells / dead code / duplication | 14 | 26 | 18 |
| Part 2 — TODO/HACK/FIXME | 0 (none exist) | — | — |
| Part 3 — Structure / coupling | 4 | 6 | — |

---

# Part 1 — Code Smells, Dead Code, Unused Imports, Naming, Duplication

## 1.1 Dead code

### scripts/ — Excel-era scripts orphaned by the SQL Server migration

Commit `ad21dca` made SQL Server (`dbo.martyrs`) the source of truth and deleted the
Supabase/Excel core. But **7 scripts that read/write `data/martyrs.xlsx` were left
behind**. They are off every live code path — verified: their only inbound references
are their own docstrings and *text* in `report_gaps.py`'s output tables (not real calls).

| # | File | Status | Suggested fix |
|---|---|---|---|
| 1 | `scripts/fill_birth_dates.py` | Excel-dead; superseded by `_v2` | Delete |
| 2 | `scripts/fill_birth_dates_v2.py` | Excel-dead (survivor of the pair) | Delete, or rework against `sqlserver_client` if birth-date backfill is still needed |
| 3 | `scripts/phase2_backfill.py` | Excel-dead; superseded by `_v2` | Delete |
| 4 | `scripts/phase2_backfill_v2.py` | Excel-dead, **zero** inbound refs | Delete |
| 5 | `scripts/phase2_photos_only.py` | Excel-dead (distinct photo-only mode, not a `v3`) | Delete or rework against SQL Server |
| 6 | `scripts/recover_photos.py` | Excel-dead — yet still *recommended* by `report_gaps.py:144,155` | Delete (and fix the stale recommendation) |
| 7 | `scripts/phase1_test.py` | Excel-dead **and** misnamed (see 1.4) | Delete or archive |

> **High** — The `_v1` vs `_v2` framing is a red herring: *both* members of each pair
> write to a non-canonical store. The decision is per-workflow ("do we still need
> birth-date backfill / photo recovery?"), not "which version is newer."

### scripts/ — exploratory proof-of-concept scripts (off every code path)

Not harmful (no Excel writes), but pure clutter. **Medium** — move to `scripts/archive/`.

- `scripts/phase0_sample.py` — phase-0 sampling PoC, no inbound refs.
- `scripts/investigate_photos.py` — one-shot investigation, no inbound refs.
- `scripts/investigate_speed.py` — one-shot investigation, no inbound refs.
- `scripts/test_partial_video.py` — partial-download PoC; also misnamed (see 1.4).

### scripts/ — partially dead

- **High** — `scripts/status.py:13,27-53` — the coverage-stats block reads
  `data/martyrs.xlsx` via `load_workbook` and reports stale numbers. The `state.json`
  block (lines 18-25) still works. *Fix:* rewrite the coverage block to query SQL
  Server, or drop it.

### scripts/ — broken reference (dead call, not a dead file)

- **High** — `scripts/serve.ps1:22-24` — invokes `scripts/excel_to_json.py`, which was
  deleted in `ad21dca`. On the normal `.venv` path this runs unconditionally and prints
  `No such file or directory` before falling through to the static server. *Fix:* remove
  the JSON-regeneration block (lines 18-25) — JSON is now produced by
  `export_to_json.py` from SQL Server — or repoint it there.

### webui/ — dead functions, getters, and config

- **High** — `webui/app.js:419-432` — `adminHeaders` getter defined, never referenced
  (table renders from `adminCols` instead). Delete (14 lines).
- **High** — `webui/app.js:994-998` — `initials(name)` never called; the monogram it fed
  was removed 2026-05-18 (see comment at `app.js:886`). Delete.
- **High** — `webui/app.js:1025-1029` — `sha256()` defined, exported nowhere, never
  called. Delete.
- **Medium** — `webui/app.js:53-56` — `arMonths`/`enMonths` state arrays never read by
  any template (the live copy lives inside `formatDate`). Delete the state properties.
- **High** — `webui/data-loader.js:12-26` — `mergeOverrides()` exported and tested but
  never called by production code; its own header comment calls it "a near-no-op."
  Delete it and its 5 tests (`tests.html:131-172`).
- **Medium** — `webui/data-loader.js:37-47` — `annotateVerification()` and the `allRows`
  field it produces are never consumed (`app.js` re-derives everything via
  `adaptMartyrToNewSchema`). Delete.
- **High** — `webui/filter-logic.js:91-113` — `describeDeltaShort()` exported, never
  called anywhere. Delete.
- **Medium** — `webui/filter-logic.js` — `describeDelta()`, `sortRows()`,
  `filterByProximity()`, `windowDaysFromMode()`, `daysBetween()` are exported but used
  **only by `tests.html`** — `app.js` re-implements each inline. Either adopt them in
  `app.js` (preferred — see Part 3) or delete. Of 9 exports, only `computeAge`,
  `normalizeArabic`, `searchPredicate` are used by production.
- **Medium** — `webui/config.js:16` — `apiBase` is documented as an override knob, but
  `api-client.js:16` hardcodes `const BASE = "/api"` and never reads it. Wire it in or
  delete it.

### webui/ — broken / dead tests

- **High** — `webui/tests.html:199-226` — five tests call `addEdit(...)` and
  `buildExportPayload(...)`. **Verified: neither function exists** in any loaded script
  — they are a removed v1 API. These tests throw `ReferenceError` and always fail.
  Delete the blocks or restore the functions.
- **Medium** — `webui/tests.html:413-463` — `applyFilterPure()` is a hand-maintained
  "pure subset of `app.js`" — but `app.js` has no `applyFilter()` method; the real logic
  is the `filtered` getter. Green tests here prove nothing about production code.

### webui/ — dead CSS

- **Medium** — `webui/styles.css:3-25` — the entire `:root` light palette (23 custom
  properties) never renders: `index.html:4` hardcodes `data-theme="dark"` and there is
  no toggle UI. Ship a theme toggle or delete the light block.
- **Medium** — `webui/styles.css:241-248` — `.portrait .monogram` rule — the monogram
  element was removed; selector matches nothing. Delete.
- **Medium** — `webui/styles.css:103` — `.bg-page` defined, never used (only
  `.bg-page-2`/`.bg-page-3` appear in HTML). Delete.
- **Medium** — `webui/styles.css:202` — `.badge-crimson` defined, never referenced
  (rejected status uses an inline `style` instead). Delete or use it.

### Stale local artifacts (not tracked, but worth a sweep)

- `src/__pycache__/supabase_client.cpython-311.pyc`,
  `scripts/__pycache__/excel_to_json.cpython-311.pyc`, and three
  `*-pytest-9.0.3.pyc` files are compiled ghosts of deleted/renamed modules. `__pycache__`
  is gitignored so they are local-only — a one-time `git clean -xd` of `__pycache__`
  removes the confusion. The `*-pytest-*.pyc` ones also confirm pytest is currently
  collecting `scripts/` (see 1.4).

## 1.2 Unused imports

- **Medium** — `src/excel_writer.py:4` — `Alignment` imported from `openpyxl.styles`,
  never used (only `Font`, `PatternFill` are). Remove.
- **Medium** — `src/excel_writer.py:2` — `asdict` imported from `dataclasses`, never
  used in this file. Remove.
- **Medium** — `src/admin_app.py:29` — `JSONResponse` imported from `fastapi.responses`,
  never used (only `RedirectResponse` is). Remove.
- **Low** — `scripts/phase3_daily.py:25` — `import os` unused (paths are string
  constants; joins happen elsewhere). Remove.
- **Low** — `tests/test_config.py:1` — `import os` unused. Remove.

> A targeted pass found **no other** unused imports in `src/` or `scripts/` — imports
> are otherwise disciplined.

## 1.3 Duplicated logic

### Python — cross-script boilerplate (quantified)

| Pattern | Files | Count | Suggested fix |
|---|---|---|---|
| `sys.path.insert(0, str(Path(__file__).parent.parent))` | every script + 3 tests | **~20** | Make `src` an installable package (`pyproject.toml` + `pip install -e .`); add `tests/conftest.py`. See Part 3. |
| `TelegramFetcher(cfg.api_id, cfg.api_hash, …)` 6-arg construction | ~14 scripts | **~14** | Add a `TelegramFetcher.from_config(cfg)` classmethod |
| `logging.basicConfig(FileHandler("logs/X.log"…) + StreamHandler())` | ~10 scripts | **~10** | Extract `setup_logging(logfile)` helper into `src/` |
| `sys.stdout.reconfigure(encoding="utf-8")` UTF-8 block | 5 scripts | **5** | Shared helper (currently inconsistent — some reconfigure stderr, some don't) |
| `name_to_photo` index build loop | 6 scripts | **6** | Extract `build_photo_index(photos)` into `src/` |
| `dedup_by_name` + `VideoMeta` build loop | 3 scripts | **3** | Extract `dedup_videos(videos)` helper |
| Excel column-index constants (`COL_*`, `PHOTO_COL`…) | 3 scripts | **3 independent copies** | Moot if Excel scripts are deleted; else centralize in `excel_writer.py` |
| Paired-photo search logic | `phase3_daily.py` (`min_id-20`) vs `reprocess.py` (`(-1,-2,-3,1,2)`) | 2 divergent impls | Unify into one helper |

### Python — `src/` duplication

- **Medium** — `src/pipeline.py:51` — `merged` is initialised with a hardcoded 5-key
  dict literal that must stay in sync by hand with `parser_ocr.PATTERNS.keys()`. Add an
  OCR field and `pipeline.py` silently drops it (then risks `KeyError` at lines 73-83).
  *Fix:* `merged = {k: "" for k in PATTERNS.keys()}` (import `PATTERNS`).
- **Medium** — `src/exporter.py` + `src/sqlserver_client.py` — two sources of truth for
  the publish version number: `next_publish_version()` (computes `MAX+1`) feeds the JSON
  payload, while `insert_publish_version()` returns the IDENTITY column for the table. A
  race or manual row delete makes them disagree. *Fix:* use the `OUTPUT inserted.version`
  return value as the single source of truth; drop the separate `next_publish_version`
  call in the export flow.

### JavaScript — `webui/` duplication

- **Medium** — `webui/app.js:691-702` vs `filter-logic.js:38-47` — **two different
  `computeAge` implementations.** `app.js` does year-subtraction only; `filter-logic.js`
  does month/day-aware calculation. They give different results for the same input.
  Keep the month-aware one, delete the other.
- **Medium** — `webui/app.js:317-326` vs `filter-logic.js:69-87` — two parallel sort
  implementations (`app.js`'s inline `sortFns` map vs `filter-logic.js`'s `sortRows`),
  with different field names (`m.martyrdom` vs `r.martyrdom_date`). Consolidate.
- **Medium** — `webui/app.js:53-56, 1018, 1021` — the Arabic month-name array is
  declared **three times** (state property, inside `formatDate`, plus English twice).
  Keep one shared `const`.
- **Medium** — `webui/app.js:731-823` — three Litepicker initialisers
  (`initBirthdayPicker`, `initDatePicker`, `initDraftDatePicker`) share ~80% identical
  config. Collapse into one `makeDatePicker({el, onSelect, minYear, maxYear, maxDate})`.
- **Medium** — `webui/app.js:184-193` — the
  `[...new Set(all.map(...).filter(Boolean))].sort()` pattern is copy-pasted 5× to build
  the city/rank/weapon/battalion/brigade filter universes. Extract `distinctSorted(field)`.
- **Medium** — Three hand-maintained DB↔SPA field-name maps for the *same* schema:
  `FIELD_REVERSE_MAP` (`admin-edit.js:21`), the inline map in `adaptMartyrToNewSchema`
  (`data-loader.js`), and `OVERRIDE_FIELD_MAP` (`data-loader.js:145`). Define one
  bidirectional map; derive the inverse.
- **Medium** — `webui/index.html` — the "small martyr card" markup (portrait + name +
  meta) is hand-copied ~4× (preview-matches, on-this-day, related, browse grid/list);
  the AQMAR compass SVG logo is pasted inline 4× at different sizes. Extract a template
  partial / `<use>` a single `<symbol>`.
- **Low** — `webui/config.js:36` & `webui/app.js:992` — `pad()` defined twice.

## 1.4 Inconsistent naming

- **High** — `scripts/phase1_test.py` & `scripts/test_partial_video.py` — both match
  pytest's `test_*.py` discovery glob but contain **zero `def test_` functions** — they
  are ad-hoc `asyncio.run(main())` scripts. The `*-pytest-9.0.3.pyc` artifacts prove
  pytest collects them from the repo root; `test_partial_video.py` even makes live
  Telegram network calls during collection. *Fix:* rename off the `test` token **and**
  add a pytest config with `testpaths = tests` (see Part 3).
- **Medium** — `scripts/` has four ad-hoc naming schemes for one "phase N pipeline"
  concept: `phase0_sample` / `phase1_test` / `phase2_backfill` / `phase3_daily`, plus
  `investigate_*`, `_v2`, `_photos_only`. No consistent suffix convention.
- **Medium** — CLI conventions diverge: only `export_to_json.py`,
  `migrate_excel_to_sqlserver.py`, `reprocess.py` use `argparse`;
  `fill_birth_dates_v2.py` exposes tunables as module constants; `mark_gap_skipped.py`
  hardcodes everything.
- **Low** — `webui/app.js` free functions (`dayDelta`, `esc`, `formatDate`, `pad`,
  `sha256`, `initials`) leak to global scope — `app.js` has **no IIFE wrapper and no
  `"use strict"`**, unlike `api-client.js` / `data-loader.js` / `filter-logic.js` /
  `admin-edit.js`, which all use the IIFE-`(function(global){…})(window)` pattern.
  Inconsistent module discipline.
- **Low** — `webui/app.js:18-19` — `draft` and `edits` are both edit-state objects;
  names don't signal "current form" vs "session cache". Rename `editDraft` /
  `sessionEdits`.
- **Low** — `src/` is otherwise consistently `snake_case` / `PascalCase` with no
  camelCase drift; `tests/` consistently follows `test_<subject>_<behavior>`.

## 1.5 Other code smells

### Python

- **High** — `src/state.py:9` — `last_processed_msg_id: int = None` — annotation says
  `int` but the default is `None`. Wrong type; should be `Optional[int]`. (Same wrong
  pattern: `exporter.py:60,71` and `sqlserver_client.py:228`, all `note: str = None`.)
- **High** — `src/sqlserver_client.py:103,111,148` — `SET`/column clauses are built by
  f-string interpolation of column names. Safe *today* (names come from the `COLUMNS`
  constant / `_EDITABLE_FIELDS` whitelist) but the pattern repeats 3× and is one
  careless edit from SQL injection. Add a frozenset assertion at each f-string site, or
  a comment pinning the invariant.
- **Medium** — `src/parser_caption.py:17-18` — `grab(BATTALION_RE)` and
  `grab(BRIGADE_RE)` are each called twice (condition + value), re-running the regex.
  Assign to locals once.
- **Medium** — `src/telegram_client.py:90,121` — error handling is stringly-typed
  (`"file reference" in err_lower`); breaks if Telethon changes its message text. Hard
  to avoid with Telethon — add a comment noting the coupling.
- **Medium** — `src/pipeline.py:73-83` vs `:95-102` — inconsistent dict access:
  subscript (`merged["birth_date"]`) in one half, `.get()` in the other. Use `.get()`
  throughout (ties into the `pipeline.py:51` duplication fix above).
- **Low** — `src/exporter.py:64` — `datetime.utcnow()` is deprecated since Python 3.12;
  use `datetime.now(timezone.utc)`.
- **Low** — `src/config.py:23` — missing required `.env` keys raise a bare `KeyError`
  with no indication of which variable is absent. Wrap required-key access in a helper
  that raises `RuntimeError("TELEGRAM_API_ID missing from .env")`.
- **Low** — `src/admin_app.py:18` — docstring says `POST /api/publish (stub, Batch 6)`
  but `publish()` is fully implemented. Update the stale comment.
- **Low** — `scripts/phase3_daily.py:96` & `scripts/admin_server.py:30,35` &
  `scripts/reprocess.py:70` — magic numbers (lookback `20`, port `8000`, photo offsets)
  inline; promote to named constants.
- **Low** — `scripts/report_gaps.py:70` — hardcoded `"(0/388)"` / `"388"` in the TL;DR
  string while everything else counts dynamically; will silently lie as data grows.

### JavaScript / HTML / CSS

- **High** — `webui/app.js:569-577` — `draftDirty()` iterates only
  `Object.keys(this.draft)`, so a field *removed* from the draft is missed; it also
  flags UI-only keys (`age`, `bio`) that `buildEditDiff` later strips, so it can report
  dirty for a field `saveEdit` silently drops. Compare against the union of key sets,
  consistent with `buildEditDiff`.
- **Medium** — `webui/index.html` — pervasive inline `style="…"` carrying layout/colour
  (e.g. `padding-inline-start:12px` repeated on every date-input wrapper;
  `border-bottom:1px solid var(--divider)` on dozens of elements). This is what forces
  the `!important` pile-up in `styles.css:289-305`. Extract recurring patterns into
  classes (`.date-input-wrap`, `.solid-divider`).
- **Medium** — `webui/index.html:8-19` — `window.__updateTitle` is a JS function
  embedded in a `<head>` `<script>` with its own duplicated ar/en title strings that
  overlap `app.js:47-51`. Move into `app.js`.
- **Low** — `webui/app.js:128,132` — `catch (e) {}` swallows JSON-parse and
  localStorage errors silently (twice). At minimum `console.warn`.
- **Low** — `webui/index.html:719` — "Add photo" button in the detail view has no
  `@click` handler — clickable, does nothing.
- **Low** — `webui/tests.html:49-53` — cache-bust query strings are inconsistent
  (`?v=4` vs `?v=7`) and `index.html` loads the same files with no version string at
  all. Manual versioning already out of sync.
- **Low** — `webui/styles.css:284,303` — `.grid-bday` rule duplicated across the 900px
  and 600px media queries; the 600px copy is redundant.
- **Low** — `webui/styles.css:225,234,251-254,83-84` — magic hex/rgba colours bypass
  the `--` token system; promote to variables.

---

# Part 2 — TODO / HACK / FIXME Action Plan

**There are no `TODO`, `HACK`, `FIXME`, or `XXX` comments anywhere in the codebase.**

A full sweep of all source files (`src/`, `scripts/`, `tests/`, `webui/`, configs) for
`TODO`, `HACK`, `FIXME`, `XXX`, `WORKAROUND`, `TEMPORARY` returned only false positives
(`tempfile.TemporaryDirectory()`). A broadened sweep for `deprecated`, `legacy`, `noqa`,
`type: ignore`, `pragma`, `pylint:`, `NotImplementedError` also found nothing actionable
— the only `legacy` hits are an intentional localStorage-key migration comment
(`webui/app.js:119`) and a test name (`tests/test_parser_ocr.py:78`).

**There is therefore no action plan to produce for this deliverable** — and that is a
genuinely good sign for a young codebase.

**However**, the items that would normally *be* `FIXME`s are instead recorded in this
review as concrete findings. The de-facto "FIXME backlog" is the High-severity list in
Part 1 — treat it as the prioritised action plan:

1. `webui/tests.html` — broken tests calling non-existent `addEdit` / `buildExportPayload`.
2. `scripts/serve.ps1` — calls the deleted `excel_to_json.py`.
3. The 7 Excel-dead scripts + `status.py`'s stale block.
4. `src/state.py:9` wrong type annotation; `sqlserver_client.py` f-string SQL pattern.
5. `webui/app.js` dead functions (`adminHeaders`, `initials`, `sha256`) and the
   `draftDirty()` correctness bug.

> **Suggestion:** going forward, when work is deliberately deferred, leave an explicit
> `# TODO(owner): …` so it is greppable, rather than relying on memory or review docs.

---

# Part 3 — Project Structure & Refactoring Opportunities

## 3.1 Current structure

```
src/        14 modules  (~1,300 LOC)  — core library: telegram → OCR → parse → SQL Server → export
scripts/    24 scripts  (~2,000 LOC)  — MIXED: live pipeline + one-shot tools + dead Excel + PoCs
tests/      11 files     (92 tests)   — covers most of src/, none of scripts/
webui/      6 JS + 2 HTML + 1 CSS     — vanilla-JS SPA (Alpine.js), app.js is 1,029 LOC
data/, docs/, logs/, session/
```

The `src/` core is clean, cohesive, and well-tested. **The maintainability problems are
concentrated in two places: `scripts/` and `webui/app.js`.**

## 3.2 High-impact refactors

### R1 — Make `src` an installable package (kills ~20 copies of the path hack) — High

`sys.path.insert(0, str(Path(__file__).parent.parent))` appears in ~17 scripts and 3
test files. *Fix:* add a minimal `pyproject.toml` declaring the `src` package, run
`pip install -e .`, and delete every `sys.path.insert`. Add a single `tests/conftest.py`
so tests resolve imports without the hack. This is the single biggest coupling win and
unblocks R2/R3.

### R2 — Triage and reorganise `scripts/` — High

`scripts/` currently mixes four kinds of file with no separation:

| Kind | Files | Action |
|---|---|---|
| **Live pipeline** | `phase3_daily`, `admin_server`, `export_to_json`, `reprocess` | Keep at top level |
| **One-shot / retained tools** | `migrate_excel_to_sqlserver`, `report_gaps`, `mark_gap_skipped` | Keep (README-documented) |
| **Dead Excel-era** | the 7 scripts in §1.1 | Delete |
| **Exploratory PoCs** | `phase0_sample`, `investigate_*`, `test_partial_video` | Move to `scripts/archive/` |

After triage, `scripts/` shrinks from 24 files to ~7 live + a clearly-labelled archive.

### R3 — Extract shared script helpers into `src/` — Medium

Once R1 lands, collapse the quantified duplication from §1.3 into `src/`:
`TelegramFetcher.from_config(cfg)`, `setup_logging(logfile)`, `build_photo_index(photos)`,
`dedup_videos(videos)`, and a UTF-8 stdout helper. This removes ~40 lines of copy-paste
spread across the surviving scripts and gives one place to fix a bug.

### R4 — Decompose `webui/app.js` (1,029 LOC, 8 responsibilities) — High

`app.js` conflates rendering, state, admin lifecycle, filtering, sorting, date-pickers,
formatting utilities, and routing. Recommended split into IIFE modules (matching the
existing `data-loader.js` / `filter-logic.js` / `admin-edit.js` pattern), loaded before
`app.js`:

- `format-utils.js` — `pad`, `esc`, `formatDate`, `dayDelta`, `toArDigits` (delete
  dead `initials`, `sha256`). Removes ~5 leaked globals.
- `browse-filter.js` — the `filtered` getter's filtering + the 6-mode sort. **Adopt
  `filter-logic.js`'s `sortRows`/`filterByProximity` here** instead of re-implementing.
- `admin-table.js` — `adminCols`, `adminList` (a 57-line filter+sort), `adminSetSort`,
  `adminClearFilters` — a self-contained sub-feature.
- `date-pickers.js` — one parameterised `makeDatePicker(...)` replacing the 3 Litepicker
  initialisers.
- Convert `renderPortrait` / `renderTimeline` (~85 LOC of hand-built `x-html` strings)
  into declarative Alpine `<template>` blocks — eliminates the XSS-adjacent string
  concatenation and the `esc()` dependency.

After extraction the `aqmar()` factory drops to ~300-350 LOC: state + `init`/`loadMartyrs`
+ navigation + view getters.

### R5 — Heal the `filter-logic.js` ↔ `app.js` drift — Medium

`filter-logic.js` has become a **test-only module**: 6 of its 9 exports are exercised
only by `tests.html` because `app.js` re-implemented the same logic inline (age, sort,
proximity, day-window clamp). Result: `tests.html` is green while testing code paths
that **production never runs**. *Fix:* make `filter-logic.js` the single home for that
logic and have `app.js` call into it (folds into R4). Then `tests.html` tests real code.

### R6 — One bidirectional DB↔SPA field map — Medium

Three hand-maintained field-name maps (`FIELD_REVERSE_MAP`, the inline map in
`adaptMartyrToNewSchema`, `OVERRIDE_FIELD_MAP`) must stay in sync by hand. Define one
canonical map and derive the inverse programmatically.

## 3.3 Smaller structural fixes

- **Add a `pytest.ini` / `[tool.pytest]` with `testpaths = tests`** — High-value,
  low-effort. Stops pytest from collecting `scripts/test_partial_video.py` (which makes
  live network calls) and `scripts/phase1_test.py`.
- **Add `tests/conftest.py`** — removes the 3 duplicated path inserts and the
  `admin_app.cfg` global mutation in `test_admin_app.py:26` (move to a `monkeypatch`
  fixture with auto-teardown).
- **Test coverage gaps** — `src/ocr_engine.py`, `src/pipeline.py`, and
  `src/telegram_client.py` have **no test file**. `pipeline.py` (the orchestrator) is
  the most important to cover, with sub-modules mocked.
- **`requirements.txt` cleanup** — `ffmpeg-python` is declared but never imported (code
  shells out to the `ffmpeg` binary); `pytest-asyncio` is declared but no async tests
  exist. Remove both, or annotate. Add a `# required by fastapi TestClient` comment to
  `httpx`. All deps use `>=` lower bounds only — consider pinning for reproducible
  deploys.
- **`data/overrides.json`** — orphaned: `{"version":1,"edits":{}}`. No code reads it —
  verified across `src/`, `scripts/`, and `webui/`; the only mention is a comment inside
  `data-loader.js`'s `mergeOverrides`, which is itself dead code (§1.1). It is
  deliberately git-tracked (per `.gitignore`), suggesting it was once meant to be served
  as a static asset, but admin edits now go to `dbo.martyrs`. Delete or document as legacy.
- **`README.md:129,239`** — claims "103+ tests"; the suite has 92. Correct the count.
- **Decouple `src/excel_writer.py`** — it is now a *legacy* storage path living
  alongside `sqlserver_client.py`. Once the Excel scripts (§1.1) are gone, evaluate
  whether `excel_writer.py` and `test_excel_writer.py` should be removed too, leaving
  SQL Server as the single storage abstraction.

## 3.4 What is already good

- `src/` core is cohesive and 11 of 14 modules are tested (92 tests total).
- Naming in `src/` and `tests/` is consistent; no camelCase drift in Python.
- No `TODO`/`HACK`/`FIXME` debt accumulated.
- The webui helper modules (`api-client.js`, `admin-edit.js`) are clean, single-purpose,
  and use a consistent IIFE pattern — the model `app.js` should follow.
- The SQL Server migration core was done cleanly (`ad21dca` properly deleted the
  Supabase/Excel *core*); the gap is purely the script/PowerShell tail left behind.

---

## Recommended sequencing

1. **Quick wins (hours):** delete dead functions/CSS/imports (§1.1, §1.2); fix
   `serve.ps1`; remove the broken `tests.html` blocks; add `pytest.ini`; fix the
   `state.py` / `exporter.py` type annotations and the `draftDirty()` bug.
2. **Triage (half-day):** R2 — delete the 7 Excel-dead scripts, archive the PoCs,
   rewrite `status.py`'s stale block.
3. **Structural (1-2 days):** R1 (installable package) → R3 (shared helpers) →
   R4/R5 (`app.js` decomposition + `filter-logic.js` healing) → R6.
4. **Coverage:** add tests for `pipeline.py`, `ocr_engine.py`, `telegram_client.py`.

*All recommendations above are report-only. No code was changed.*
