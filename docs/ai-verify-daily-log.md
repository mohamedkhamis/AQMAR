# AI date-verification — daily log

Appended automatically by `scripts\ai_verify_daily.ps1`, which verifies the
martyrs added by the daily scrape (same rules and audit trail as the
2026-06-10 full run — see `docs/ai-verify-report-2026-06-10.md`).
Rows the AI cannot verify get `ai_verified = 0` + an `ai_note` and appear in
the portal's بانتظار filter for human review.

## 2026-06-11 — 5 processed (manual run, msg 1256–1268)

**3 exact matches · 1 correction · 2 NULL fills · 0 needs-human**
Two independent blind readers per row, zero disagreements. After this run
`pending` returns **0 rows** — the whole registry carries `ai_verified = 1`.

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 1258 | martyrdom | 2023-10-02 | **2023-10-28** | 2023 - 10 - 28 (day misread; old value was pre-war) |
| 1260 | birth | NULL | **1997-12-24** | 1997_12_24 (OCR was "1997") |
| 1260 | martyrdom | NULL | **2023-10-28** | 2023_10_28 (OCR was "2023") |

Exact matches: 1256, 1265, 1268.

<!-- Daily sections are appended below. -->
