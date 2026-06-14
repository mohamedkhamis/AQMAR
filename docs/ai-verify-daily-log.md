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

## 2026-06-14 — 7 processed (manual run, msg 1270–1282)

**3 exact matches · 2 corrections · 2 NULL fills · 0 needs-human**
Two frames read per row; the two NULL-martyrdom rows were additionally
confirmed against the portrait poster. After this run `pending` returns
**0 rows** — every human-unverified row carries `ai_verified = 1`.
(msg 1282 was scraped mid-run and picked up in the same pass.)

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 1272 | birth | 1989-12-08 | **1989-08-12** | 1989 - 08 - 12 (day/month swap) |
| 1276 | martyrdom | 2025-12-06 | **2025-06-12** | 2025 - 06 - 12 (day/month swap) |
| 1278 | martyrdom | NULL | **2023-10-07** | card 2023-10-07 + poster 07-10-2023 (war day 1) |
| 1280 | martyrdom | NULL | **2023-10-07** | card 2023-10-07 + poster 07-10-2023 (war day 1) |

Exact matches: 1270, 1274, 1282.

Note: 1278's video card middle group is faint and reads like "01"; the
portrait poster (07-10-2023) confirmed the month is **10**, so martyrdom is
2023-10-07, not the pre-war 2023-01-07 a single-frame read would suggest.

## 2026-06-14 — full re-verify of every ai_verified=0 row (admin request)

The admin asked to re-pull **all** not-yet-AI-confirmed rows fresh from
Telegram and re-read them. Scope: the 11 human-verified `ai_verified=0`
rows + 5 new scrape rows (1284, 1286, 1290, 1293, 1295). Method: re-extracted
fresh video frames + re-downloaded portraits via `data/ai_batches/_refetch.py`,
read each card by vision (video card primary, poster as disambiguator).

**Outcome: every row in the registry now carries `ai_verified = 1`
(587 / 587; `ai_verified=0` = 0).**

New scrape rows (5): 1293/1295 exact match; 1284 & 1286 NULL-martyrdom filled
(2023-10-07 war-day-1, 2025-08-07); 1290 fixed swap 2024-04-06 → **2024-06-04**.

Human-verified `ai_verified=0` rows (11): **8 confirmed** (926, 928, 930, 932,
934, 936, 938, 1254) — every one's birth was on the *video card* and matched;
the old "no birth on card" flags were poster-only misreads. **3 conflicts**
went to the admin and were approved as fixes:

| msg | field | was | now | basis |
|---|---|---|---|---|
| 98 | birth | 1992-02-06 | **1992-06-02** | video card prints 1992-06-02 (day/month swap) |
| 772 | martyrdom | 2023-01-10 | **2024-01-10** | DB was pre-war; poster + OCR both 2024-01-10 (card year typo) |
| 233 | birth | 1887-09-24 | **1987-09-24** | card itself prints impossible 1887; admin-approved correction to 1987 |

These three are human-`verified` rows; dates were changed only after explicit
admin approval. The `ai_note` on each records the before→after and the basis.

<!-- Daily sections are appended below. -->
