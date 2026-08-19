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

## 2026-07-30_2306 nightly p1 — 12 processed

| msg | field | was | now | card shows |
|---|---|---|---|---|
| — | — | — | — | no date changes written this batch |

**Needs human (1):**

| msg | reason |
|---|---|
| 2020 | card vs poster conflict on martyrdom: card prints `2025 - 07 - 19`, poster prints `2025-07-18`. Birth also differs — card `1988 - 01 - 08` vs DB `1988-08-01` (day/month swap) — but the row is left untouched pending the martyrdom decision. |

**Exact matches (11):** 2010, 2012, 2014, 2016, 2018, 2022, 2024, 2026, 2028, 2030, 2032.

Notes: an unusually clean batch — 11 of 12 cards agreed with the DB on both
dates, so nothing was written to `birth_date` / `martyrdom_date`. Every card in
the batch prints YYYY-MM-DD and all readings were confirmed against a second
frame. The one exception is 2020 (أسامه عبد الحافظ النجار): its poster is the
only one in the batch carrying a date, and it disagrees with the card by one day
on the martyrdom (18 vs 19 July 2025), so per the never-guess rule the row is
noted rather than fixed. Its birth swap is real and unambiguous under the
middle-group rule, but writing it would require verifying the row, so both
fields wait for the admin. All 11 verified rows passed the sanity band
(martyrdom 2023-10 .. today+1mo, ages 23–43) and got the `_28` frame as cover.

## 2026-07-31_1939 nightly p1 — 3 processed

| msg | field | was | now | card shows |
|---|---|---|---|---|
| — | — | — | — | no date changes written this batch |

**Needs human (0):** none.

**Exact matches (3):** 2034, 2036, 2038.

Notes: a small, entirely clean batch — all three cards agreed with the DB on
both dates, so nothing was written to `birth_date` / `martyrdom_date`. Cards
read: 2034 (ياسين علي حسن رضوان) `1999 - 10 - 19` / `2025 - 07 - 19`;
2036 (صبري يوسف عبد بنات) `1988 - 08 - 23` / `2025 - 10 - 03`;
2038 (فادي عادل سالم صلاح) `1987 - 02 - 20` / `2024 - 12 - 16`. Every card
prints YYYY-MM-DD and each reading was confirmed against a second frame
(`_30` then `_28`, digits identical). All three passed the sanity band
(martyrdom 2023-10 .. today+1mo, ages 25–37) and got the `_28` frame as cover.
Msg 2020 was carried over from last night's batch as needs-human and was
excluded from this work list, so the card-vs-poster conflict there is still
awaiting the admin's decision.

## 2026-08-02_1359 nightly p1 — 10 processed

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 2045 | birth_date | 1990-07-03 | 1990-03-07 | `1990 - 03 - 07` |
| 2051 | birth_date | 1986-11-07 | 1986-07-11 | `1986 - 07 - 11` |
| 2053 | birth_date | 1993-11-12 | 1993-12-11 | `1993 - 12 - 11` |
| 2059 | birth_date | 1998-02-07 | 1998-07-02 | `1998 - 07 - 02` |

**Needs human (0):** none.

**Exact matches (6):** 2041, 2043, 2047, 2049, 2055, 2057.

Notes: ten memorial cards, all readable, no conflicts and nothing carried to the
admin. Four birth dates were day/month swaps in the DB and were fixed to the
card; every martyrdom date in the batch already matched. The four swaps share
one signature — the day printed on the card is ≤ 12 (07, 11, 11, 02), so the
stored value could be reordered without looking wrong, while the six exact
matches all print a day > 12 (21, 13, 23, 30) or a day/month pair the DB already
had right. Under the middle-group rule the card readings are unambiguous: the
month is the middle group in all ten cards, and the layout is confirmed
independently — msg 2045's own martyrdom line prints `2023 - 10 - 16` (16 can
only be the day, and it sits in the right-hand group), and msg 2051's poster
prints `05-12-2024` against the card's `2024 - 12 - 05`, so the card template is
YYYY-MM-DD and the poster DD-MM-YYYY exactly as expected. Posters were pulled
for 2045 and 2051 to break the ≤ 12 ambiguity; both carry the martyrdom date
only (no birth date), and both agreed with the card. Cards read: 2041
(إسماعيل أشرف البطش) `1992 - 05 - 21` / `2025 - 07 - 29`; 2043 (إبراهيم ناصر
شحادة) `1993 - 04 - 13` / `2025 - 10 - 10`; 2045 (آدم إسماعيل المدهون)
`1990 - 03 - 07` / `2023 - 10 - 16`; 2047 (مراد أحمد أبو مراد) `1978-01-23` /
`2023-10-19`; 2049 (محمد رسلان شنيوره) `1999 - 09 - 30` / `2023 - 11 - 15`;
2051 (أمجد أحمد جندية) `1986 - 07 - 11` / `2024 - 12 - 05`; 2053 (عز الدين كمال
هنيه) `1993 - 12 - 11` / `2023 - 11 - 09`; 2055 (علي خالد الطناني)
`1991 - 02 - 10` / `2024 - 05 - 14`; 2057 (حسن محمد حسنين) `1994 - 07 - 19` /
`2023 - 11 - 09`; 2059 (عطا الله عمر الهمص) `1998 - 07 - 02` / `2024 - 05 - 29`.
Each reading was confirmed against a second frame (`_30` then `_28`, digits
identical). All ten passed the sanity band (martyrdom 2023-10 .. today+1mo,
ages 24–45) and got the `_28` frame as cover. Msg 2020 remains needs-human from
the 2026-07-30 batch and was excluded from this work list; its birth swap
(`1988 - 01 - 08` on the card) matches the same ≤ 12 pattern seen here, but it
stays blocked behind the unresolved card-vs-poster martyrdom conflict.

## 2026-08-02_1359 nightly p2 — 1 processed

Work list `data/ai_batches/args_nightly.json` (msg 2062 only — the row that
landed after p1's snapshot; msg 2020 stays excluded as needs-human). Read from
the middle video frame (`_30`) and confirmed against `_28`. **1 processed —
1 exact match, 0 changes, 0 needs-human.** Cover frame set to `_28`.

| msg | field | was | now | card shows |
|---|---|---|---|---|
| — | — | — | — | no changes this pass |

**Needs human:** none.

**Exact matches (1):** 2062.

Note on 2062 (خليل حسن أبو جزر): card prints تاريخ الميلاد `1991 - 11 - 09` and
تاريخ الشهادة `2024 - 09 - 27` — both YYYY-MM-DD with the month in the middle
group, and both already matching the DB, so no poster lookup was needed. Digits
identical across `_30` and `_28`. Age at martyrdom 32; martyrdom inside the
sanity band. Aside: the card renders the name as خليل حسن خليل أبو جزر against
the DB's خليل حسن أبو جزر — out of scope for this pass (dates only), left for
the admin.

## 2026-08-04_1411 nightly p1 — 17 processed

Work list `data/ai_batches/args_nightly.json` (msg 2064–2096 even; msg 2020
stays excluded as needs-human). Read from the middle video frame (`_30`) and
confirmed against `_28`; posters consulted on 2064, 2070 and 2096 to break
fully-ambiguous ≤ 12 swaps. **17 processed — 7 exact matches, 10 fixed,
0 needs-human.** Cover frame set to `_28` on all 17.

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 2064 | birth_date | 1997-02-06 | 1997-06-02 | `1997 - 06 - 02` |
| 2064 | martyrdom_date | 2023-07-10 | 2023-10-07 | `2023 - 10 - 07` (poster `2023-10-07`) |
| 2066 | birth_date | 1997-10-01 | 1997-01-10 | `1997 - 01 - 10` |
| 2066 | martyrdom_date | 2023-07-10 | 2023-10-07 | `2023 - 10 - 07` |
| 2070 | birth_date | 1995-12-11 | 1995-11-12 | `1995 - 11 - 12` |
| 2070 | martyrdom_date | 2023-11-10 | 2023-10-11 | `2023 - 10 - 11` (poster `2023 - 10 - 11`) |
| 2074 | martyrdom_date | 2023-07-10 | 2023-10-07 | `2023 - 10 - 07` |
| 2078 | birth_date | 1995-01-06 | 1995-06-01 | `1995 - 06 - 01` |
| 2082 | birth_date | 1980-03-01 | 1980-01-03 | `1980 - 01 - 03` |
| 2088 | martyrdom_date | 2023-07-10 | 2023-10-07 | `2023 - 10 - 07` |
| 2090 | birth_date | 1994-12-10 | 1994-10-12 | `1994 - 10 - 12` |
| 2094 | birth_date | 1999-03-10 | 1999-10-03 | `1999 - 10 - 03` |
| 2096 | martyrdom_date | 2026-03-06 | 2026-06-03 | `2026 - 06 - 03` (poster `2026/06/03`) |

**Needs human:** none.

**Exact matches (7):** 2068, 2072, 2076, 2080, 2084, 2086, 2092.

Note on the fix pattern: every one of the 10 fixes is a day/month transposition
where both tokens are ≤ 12, i.e. the OCR read the card's YYYY-MM-DD as
YYYY-DD-MM. Four of them (2064, 2066, 2074, 2088) had the DB holding
`2023-07-10` against a card reading `2023 - 10 - 07` — the 7 October date, and
the single most common OCR swap in this batch. Where a poster was available it
agreed with the card every time (2064, 2070, 2096), which is what licensed
applying the same middle-group-is-month rule to the birth dates, whose posters
print no birth date. All 17 rows pass the sanity band: martyrdoms fall
2023-10-07 … 2026-06-03 and ages at martyrdom run 20–44.

## 2026-08-05_0415 nightly p1 — 7 processed

Work list `data/ai_batches/args_nightly.json` (msg 2098–2110 even; msg 2020
stays excluded as needs-human). Read from the middle video frame (`_30`) and
confirmed against `_28`; posters consulted on 2098 and 2100. **7 processed —
4 exact matches, 3 fixed, 0 needs-human.** Cover frame set to `_28` on all 7.

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 2098 | martyrdom_date | 2026-03-06 | 2026-06-03 | `2026 - 06 - 03` (poster `2026/06/03`) |
| 2100 | birth_date | 1990-06-10 | 1990-10-06 | `1990 - 10 - 06` |
| 2104 | birth_date | *(NULL)* | 1997-12-16 | `1997-12-16` |

**Needs human:** none.

**Exact matches (4):** 2102, 2106, 2108, 2110.

Both swaps are the usual day/month transposition where the two tokens are ≤ 12,
i.e. the OCR read the card's YYYY-MM-DD as YYYY-DD-MM. 2098 repeats yesterday's
`2026-03-06` vs `2026 - 06 - 03` pattern (2096) and its poster agreed with the
card again; 2100's poster prints only the martyrdom date (`2024-02-29`, which
already matched), so the birth fix rests on the middle-group-is-month rule.
2104 was a fill, not a fix — the DB birth was NULL because the OCR ran the birth
date and the martyrdom label together into one string
(`1997-12-16 لا35 تاريخ الشهادة 2024-06-15`). All 7 rows pass the sanity band:
martyrdoms fall 2023-12-23 … 2026-06-03 and ages at martyrdom run 22–35.

## 2026-08-06_0802 nightly p1 — 15 processed

Work list `data/ai_batches/args_nightly.json` (msg 2112–2142 even, minus 2136;
msg 2020 stays excluded as needs-human). Read from the middle video frame
(`_30`) and confirmed against `_28`; posters consulted on 2118, 2122 and 2130.
**15 processed — 10 exact matches, 4 fixed, 1 needs-human.** Cover frame set to
`_28` on all 14 verified rows.

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 2118 | martyrdom_date | 2023-01-12 | 2023-12-01 | `2023 - 12 - 01` (poster `01 - 12 - 2023`) |
| 2122 | martyrdom_date | 2024-05-07 | 2024-07-05 | `2024 - 07 - 05` (poster `05-07-2024`) |
| 2130 | birth_date | 1988-02-01 | 1988-01-02 | `1988 - 01 - 02` |
| 2138 | birth_date | 1998-12-10 | 1998-10-12 | `1998 - 10 - 12` |

**Needs human (1):**

| msg | reason |
|---|---|
| 2140 | No frames were extracted and `data/photos/2140.jpg` is a 0-byte file — no readable card in any source. DB birth and martyrdom are both NULL, so nothing could be confirmed or filled. |

**Exact matches (10):** 2112, 2114, 2116, 2120, 2124, 2126, 2128, 2132, 2134, 2142.

All four fixes are the usual day/month transposition where both tokens are ≤ 12,
i.e. the OCR read the card's YYYY-MM-DD as YYYY-DD-MM. The two martyrdom fixes
were confirmed by their posters, which print DD-MM-YYYY: 2118's poster reads
`01 - 12 - 2023` and 2122's `05-07-2024`, both agreeing with the card. The two
birth fixes rest on the middle-group-is-month rule — the posters carry only the
martyrdom date (2130's prints `16 - 07 - 2025`, which already matched). 2118 is
also the one row whose stored date failed the sanity band outright (2023-01-12
predates 2023-10); the corrected 2023-12-01 sits inside it.

Note for the human reviewer: msg 2114 and msg 2126 are the same martyr
(إبراهيم محمد أبو هداف, 1988-08-14 / 2023-10-24) posted twice — both cards read
identically and both match the DB, so both verified, but the pair looks like a
duplicate row worth merging. Msg 2142 prints the same day and month for birth
and martyrdom (`1993-12-30` / `2023-12-30`); that is what the card shows on both
frames, not a transcription slip. All 14 verified rows pass the sanity band:
martyrdoms fall 2023-10-13 … 2025-07-16 and ages at martyrdom run 25–37.

## 2026-08-06_0802 nightly p2 — 1 processed

Work list `data/ai_batches/args_nightly.json` held a single row (msg 2144);
msg 2020 and msg 2140 stay excluded as needs-human. Read the middle frame
(`_30`), confirmed against `_28`, then consulted the poster because both
non-year tokens on each card date are ≤ 12. **1 processed — 0 exact matches,
0 fixed, 1 needs-human.** No cover frame set.

| msg | field | was | now | card shows |
|---|---|---|---|---|
| — | — | — | — | no changes written |

**Needs human (1):**

| msg | reason |
|---|---|
| 2144 | Card vs poster conflict on the martyrdom date. Frames `_28` and `_30` agree exactly and both match the DB: birth `1992 - 07 -02` → 1992-07-02, martyrdom `2025 - 04-02` → 2025-04-02. The poster prints `تاريخ الاستشهاد/ 04 - 03 - 2025` → 2025-03-04. |

**Exact matches (0):** —

The 2144 conflict is not the usual day/month transposition. A swap would leave
the token pair unchanged, but the card's non-year tokens are {02, 04} while the
poster's are {04, 03} — the **month** differs (April on the card, March on the
poster), so no reading of either source reconciles them. Both readings were
re-checked on 3× zoom crops of the card date block and of the poster date line;
the digits are unambiguous in both. Both candidate dates also pass the sanity
band on their own (2025-04-02 and 2025-03-04 are inside 2023-10 … today+1month;
age at martyrdom 32 either way), so sanity cannot break the tie. Left for the
admin to decide which source is authoritative — the DB keeps its existing
2025-04-02 and the row stays unverified. The birth date needs no attention: the
card matches the DB and the poster carries no birth date.

## 2026-08-06_0802 nightly p3 — 1 processed

Work list `data/ai_batches/args_nightly.json` held a single row (msg 2146);
msg 2020, msg 2140 and msg 2144 stay excluded as needs-human. Read the middle
frame (`_30`) and confirmed the digits against `_28` — both frames render the
card identically. **1 processed — 1 exact match, 0 fixed, 0 needs-human.**

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 2146 | featured_frame_path | (unset) | data/frames/2146_28.jpg | clean full card: portrait, name, both dates, no title overlay |

**Needs human (0):** —

**Exact matches (1):** 2146

msg 2146 مصطفى خليل أبو العلا — the card prints birth `2000 - 05 - 30` and
martyrdom `2023 - 12 - 21`, both year-first, so the day is the outer token on
the side away from the year: 2000-05-30 and 2023-12-21. Both agree with the DB,
so no date column was written. Sanity passes on both — martyrdom sits inside
2023-10 … today+1month and the age at martyrdom is 23. Only the cover frame
changed: `_28` is the sharpest fully-rendered frame (`_32` is the transition
frame) and is one of this row's own `frames` paths.

## 2026-08-06_1459 nightly p1 — 2 processed

Work list `data/ai_batches/args_nightly.json` held two rows (msg 2148, msg 2150);
msg 2140 stays excluded as needs-human. For each row the middle frame (`_30`) was
read first and the digits confirmed against `_28` — both frames render each card
identically. **2 processed — 1 exact match, 1 fixed, 0 needs-human.**

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 2150 | birth_date | 1992-11-10 | 1992-10-11 | `تاريخ الميلاد` `1992 - 10 - 11` |
| 2148 | featured_frame_path | (unset) | data/frames/2148_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2150 | featured_frame_path | (unset) | data/frames/2150_28.jpg | clean full card: portrait, name, both dates, no title overlay |

**Needs human (0):** —

**Exact matches (1):** 2148

msg 2148 رائد أنور علي الدنف — the card prints birth `1994 - 10 - 16` and
martyrdom `2023 - 10 - 31`, both year-first, so the day is the outer token on the
side away from the year: 1994-10-16 and 2023-10-31. Both agree with the DB, so no
date column was written. Sanity passes — martyrdom sits inside 2023-10 …
today+1month and the age at martyrdom is 29. Only the cover frame changed.

msg 2150 محمد محمود كنعان — the card prints birth `1992 - 10 - 11`, year-first,
so the month is the middle group (10) and the day the outer token away from the
year (11) → 1992-10-11. The DB held 1992-11-10, a day/month transposition. Both
non-year tokens are ≤ 12, so the reading is fully ambiguous on its own and the
poster was pulled in to break it — but this poster carries only
`تاريخ الاستشهاد/ 2024-03-20` and no birth date, so it cannot arbitrate. The fix
therefore rests on the middle-group-is-month rule alone, which both frames
support unambiguously. Flagging that here rather than in the note: if the admin
ever finds a birth-bearing source for this row, 2150 is the one to re-check. The
martyrdom date needs no attention — card, poster and DB all read 2024-03-20.
Sanity passes on the new birth date: age at martyrdom 31 either way.

## 2026-08-07_2230 nightly p1 — 7 processed

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 2152 | featured_frame_path | (unset) | data/frames/2152_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2154 | featured_frame_path | (unset) | data/frames/2154_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2156 | featured_frame_path | (unset) | data/frames/2156_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2158 | featured_frame_path | (unset) | data/frames/2158_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2160 | featured_frame_path | (unset) | data/frames/2160_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2162 | featured_frame_path | (unset) | data/frames/2162_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2164 | featured_frame_path | (unset) | data/frames/2164_28.jpg | clean full card: portrait, name, both dates, no title overlay |

**Needs human (0):** —

**Exact matches (7):** 2152, 2154, 2156, 2158, 2160, 2162, 2164

A clean batch — no date column was written on any row. All seven are the standard
year-first memorial card (`تاريخ الميلاد` / `تاريخ الشهادة`), read on the `_30`
frame and confirmed digit-for-digit on `_28`. Card readings, all agreeing with
the DB: 2152 محمود رجاء شابط `1999 - 12 - 30` / `2025 - 06 - 15`;
2154 حسين عبدالله الجوجو `1977 - 12 - 31` / `2024 - 10 - 19`;
2156 محمد فايز البرعي `1974-12-11` / `2025-07-15`;
2158 شادي حسن حسنين `1984 - 04 - 17` / `2024 - 04-08`;
2160 حسن يوسف الكحلوت `1998 - 03 - 13` / `2023 - 11 - 09`;
2162 غسان محمود العجلة `1982 - 10 -19` / `2025 -01 - 11`;
2164 سعد عزمي شلح `1992 - 04 - 01` / `2025 - 06 -19`.

Every reading is year-first, so the month is the middle group and the day the
outer token away from the year; none of them needed the poster to disambiguate.
Sanity passes across the batch — martyrdom dates run 2023-11-09 … 2025-07-15, all
inside 2023-10 … today+1month, and ages at martyrdom are 25, 46, 50, 39, 25, 42
and 33. The only DB writes were the seven cover frames, each the `_28` frame
(`_32` is the transition frame and was rejected on sight for all seven).

## 2026-08-10_0932 nightly p1 — 11 processed

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 2170 | martyrdom_date | 2025-08-06 | 2025-06-08 | `2025 - 06 - 08` (poster: `08 يونيو - 2025`) |
| 2172 | martyrdom_date | (null) | 2023-10-09 | `2023 - 10 - 09` |
| 2174 | birth_date | (null) | 1985-06-17 | `1985 - 06 - 17` |
| 2174 | martyrdom_date | (null) | 2024-03-24 | `2024 - 03 - 24` |
| 2178 | birth_date | 1992-11-06 | 1992-06-11 | `1992 - 06 - 11` |
| 2187 | birth_date | 1990-07-02 | 1990-02-07 | `1990 - 02 - 07` |
| 2189 | birth_date | (null) | 1995-08-22 | `1995 - 08 -22` |
| 2191 | birth_date | 1992-03-17 | 1992-08-17 | `1992 - 08 - 17` |
| 2166 | featured_frame_path | (unset) | data/frames/2166_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2170 | featured_frame_path | (unset) | data/frames/2170_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2172 | featured_frame_path | (unset) | data/frames/2172_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2174 | featured_frame_path | (unset) | data/frames/2174_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2176 | featured_frame_path | (unset) | data/frames/2176_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2178 | featured_frame_path | (unset) | data/frames/2178_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2183 | featured_frame_path | (unset) | data/frames/2183_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2185 | featured_frame_path | (unset) | data/frames/2185_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2187 | featured_frame_path | (unset) | data/frames/2187_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2189 | featured_frame_path | (unset) | data/frames/2189_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2191 | featured_frame_path | (unset) | data/frames/2191_28.jpg | clean full card: portrait, name, both dates, no title overlay |

**Needs human (0):** —

**Exact matches (4):** 2166, 2176, 2183, 2185

A heavy batch for date columns — 7 of 11 rows took a write. Every card is the
standard year-first memorial layout (`تاريخ الميلاد` / `تاريخ الشهادة`), read on
the `_30` frame and confirmed digit-for-digit on `_28`.

Three of the seven were day/month swaps in the DB where both tokens are ≤ 12, so
the middle-group-is-month rule is what settles them: 2170 martyrdom
(`2025 - 06 - 08`), 2178 birth (`1992 - 06 - 11`), 2187 birth (`1990 - 02 - 07`).
2170 was the one swap with an independent arbiter — its poster prints
`تاريخ الاستشهاد / 08 يونيو - 2025`, i.e. 8 June 2025, which confirms the card
against the DB's 2025-08-06. The 2178 and 2187 posters carry only the martyrdom
date (which already matched), so those two birth fixes rest on the card rule
alone; both frames agree unambiguously in each case.

2191 is a different failure — not a swap but an OCR digit misread. The card reads
`1992 - 08 - 17` on both frames; the DB had month 03, an 8→3 confusion. Day 17
is > 12 so the month/day roles were never in question, only the digit.

Three fills on previously-NULL columns: 2172 martyrdom (OCR had left the garbage
`٥9 2023-10`), 2174 both dates (OCR had only the fragment `03.24 202` and no
birth at all), and 2189 birth. 2174's card is the small-format variant — the
whole card renders at roughly half the usual width — but both dates are legible
and consistent across frames.

Sanity passes across the batch: martyrdom dates run 2023-10-09 … 2025-06-08, all
inside 2023-10 … today+1month, and ages at martyrdom are 30, 42, 29, 38, 31, 32,
33, 27, 35, 28 and 31. All eleven cover frames are the `_28` frame; `_32` was
rejected on sight throughout as the transition frame.

## 2026-08-10_1941 nightly p1 — 8 processed

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 2197 | birth_date | 1995-02-05 | 1995-05-02 | `1995 - 05 - 02` |
| 2197 | martyrdom_date | (null) | 2024-11-05 | `2024 - 11 - 05` (poster: `2024-11-05`) |
| 2193 | featured_frame_path | (unset) | data/frames/2193_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2195 | featured_frame_path | (unset) | data/frames/2195_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2197 | featured_frame_path | (unset) | data/frames/2197_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2199 | featured_frame_path | (unset) | data/frames/2199_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2201 | featured_frame_path | (unset) | data/frames/2201_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2203 | featured_frame_path | (unset) | data/frames/2203_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2207 | featured_frame_path | (unset) | data/frames/2207_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2209 | featured_frame_path | (unset) | data/frames/2209_28.jpg | clean full card: portrait, name, both dates, no title overlay |

**Needs human (0):** —

**Exact matches (7):** 2193, 2195, 2199, 2201, 2203, 2207, 2209

A quiet batch — 7 of the 8 rows confirmed the DB digit-for-digit. Every card is
the standard year-first memorial layout (`تاريخ الميلاد` / `تاريخ الشهادة`), read
on the `_30` frame and re-confirmed on `_28`.

The single write is 2197, and it is the only row in the batch that needed any
judgement. Its birth reads `1995 - 05 - 02` — both tokens ≤ 12, so the
middle-group-is-month rule is what settles it against the DB's 1995-02-05. The
poster carries only the martyrdom date, so this birth fix rests on the card rule
alone; both frames agree unambiguously. The same row's martyrdom column was NULL
(OCR had left the garbage `م ء 207`) and the card prints `2024 - 11 - 05`, which
the poster independently confirms as `تاريخ الاستشهاد / 2024-11-05` — the one
date in this batch with a second source behind it.

Sanity passes across the batch: martyrdom dates run 2023-10-18 … 2024-12-27, all
inside 2023-10 … today+1month, and ages at martyrdom are 33, 40, 29, 23, 35, 45,
31 and 34. All eight cover frames are the `_28` frame; `_32` was rejected on
sight throughout as the transition frame.

## 2026-08-10_2230 nightly p1 - 5 processed

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 2215 | birth_date | 1999-05-02 | 1999-02-05 | `تاريخ الميلاد` 1999 - 02 - 05 |
| 2217 | birth_date | 1988-04-07 | 1988-07-04 | `تاريخ الميلاد` 1988 - 07 - 04 |
| 2219 | birth_date | (NULL) | 1987-09-22 | `تاريخ الميلاد` 1987 - 09 - 22 |
| 2221 | birth_date | (NULL) | 1998-01-19 | `تاريخ الميلاد` 1998 - 01 - 19 |
| 2212 | featured_frame_path | (unset) | data/frames/2212_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2215 | featured_frame_path | (unset) | data/frames/2215_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2217 | featured_frame_path | (unset) | data/frames/2217_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2219 | featured_frame_path | (unset) | data/frames/2219_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2221 | featured_frame_path | (unset) | data/frames/2221_28.jpg | clean full card: portrait, name, both dates, no title overlay |

**Needs human (0):** —

**Exact matches (1):** 2212

Every martyrdom date in the batch already matched the DB — all four date writes
land on the birth column. Each card is the standard year-first layout, read on
the `_30` frame and re-confirmed on `_28`.

Two of those four are day/month swaps where both tokens are ≤ 12, so the
middle-group-is-month rule is the only thing that settles them: 2215 reads
`1999 - 02 - 05` against the DB's 1999-05-02, and 2217 reads `1988 - 07 - 04`
against 1988-04-07. Both posters were pulled to look for a second source and both
carry only `تاريخ الاستشهاد` (2024-03-30 and 2023-10-25 respectively, each
confirming the martyrdom the DB already had) — no birth date, so these two fixes
rest on the card rule alone. Both frames agree digit-for-digit in each case.

The other two writes are unambiguous fills into NULL columns: 2219 at
`1987 - 09 - 22` and 2221 at `1998 - 01 - 19`, both with a day token > 12. 2221's
OCR had left the fragment `85` in `ocr_birth_date`, which the card contradicts
outright.

Sanity passes across the batch: martyrdom dates run 2023-10-25 … 2024-03-30, all
inside 2023-10 … today+1month, and ages at martyrdom are 37, 25, 35, 36 and 25.
All five cover frames are the `_28` frame; `_32` was rejected on sight as the
transition frame.

## 2026-08-12_1409 nightly p1 - 16 processed

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 2231 | birth_date | (NULL) | 2000-04-08 | `تاريخ الميلاد` 2000 - 04 - 08 |
| 2241 | martyrdom_date | 2023-10-12 | 2023-12-10 | `تاريخ الشهادة` 2023 - 12 - 10 |
| 2243 | birth_date | (NULL) | 1995-11-04 | `تاريخ الميلاد` 1995 - 11 - 04 |
| 2223 | featured_frame_path | (unset) | data/frames/2223_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2225 | featured_frame_path | (unset) | data/frames/2225_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2227 | featured_frame_path | (unset) | data/frames/2227_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2229 | featured_frame_path | (unset) | data/frames/2229_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2231 | featured_frame_path | (unset) | data/frames/2231_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2233 | featured_frame_path | (unset) | data/frames/2233_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2235 | featured_frame_path | (unset) | data/frames/2235_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2237 | featured_frame_path | (unset) | data/frames/2237_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2239 | featured_frame_path | (unset) | data/frames/2239_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2241 | featured_frame_path | (unset) | data/frames/2241_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2243 | featured_frame_path | (unset) | data/frames/2243_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2245 | featured_frame_path | (unset) | data/frames/2245_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2247 | featured_frame_path | (unset) | data/frames/2247_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2249 | featured_frame_path | (unset) | data/frames/2249_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2251 | featured_frame_path | (unset) | data/frames/2251_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2253 | featured_frame_path | (unset) | data/frames/2253_28.jpg | clean full card: portrait, name, both dates, no title overlay |

**Needs human (0):** —

**Exact matches (13):** 2223, 2225, 2227, 2229, 2233, 2235, 2237, 2239, 2245, 2247, 2249, 2251, 2253

A clean batch: 13 of 16 rows matched the DB on both dates, and every card in the
run was the standard year-first layout, read on the `_30` frame and re-confirmed
on `_28`.

The one real correction is 2241 (إسماعيل عليان أحمد لظن). The card prints
`2023 - 12 - 10` against the DB's 2023-10-12 — a day/month swap where both tokens
are ≤ 12, so the middle-group-is-month rule alone would carry it. The poster was
pulled as a second source and settles it independently: it carries
`تاريخ الاستشهاد/ 10-12-2023` in its DD-MM-YYYY layout, i.e. 10 December 2023,
agreeing with the card. Birth on that row (2000-01-01) already matched.

The other two writes are unambiguous fills into NULL birth columns: 2231 at
`2000 - 04 - 08` and 2243 at `1995 - 11 - 04`. Both DB rows also had
`ocr_birth_date` NULL, so nothing was contradicted — the card is the only source
and it is legible in both frames.

Two cards print the birth month unpadded — 2235 reads `1999 - 9 - 23` and 2243
reads `1995 - 11 - 04` — which does not disturb the rule, since the month is still
the middle group and the day is still the outer group opposite the year.

Sanity passes across the batch: martyrdom dates run 2023-10-07 … 2025-10-28, all
inside 2023-10 … today+1month, and ages at martyrdom span 20 (2225) to 42 (2229).
All 16 cover frames are the `_28` frame; `_32` was rejected on sight as the
transition frame — 2241's `_32` was inspected directly and carries the animated
`أقمار الطوفان` title overlay across the portrait, as expected.

## 2026-08-14_1206 nightly p1 - 16 processed

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 2275 | birth_date | 1994-08-09 | 1994-09-08 | `تاريخ الميلاد` 1994 - 09 - 08 |
| 2277 | martyrdom_date | 2023-07-10 | 2023-10-07 | `تاريخ الشهادة` 2023 - 10 - 07 |
| 2279 | martyrdom_date | 2025-05-23 | 2025-05-28 | `تاريخ الشهادة` 2025 - 05 - 28 |
| 2257 | featured_frame_path | (unset) | data/frames/2257_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2259 | featured_frame_path | (unset) | data/frames/2259_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2261 | featured_frame_path | (unset) | data/frames/2261_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2263 | featured_frame_path | (unset) | data/frames/2263_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2265 | featured_frame_path | (unset) | data/frames/2265_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2267 | featured_frame_path | (unset) | data/frames/2267_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2269 | featured_frame_path | (unset) | data/frames/2269_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2271 | featured_frame_path | (unset) | data/frames/2271_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2273 | featured_frame_path | (unset) | data/frames/2273_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2275 | featured_frame_path | (unset) | data/frames/2275_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2277 | featured_frame_path | (unset) | data/frames/2277_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2279 | featured_frame_path | (unset) | data/frames/2279_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2281 | featured_frame_path | (unset) | data/frames/2281_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2283 | featured_frame_path | (unset) | data/frames/2283_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2285 | featured_frame_path | (unset) | data/frames/2285_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2287 | featured_frame_path | (unset) | data/frames/2287_28.jpg | clean full card: portrait, name, both dates, no title overlay |

**Needs human (0):** —

**Exact matches (13):** 2257, 2259, 2261, 2263, 2265, 2267, 2269, 2271, 2273, 2281, 2283, 2285, 2287

Every card in the run was the standard year-first layout, read on the `_30` frame
and re-confirmed on `_28`. Three rows needed a write.

2275 (أحمد جمال يوسف طافش) is a day/month swap on birth: the card prints
`1994 - 09 - 08` against the DB's 1994-08-09. Both tokens are ≤ 12, so the
middle-group-is-month rule is doing the work — the poster was pulled but carries
only `تاريخ الاستشهاد/ 17 - 07 - 2024`, no birth date, so it corroborates the
martyrdom (which already matched) and is silent on the birth. Both frames read
`09` in the middle group cleanly.

2277 (وليد علي سليمان عقل) is the clearest correction in the batch. The card
prints `2023 - 10 - 07` against the DB's 2023-07-10, and the DB value fails the
sanity floor outright — 2023-07-10 predates 2023-10. The poster settles it
independently: `تاريخ الاستشهاد/ 07 - 10 - 2023` in DD-MM-YYYY, i.e. 7 October
2023, agreeing with the card.

2279 (حسن علي أحمد المغاري) is not a swap but a misread day — card
`2025 - 05 - 28` against the DB's 2025-05-23, with the poster carrying
`28 - 05 - 2025` and confirming the 28. Month and year were never in dispute.

Sanity passes across the batch: martyrdom dates run 2023-10-07 … 2025-10-08, all
inside 2023-10 … today+1month, and ages at martyrdom span 23 (2257) to 46 (2259,
2281). All 16 cover frames are the `_28` frame; `_32` was rejected on sight as the
transition frame.

## 2026-08-15_1131 nightly p1 - 3 processed

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 2290 | featured_frame_path | (unset) | data/frames/2290_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2292 | featured_frame_path | (unset) | data/frames/2292_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2294 | featured_frame_path | (unset) | data/frames/2294_28.jpg | clean full card: portrait, name, both dates, no title overlay |

**Needs human (0):** —

**Exact matches (3):** 2290, 2292, 2294

No date changed in this run. All three are the standard year-first card layout,
read on the `_30` frame and re-confirmed on `_28`; both frames agreed digit for
digit in every case, and every reading matched the DB.

Two rows carried a fully-ambiguous group (both tokens ≤ 12) where the
middle-group-is-month rule is the only thing separating day from month, so the
posters were pulled to corroborate. 2290 (منتصر جمال حسونة) prints
`2024 - 11 -07` on the card; the poster carries
`تاريخ الاستشهاد/ 07-11-2024` in DD-MM-YYYY, i.e. 7 November 2024, agreeing.
2294 (معتصم فريد النجار) has the ambiguity on the *birth* line, `1993 - 02 - 12`
— the poster prints no birth date, so it is silent there, but its
`تاريخ الاستشهاد/ 27-12-2023` confirms the martyrdom independently. The DB
already held the middle-group reading in both cases, so nothing needed a write.

2292 (إبراهيم أشرف المدهون) was unambiguous on both lines — `1996 - 03 - 15` and
`2025 - 06 - 29`, each with an outer token > 12.

Sanity passes across the batch: martyrdom dates run 2023-12-27 … 2025-06-29, all
inside 2023-10 … today+1month, and ages at martyrdom are 34 (2290), 29 (2292) and
30 (2294). All three cover frames are the `_28` frame; `_32` was rejected on sight
as the transition frame.

## 2026-08-16_1553 nightly p1 - 14 processed

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 2310 | birth_date | 1993-09-05 | 1993-05-09 | `1993 - 05 - 09` (day/month swap) |
| 2316 | birth_date | 1997-09-12 | 1997-12-09 | `1997 - 12 - 09` (day/month swap) |
| 2318 | birth_date | 2004-02-06 | 2004-06-02 | `2004 - 06 - 02` (day/month swap) |
| 2324 | birth_date | 1998-05-03 | 1998-03-05 | `1998 - 03 - 05` (day/month swap) |
| 2298 | featured_frame_path | (unset) | data/frames/2298_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2300 | featured_frame_path | (unset) | data/frames/2300_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2302 | featured_frame_path | (unset) | data/frames/2302_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2304 | featured_frame_path | (unset) | data/frames/2304_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2306 | featured_frame_path | (unset) | data/frames/2306_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2310 | featured_frame_path | (unset) | data/frames/2310_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2312 | featured_frame_path | (unset) | data/frames/2312_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2314 | featured_frame_path | (unset) | data/frames/2314_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2316 | featured_frame_path | (unset) | data/frames/2316_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2318 | featured_frame_path | (unset) | data/frames/2318_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2320 | featured_frame_path | (unset) | data/frames/2320_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2322 | featured_frame_path | (unset) | data/frames/2322_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2324 | featured_frame_path | (unset) | data/frames/2324_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2326 | featured_frame_path | (unset) | data/frames/2326_28.jpg | clean full card: portrait, name, both dates, no title overlay |

**Needs human (0):** —

**Exact matches (10):** 2298, 2300, 2302, 2304, 2306, 2312, 2314, 2320, 2322, 2326

The heaviest correction run so far: four of fourteen rows carried a day/month
swap on the **birth** line, and every one of them was the same failure mode — a
fully-ambiguous group where both outer tokens are ≤ 12, so nothing but the
middle-group-is-month rule separates day from month, and the OCR had landed on
the wrong side. Every card is the standard year-first layout, read on the `_30`
frame and re-confirmed digit for digit on `_28`; the two frames agreed in all
fourteen cases, so no reading rested on a single look.

2310 (عبدالله صلاح الكحلوت) prints `1993 - 05 - 09` — 9 May 1993, against the DB's
1993-09-05. Its poster carries `تاريخ الاستشهاد/ 19-05-2024` in DD-MM-YYYY, which
confirms the martyrdom line independently but is silent on birth, as these
posters always are. 2316 (حسام نعمان سنان) reads `1997 - 12 - 09` vs the stored
1997-09-12; its poster prints the martyrdom as `2024-10-17`, again agreeing and
again carrying no birth date. 2318 (فاكر ثائر الزعانين) reads `2004 - 06 - 02` vs
2004-02-06, and 2324 (محمد جمعة البهبهاني) reads `1998 - 03 - 05` vs 1998-05-03.
No martyrdom date moved in this run, and no card contradicted its poster, so
nothing needed to be held back for the admin.

The ten matches were unambiguous or already correct. 2326 (إبراهيم موسى منصور)
and 2298 (أحمد سميح أبو هربيد) print their dates in the tight `1995-08-19` /
`2023-10-08` form rather than the spaced form, which reads the same way.

Sanity passes across the batch: martyrdom dates run 2023-10-08 … 2026-04-23, all
inside 2023-10 … today+1month, and ages at martyrdom span 21 (2318) to 35 (2302).
All 14 cover frames are the `_28` frame; `_32` was rejected on sight as the
transition frame.

## 2026-08-19_1538 nightly p1 - 31 processed

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 2346 | birth_date | 1989-03-08 | 1989-08-03 | `1989 - 08 - 03` (day/month swap) |
| 2377 | birth_date | 1994-10-03 | 1994-03-10 | `1994 - 03 - 10` (day/month swap) |
| 2391 | birth_date | 1996-06-11 | 1996-11-06 | `1996 - 11 - 06` (day/month swap) |
| 2393 | birth_date | (null) | 1994-01-09 | `1994 - 01 - 09` (filled from card) |
| 2328 | featured_frame_path | (unset) | data/frames/2328_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2334 | featured_frame_path | (unset) | data/frames/2334_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2336 | featured_frame_path | (unset) | data/frames/2336_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2338 | featured_frame_path | (unset) | data/frames/2338_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2340 | featured_frame_path | (unset) | data/frames/2340_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2342 | featured_frame_path | (unset) | data/frames/2342_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2344 | featured_frame_path | (unset) | data/frames/2344_28.jpg | clean full card; `_30` carried the animated title overlay |
| 2346 | featured_frame_path | (unset) | data/frames/2346_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2348 | featured_frame_path | (unset) | data/frames/2348_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2350 | featured_frame_path | (unset) | data/frames/2350_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2352 | featured_frame_path | (unset) | data/frames/2352_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2354 | featured_frame_path | (unset) | data/frames/2354_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2356 | featured_frame_path | (unset) | data/frames/2356_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2358 | featured_frame_path | (unset) | data/frames/2358_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2360 | featured_frame_path | (unset) | data/frames/2360_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2362 | featured_frame_path | (unset) | data/frames/2362_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2364 | featured_frame_path | (unset) | data/frames/2364_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2368 | featured_frame_path | (unset) | data/frames/2368_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2370 | featured_frame_path | (unset) | data/frames/2370_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2372 | featured_frame_path | (unset) | data/frames/2372_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2375 | featured_frame_path | (unset) | data/frames/2375_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2377 | featured_frame_path | (unset) | data/frames/2377_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2379 | featured_frame_path | (unset) | data/frames/2379_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2381 | featured_frame_path | (unset) | data/frames/2381_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2383 | featured_frame_path | (unset) | data/frames/2383_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2385 | featured_frame_path | (unset) | data/frames/2385_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2387 | featured_frame_path | (unset) | data/frames/2387_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2389 | featured_frame_path | (unset) | data/frames/2389_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2391 | featured_frame_path | (unset) | data/frames/2391_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2393 | featured_frame_path | (unset) | data/frames/2393_28.jpg | clean full card: portrait, name, both dates, no title overlay |
| 2395 | featured_frame_path | (unset) | data/frames/2395_28.jpg | clean full card: portrait, name, both dates, no title overlay |

**Needs human (0):** —

**Exact matches (27):** 2328, 2334, 2336, 2338, 2340, 2342, 2344, 2348, 2350,
2352, 2354, 2356, 2358, 2360, 2362, 2364, 2368, 2370, 2372, 2375, 2379, 2381,
2383, 2385, 2387, 2389, 2395

The largest batch to date — 31 rows — and the cleanest in proportion: 27 needed
no change at all, and every one of the four corrections landed on the **birth**
line. Not a single martyrdom date moved, and nothing had to be held back for the
admin. Every card is the standard year-first layout, read on `_30` and
re-confirmed digit for digit on `_28`; the two frames agreed on all 31 rows, so
no reading rested on a single look.

Three of the four changes are the familiar swap: a fully-ambiguous group where
both outer tokens are ≤ 12, so only the middle-group-is-month rule separates day
from month, and the stored value had landed on the wrong side. 2346
(علاء نصر جرغون) prints `1989 - 08 - 03` against the DB's 1989-03-08; 2377
(محمود جمال شاهين) prints `1994 - 03 - 10` against 1994-10-03; 2391
(أحمد أسامة اللهواني) prints `1996 - 11 - 06` against 1996-06-11. All three
posters were pulled to look for a second opinion and all three behaved as these
posters always do — they carry the martyrdom date and nothing else. 2391's is the
useful one: it prints `13 مايو - 2025` in words, which independently confirms
that the middle group is the month and the card's `2025 - 05 - 13` reads as
13 May. 2346's and 2377's posters likewise confirmed their martyrdom lines
(2023-11-07 and 2024-12-20) while staying silent on birth, so the three birth
corrections rest on the numeric rule alone — the same basis as the four swaps
fixed on 2026-08-16.

The fourth change is a fill rather than a fix: 2393 (محمود عبد الفتاح أبوشاويش)
had a null birth_date and the card prints `1994 - 01 - 09` plainly on both
frames.

Sanity passes across the batch: martyrdom dates run 2023-10-07 … 2025-10-07, all
inside 2023-10 … today+1month, and ages at martyrdom span 22 (2340,
أحمد سهيل أبو مسلم) to 49 (2334 and 2372). All 31 cover frames are the `_28`
frame. 2344 was the one row where the choice mattered visibly — its `_30` still
carried the animated title lettering across the portrait — which is why `_30` is
read and `_28` is taken as the cover, not the other way round.
