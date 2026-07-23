# Progress Log

Newest first. Each entry links to its commit; pull `master` and the live
state is what's described here. The longer rationale for each change lives
in the commit message and the dated spec/plan files under
[`docs/superpowers/`](docs/superpowers/).

---

## 2026-07-23

### `1f01894` — feat(webui): selectable lifespan-line designs; retire event `end_date`

The finalized 18-event list broke the assumption the lifespan line was built
on. Measured across all **814** published people, every martyr now has
**7–15 events** inside their lifetime (median **11**; 650 people fall in the
10–12 band). The line had exactly two label rows, so:

- at 1100px with 11 events, labels were pushed up to **103px (~3.8 years)**
  away from the date they marked;
- at 820px with 15 events they needed **953px + 969px inside 648px**, ran
  visibly outside the card, and drifted up to **415px (37.8 years)** — the
  SVG leader lines became a meaningless horizontal spray;
- every event has no end date, and the band code read that as "still
  running", drawing one band per event from its start to the martyrdom date.
  With 11 events the whole life bar rendered as a single gold slab, burying
  the olive→gold gradient. The legend still advertised فترة حدث for a band
  type that could never legitimately appear.

**Six designs now ship**, one rendered at a time, selected per visitor:

| key | | what it does differently |
|---|---|---|
| `w` | الخطّ المتدرّج | names wrap to 2 lines, parenthetical trimmed, stacked into as many rows as the crowding needs — every label sits at its **true x** |
| `a` | الخطّ المرقّم | axis carries only numbers; a numbered ledger holds the words |
| `b` | العمود الزمني | vertical spine, gaps proportional to elapsed time |
| `c` | محور العمر | axis is age 0→death, one lane per event |
| `d` | فصول العمر | events grouped into age-based chapters, expandable |
| `e` | الشريط الهادئ | silent bar; names on hover/tap |

`w` came from the user's own suggestion ("wrap text in 2 lines and fit based
on current data"). Wrapping alone was **not** enough — 12 of the 18 events
fall after 2000, so they pile into the last third of the axis where markers
sit ~26px apart while a wrapped label is still ~110px wide. Trimming the
trailing parenthetical (`معركة الفرقان (الحرب على غزة الأولى)` →
`معركة الفرقان`, full name in the tooltip) plus row stacking is what made it
fit.

The admin picks the site-wide default **and** which designs are offered
(`data/settings.json` → `lifeline: {default, enabled}`, validated by
`validate_lifeline`); the visitor switches from the lifespan card and the
pick is remembered in `localStorage`. `AQMAR_LIFELINE.resolve()` reconciles
the two so a retired or unknown key degrades to the default instead of
blanking the line.

**Mobile is deliberately untouched**: below 480px every design is hidden and
the existing vertical layout takes over, so the phone view renders
identically whichever design is active.

**`end_date` is retired** — an event is a single point in time. The nullable
field only ever produced wrong output (the band bug above, plus an
`استمرّ حتى استشهاده` tag on one-day events). `validate_events` tolerates a
legacy value and `merge_settings` strips it, so one save migrates the list;
`formatDateRange` and `.tag-ongoing` existed only for ranges and went with
it. All 18 events in `data/settings.json` were migrated in this commit.

Verified in the SPA across 3 stress cases × 6 designs: **zero text overlaps
and no horizontal overflow in any of the 18 combinations**, and the same at
400px where all six defer to the vertical layout. 221 tests pass (+11).

Caveats carried forward: `PUT /api/settings` with the new `lifeline` block
has never been exercised against a running `admin_server.py` (schema, merge
and the draft state machine are unit-tested; the HTTP round-trip is not), no
`lifeline` key exists in `data/settings.json` yet so the site currently
offers all six, and designs `b`/`d` run ~1250px tall at 15 events. The five
agent-written designs passed a mechanical audit (`esc()` on every name,
tokens only, scoped CSS, no bands) but never got a human visual review.

### feat(webui): portrait + video card in one swappable slot

The detail page showed the cover frame and the portrait side by side. They now
share **one slot**: whichever is in front fills it, the other sits as a
tappable inset in the corner, and a badge names what you're looking at.
804 of 814 rows have both images; the 10 with only a portrait get no inset and
no swap control rather than a dead button.

Sizing came from the files themselves. Every portrait is 896×1280 or
1792×2560 — **exactly 0.700** — while cover frames are 0.799–0.80. The slot is
therefore `aspect-ratio: 7/10` (the portrait's exact shape) and the frame is
`object-fit: fill`, so both images occupy an identical footprint and swapping
never moves the page. Checked all 804 published covers first: none are
landscape, so the stretch is a uniform ~12.5% horizontal squeeze rather than
anything grotesque. The grid cards moved `4/5 → 7/10` for the same reason —
with `object-fit: cover` a 0.700 portrait in a 0.800 box was losing ~12.5% top
and bottom; now it fits exactly, zero crop. The loading skeleton moved with it
so cards don't jump when images land.

The corner inset needed a second pass. `data/photos/*.jpg` is not a headshot —
it is a full branded poster (verse, brigade logo, wordmark, figure, name,
dates, landscape), and so is the cover frame. A whole poster shrunk to ~83px
was an illegible smudge that also looked near-identical to the main image, so
it failed to signal "the other one". The inset is now **square and cropped to
the figure** (`cover` + `scale(1.75)` at origin `62% 30%`, the band this
channel's template puts the head in), larger (27%, min 78px), with a `⇄`
badge. The origin was picked by rendering thumbnails for several real rows
across four origin/scale settings and checking both sources — portraits and
cover frames — not by guessing on one row.

Selected from a five-option preview (tabs / segmented caption / corner inset /
thumbnail strip / click-to-swap); the user picked the corner inset.

### `88a6c97` — chore(webui): drop the design preview scratch files

The `_preview_lifeline*` comparison harness (8 files) that was used to choose
between the designs. Dead once the switcher shipped in the app, and it still
referenced the retired `end_date` and the old `window.VARIANTS` registry.

---

## 2026-06-11

### (uncommitted) — feat(photos): recover the 39 missing portrait photos

Every row in `dbo.martyrs` now has a photo (`photo_path IS NULL` count:
**39 → 0**). Root cause of the gap: the daily scraper pairs each video with
its portrait by **exact caption-name match**, but the channel's video
captions usually append the fighter's kunya in quotes (`محمد كمال منصور
"أبو كمال"`) while the photo caption carries the plain name — plus a few
channel-side typos (`أمجد`/`أحمد` msg 118, `الشمباري`/`الشنباري` msg 311)
and spacing variants. Those rows could therefore never pair, from day one.

New `scripts/recover_missing_photos.py` (dry-run capable, photo-only — the
single DB write is `UPDATE … SET photo_path`): re-queries Telegram ±10
messages around each video and matches in three tiers — exact name,
normalized name, then *name-overlap* (≥2 shared normalized tokens and ≥half
the target's tokens) restricted to offsets −1/−2 where the channel
conventionally posts the portrait. All 39 matched at offset −1; identity
spot-checked visually (recovered portrait vs the portrait inside the video's
own card) for the typo cases. `reprocess.py --update` was deliberately NOT
used for the 38 rows with data — it would have overwritten the AI-corrected
dates with raw OCR.

msg 1200 (the empty needs-human row: no frames, no dates, 0-byte photo from
a failed 2026-06-08 download) was fully re-scraped, then AI-verified from
its new frames (1976-07-20 / 2023-12-08, card matches OCR), as was the new
daily row 1252. `docs/ai-verify-report-2026-06-10.md` gained an Update
2026-06-11 section: admin deleted 5 unfixable rows; needs-human is down to
9; counters now 559 AI-verified / 569 total.

---

## 2026-06-10

### [`7c5734b`](https://github.com/mohamedkhamis/AQMAR/commit/7c5734b) — feat(ai-verify): AI date-verification track + admin portal filters/counters

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
