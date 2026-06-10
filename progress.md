# Progress Log

Newest first. Each entry links to its commit; pull `master` and the live
state is what's described here. The longer rationale for each change lives
in the commit message and the dated spec/plan files under
[`docs/superpowers/`](docs/superpowers/).

---

## 2026-06-10

### (uncommitted) — feat(ai-verify): AI date-verification track + admin portal filters/counters

New **second verification dimension**, independent of the human workflow:
`dbo.martyrs` gains `ai_verified` (BIT), `ai_verified_at`, `ai_note`
(migration: `scripts/migrate_add_ai_verify.sql`). The AI batch
(`scripts/ai_verify.py pending|apply` + Claude reading the OCR frames)
checks **birth/martyrdom dates only** against the memorial cards, fixes
day/month swaps into strict `yyyy-mm-dd`, fills NULLs the card answers, and
flags `ai_verified=1` with an audit note. Human `verification_status`,
`verified_*` and `ocr_*` columns are never touched; exporter allowlist keeps
the AI columns out of the published JSON.

Admin portal (Option B from `webui/_preview_ai_verify.html`, user-picked):
4-cell stats strip (human ✓ / rest / AI ✓ / rest), second "تحقق AI" pills
row ANDed with the status filter, sortable AI column whose 🤖✓ badge
tooltips the audit note, and a teal AI panel in the edit form. New `--ai`
design tokens in `styles.css`.

**Pilot applied (msg 114–217, 50 rows): 26 match · 11 corrections (9
day/month swaps, 1 year misread 1931→1981, 1 day misread) · 15 NULL fills ·
0 unreadable.** Row-by-row: `docs/ai-verify-report-2026-06-10.md`. Remaining
462 rows resume via `docs/ai-verify-resume-prompt.md`. Tests: 100 pytest +
38 browser, all green. Spec/plan: `docs/superpowers/specs/2026-06-10-ai-verify-design.md`,
`docs/superpowers/plans/2026-06-10-ai-verify.md`.

---

## 2026-05-23

### [`bc82895`](https://github.com/mohamedkhamis/AQMAR/commit/bc82895) — feat(webui): signed +/− delta badge + hide dev banner on production

The birthday-search result cards now show **direction explicitly**:

- `+ ١٤ يوماً` — martyr is younger than the picked date
- `− ٣٥ يوماً` — martyr is older
- `نفس اليوم` — same date

Implementation: `birthDistance` renamed to `birthDelta` (returns the signed
day delta now); `Math.abs(m.delta)` at the window-filter and sort sites;
new `deltaLabel(delta)` Alpine method drives the three display sites (home
preview card, browse-grid badge, browse-list badge) from one helper.

Separately, the yellow `data/martyrs.json — run python scripts/admin_server.py`
hint banner that was leaking onto the **public** GitHub Pages site is now
suppressed there. New `isLocalDev` getter gates the hint to `localhost` /
`127.0.0.1`; the public `?demo` sample-data notice still shows everywhere.

---

## 2026-05-22

### [`8979573`](https://github.com/mohamedkhamis/AQMAR/commit/8979573) — fix(webui): birthday search matches the full date (year + month + day)

The home search measured month + day cyclic distance and **discarded the
year**, so a "30-day window" matched anyone born on that day in any year —
people decades apart. Picking 1995-05-15 returned 67 rows, 66 of them
thousands of days outside the window.

The fix uses real calendar distance via a new `birthDistance` helper built
on the existing `daysBetween` (which had been sitting in `filter-logic.js`
unused since the test-only era). The default window flipped from 30 to 365
("السنة كاملة") because with full-date matching narrow windows return very
few results.

`dayDelta` (month + day cyclic) is kept for `onThisDay` — martyrdom
anniversaries recur yearly, so month + day is still the right semantic there.

Verified on production after deploy: picking 1998-05-15 returns 27 martyrs
all born within a year of that date, sorted closest-first.

### [`dee036a`](https://github.com/mohamedkhamis/AQMAR/commit/dee036a) + [`604bba9`](https://github.com/mohamedkhamis/AQMAR/commit/604bba9) — feat(webui): typography refresh + responsive overhaul + themed date picker

A coordinated UI redesign chosen visually from a temporary preview page
(`webui/preview.html`).

- **Fonts:** El Messiri (headings + wordmark) · IBM Plex Sans Arabic
  (body, UI, martyr names) · IBM Plex Sans (Latin); Amiri kept for the
  Qur'an verse. Reem Kufi / Tajawal / Crimson Pro / Inter Tight removed.
- **Type scale:** new `clamp()`-based fluid tokens (`--text-xs` …
  `--text-hero`) replace fixed pixel sizes and the `!important` font
  overrides in the old 600px media query.
- **Responsive:** clean 1024 / 768 / 480 breakpoints. Eight named grid
  classes (`.grid-bday`, `.grid-filters`, `.grid-detail`, `.grid-2col`,
  `.stats-strip`, `.dates-strip`, `.preview-matches`, `.footer-grid`)
  moved out of inline `style="grid-template-columns:…"` rules so the
  media queries no longer need `!important`. Admin table wrapped in a
  `.table-scroll` container so it scrolls sideways instead of breaking
  the page on phones. Header `px`/`gap` tightened on small phones so the
  admin button still fits.
- **Date pickers:** one CSS override block themes all three Litepickers
  (home birthday search + admin birth + admin martyrdom) to the dark
  forest theme via `--litepicker-*` variables, with brand gold on the
  selected day.
- **Tidy-ups in the same pass:** About-page card grid (was non-responsive
  Tailwind `grid-cols-2`) collapses on small screens via `.grid-pair`;
  About-page "Editing" copy corrected — edits save to **SQL Server**,
  not the now-removed Supabase.

Design recorded in
[`docs/superpowers/specs/2026-05-22-aqmar-ui-typography-responsive-design.md`](docs/superpowers/specs/2026-05-22-aqmar-ui-typography-responsive-design.md),
plan in
[`docs/superpowers/plans/2026-05-22-aqmar-ui-typography-responsive.md`](docs/superpowers/plans/2026-05-22-aqmar-ui-typography-responsive.md).

---

## 2026-05-20

### [`4b7fb0b`](https://github.com/mohamedkhamis/AQMAR/commit/4b7fb0b) — refactor: code-review quick-wins

Resolved the high-priority findings from a full-repo audit:

- **Dead JS removed:** `adminHeaders`, `initials`, `sha256` (`app.js`);
  `mergeOverrides`, `annotateVerification`, the `allRows` field
  (`data-loader.js`); the always-failing `addEdit` / `buildExportPayload`
  test blocks in `tests.html`.
- **Dead CSS removed:** the light-theme `:root` palette that never
  rendered, `.portrait .monogram`, `.bg-page`, `.badge-crimson`.
- **Dead imports:** `Alignment`, `asdict` (`excel_writer.py`),
  `JSONResponse` (`admin_app.py`).
- **Dead scripts:** seven Excel-era scripts that the Excel → SQL Server
  migration had orphaned (`fill_birth_dates{,_v2}`, `phase2_backfill{,_v2}`,
  `phase2_photos_only`, `recover_photos`, `phase1_test`); four exploratory
  PoCs moved to `scripts/archive/`.
- **Stale references fixed:** `serve.ps1` called a deleted script;
  `status.py`'s coverage block read the Excel file (now reads SQL Server);
  `report_gaps.py` recommended deleted tools.
- **Latent bugs:** wrong type annotations in `state.py`/`exporter.py`,
  a key-union bug in `app.js` `draftDirty()`.
- **`pytest.ini`** added so `scripts/` is no longer accidentally collected
  by `pytest`.

Full audit: [`docs/code-review-2026-05-20.md`](docs/code-review-2026-05-20.md).
92 tests still pass.

---

## Current state

- **Deployed public site:** https://mohamedkhamis.github.io/AQMAR/ — built
  from `master` by GitHub Pages on every push.
- **Local admin (live data):** `python scripts\admin_server.py` →
  http://localhost:8000/ (FastAPI + SQL Server).
- **Local IIS portal:** http://localhost:8082/ — `scripts\iis_deploy.ps1`
  does the one-time IIS setup; the site serves directly from the working
  tree afterwards.
- **Tests:** 92 pytest, all passing. Browser-side filter-logic checks
  live in `webui/tests.html`.
