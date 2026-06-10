# Resume prompt — AI date verification full run

Copy everything inside the fence into a fresh Claude Code session opened in
`D:\Repo\01-Khamis-Projects\AQMAR` to continue the run. It is fully
self-contained.

```text
Continue the AQMAR AI date-verification run (the 2026-06-10 feature — the
50-row pilot is already applied and approved; you are processing the
remaining ~462 rows). Read these before starting:
- docs/superpowers/specs/2026-06-10-ai-verify-design.md  (the approved design)
- docs/ai-verify-report-2026-06-10.md                    (pilot results — your output format)
- scripts/ai_verify.py                                   (the batch CLI you will use)

WHAT EXISTS ALREADY (do not rebuild):
- dbo.martyrs has ai_verified BIT / ai_verified_at DATETIME2 / ai_note NVARCHAR(255).
- scripts/ai_verify.py works:
    .venv\Scripts\python.exe scripts\ai_verify.py pending --limit 60 --json data\ai_batches\pending_NNN.json
    .venv\Scripts\python.exe scripts\ai_verify.py apply data\ai_batches\results_NNN.json
- Admin portal at http://localhost:8082/webui/ shows AI counters/filter/column.
- Pilot covered msg_id 114–217. The DB flag itself is the checkpoint:
  `pending` only returns rows still needing work, so just keep pulling.

THE TASK — repeat this cycle until `pending` returns 0 rows:
1. Run `pending --limit 60 --json data\ai_batches\pending_NNN.json` (NNN = 002, 003, …).
2. For each row, Read its MIDDLE frame image (frame_paths[1], else [0]) with
   the Read tool. If the card is unreadable/missing, try the other frames;
   if still nothing, the row is not-verifiable (verified:false + note).
3. Read تاريخ الميلاد (birth) and تاريخ الشهادة (martyrdom) off the card and
   compare with the row's birth_date / martyrdom_date.
4. Write data\ai_batches\results_NNN.json:
   {"results": [{"msg_id": N, "birth_date": "yyyy-mm-dd" (only if fixing),
                 "martyrdom_date": "yyyy-mm-dd" (only if fixing),
                 "verified": true|false, "note": "..."}]}
5. Run `apply` on it. The helper rejects anything not strict yyyy-mm-dd and
   only ever writes the two date columns + the ai_* columns.
6. Append the cycle's corrections/fills/not-verifiable rows to
   docs/ai-verify-report-2026-06-10.md in the same table format as the pilot
   section, with a "## Cycle NNN" heading.

DATE-READING RULES (validated against human-verified ground truth, msg 23):
- The cards print dates with the MONTH ALWAYS THE MIDDLE group; the DAY is
  the outer group on the OPPOSITE side from the 4-digit year. This one rule
  handles both templates ("03 - 10 - 1994" = 1994-10-03, and ISO-style
  "1987-09-28" = 1987-09-28). Slash dates ("2025/05/14") follow the same rule.
- Month-name + year only (e.g. "فبراير - 2024", "مايو - 2024") → day-15
  convention: equals DB yyyy-mm-15 = match; DB NULL → fill yyyy-mm-15.
- Card date ≠ DB date → fix DB to the card (swaps, misread digits — note the
  old -> new and what the card shows).
- DB NULL + card shows a date → fill it.
- Card shows NO date for a field and DB is NULL too → still verified:true,
  note "card has no <field>".
- Card shows no date but DB HAS a value → verified:false, note it (human must decide).
- Sanity: martyrdom must be >= 2023-10-07 era (the war); birth must give a
  plausible age (15–70). If a reading violates this, re-read the frame before
  writing anything.

NOTE FORMAT (mirror the pilot, keep ≤255 chars, English, card reading included):
- "match (card: 27-04-1999 / 26-12-2023)"
- "fixed swap: birth 1994-03-10 -> 1994-10-03 (card: 03-10-1994); martyrdom matches 30-03-2024"
- "filled martyrdom from card 28-10-2023; birth matches card 15-02-1996"
- "frames unreadable" / "card has no birth date"

HARD CONSTRAINTS:
- Touch ONLY birth_date / martyrdom_date (+ the ai_* columns via the helper).
  NEVER touch verification_status, verified_*, ocr_*, names, or any other field.
- Human-verified and rejected rows are excluded automatically — don't process them.
- ABSOLUTE GIT RULE: no git add / commit / push at any point without my
  explicit approval. There is uncommitted work from 2026-06-10 in the tree —
  leave git alone entirely until I say otherwise.
- Batch size ~60; apply after each batch so progress survives interruption.

WHEN DONE (pending returns 0):
- Append final totals to the report (corrections / fills / matches /
  not-verifiable, plus the full not-verifiable list for human follow-up).
- Run: sqlcmd -S localhost -d aqmar -E -Q "SELECT ai_verified, COUNT(*) FROM dbo.martyrs GROUP BY ai_verified"
  and confirm the numbers match the portal at http://localhost:8082/webui/
  (refresh with cache bypass — IIS sends no cache-control).
- Summarize and ask "Ready to commit?" — do not commit yourself.
```
