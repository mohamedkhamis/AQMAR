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

## 2026-07-29_0125 nightly p1 — 23 processed

Work list `data/ai_batches/args_nightly.json` (msg 1897–1945). Each row read
from the middle video frame (`_30`) and confirmed against `_28`; posters used
as disambiguators where both date tokens were ≤ 12. **23 processed — 18 exact
matches, 5 changes, 0 needs-human.** Cover frame set to `_28` on 22 rows
(msg 1940 is a poster-only post with no video frames).

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 1897 | birth | 1995-03-18 | **1995-08-13** | 1995 - 08 - 13 (OCR read 8 as 3 in both groups) |
| 1901 | birth | 1990-07-12 | **1990-12-07** | 1990 - 12 - 07 (day/month swap; month is the middle group) |
| 1901 | martyrdom | 2023-12-23 | **2023-12-28** | 2023 - 12 - 28; poster prints 2023/12/28 |
| 1903 | martyrdom | 2024-02-13 | **2024-02-18** | 2024 - 02 - 18 |
| 1918 | birth | *NULL* | **1995-03-31** | 1995 - 03 - 31 (filled from card) |
| 1922 | birth | 2001-04-07 | **2001-07-04** | 2001 - 07 - 04 (day/month swap); poster confirms martyrdom 10-01-2024 |

**Needs human:** none.

**Exact matches (18):** 1899, 1905, 1910, 1912, 1914, 1916, 1920, 1924, 1926, 1928, 1930, 1932, 1934, 1936, 1938, 1940, 1942, 1945.

Note on 1940 (منذر مازن داوود): poster-only post, no memorial-card frames.
The poster prints only تاريخ الاستشهاد / 10-12-2023, which matches the DB;
no birth date is printed and the DB birth is NULL, so the row is verified
with birth still unset.

## 2026-07-29_0125 nightly p2 — 1 processed

Work list `data/ai_batches/args_nightly.json` (msg 1948 only — the second pass
picked up the one row that landed after p1's snapshot). Read from the middle
video frame (`_30`) and confirmed against `_28`. **1 processed — 1 exact
match, 0 changes, 0 needs-human.** Cover frame set to `_28`.

| msg | field | was | now | card shows |
|---|---|---|---|---|
| — | — | — | — | no changes this pass |

**Needs human:** none.

**Exact matches (1):** 1948.

Note on 1948 (وليد نافذ انعيم): card prints تاريخ الميلاد 1988 - 09 - 16 and
تاريخ الشهادة 2023 - 11 - 06 — both already YYYY-MM-DD and both matching the
DB. Age at martyrdom 35.

## 2026-07-29_0418 nightly p1 — 21 processed

Work list `data/ai_batches/args_nightly.json` (21 rows, msg 1950–1992; 1988 not
in the list). Read from the middle video frame (`_30`) and confirmed the digits
against `_28` on every row. **21 processed — 7 exact matches, 14 fixed, 0
needs-human.** Cover frame set to `_28` on all 21.

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 1950 | martyrdom | 2023-07-10 | **2023-10-07** | 2023 - 10 - 07 (day/month swap) |
| 1952 | birth | 1991-07-03 | **1991-03-07** | 1991 - 03 - 07 (day/month swap) |
| 1956 | martyrdom | 2025-02-10 | **2025-10-02** | 2025 - 10 - 02 (day/month swap) |
| 1962 | birth | 2002-12-08 | **2002-08-12** | 2002 - 08 - 12 (day/month swap) |
| 1962 | martyrdom | 2023-07-10 | **2023-10-07** | 2023 - 10 - 07; poster confirms 2023-10-07 |
| 1964 | birth | 2000-02-01 | **2000-01-02** | 2000 - 01 - 02 (day/month swap) |
| 1966 | birth | 1990-05-08 | **1990-08-05** | 1990 - 08 - 05 (day/month swap) |
| 1968 | birth | 1979-04-03 | **1979-03-04** | 1979 - 03 - 04 (day/month swap) |
| 1970 | martyrdom | *NULL* | **2024-06-16** | 2024 - 06 -16 (filled from card; OCR was garbled) |
| 1972 | birth | 1994-03-10 | **1994-10-03** | 1994 - 10 - 03 (day/month swap) |
| 1976 | birth | 1990-05-01 | **1990-01-05** | 1990 - 01 - 05 (day/month swap) |
| 1978 | martyrdom | 2023-03-10 | **2023-10-08** | 2023 - 10 - 08 (both parts wrong, not a swap) |
| 1982 | birth | 1994-12-11 | **1994-11-12** | 1994 - 11 - 12 (day/month swap) |
| 1982 | martyrdom | 2026-03-03 | **2026-03-08** | 2026 - 03 - 08 (day wrong) |
| 1984 | birth | 1990-04-07 | **1990-07-04** | 1990 - 07 - 04 (day/month swap) |
| 1992 | martyrdom | 2024-10-05 | **2024-05-10** | 2024 - 05 - 10 (day/month swap) |

**Needs human:** none.

**Exact matches (7):** 1954, 1958, 1960, 1974, 1980, 1986, 1990.

Notes: this batch was unusually swap-heavy — 12 of the 14 fixes are plain
day/month transpositions the OCR introduced, all resolved by the middle-group
rule (every card in the batch prints YYYY-MM-DD). Two rows needed more than a
swap: 1978's martyrdom was 2023-03-10 in the DB against a card reading of
2023-10-08, and 1982's martyrdom day was 03 against the card's 08. Posters
exist for 1962 and 1964 and print only تاريخ الاستشهاد / 2023-10-07, which
matched the card in both cases; neither poster carries a birth date, so those
birth readings rest on the card's own YYYY-MM-DD ordering. Every row passed the
sanity band (martyrdom 2023-10 .. today+1mo, age 21–45).

## 2026-07-30_0329 nightly p1 — 8 processed

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 1994 | martyrdom | 2025-04-09 | **2025-09-04** | 2025 - 09 - 04 (day/month swap); poster 04-09-2025 |
| 1996 | birth | 1997-10-08 | **1997-08-10** | 1997 - 08 - 10 (day/month swap) |
| 1996 | martyrdom | 2024-10-07 | **2024-07-10** | 2024 - 07 - 10 (day/month swap); poster 2024/07/10 |
| 1998 | birth | 1990-05-02 | **1990-02-05** | 1990 - 02 - 05 (day/month swap) |
| 2000 | birth | 1990-02-12 | **1990-12-02** | 1990 - 12 - 02 (day/month swap) |
| 2006 | birth | 1995-08-11 | **1995-11-08** | 1995 - 11 - 08 (day/month swap) |
| 2006 | martyrdom | 2023-11-03 | **2023-11-08** | 2023 - 11 - 08 (day wrong); poster 08 / 11 / 2023 |
| 2008 | martyrdom | *NULL* | **2024-07-23** | 2024 - 07 - 23 (filled from card; OCR had no date) |

**Needs human:** none.

**Exact matches (2):** 2002, 2004.

Notes: another swap-heavy batch — 6 of the 8 rows needed a fix, and 6 of the 8
field changes are plain day/month transpositions, all resolved by the
middle-group rule (every card in the batch prints YYYY-MM-DD). Two changes went
beyond a swap: 2006's martyrdom day was 03 in the DB against a card reading of
08, and 2008's martyrdom was NULL and came straight off the card. Posters exist
for 1994, 1996 and 2006 and print only تاريخ الاستشهاد; all three matched the
card, which settled 1994's fully-ambiguous 09/04 pair and confirmed 2006's day.
No poster carries a birth date, so the four birth fixes rest on the card's own
YYYY-MM-DD ordering. Every row passed the sanity band (martyrdom 2023-10 ..
today+1mo, ages 24–35). Cover frame set to the `_28` frame for all 8 rows.
