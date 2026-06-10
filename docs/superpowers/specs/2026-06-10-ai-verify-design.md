# AI date verification (`ai_verified`) — design

**Date:** 2026-06-10 · **Status:** approved by user (4 design questions + visual mockup)

## Goal

A second, independent verification track: an AI (Claude) reads every pending
row's OCR frames, checks **birth date and martyrdom date only** against what
the memorial card actually shows, fixes wrong/swapped dates in strict
`yyyy-mm-dd`, and marks the row `ai_verified = 1`. The admin portal gets a
filter, a sortable column, counters, and an audit note so the human admin can
see exactly what the AI did.

## Why

OCR day/month swaps are endemic: e.g. msg 23's card shows `08 - 01 - 1991`
(= 1991-01-08, dd-mm-yyyy) but OCR stored `1991-08-01`. ~180 of 567 rows have
"ambiguous" dates (day ≤ 12) that may be swapped. Human verification has
covered 54 rows; 512 are pending.

## User decisions (locked)

1. **Scope:** AI processes only the 512 `unverified` rows. Human-`verified`
   (54) and `rejected` (1) rows are skipped entirely.
2. **Audit columns:** yes — `ai_verified_at`, `ai_note` alongside the bool.
3. **Pacing:** pilot of 50 rows first → user spot-checks in the portal →
   then the remaining ~462.
4. **Month-only dates:** keep the existing day-15 convention
   (`فبراير - 2024` ⇒ `2024-02-15` counts as a match; fills NULLs too).
5. **Counters layout:** Option B — 4-cell stats strip above the admin filter
   card (chosen from `webui/_preview_ai_verify.html`).

## DB changes

`scripts/migrate_add_ai_verify.sql` (idempotent, INFORMATION_SCHEMA guards,
same pattern as `migrate_add_featured_frame.sql`):

```sql
ALTER TABLE dbo.martyrs ADD ai_verified    BIT NOT NULL CONSTRAINT DF_martyrs_ai_verified DEFAULT 0;
ALTER TABLE dbo.martyrs ADD ai_verified_at DATETIME2     NULL;
ALTER TABLE dbo.martyrs ADD ai_note        NVARCHAR(255) NULL;
```

No index — the SPA filters client-side over the full row set.

## Backend changes (`src/sqlserver_client.py`)

- `mark_ai_verified(conn, msg_id, edits: dict, note: str)` — applies optional
  `birth_date` / `martyrdom_date` corrections (validated by `_sanitize_date`)
  and sets `ai_verified = 1`, `ai_verified_at = SYSUTCDATETIME()`, `ai_note`.
  **Never** touches `verification_status` / `verified_*` / `ocr_*`.
- `mark_ai_note(conn, msg_id, note)` — for rows the AI could NOT verify
  (unreadable / no frames / no date on card): writes the note, leaves
  `ai_verified = 0`.
- `get_ai_pending(conn, limit)` — rows with
  `verification_status = 'unverified' AND ai_verified = 0`, ordered
  `msg_id ASC`, returning the fields the batch needs (ids, dates, ocr_*,
  frame_paths, photo_path).

No new API endpoints: `GET /api/martyrs` is `SELECT *`, so the new columns
flow to the SPA automatically. The batch writes via direct DB connection
(local, same as migration scripts).

## Batch workflow

`scripts/ai_verify.py` CLI:

- `pending --limit N --json out.json` — dump the next N pending rows.
- `apply results.json` — apply a results file; prints a per-row summary.

Results file shape (written by Claude after reading the frames):

```json
{"results": [
  {"msg_id": 23, "birth_date": "1991-01-08", "martyrdom_date": null,
   "verified": true, "note": "fixed swap: birth 1991-08-01 -> 1991-01-08 (card: 08-01-1991)"}
]}
```

`birth_date` / `martyrdom_date` present ⇒ correction; `null`/absent ⇒ keep
DB value. `verified: false` ⇒ note-only write (`mark_ai_note`).

Claude's reading procedure per row: open the middle frame first (cards
typically appear in late frames), fall back to the other frames if the card
is missing/unreadable; read `تاريخ الميلاد` and `تاريخ الشهادة`; interpret
numeric dates as **dd-mm-yyyy** (validated against human-verified ground
truth); compare with DB; decide match / fix / can't-verify.

Resumability: the `ai_verified` flag + `ai_note` in the DB are the
checkpoint — re-running `pending` naturally skips completed rows. Batches of
~10–15 rows per apply. Results files land in `data/ai_batches/` (gitignored).

### Date rules

| Card shows | DB has | Action |
|---|---|---|
| Full date, matches DB | same | `ai_verified=1`, note `match` |
| Full date, differs | anything | fix column(s), `ai_verified=1`, note `old -> new` |
| Month + year only | `yyyy-mm-15` | match (day-15 convention) |
| Month + year only | NULL or different month | write `yyyy-mm-15`, note |
| No date printed | NULL | `ai_verified=1`, note `card has no <field>` |
| No date printed | value | flag in note, leave `ai_verified=0` (needs human) |
| Unreadable / no frames | — | `ai_verified=0`, note reason |

All written dates are strict `yyyy-mm-dd` (`_sanitize_date` enforced).

## Admin portal UI

- **Stats strip (Option B):** 4 cells above the filter card — human verified /
  human remaining / AI verified / AI remaining. Rejected rows excluded from
  denominators. Western tabular digits (admin-grid convention, matches the
  approved mockup).
- **AI filter pills:** second pills row `تحقق AI: الكل / تمّ / بانتظار`
  (`adminAiFilter: 'all' | 'ai' | 'pending'`), ANDed with the existing
  status filter.
- **AI column:** sortable, teal `🤖 ✓` badge with `ai_note` as tooltip; `—`
  for pending; human-verified rows show `— (محقق بشرياً)`.
- **Edit form:** teal note panel above the fields when `ai_note` exists
  (note + timestamp).
- **Design token:** `--ai: #4cc3b0` (+ `--ai-dim`) added to `:root` in
  `styles.css`.
- `data-loader.js` maps `ai_verified → aiVerified`, `ai_note → aiNote`,
  `ai_verified_at → aiVerifiedAt`.

## Protected / out of scope

- `exporter.py PUBLISHED_FIELDS` unchanged — AI columns never publish.
- Scraper upsert `COLUMNS` unchanged — re-scrape can't reset AI state.
- Human verify flow (`mark_verified`) untouched; saving a human verification
  does not change `ai_verified`.
- Names, cities, ranks, etc. are never edited by the AI (dates only).

## Testing

- pytest: `mark_ai_verified` (SQL + sanitization + status untouched),
  `mark_ai_note`, `get_ai_pending` filter, exporter exclusion of AI columns.
- Existing 92 tests stay green.
- `webui/tests.html`: `adaptMartyrToNewSchema` maps AI fields + defaults.
- Manual: user spot-checks pilot in the portal at http://localhost:8082/webui/.

## Rollout

1. Migration → 2. backend helpers + tests → 3. portal UI → 4. pilot 50 →
5. user spot-check → 6. full run (~462) → 7. final report
(`docs/ai-verify-report-2026-06-10.md`: every change old → new, plus the
can't-verify list).
