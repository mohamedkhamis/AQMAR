# AQMAR — AI working notes

Quick orientation for Claude / any AI working in this repo. The full
walkthrough is in [`README.md`](README.md); the changelog is in
[`progress.md`](progress.md). This file is the fast-path: what the project
is, where things live, and the conventions and constraints that aren't
obvious from a single file.

## What it is

A local-first pipeline that mirrors the public Telegram channel
[`@AqmarTofan`](https://t.me/AqmarTofan) — a memorial for شهداء كتائب القسام
in معركة طوفان الأقصى. Flow:

```
Telegram → OCR (ffmpeg + EasyOCR) → SQL Server (`aqmar` DB)
       → admin verifies → publish → data/martyrs.json → GitHub Pages
```

**Mandatory fields:** name + birth date + martyrdom date. Everything else
(city, military rank, weapon, battalion, brigade) is optional and must
never block a row.

## Where things live

| Path | Responsibility |
|---|---|
| `src/` | Pipeline core — `telegram_client`, `parser_caption/ocr`, `frame_extractor`, `ocr_engine`, `pipeline`, `name_normalizer`, `dedup`, `state`, `excel_writer`, `exporter`, `sqlserver_client`, `admin_app` (FastAPI). |
| `scripts/` | Live CLIs: `phase3_daily` (daily scrape), `admin_server` (FastAPI launcher), `export_to_json` (publish), `reprocess`, `report_gaps`, `mark_gap_skipped`, `status`, `migrate_excel_to_sqlserver`. PowerShell: `serve`, `publish`, `iis_deploy`, `setup_daily_trigger`. Old experiments in `scripts/archive/`. |
| `webui/` | Vanilla-JS SPA — Alpine.js + Tailwind Play CDN + Litepicker, **no build step**. `app.js` is the Alpine `aqmar()` factory; helpers in IIFE modules (`api-client.js`, `data-loader.js`, `filter-logic.js`, `admin-edit.js`); `styles.css` holds the design-token system. |
| `tests/` | Pytest. 92 tests. `pytest.ini` scopes collection to this directory. |
| `data/` | `martyrs.json` (published snapshot — what GitHub Pages serves), `martyrs.xlsx` (legacy snapshot from before SQL Server), `photos/`, `overrides.json` (legacy, no longer consumed). |
| `docs/superpowers/` | Dated specs and plans for major changes; `docs/code-review-2026-05-20.md` is the full repo audit. |

## Commands

| | |
|---|---|
| Run tests | `.venv\Scripts\python.exe -m pytest -q` |
| Local admin (live data) | `python scripts\admin_server.py` → http://localhost:8000/ |
| Read-only preview (static JSON) | `.\scripts\serve.ps1` → http://localhost:8000/webui/ |
| Publish a new snapshot | `.\scripts\publish.ps1 -Note "…"` (export → git commit, no auto-push) |
| Local IIS portal | http://localhost:8082/ — one-time setup with `scripts\iis_deploy.ps1` (needs UAC), serves directly from the working tree |
| Production | https://mohamedkhamis.github.io/AQMAR/ — GitHub Pages built from `master` |

## Conventions

- **Python:** snake_case, dataclasses, type hints; tests live in
  `tests/test_<module>.py`.
- **JS modules:** the helpers (`api-client.js`, `data-loader.js`,
  `filter-logic.js`, `admin-edit.js`) all use the
  `(function (global) { "use strict"; … })(window)` IIFE pattern. `app.js`
  is the Alpine `aqmar()` factory plus a `// Free functions` section at the
  bottom (`dayDelta`, `birthDelta`, `isoDate`, `pad`, `formatDate`, `esc`).
  Pure date math (`daysBetween`, `computeAge`, `normalizeArabic`,
  `searchPredicate`, `sortRows`) lives in `filter-logic.js` and is exposed
  as `window.*`; `app.js` calls those as bare globals.
- **CSS:** design tokens (`--bg`, `--paper`, `--ink`, `--forest`, `--font-*`,
  fluid `--text-*` scale, `--litepicker-*` overrides) all live in `:root`
  in `styles.css`. The site is **dark-only** — `html[data-theme="dark"]`
  is hardcoded in `index.html` and there is no light toggle.
- **Numerals + i18n:** Arabic-Indic digits via the `toArDigits(n)` Alpine
  method. RTL Arabic primary, LTR English secondary. Templates check
  `lang === 'ar' ? '…' : '…'` inline; `lang` is on Alpine state.
- **Breakpoints:** 1024 / 768 / 480. The named grid classes (`.grid-bday`,
  `.grid-filters`, `.grid-detail`, `.grid-2col`, `.stats-strip`,
  `.dates-strip`, `.preview-matches`, `.footer-grid`, `.grid-pair`) carry
  their defaults in `styles.css`; media queries override without `!important`.
  The exceptions that **do** use `!important` (`.nav-links`,
  `.admin-banner align-items`, `.hero-pad padding`, `.header-bar`) are
  beating Tailwind utility classes, not inline styles — that's intentional.

## Data flow

- SQL Server table `dbo.martyrs` is the source of truth. New rows from the
  scraper land as `verification_status = 'unverified'`; the admin reviews
  them side-by-side with the raw OCR (kept in `ocr_*` columns) and clicks
  **Save & verify** or **Reject**. Only verified rows are included by
  `export_to_json`.
- `data/martyrs.json` is the published snapshot, versioned in
  `dbo.publish_versions`. The git history of that file is effectively the
  publish history.
- The SPA prefers the local admin API (`AQMAR_API.get('/martyrs')`) and
  falls back to `../data/martyrs.json` when there's no API (GitHub Pages,
  or running locally without `admin_server.py`). `dataSource` on the
  Alpine state reflects which path won (`'api'` / `'static-json'` /
  `'sample-data'`).

## Birthday search (subtle, easy to break)

- `bday.window` is a **number** (7 / 30 / 60 / 365) **or** the string
  `'custom'`. Default is `30` ("شهر") per the user's request (2026-06-17).
  Caveat: matching is **full-date proximity** (year included), so a 1-month
  default is deliberately narrow — most picks return only a handful. The user
  chose this over month/day-anniversary matching after seeing the counts.
- **Shareable search:** the active birthday search is mirrored to the URL
  query string (`?b=YYYY-MM-DD&w=30`, or `w=custom&d=21`). `syncBirthdayUrl()`
  writes it (replaceState) from `matchFilter`; `applyBirthdayFromUrl()` reads it
  on load and re-runs the search. Pure encode/decode lives in `filter-logic.js`
  (`buildBirthdayParams` / `parseBirthdayQuery`).
- `birthDelta(userIso, birthIso)` (in `app.js`) returns the **signed** day
  delta. Positive ⇒ martyr younger than the picked date; negative ⇒ older;
  Infinity for missing/unparseable birth dates (so they sort last and stay
  out of every window).
- `Math.abs(m.delta)` is what the window filter and the closest-first sort
  use; the badge display reads the sign via `deltaLabel(delta)`.
- `dayDelta` (month + day cyclic) is **kept and still used** by `onThisDay`
  (martyrdom anniversaries). Anniversaries recur every year, so month + day
  is the right semantic there — don't replace it.

## Constraints

- **Git rule (absolute):** never run `git add`, `git commit`, or `git push`
  without explicit user approval. After completing work, summarize and ask
  *"Ready to commit?"* — even when the user says "fix X and push," do the
  fix, then ask before staging. This is the user's global policy and it
  applies even for emergency fixes.
- **No build step.** Tailwind Play CDN is used deliberately — don't
  introduce a bundler or compile step without discussing it. Custom utility
  classes that aren't Tailwind defaults (`.font-display`, `.bg-page-2`,
  `.h1-display`, `.grid-bday`, …) are defined in `styles.css`.
- **Design tokens are the single source of truth.** No hard-coded colors,
  font families, or breakpoints in components. New tokens go in `:root`.
- **`.env` is gitignored.** Never commit credentials. `ADMIN_TOKEN` lives
  on the user's machine; the SPA stores it in `sessionStorage` after login.

## User preferences

- The user **is not a UI developer**. For visual choices (fonts, layouts,
  colors, themed components) build a temporary preview page they can click
  through and tell you which option to use — text-only multiple-choice
  questions don't work as well for them.
- **Keep it simple.** Prefer focused, minimal changes over sweeping
  refactors. When in doubt, ask before broadening the scope.

## Skills to reach for

| Situation | Skill |
|---|---|
| Designing a new feature | `superpowers:brainstorming` → `writing-plans` → `executing-plans` |
| Building UI components | `frontend-design` |
| A bug or unexpected behavior | `superpowers:systematic-debugging` (root cause **before** any fix) |
| About to claim something works | `superpowers:verification-before-completion` + `verify` / `run` |
| Multiple independent tasks | `superpowers:dispatching-parallel-agents` |
