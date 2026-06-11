# AI date-verification report — 2026-06-10

AI (Claude Opus 4.8) read the OCR frames of unverified rows and checked
**birth date + martyrdom date** against what each memorial card actually
shows. Dates interpreted with the rule: *month = middle group, day = the
outer group opposite the 4-digit year* (handles both card templates:
`dd - mm - yyyy` and ISO-style `yyyy-mm-dd`). Convention validated against
human-verified rows (e.g. msg 23) before the run. Month-only cards use the
project's day-15 rule. Every change carries an `ai_note` audit entry in the
DB; original OCR text remains untouched in `ocr_*` columns.

## Pilot — batch 001 (msg 114 → 217, 50 rows) — applied 2026-06-10

**Totals: 26 exact matches · 11 corrections · 15 NULL fills · 0 unreadable**
(11 + 15 = 26 rows changed; 2 rows had both a fix and a fill)

### Corrections (DB value was wrong)

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 118 | birth | 1994-03-10 | **1994-10-03** | 03-10-1994 (swap) |
| 124 | birth | 1994-03-04 | **1994-04-03** | 03-04-1994 (swap) |
| 128 | birth | 1984-12-08 | **1984-08-12** | 12-08-1984 (swap) |
| 136 | birth | 1981-06-05 | **1981-05-06** | 06-05-1981 (swap) |
| 138 | martyrdom | 2025-10-06 | **2025-06-10** | 10-06-2025 (swap) |
| 146 | birth | 1986-05-11 | **1986-11-05** | 05-11-1986 (swap) |
| 158 | birth | 1992-07-08 | **1992-08-07** | 07-08-1992 (swap) |
| 172 | martyrdom | 2024-09-25 | **2024-09-26** | 26-09-2024 (day misread) |
| 184 | birth | 1931-01-21 | **1981-01-21** | 21-01-1981 (year misread 8→3) |
| 198 | birth | 2001-02-01 | **2001-01-02** | 02-01-2001 (swap) |
| 209 | birth | 1973-03-09 | **1973-09-03** | 03-09-1973 (swap) |

### NULL fills (DB had no date, card shows one)

| msg | field | filled with | card shows |
|---|---|---|---|
| 114 | martyrdom | 2023-10-28 | 28-10-2023 |
| 124 | martyrdom | 2023-10-15 | 15-10-2023 |
| 134 | martyrdom | 2025-07-13 | 13-07-2025 |
| 142 | martyrdom | 2024-06-05 | 05-06-2024 (OCR was garbage) |
| 168 | martyrdom | 2024-12-01 | 01-12-2024 |
| 170 | martyrdom | 2024-01-02 | 02-01-2024 (OCR was garbage) |
| 174 | martyrdom | 2026-01-08 | 08-01-2026 |
| 176 | martyrdom | 2023-11-09 | 09-11-2023 |
| 182 | martyrdom | 2023-10-07 | 07-10-2023 |
| 186 | martyrdom | 2023-11-07 | 07-11-2023 |
| 198 | martyrdom | 2025-05-03 | 03-05-2025 |
| 203 | martyrdom | 2023-10-08 | 08-10-2023 (OCR was '0') |
| 207 | birth | 1987-11-29 | 29-11-1987 (OCR was garbage) |
| 213 | martyrdom | 2024-08-21 | 21-08-2024 |
| 215 | martyrdom | 2023-11-16 | 16-11-2023 |

### Exact matches (no change, flag set)

116, 120, 122, 126, 140, 144, 148 (month-only → day-15), 150, 152, 154,
156, 160, 162, 164, 166, 178 (month-only → day-15), 180, 188, 190, 192,
194, 196, 200, 205, 211, 217.

### DB state after pilot

- `ai_verified = 1`: **50** · pending: **462**
- NULL martyrdom dates: 77 → **63** · NULL birth dates: 29 → **28**

## Cycle 002 (msg 219 → 293, 35 rows) — applied 2026-06-10

**Totals: 21 exact matches · 7 corrections · 8 NULL fills · 1 needs-human**
(13 rows changed; msg 260 had two fills, msg 293 had a fix and a fill.)
Full run upgraded to two independent blind card-readers per row; a row is
only auto-applied when both readings agree and pass sanity bounds.
25 rows of this pull (msg 287–340) hit a session limit mid-read and stay
pending for the next cycle.

### Corrections (DB value was wrong)

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 225 | martyrdom | 2025-07-15 | **2025-07-10** | 2025 - 07 - 10 (day misread) |
| 230 | birth | 1989-02-07 | **1989-07-02** | 1989 - 07 - 02 (swap) |
| 249 | birth | 1988-08-05 | **1988-05-08** | 1988 - 05 - 08 (swap) |
| 266 | martyrdom | 2024-10-09 | **2024-09-10** | 2024 - 09 - 10 (swap) |
| 274 | martyrdom | 2025-11-05 | **2025-05-11** | 2025 - 05 - 11 (swap) |
| 284 | birth | 1976-10-05 | **1976-05-10** | 1976 - 05 - 10 (swap) |
| 293 | birth | 1937-04-27 | **1987-04-27** | 27-04-1987 (year misread 9→3) |

### NULL fills (DB had no date, card shows one)

| msg | field | filled with | card shows |
|---|---|---|---|
| 245 | martyrdom | 2023-11-10 | 2023 - 11 - 10 (OCR was "10 11-") |
| 260 | birth | 1991-10-25 | 1991 - 10 - 25 (OCR was "1991") |
| 260 | martyrdom | 2023-11-01 | 2023 - 11 - 01 (OCR was "202") |
| 264 | birth | 2000-05-30 | 2000 - 05 - 30 (OCR was "05 2000") |
| 270 | birth | 1991-02-13 | 1991 - 02 - 13 |
| 280 | martyrdom | 2023-10-20 | 20 - 10 - 2023 (OCR was garbage) |
| 282 | martyrdom | 2023-10-07 | 2023 - 10 - 07 (OCR was garbage) |
| 293 | martyrdom | 2023-11-21 | 2023 - 11 - 21 |

### Not verifiable (needs human)

| msg | issue |
|---|---|
| 233 | card itself prints birth **1887**-09-24 (= DB; likely card typo for 1987 — man pictured ~30s). Card martyrdom 2023-10-09, DB NULL. Fill withheld so the admin decides both fields together. |

### Exact matches (no change, flag set)

219, 221, 223, 227, 229, 235, 237, 239, 241, 243, 247, 251, 253, 255,
258, 262, 268, 272, 276, 278, 289.

## Cycle 003 (msg 287 → 421, 59 rows) — applied 2026-06-10

**Totals: 26 exact matches · 17 corrections · 16 NULL fills · 2 needs-human**
(31 rows changed; msg 305 and 315 each had a fix + a fill.)

### Corrections (DB value was wrong)

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 301 | birth | 1992-07-04 | **1992-04-07** | 1992 - 04 - 07 (swap) |
| 305 | birth | 2002-03-05 | **2002-05-03** | 2002 - 05 - 03 (swap) |
| 315 | birth | 1984-02-04 | **1984-04-02** | 1984 - 04 - 02 (swap) |
| 336 | birth | 1991-05-03 | **1991-03-05** | 1991 - 03 - 05 (swap) |
| 342 | birth | 1997-09-11 | **1997-11-09** | 1997 - 11 - 09 (swap) |
| 344 | birth | 1977-07-06 | **1977-06-07** | 1977 - 06 - 07 (swap) |
| 348 | birth | 1993-01-03 | **1993-03-01** | 1993 - 03 - 01 (swap) |
| 352 | birth | 1990-02-03 | **1990-03-02** | 1990 - 03 - 02 (swap) |
| 358 | birth | 1989-06-10 | **1989-10-06** | 1989 - 10 - 06 (swap) |
| 366 | birth | 1984-12-05 | **1984-05-12** | 1984 - 05 - 12 (swap) |
| 370 | birth | 1990-01-05 | **1990-05-01** | 1990 - 05 - 01 (swap) |
| 379 | birth | 1998-04-07 | **1998-07-04** | 1998 - 07 - 04 (swap) |
| 396 | birth | 1990-02-07 | **1990-07-02** | 1990 - 07 - 02 (swap) |
| 390 | martyrdom | 2024-08-15 | **2024-08-27** | 2024 - 08 - 27 (day misread) |
| 407 | martyrdom | 2023-03-23 | **2024-03-23** | 2024-03-23 (year misread; old value was pre-war) |
| 409 | martyrdom | 2025-08-09 | **2025-09-08** | 2025-09-08 (swap) |
| 417 | martyrdom | 2023-06-15 | **2024-06-07** | 2024 - 06 - 07 (misread; old value was pre-war) |

### NULL fills (DB had no date, card shows one)

| msg | field | filled with | card shows |
|---|---|---|---|
| 287 | martyrdom | 2025-04-08 | 2025 - 04 - 08 |
| 295 | martyrdom | 2023-11-19 | 2023 - 11 - 19 |
| 299 | martyrdom | 2025-04-16 | 2025 - 04 - 16 |
| 303 | martyrdom | 2023-11-11 | 2023 - 11 - 11 |
| 305 | martyrdom | 2023-10-08 | 2023 - 10 - 08 |
| 315 | martyrdom | 2023-10-07 | 2023 - 10 - 07 |
| 319 | martyrdom | 2024-02-02 | 2024 - 02 - 02 |
| 321 | martyrdom | 2025-09-08 | 2025 - 09 - 08 |
| 324 | martyrdom | 2024-11-20 | 2024 - 11 - 20 |
| 328 | martyrdom | 2023-11-06 | 2023 - 11 - 06 |
| 332 | birth | 1984-11-24 | 1984 - 11 - 24 |
| 338 | birth | 1977-01-29 | 1977 - 01 - 29 |
| 346 | birth | 1988-09-12 | 1988 - 09 - 12 |
| 377 | martyrdom | 2024-05-23 | 2024 - 05 - 23 |
| 398 | birth | 1986-08-03 | 1986 - 08 - 03 |
| 405 | birth | 1988-04-06 | 1988 - 04 - 06 |

### Not verifiable (needs human)

| msg | issue |
|---|---|
| 380 | No memorial card in any frame — operations video (True Promise 4); both dates NULL. Likely not a martyr post; consider rejecting the row. |
| 386 | No memorial card in any frame — Qassam spokesman speech video (broadcast 05 Apr 2026); both dates NULL. Likely not a martyr post; consider rejecting the row. |

### Exact matches (no change, flag set)

291, 297, 307, 309, 311, 313, 317, 326, 330, 334, 340, 350, 354, 356,
360, 368, 372, 374, 382, 384, 394, 400, 411, 413, 415, 421.

## Cycle 004 (msg 423 → 546, 60 rows) — applied 2026-06-10

**Totals: 34 exact matches · 20 corrections · 10 NULL fills · 0 needs-human**
(26 rows changed; msg 445 and 528 each had two fixes, msg 497 and 501 a fix + a fill.)

### Corrections (DB value was wrong)

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 439 | birth | 1992-04-12 | **1992-12-04** | 1992 - 12 - 04 (swap) |
| 443 | martyrdom | 2026-09-02 | **2026-02-09** | 2026-02-09 (swap; old value was in the future) |
| 445 | birth | 2001-10-07 | **2001-07-10** | 2001 - 07 - 10 (swap) |
| 445 | martyrdom | 2024-12-30 | **2024-12-20** | 2024 - 12 - 20 (day misread) |
| 453 | martyrdom | 2024-04-12 | **2024-12-03** | 2024-12-03 (misread) |
| 463 | martyrdom | 2025-08-15 | **2025-08-20** | 2025 - 08 - 20 (day misread) |
| 465 | martyrdom | 2023-11-15 | **2023-11-23** | 2023 - 11 - 23 (day misread) |
| 469 | martyrdom | 2025-08-15 | **2025-08-28** | 2025 - 08 - 28 (day misread) |
| 473 | martyrdom | 2025-06-15 | **2025-06-08** | 2025 - 06 - 08 (day misread) |
| 479 | birth | 1992-08-02 | **1992-02-08** | 1992 - 02 - 08 (swap) |
| 489 | birth | 1985-11-09 | **1985-09-11** | 1985 - 09 - 11 (swap) |
| 497 | birth | 1993-05-03 | **1993-03-05** | 1993 - 03 - 05 (swap) |
| 501 | birth | 1986-07-03 | **1986-03-07** | 1986 - 03 - 07 (swap) |
| 518 | birth | 1995-06-12 | **1995-12-06** | 1995 - 12 - 06 (swap) |
| 520 | martyrdom | 2024-11-27 | **2024-11-07** | 2024 - 11 - 07 (day misread) |
| 522 | birth | 1983-07-06 | **1983-06-07** | 1983 - 06 - 07 (swap) |
| 528 | birth | 1990-04-02 | **1990-02-04** | 1990 - 02 - 04 (swap) |
| 528 | martyrdom | 2025-03-15 | **2025-03-04** | 2025 - 03 - 04 (day misread) |
| 532 | martyrdom | 2024-10-15 | **2024-10-17** | 2024 - 10 - 17 (day misread) |
| 542 | martyrdom | 2023-02-18 | **2023-10-07** | 2023 - 10 - 07 (misread; old value was pre-war) |

### NULL fills (DB had no date, card shows one)

| msg | field | filled with | card shows |
|---|---|---|---|
| 431 | martyrdom | 2023-10-28 | 2023 - 10 - 28 |
| 447 | martyrdom | 2023-11-25 | 2023 - 11 - 25 |
| 449 | birth | 1988-09-27 | 1988 - 09 - 27 |
| 467 | martyrdom | 2025-08-09 | 2025 - 08 - 09 |
| 471 | martyrdom | 2024-05-26 | 2024 - 05 - 26 |
| 477 | martyrdom | 2024-08-21 | 2024 - 08 - 21 |
| 497 | martyrdom | 2024-03-31 | 2024-03-31 |
| 501 | martyrdom | 2024-02-13 | 2024 - 02 - 13 |
| 514 | birth | 1972-04-27 | 1972 - 04 - 27 |
| 516 | martyrdom | 2025-01-17 | 2025 - 01 - 17 |

### Exact matches (no change, flag set)

423, 425, 427, 429, 433, 435, 437, 451, 455, 457, 459, 461, 475, 481,
483, 485, 487, 491, 493, 495, 499, 503, 508, 510, 512, 524, 526, 530,
534, 536, 538, 540, 544, 546.

## Cycle 005 (msg 548 → 669, 60 rows) — applied 2026-06-10

**Totals: 33 exact matches · 21 corrections · 7 NULL fills · 0 needs-human**
(27 rows changed; msg 661 had both dates fixed.)

### Corrections (DB value was wrong)

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 556 | birth | 2001-10-01 | **2001-01-10** | 2001 - 01 - 10 (swap) |
| 573 | birth | 1986-01-02 | **1986-02-01** | 1986 - 02 - 01 (swap) |
| 583 | martyrdom | 2025-07-21 | **2025-01-21** | 2025-01-21 (month misread) |
| 591 | martyrdom | 2025-08-09 | **2025-09-08** | 2025 - 09 - 08 (swap) |
| 597 | martyrdom | 2025-10-09 | **2025-09-10** | 2025 - 09 - 10 (swap) |
| 609 | martyrdom | 2024-07-15 | **2024-07-13** | 2024 - 07 - 13 (day misread) |
| 611 | martyrdom | 2025-06-15 | **2025-06-08** | 2025 - 06 - 08 (day misread) |
| 613 | martyrdom | 2024-08-15 | **2024-08-11** | 2024 - 08 - 11 (day misread) |
| 617 | martyrdom | 2023-11-15 | **2023-11-22** | 2023 - 11 - 22 (day misread) |
| 619 | martyrdom | 2025-03-15 | **2025-03-18** | 2025 - 03 - 18 (day misread) |
| 621 | martyrdom | 2025-03-15 | **2025-03-25** | 2025 - 03 - 25 (day misread) |
| 623 | birth | 1987-12-08 | **1987-08-12** | 1987 - 08 - 12 (swap) |
| 627 | birth | 1992-03-10 | **1992-10-03** | 1992 - 10 - 03 (swap) |
| 635 | birth | 1993-03-11 | **1993-11-03** | 03 - 11 - 1993 (swap) |
| 639 | birth | 1999-09-11 | **1999-11-09** | 1999 - 11 - 09 (swap) |
| 649 | birth | 1991-03-09 | **1991-09-03** | 1991 - 09 - 03 (swap) |
| 651 | martyrdom | 2024-12-12 | **2024-12-08** | 2024 - 12 - 08 (day misread) |
| 655 | birth | 2000-04-09 | **2000-09-04** | 2000 - 09 - 04 (swap) |
| 661 | birth | 1980-10-07 | **1980-07-10** | 1980 - 07 - 10 (swap) |
| 661 | martyrdom | 2023-07-10 | **2023-10-07** | 2023 - 10 - 07 (swap; old value was pre-war) |
| 663 | birth | 1979-02-05 | **1979-05-02** | 1979 - 05 - 02 (swap) |

### NULL fills (DB had no date, card shows one)

| msg | field | filled with | card shows |
|---|---|---|---|
| 552 | martyrdom | 2024-02-14 | 2024 - 02 - 14 |
| 575 | martyrdom | 2023-10-07 | 2023 - 10 - 07 |
| 577 | martyrdom | 2024-06-03 | 2024 - 06 - 03 |
| 579 | martyrdom | 2025-03-19 | 2025 - 03 - 19 |
| 606 | birth | 1988-12-21 | 1988 - 12 - 21 |
| 615 | martyrdom | 2024-05-29 | 2024 - 05 - 29 |
| 659 | martyrdom | 2024-01-06 | 2024 - 01 - 06 |

### Exact matches (no change, flag set)

548, 550, 554, 559, 561, 563, 565, 567, 569, 571, 581, 585, 587, 589,
593, 595, 599, 601, 604, 625, 629, 631, 633, 637, 641, 643, 645, 647,
653, 657, 665, 667, 669.

## Cycle 006 (msg 671 → 792, 60 rows) — applied 2026-06-10

**Totals: 36 exact matches · 19 corrections · 7 NULL fills · 2 needs-human**
(22 rows changed; msg 675/679/702 had two fixes each, msg 681 a fix + a fill.
msg 694 matched via the month-only day-15 convention: card "نوفمبر - 2024".)

### Corrections (DB value was wrong)

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 675 | birth | 1997-09-04 | **1997-04-09** | 09 - 04 - 1997 (swap) |
| 675 | martyrdom | 2023-10-15 | **2023-10-07** | 07 - 10 - 2023 (day misread) |
| 677 | birth | 1990-05-11 | **1990-11-05** | 1990 - 11 - 05 (swap) |
| 679 | birth | 1986-08-12 | **1986-12-08** | 1986 - 12 - 08 (swap) |
| 679 | martyrdom | 2024-06-15 | **2024-06-07** | 2024 - 06 - 07 (day misread) |
| 681 | birth | 1988-03-02 | **1988-02-03** | 1988 - 02 - 03 (swap) |
| 696 | birth | 1988-06-09 | **1988-09-06** | 1988 - 09 - 06 (swap) |
| 702 | birth | 1994-01-07 | **1994-07-01** | 1994 - 07 - 01 (swap) |
| 702 | martyrdom | 2025-12-07 | **2025-07-12** | 2025-07-12 (swap) |
| 706 | birth | 1994-05-03 | **1994-03-05** | 1994 - 03 - 05 (swap) |
| 714 | birth | 1995-12-01 | **1995-01-12** | 1995 - 01 - 12 (swap) |
| 716 | martyrdom | 2024-07-03 | **2024-03-07** | 2024 - 03 - 07 (swap) |
| 744 | martyrdom | 2024-06-15 | **2024-06-07** | 2024 - 06 - 07 (day misread) |
| 746 | birth | 1985-08-06 | **1985-06-08** | 1985 - 06 - 08 (swap) |
| 748 | birth | 1977-10-07 | **1977-07-10** | 1977 - 07 - 10 (swap) |
| 756 | martyrdom | 2024-06-15 | **2024-06-01** | 2024 - 06 - 01 (day misread) |
| 768 | birth | 1993-03-07 | **1993-07-03** | 1993 - 07 - 03 (swap) |
| 776 | martyrdom | 2025-07-05 | **2025-05-07** | 2025-05-07 (swap) |
| 778 | martyrdom | 2023-10-11 | **2023-11-10** | 2023-11-10 (swap) |

### NULL fills (DB had no date, card shows one)

| msg | field | filled with | card shows |
|---|---|---|---|
| 681 | martyrdom | 2024-05-29 | 2024 - 05 - 29 |
| 718 | birth | 1997-01-21 | 1997 - 01 - 21 |
| 732 | martyrdom | 2025-09-25 | 2025-09-25 |
| 742 | martyrdom | 2023-10-21 | 2023 - 10 - 21 |
| 750 | birth | 1983-05-19 | 1983 - 05 - 19 |
| 764 | martyrdom | 2025-05-23 | 2025 - 05 - 23 |
| 792 | martyrdom | 2024-07-22 | 2024 - 07 - 22 |

### Not verifiable (needs human)

| msg | issue |
|---|---|
| 710 | No memorial card in any frame — subtitled nasheed/anthem video; both dates NULL. Likely not a martyr post; consider rejecting the row. |
| 772 | Card itself prints martyrdom **2023**-01-10 (pre-war — card typo; DB already has 2024-01-10 with the same day/month). Birth matches card 1992-06-11. Human should confirm the year. |

### Exact matches (no change, flag set)

671, 673, 683, 685, 688, 690, 692, 694 (month-only → day-15), 698, 700,
704, 708, 712, 720, 722, 724, 726, 728, 734, 736, 738, 740, 752, 754,
758, 760, 762, 766, 770, 774, 780, 782, 784, 786, 788, 790.

## Cycle 007 (msg 794 → 876, 39 rows) — applied 2026-06-10

**Totals: 21 exact matches · 15 corrections · 5 NULL fills · 0 needs-human**
(18 rows changed; msg 832 had two fills, msg 850 a fill + a fix.)
21 rows of this pull (msg 858, 866, 878–915) hit a session limit mid-read
and stay pending for the next cycle.

### Corrections (DB value was wrong)

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 806 | martyrdom | 2023-10-15 | **2023-10-07** | 2023 - 10 - 07 (day misread) |
| 808 | birth | 1980-12-02 | **1980-02-12** | 1980 - 02 - 12 (swap) |
| 810 | martyrdom | 2024-05-15 | **2024-05-30** | 2024 - 05 - 30 (day misread) |
| 816 | martyrdom | 2025-09-15 | **2025-09-17** | 2025 - 09 - 17 (day misread) |
| 820 | birth | 1997-11-06 | **1997-06-11** | 1997 - 06 - 11 (swap) |
| 824 | birth | 1987-10-12 | **1987-12-10** | 1987 - 12 - 10 (swap) |
| 826 | birth | 1993-01-07 | **1993-07-01** | 1993 - 07 - 01 (swap) |
| 828 | birth | 1987-10-05 | **1987-05-10** | 1987 - 05 - 10 (swap) |
| 836 | birth | 1989-08-05 | **1989-05-08** | 1989 - 05 - 08 (swap) |
| 840 | birth | 1992-10-05 | **1992-05-10** | 1992 - 05 - 10 (swap) |
| 848 | birth | 1990-05-10 | **1990-10-05** | 1990 - 10 - 05 (swap) |
| 850 | martyrdom | 2023-12-03 | **2023-12-08** | 2023 - 12 - 08 (day misread) |
| 852 | birth | 1988-02-07 | **1988-07-02** | 1988 - 07 - 02 (swap) |
| 862 | birth | 1987-12-05 | **1987-05-12** | 1987 - 05 - 12 (swap) |
| 870 | birth | 1986-04-07 | **1986-07-04** | 1986 - 07 - 04 (swap) |

### NULL fills (DB had no date, card shows one)

| msg | field | filled with | card shows |
|---|---|---|---|
| 796 | martyrdom | 2024-01-09 | 2024 - 01 - 09 |
| 832 | birth | 1996-09-22 | 1996 - 09 - 22 |
| 832 | martyrdom | 2025-08-02 | 2025 - 08 - 02 |
| 850 | birth | 1991-03-11 | 1991 - 03 - 11 |
| 868 | martyrdom | 2023-12-06 | 2023 - 12 - 06 |

### Exact matches (no change, flag set)

794, 798, 800, 802, 804, 812, 814, 818, 822, 830, 834, 838, 842, 844,
846, 854, 856, 860, 864, 872, 876.

## Cycle 008 (msg 858 → 1022, 60 rows) — applied 2026-06-10

**Totals: 29 exact matches · 16 corrections · 11 NULL fills · 7 needs-human**
(24 rows changed; msg 891 had two fixes, msg 913 two fills, msg 982 a fix + a fill.
First photo-poster posts appear in this range: msg 926–938 are أقمار الطوفان
posters whose card prints only تاريخ الاستشهاد — no birth field exists, so
the DB birth (from the caption) cannot be image-verified.)

### Corrections (DB value was wrong)

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 884 | martyrdom | 2024-09-19 | **2025-09-19** | 2025 - 09 - 19 (year misread) |
| 891 | birth | 1989-05-03 | **1989-03-05** | 1989 - 03 - 05 (swap) |
| 891 | martyrdom | 2025-09-09 | **2025-05-09** | 2025 - 05 - 09 (month misread) |
| 901 | birth | 1999-01-08 | **1999-08-01** | 1999 - 08 - 01 (swap) |
| 905 | birth | 1991-12-03 | **1991-03-12** | 1991 - 03 - 12 (swap) |
| 924 | birth | 1962-01-08 | **1962-08-01** | 1962 - 08 - 01 (swap) |
| 949 | birth | 1993-07-07 | **1993-07-27** | 1993 - 07 - 27 (day misread) |
| 955 | birth | 1992-05-03 | **1992-03-05** | 1992 - 03 - 05 (swap) |
| 967 | martyrdom | 2024-10-04 | **2024-04-10** | 2024 - 04 - 10 (swap) |
| 976 | martyrdom | 2024-07-02 | **2024-02-07** | 2024 - 02 - 07 (swap) |
| 980 | martyrdom | 2023-10-15 | **2023-10-19** | 2023 - 10 - 19 (day misread) |
| 982 | birth | 1991-03-02 | **1991-02-03** | 1991 - 02 - 03 (swap) |
| 988 | birth | 1989-07-10 | **1989-10-07** | 1989 - 10 - 07 (swap) |
| 992 | birth | 1987-01-08 | **1987-08-01** | 1987 - 08 - 01 (swap) |
| 996 | martyrdom | 2025-08-09 | **2025-09-08** | 2025 - 09 - 08 (swap) |
| 1022 | birth | 1993-03-04 | **1993-04-03** | 1993 - 04 - 03 (swap) |

### NULL fills (DB had no date, card shows one)

| msg | field | filled with | card shows |
|---|---|---|---|
| 878 | martyrdom | 2023-10-07 | 2023 - 10 - 07 |
| 880 | martyrdom | 2024-05-24 | 2024 - 05 - 24 |
| 911 | birth | 1989-07-17 | 1989 - 07 - 17 |
| 913 | birth | 1983-05-13 | 1983 - 05 - 13 |
| 913 | martyrdom | 2023-11-13 | 2023 - 11 - 13 |
| 915 | birth | 1991-04-14 | 1991 - 04 - 14 |
| 961 | martyrdom | 2024-03-19 | 2024-03-19 |
| 982 | martyrdom | 2023-10-07 | 2023 - 10 - 07 |
| 1008 | martyrdom | 2025-07-19 | 2025 - 07 - 19 |
| 1012 | martyrdom | 2025-03-25 | 2025 - 03 - 25 |
| 1016 | martyrdom | 2024-07-03 | 2024 - 07 - 03 |

### Not verifiable (needs human)

| msg | issue |
|---|---|
| 926 | Poster shows only تاريخ الاستشهاد (15 مايو 2025, **matches** DB); no birth field on poster, DB birth 1995-07-21 from caption. |
| 928 | Poster shows only martyrdom (2023-12-05, **matches** DB); DB birth 1987-02-28 not on poster. |
| 930 | Poster shows only martyrdom (2023-12-31, **matches** DB); DB birth 1991-01-01 not on poster. |
| 932 | Poster shows only martyrdom (2025-10-03, **matches** DB); DB birth 1998-08-07 not on poster. |
| 934 | Poster shows only martyrdom — and it **differs**: card 2025-04-28 vs DB 2025-04-02. DB birth 1994-04-21 not on poster. |
| 936 | Poster shows only martyrdom (2023-12-01, **matches** DB); DB birth 1995-02-01 not on poster. |
| 938 | Poster shows only martyrdom (2025-09-25, **matches** DB); DB birth 1993-08-13 not on poster. |

### Exact matches (no change, flag set)

858, 866, 882, 887, 889, 893, 895, 897, 899, 903, 907, 909, 947, 951,
957, 959, 965, 969, 971, 978, 984, 986, 990, 994, 998, 1006, 1014,
1018, 1020.

## Cycle 009 (msg 1024 → 1194, 68 rows) — applied 2026-06-10

**Totals: 38 exact matches · 22 corrections · 13 NULL fills · 1 needs-human**
(29 rows changed; msg 1075/1109/1122 had two fixes each, msg 1071 a fix + a fill,
msg 1105/1172 two fills each.)

### Corrections (DB value was wrong)

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 1039 | birth | 1986-08-09 | **1986-09-08** | 1986 - 09 - 08 (swap) |
| 1069 | martyrdom | 2023-10-15 | **2023-10-30** | 2023 - 10 - 30 (day misread) |
| 1071 | birth | 1978-07-12 | **1978-12-07** | 1978 - 12 - 07 (swap) |
| 1075 | birth | 1985-11-06 | **1985-06-11** | 1985 - 06 - 11 (swap) |
| 1075 | martyrdom | 2024-08-15 | **2024-08-21** | 2024 - 08 - 21 (day misread) |
| 1085 | birth | 1996-10-08 | **1996-08-10** | 1996 - 08 - 10 (swap) |
| 1109 | birth | 1984-10-06 | **1984-06-10** | 1984 - 06 - 10 (swap) |
| 1109 | martyrdom | 2025-03-15 | **2025-03-23** | 2025 - 03 - 23 (day misread) |
| 1117 | birth | 1988-03-08 | **1988-08-03** | 1988 - 08 - 03 (swap) |
| 1122 | birth | 1991-11-03 | **1991-03-11** | 1991 - 03 - 11 (swap) |
| 1122 | martyrdom | 2023-07-10 | **2023-10-07** | 2023 - 10 - 07 (swap; old value was pre-war) |
| 1130 | martyrdom | 2023-01-12 | **2023-12-01** | 2023 - 12 - 01 (swap; old value was pre-war) |
| 1134 | martyrdom | 2024-01-12 | **2024-12-01** | 2024 - 12 - 01 (swap) |
| 1136 | martyrdom | 2025-01-09 | **2025-09-01** | 2025 - 09 - 01 (swap) |
| 1144 | birth | 1986-09-01 | **1986-01-09** | 1986 - 01 - 09 (swap) |
| 1148 | martyrdom | 2023-07-10 | **2023-10-07** | 2023 - 10 - 07 (swap; old value was pre-war) |
| 1150 | martyrdom | 2023-10-15 | **2023-10-29** | 2023 - 10 - 29 (day misread) |
| 1152 | birth | 1996-03-11 | **1996-11-03** | 1996 - 11 - 03 (swap) |
| 1156 | martyrdom | 2024-07-15 | **2024-07-06** | 2024 - 07 - 06 (day misread) |
| 1160 | martyrdom | 2024-07-15 | **2024-07-01** | 2024 - 07 - 01 (day misread) |
| 1162 | martyrdom | 2025-03-04 | **2025-04-03** | 2025 - 04 - 03 (swap) |
| 1166 | birth | 1992-03-10 | **1992-10-08** | 1992 - 10 - 08 (misread) |

### NULL fills (DB had no date, card shows one)

| msg | field | filled with | card shows |
|---|---|---|---|
| 1033 | martyrdom | 2025-08-20 | 2025-08-20 |
| 1045 | martyrdom | 2023-11-04 | 2023 - 11 - 04 |
| 1047 | martyrdom | 2025-03-18 | 2025 - 03 - 18 |
| 1071 | martyrdom | 2024-08-21 | 2024 - 08 - 21 |
| 1097 | martyrdom | 2023-11-16 | 2023 - 11 - 16 |
| 1099 | martyrdom | 2023-10-07 | 2023 - 10 - 07 |
| 1105 | birth | 1993-08-17 | 1993 - 08 - 17 |
| 1105 | martyrdom | 2025-05-30 | 2025 - 5 - 30 |
| 1168 | martyrdom | 2024-05-24 | 2024 - 05 - 24 |
| 1172 | birth | 1989-02-14 | 1989 - 02 - 14 |
| 1172 | martyrdom | 2024-09-26 | 2024 - 09 - 26 |
| 1180 | birth | 1986-01-27 | 1986-01-27 |
| 1186 | martyrdom | 2025-05-28 | 2025 - 05 - 28 |

### Not verifiable (needs human)

| msg | issue |
|---|---|
| 1125 | No memorial card — Qassam spokesman speech still (02 Jun 2026) with two martyr portraits, no date fields. Row has no name and both dates NULL. Likely not a martyr post; consider rejecting the row. |

### Exact matches (no change, flag set)

1024, 1035, 1037, 1041, 1049, 1051, 1067, 1073, 1077, 1079, 1081, 1083,
1087, 1089, 1091, 1101, 1103, 1107, 1113, 1115, 1119, 1128, 1132, 1138,
1140, 1142, 1154, 1158, 1164, 1170, 1174, 1176, 1178, 1182, 1184, 1190,
1192, 1194.

## Cycle 010 (msg 1196 → 1250, 27 rows) — applied 2026-06-10

**Totals: 19 exact matches · 8 corrections · 1 NULL fill · 1 needs-human**
(8 rows changed; msg 1242 had two fixes. msg 1250 was scraped mid-run by the
daily job and was read directly by the orchestrator from two frames.
msg 1198 is a photo-poster with martyrdom only — it matched because the DB
birth is NULL too, so nothing on the card was contradicted.)

### Corrections (DB value was wrong)

| msg | field | was | now | card shows |
|---|---|---|---|---|
| 1202 | birth | 1997-09-07 | **1997-07-09** | 1997 - 07 - 09 (swap) |
| 1224 | martyrdom | 2024-01-09 | **2024-09-01** | 2024 - 09 - 01 (swap) |
| 1226 | birth | 1988-06-01 | **1988-01-06** | 1988 - 01 - 06 (swap) |
| 1234 | martyrdom | 2024-06-15 | **2024-06-07** | 2024 - 06 - 07 (day misread) |
| 1242 | birth | 1989-11-05 | **1989-05-11** | 1989 - 05 - 11 (swap) |
| 1242 | martyrdom | 2023-06-15 | **2024-06-07** | 2024 - 06 - 07 (misread; old value was pre-war) |
| 1244 | birth | 1989-03-10 | **1989-10-03** | 1989 - 10 - 03 (swap) |
| 1246 | martyrdom | 2025-07-15 | **2025-07-04** | 2025 - 07 - 04 (day misread) |

### NULL fills (DB had no date, card shows one)

| msg | field | filled with | card shows |
|---|---|---|---|
| 1250 | martyrdom | 2025-04-19 | 2025 - 04 - 19 (OCR was "207-") |

### Not verifiable (needs human)

| msg | issue |
|---|---|
| 1200 | No frames and no photo were extracted for this msg (name محمد أسعد عابدين present, both dates NULL). Nothing to read — needs re-scrape or manual entry. |

### Exact matches (no change, flag set)

1196, 1198 (poster: martyrdom only, no birth on card or in DB), 1204, 1206,
1208, 1210, 1212, 1214, 1216, 1218, 1220, 1222, 1228, 1230, 1232, 1236,
1240, 1248.

---

## Final totals — full run complete 2026-06-10

`pending` now returns **only** the 14 needs-human rows below; every other
unverified row carries `ai_verified = 1`.

### Whole AI run (pilot + cycles 002–010 + msg 1250)

| | rows |
|---|---|
| AI-verified (`ai_verified = 1`) | **504** |
| — exact matches | 282 |
| — rows changed (fix and/or fill) | 222 |
| Field-level corrections (DB was wrong) | **156** |
| Field-level NULL fills | **93** |
| Needs-human (noted, `ai_verified = 0`) | **14** |

Correction patterns: the overwhelming majority were day↔month swaps from the
OCR pipeline; the rest were day misreads (many OCR'd as day-15), six year
misreads, and ten old values that were impossible (pre-war or future) and now
match the cards.

### DB state after the run (`SELECT ai_verified, COUNT(*) … GROUP BY`)

```
ai_verified 0:  69   (= 54 human-verified + 1 rejected + 14 needs-human)
ai_verified 1: 504
total        : 573   (daily scrape added rows during the run, incl. msg 1250)
```

NULL dates: birth 29 → **7**, martyrdom 77 → **7** (since before the pilot).
Every remaining NULL belongs to a needs-human row, the rejected row (1062),
or msg 1198 whose poster genuinely prints no birth date.

### Needs-human list (full, for follow-up)

| msg | reason |
|---|---|
| 233 | Card itself prints birth **1887**-09-24 (= DB; likely card typo for 1987). Card martyrdom 2023-10-09, DB NULL — fill withheld. |
| 380 | Not a martyr post — operations video (True Promise 4); both dates NULL. Consider rejecting. |
| 386 | Not a martyr post — Qassam spokesman speech (05 Apr 2026); both dates NULL. Consider rejecting. |
| 710 | Not a martyr post — subtitled nasheed/anthem video; both dates NULL. Consider rejecting. |
| 772 | Card prints martyrdom **2023**-01-10 (pre-war card typo; DB already has 2024-01-10, same day/month). Confirm year. |
| 926 | Poster shows only martyrdom (15 مايو 2025, matches DB); DB birth 1995-07-21 not on poster. |
| 928 | Poster shows only martyrdom (2023-12-05, matches DB); DB birth 1987-02-28 not on poster. |
| 930 | Poster shows only martyrdom (2023-12-31, matches DB); DB birth 1991-01-01 not on poster. |
| 932 | Poster shows only martyrdom (2025-10-03, matches DB); DB birth 1998-08-07 not on poster. |
| 934 | Poster martyrdom **differs**: card 2025-04-28 vs DB 2025-04-02. DB birth 1994-04-21 not on poster. |
| 936 | Poster shows only martyrdom (2023-12-01, matches DB); DB birth 1995-02-01 not on poster. |
| 938 | Poster shows only martyrdom (2025-09-25, matches DB); DB birth 1993-08-13 not on poster. |
| 1125 | Not a martyr post — spokesman speech still (02 Jun 2026); row has no name, both dates NULL. Consider rejecting. |
| 1200 | No frames/photo extracted; nothing to read. Re-scrape or manual entry. |

## Cycle 011 — cross-check of the 54 human-verified rows (applied 2026-06-10)

At the user's request the AI also cross-checked the 54 human-verified rows so
the `ai_verified` flag covers every checkable row ("fill the gap"). Mode:
**flag-only** — the AI never edits dates on human-verified rows; agreement
sets `ai_verified = 1` with a `cross-check:` note, disagreement is a
note-only flag for the human.

**Result: 53 of 54 confirmed · 1 disagreement flagged**

| msg | finding |
|---|---|
| 98 | Card prints birth **1992-06-02** but the human-verified DB has **1992-02-06** (day/month swap that slipped through review). Martyrdom matches. Dates left untouched — note flags it for re-check via the edit form. |
| 29 | Confirmed incl. pre-war martyrdom: card itself prints يونيو - 2023 (June 2023, month-only = DB's 2023-06-15). |
| 940, 942 | Posters print only the martyrdom date (both match); the human-verified births came from the captions and are unchallenged by the card. |

### DB state after the cross-check

```
ai_verified 1: 557
ai_verified 0:  16  (= 14 needs-human + 1 rejected + msg 98 disagreement)
```

Every row with `ai_verified = 0` (except the rejected row) carries an
`ai_note` explaining exactly why, so the portal's بانتظار filter is the
complete human worklist.

### Method note (full run)

The full run upgraded the pilot's single-reader procedure: every row was read
by **two independent blind readers** (subagents that saw only the frame
images, never the DB values), a row auto-applied only when both readings
agreed on both dates and passed sanity bounds (martyrdom within the war era,
age 15–70), and every disagreement, low-confidence reading, sanity violation
and terminal needs-human judgment was re-read by the orchestrator directly.
Results files: `data/ai_batches/results_002 … results_011.json`.

## Update 2026-06-11 — needs-human list movement + msg 1200 resolved

Admin deleted 5 rows from the DB: the rejected row (1062) and the four
"consider rejecting / unfixable" entries **380, 386, 710, 1125**.

**msg 1200 is resolved**: a full re-scrape (`scripts/reprocess.py --msg-id
1200 --update`) recovered its frames, photo and OCR fields, and the card was
then AI-verified — birth 1976-07-20 / martyrdom 2023-12-08, both matching the
fresh OCR (`results_photo_recovery_2026-06-11.json`). Removed from
`noted_ids.json`. The new daily row 1252 was verified in the same pass.

Remaining needs-human (9): **233, 772, 926, 928, 930, 932, 934, 936, 938** —
the two card-typo confirmations and the seven martyrdom-only posters with
unconfirmable births.

```
ai_verified 1: 559
ai_verified 0:  10  (= 9 needs-human + msg 98 disagreement)
total        : 569
```

Side observation from the photo-recovery pass (2026-06-11): for msg 1035 the
portrait *poster* prints martyrdom 22-12-2023 while the video card prints
25-12-2023 (= DB, AI-verified). Cards remain the canonical date source; noted
here in case the admin ever wants to chase the 3-day discrepancy.
