# AQMAR UI Redesign — Integration Plan

> **For the human reviewer first:** this plan is BEFORE-implementation. It surfaces the decisions that need answering before any code moves. Do NOT skip Section 3.

**Source:** `C:\Users\MohamedKhamis\Downloads\AQMAR\aqmar-webui\` — 4 files, 1615 lines total.
**Target:** `webui/` on this repo (currently on branch `feat/spa-ux-polish`, PR #1 still open).
**Date:** 2026-05-14
**Status:** Awaiting human decisions on Section 3 before implementer work begins.

---

## 1. What's in the download

| File | Lines | Role |
|---|---|---|
| `index.html` | 767 | Full SPA shell — home / browse / detail / admin / about views, language toggle, header, footer |
| `app.js` | 498 | Alpine root `aqmar()` + 6 free helpers (`dayDelta`, `initials`, `formatDate`, `sha256`, `esc`, `pad`) |
| `config.js` | 63 | Admin password hash + `usePhotos` flag + **36-row sample dataset** for offline preview |
| `styles.css` | 287 | Design tokens (warm earth-tone palette), `.btn` / `.card` / `.portrait` / `.section-*` classes, light/dark theme via `html[data-theme]` |
| `PORT_README.md` | 141 | Install instructions and field-mapping documentation |

**Stack:** Alpine.js 3.13.5 + Tailwind Play CDN + Litepicker (kept but unused on landing) + Google Fonts (Reem Kufi, Amiri, Tajawal, Crimson Pro, Inter Tight). No build step. Same as current.

**New features vs. our current `feat/spa-ux-polish`:**

- Multi-view router with **Home / Browse / Detail / Admin / About** pages — currently we have Public + Admin only.
- **Language toggle** (Arabic ↔ English) on the whole UI — currently Arabic-only.
- **"On this day" anniversaries** strip on the landing.
- **Detail page** with a lifespan timeline SVG and a "related martyrs (same battalion)" rail.
- **Calligraphic-monogram portrait** that falls back from photo on error and renders monogram-only when `usePhotos: false`.
- **Stats strip** on landing (names recorded, days since Oct 7, battalions covered).
- **Birthday-match as the hero** using native `<select>` for day + month (no Litepicker on landing).
- **Warm earth-tone visual language** (paper, ink, forest, olive) — replaces the current dark-green palette entirely.
- **Light theme by default**, dark theme via `html[data-theme="dark"]` (no toggle wired yet).
- **Sample-data fallback** so the UI loads visibly without `data/martyrs.json` on disk.

**Features in our current `feat/spa-ux-polish` that the download DOES NOT have:**

- Grid/list view toggle.
- Search with Arabic normalization (`normalizeArabic` + `searchPredicate`).
- Skeleton loaders with `prefers-reduced-motion`.
- ARIA landmarks, skip-to-content link, result-count `aria-live`.
- Focus traps on modals via `@alpinejs/focus`.
- `tests.html` — the new UI does not ship one. PORT_README says to "keep your existing one"; the 41 tests we have target functions (`normalizeArabic`, `searchPredicate`, `filterByProximity` etc.) that **do not exist** in the new `app.js`.

---

## 2. The blocker — schema mismatch

The download's `app.js` reads fields that our `data/martyrs.json` does not produce.

| Concept | Current schema (our `martyrs.json`) | Download schema (new UI expects) |
|---|---|---|
| Stable ID | `msg_id` | `id` |
| Birth date | `birth_date` | `birth` |
| Martyrdom date | `martyrdom_date` | `martyrdom` |
| Military rank | `military_rank` | `rank` |
| Photo path | `photo_path` (`../data/photos/N.jpg`) | `photo` (optional) — UI auto-derives `../data/photos/{id}.jpg` |
| Telegram link | `message_link` | *(removed)* |
| Short biography | *(absent)* | `bio` *(optional)* |
| Overrides format | `{ version: 1, edits: { [msg_id]: {…, _manual_edit_at } } }` | `{ [id]: {…} }` |
| Overrides localStorage key | `aqmar.pending_overrides` | `aqmar.edits` |

**Without addressing this, the new UI on top of our real data would render an empty registry** (it would hit the sample-data fallback because every record fails to expose `id` / `birth` / `martyrdom`).

Three approaches (resolved in Section 3, decision D2):

- **A.** Add a JS adapter that maps current → download schema on load.
- **B.** Modify `scripts/excel_to_json.py` to emit the new schema names.
- **C.** Modify the download's `app.js` to read our existing field names.

---

## 3. Decisions you need to make BEFORE I plan tasks in detail

### D1 — What happens to `feat/spa-ux-polish` (PR #1)?

The download is a **full visual redesign** that overlaps with most of what we just shipped on that branch. If you adopt the new UI as-is, ~16 of the 17 polish commits become irrelevant.

| Option | Description |
|---|---|
| **D1-a** Drop PR #1, replace `webui/` with the download | Cleanest. Throws away grid/list toggle, search bar, skeletons, ARIA polish, focus traps, mobile bottom-sheet — the download has none of these. ~3 days of work discarded. |
| **D1-b** Merge PR #1 first, then layer the download on top | The polish work survives in history; the new UI becomes its own branch on top of the polished version. But: the new UI replaces the markup, so most of PR #1's HTML changes get overwritten anyway. The CSS / a11y / search logic CAN be preserved. |
| **D1-c** Use the download as a v2 fork, keep the current SPA live | Set up `webui/v2/` (or a second deployment) so both versions coexist. Heavier maintenance but lowest risk. |
| **D1-d** Cherry-pick from the download into PR #1 | Pull only specific pieces (e.g. the portrait component, the lifespan timeline, the warm palette) without taking the whole multi-view redesign. |

**My recommendation:** **D1-b.** Merge PR #1 so the accessibility, search, and tests survive on `master`, then start a `feat/ui-redesign` branch from the new master that ports the download's visuals + multi-view structure. The download has zero a11y work, no tests, and no search — keeping those is non-negotiable for a "professional UI/UX".

### D2 — Where does the schema mismatch get resolved?

| Option | Pros | Cons |
|---|---|---|
| **D2-a** Adapter in `webui/data-loader.js` (recommended) | Zero pipeline change, isolated, easy to revert. ~20 lines. | Adapter is a permanent layer until D2-b lands. |
| **D2-b** Change `scripts/excel_to_json.py` to emit new field names | Single source of truth, no adapter. | Breaking change to `data/martyrs.json` schema. Requires re-running the pipeline + invalidating any downstream consumer. |
| **D2-c** Modify the download's `app.js` to use our field names | No adapter, no pipeline change. | Diverges from PORT_README docs, will fight any future refresh of the download. |

**My recommendation:** **D2-a.** A 20-line normalizer in `data-loader.js` is reversible. Once the new UI is settled and proven, optionally migrate to D2-b in a follow-up.

### D3 — What about the tests?

The download has no `tests.html`. Our 41 tests test functions that **don't exist** in the download's `app.js`. After the swap:

- `daysBetween`, `filterByProximity`, `windowDaysFromMode`, `computeAge`, `sortRows`, `describeDelta*` are in `webui/filter-logic.js` — the new UI **does not load this file**. Their tests would break.
- `mergeOverrides` is in `webui/data-loader.js` — the new UI **does not load this either**.
- `buildEditDiff`, `addEdit` are in `webui/admin-edit.js` — same.
- `normalizeArabic`, `searchPredicate`, `viewMode` helpers are in our `filter-logic.js` and `app.js` — not in the new UI.

| Option | Pros | Cons |
|---|---|---|
| **D3-a** Keep `filter-logic.js` + `data-loader.js` + `admin-edit.js` AND wire them into the new UI's render pipeline (recommended) | All 41 tests stay green. Existing logic is reused. Adapter pattern from D2-a fits here. | Some plumbing work; the new UI's `app.js` calls its own `dayDelta` etc., need to reroute or coexist. |
| **D3-b** Delete the old tests, port a subset that still applies to new helpers | Cleanest end state. | Test coverage shrinks. Hard to argue this is "professional" with fewer tests. |
| **D3-c** Add new tests for the download's helpers, keep the old ones in a side runner | Most coverage. | Two test runners, two test pages. |

**My recommendation:** **D3-a.** It also dovetails with D1-b: the test investment from PR #1 survives.

### D4 — Light theme as default? Multi-language?

The download defaults to light theme with `data-theme="light"` and ships an Arabic/English language toggle. Current is dark-only, Arabic-only.

| Option | Description |
|---|---|
| **D4-a** Keep light default + toggle + English | Adopt the download verbatim. Most product surface. |
| **D4-b** Light default + toggle, but Arabic-only (English deferred) | Keep i18n for later. Removes ~half the inline `lang === 'ar' ? … : …` ternaries. |
| **D4-c** Keep current dark palette + Arabic-only | Apply the download's structure + components, keep our colors. Significant CSS rework. |

**My recommendation:** **D4-a.** The translation work is already done in the download — discarding it is wasteful.

### D5 — `usePhotos: true` from day one?

The download defaults to `usePhotos: false` for a clean preview. We have 352 photos in `data/photos/`. We should flip to `true` immediately so portraits show real faces.

| Option | Description |
|---|---|
| **D5-a** Set `usePhotos: true` in `config.js` at port time (recommended) | What you actually want. |
| **D5-b** Keep `false` for now | Strange UX given we have the photos. |

**My recommendation:** **D5-a.**

---

## 4. Recommended path (D1-b + D2-a + D3-a + D4-a + D5-a) — task breakdown

**Pre-flight:**
- [ ] **Merge PR #1 to master** (you do this on GitHub). Confirm GitHub Pages rebuilds successfully and shows the polished SPA at `https://mohamedkhamis.github.io/AQMAR/`.
- [ ] Sync local: `git checkout master && git pull origin master`.
- [ ] Branch: `git checkout -b feat/ui-redesign`.

### Phase A — Vendor the new UI files (no behavior change yet)

**Task A1: Stage new files alongside current**
- Copy the download into a temporary location inside the repo: `webui/_redesign/{index.html, app.js, config.js, styles.css, PORT_README.md}`.
- Goal: have the new code in version control without breaking the live SPA. Commit.
- Verify: live SPA at `http://localhost:8000/webui/` still works (current code untouched).

**Task A2: Capture the current `webui/` as fallback**
- Just before swapping, tag the current state: `git tag spa-v1 master` and push the tag.
- Why: if the redesign needs rolling back, GitHub Pages can be redeployed from the tag.

### Phase B — Schema adapter (the blocker)

**Task B1: Add `adaptMartyrToNewSchema(row)` to a new file `webui/_redesign/schema-adapter.js`**
- Input: a `martyrs.json` row in current schema (`msg_id`, `birth_date`, `martyrdom_date`, `military_rank`, `photo_path`, …).
- Output: a row in new schema (`id`, `birth`, `martyrdom`, `rank`, `photo`, …).
- Drop unmapped fields (`message_link`, `name_normalized`, `posted_date`, `status`, `_overridden_fields`).
- Compute `id = msg_id`. Map `photo_path` → `photo` if present, else let the UI auto-derive.
- Write 4 tests in a NEW `webui/_redesign/tests-adapter.html`:
  1. Maps a full row 1:1.
  2. Maps a sparse row (only mandatory fields).
  3. Returns `null`/skip for rows with missing `msg_id` (or coerces).
  4. Preserves array order when called via `.map()`.
- Commit.

**Task B2: Add overrides translator**
- Current overrides: `{ version: 1, edits: { "20": { birth_date: "…", _manual_edit_at: "…" } } }`.
- New overrides: `{ "20": { birth: "…" } }`.
- Add `adaptOverridesToNewSchema(overridesObj)` + 3 tests (version stripped, edit-meta stripped, field names remapped).
- Commit.

**Task B3: Wire the adapter into `_redesign/app.js`**
- Find the `init()` block that does `await fetch('../data/martyrs.json')`.
- After parsing JSON: `martyrs = martyrs.map(adaptMartyrToNewSchema).filter(Boolean)`.
- After parsing overrides: `overrides = adaptOverridesToNewSchema(overrides)`.
- Verify in browser: `http://localhost:8000/webui/_redesign/` renders real martyr data, not the sample.
- Commit.

### Phase C — Bring in the polish from PR #1 (D3-a)

**Task C1: Copy `filter-logic.js`, `data-loader.js`, `admin-edit.js` into `_redesign/`**
- These are still needed for `mergeOverrides`, `computeAge` (used in age filter), `normalizeArabic`, `searchPredicate`, and `buildEditDiff`/`addEdit` for the admin save path.
- Load them in `_redesign/index.html` BEFORE `app.js`.
- Commit.

**Task C2: Rewire the new `app.js`'s search to use `searchPredicate`**
- The new UI's `filtered` getter has a `if (f.q)` block doing a naive `.toLowerCase().includes(…)`. Replace with `searchPredicate(m, f.q)` from `filter-logic.js`.
- Result: search now handles Arabic alef/ya/ta-marbuta variants exactly like PR #1.
- Commit.

**Task C3: Rewire admin save to use `buildEditDiff` + `addEdit`**
- Current new-UI `saveEdit()` writes a flat dict per id. Replace with `addEdit(this.pendingOverrides, m.id, diff)` so edits get `_manual_edit_at` timestamps — keeps backward compatibility with overrides written by the v1 admin.
- Commit.

**Task C4: Port tests**
- Copy `webui/tests.html` to `webui/_redesign/tests.html`.
- Add adapter tests from B1 + B2 (7 new tests = 48 total).
- Verify 48 pass.
- Commit.

### Phase D — Cutover

**Task D1: Replace `webui/` contents with `_redesign/`**
- Delete current `webui/index.html`, `app.js`, `config.js`, `style.css` (note: download is `styles.css` plural).
- Move `_redesign/*` → `webui/`.
- Update `index.html` at repo root if needed (the auto-redirect to `./webui/` stays the same).
- Commit.

**Task D2: Flip `usePhotos: true` in `webui/config.js`**
- One-line change. Verify portraits show real photos in browser.
- Commit.

**Task D3: Visual smoke test**
- Open `http://localhost:8000/webui/` and walk through home → browse → detail → admin (login) → edit → export → about → language toggle. Note any visual glitches.
- Mobile breakpoint check at 390 px.
- Commit any tweaks.

**Task D4: Accessibility re-audit**
- The new UI has fewer ARIA landmarks than PR #1 (no skip-to-content link, no `aria-live` result count, no `role="dialog"` on modals — need to verify).
- Add what's missing — port the ARIA / focus-trap polish from PR #1 commit `0db3cf2` and `fac8e4a`.
- Target Lighthouse a11y ≥ 95.
- Commit.

### Phase E — Wrap up

**Task E1: Update `README.md`** to reflect the new visual identity, multi-view structure, and language toggle.

**Task E2: Update the spec doc** `docs/superpowers/specs/2026-05-13-aqmar-spa-design.md` (or write a v2 spec) noting the new IA.

**Task E3: Open PR #2** from `feat/ui-redesign` to `master`. Provide screenshots of all 5 views.

**Task E4: Stop. Ask before pushing/merging.** Per CLAUDE.md.

---

## 5. Risks

1. **Photo path mismatch.** Current data uses `photo_path` that points to `../data/photos/N.jpg` with `N = msg_id`. The new UI auto-derives `../data/photos/{id}.jpg`. After the adapter sets `id = msg_id`, paths align — but only if `data/photos/` is keyed by `msg_id` (which it is, per the current commit). Verify by spot-checking a few.
2. **Overrides backward compatibility.** Edits saved by the v1 admin UI live in localStorage under `aqmar.pending_overrides`. The new UI reads from `aqmar.edits`. Unmigrated users would lose their pending edits on first load. Mitigate: read both keys on init, prefer the new one, write to the new one.
3. **Sample data leaks to production.** `config.js` ships a 36-row hardcoded sample. If `martyrs.json` ever fails to load on the live site, users see fake names. Recommend deleting the sample block once D2-a is verified, or gating it behind a query string (`?demo`).
4. **English UI lies in places.** A spot-check of the English strings shows they're decent but not reviewed by a native speaker. Specifically the "572 days since Oct 7" stat is hardcoded — needs to be either dynamic or removed.
5. **Lifespan timeline can divide by zero** for any row where `birth = martyrdom` (unlikely but defensive code is missing in `renderTimeline`).
6. **No image lazy-load.** The current SPA uses `loading="lazy"` on all `<img>`. The new portrait component doesn't. With 350+ photos visible, mobile data + initial paint will suffer. Add `loading="lazy"` to the `<img>` inside `renderPortrait`.
7. **Throw-away CSS class collisions.** The download styles use generic names like `.card`, `.btn` that any future Tailwind plugin could shadow. Low risk but worth scanning.

---

## 6. Open questions (must be answered before Phase B)

1. **D1, D2, D3, D4, D5** — see Section 3.
2. Should we delete the 36-row sample data from `config.js`, or keep it as a fallback?
3. Is the "On this day" anniversaries strip meant to use martyrdom date (current implementation) or birth date? PORT_README implies martyrdom.
4. The lifespan timeline shows "572 days since Oct 7" — hardcoded. Should it be live-computed from `2023-10-07`?
5. The new UI removes the link back to the Telegram message (`message_link`). Is that intentional? Reinstate as a small "source" link on the detail page?
6. The new UI loads Google Fonts. Acceptable for a public memorial site, or do you want self-hosted fonts to avoid the third-party request?

---

## 7. Effort estimate

Under the recommended path (D1-b + D2-a + D3-a + D4-a + D5-a):

| Phase | Effort |
|---|---|
| A (vendor) | ~30 min |
| B (schema adapter + tests) | ~2 hours |
| C (polish carry-over) | ~3 hours |
| D (cutover + visual smoke + a11y) | ~3 hours |
| E (docs + PR) | ~1 hour |

**Total: ~1 day of focused work**, after PR #1 is merged.

---

**Next step:** answer the 6 decisions in Section 3 and the 6 questions in Section 6, then I'll convert the recommended-path tasks (4) into a TDD-style implementation plan under `superpowers:writing-plans`.
