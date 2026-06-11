# scripts/ai_verify_daily.ps1
# Daily AI date-verification gap-filler.
#
# The daily scraper (phase3_daily) adds ~5-10 new martyrs per day; they land
# as ai_verified = 0. This script pulls the new pending rows and drives
# Claude Code headless (claude -p, uses the local subscription - no API key
# needed) through the same verify cycle used for the 2026-06-10 full run:
# read the card frames, compare birth/martyrdom with the DB, apply via
# scripts/ai_verify.py, and append a summary to docs/ai-verify-daily-log.md.
#
# Run manually:        .\scripts\ai_verify_daily.ps1
# Or schedule it after the daily scrape (Task Scheduler, same user account
# that is logged in to Claude Code).
#
# Exits 0 with "nothing to verify" when every pending row is already noted
# as needs-human (data/ai_batches/noted_ids.json).

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$env:PYTHONIOENCODING = "utf-8"

$py      = Join-Path $repo ".venv\Scripts\python.exe"
$stamp   = Get-Date -Format "yyyy-MM-dd_HHmm"
$logDir  = "data\ai_batches\daily_logs"
$results = "data\ai_batches\results_daily_$stamp.json"
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir "ai_verify_$stamp.log"

# 1. Pull pending rows and build the work list (excludes rows already noted
#    as needs-human; photo posts fall back to photo_path automatically).
& $py scripts\ai_verify.py pending --limit 100 --json data\ai_batches\pending_daily.json | Tee-Object -FilePath $log -Append
& $py data\ai_batches\_mk_args.py pending_daily.json args_daily.json | Tee-Object -FilePath $log -Append

$count = & $py -c "import json; print(len(json.load(open(r'data\ai_batches\args_daily.json',encoding='utf-8'))['rows']))"
if ([int]$count -eq 0) {
    "Nothing to verify - all pending rows are already noted as needs-human." | Tee-Object -FilePath $log -Append
    exit 0
}
"$count new row(s) to verify - launching headless Claude..." | Tee-Object -FilePath $log -Append

# 2. The verify prompt (same rules as the 2026-06-10 full run).
$prompt = @"
You are running the AQMAR daily AI date-verification cycle (repo: $repo).
The work list is data/ai_batches/args_daily.json (msg_id + frame image paths,
rows already noted as needs-human are excluded). Current DB values are in
data/ai_batches/pending_daily.json (birth_date / martyrdom_date per msg_id).

FOR EACH row in args_daily.json:
1. Read the MIDDLE frame image with the Read tool, then Read ONE other frame
   and confirm the digits agree (single-frame photo posts: zoom mentally,
   read carefully once).
2. Read the dates printed next to the yellow labels:
   - birth.....: "تاريخ الميلاد" / "تاريخ الولادة"
   - martyrdom.: "تاريخ الشهادة" / "تاريخ الاستشهاد"
   Numeric rule (validated on 550+ cards): the MONTH is ALWAYS the middle
   group; the DAY is the outer group on the OPPOSITE side from the 4-digit
   year. "03 - 10 - 1994" -> 1994-10-03; "1994 - 10 - 03" -> 1994-10-03.
   Month-name + year only (e.g. "مايو - 2025") -> day-15 convention
   (= yyyy-mm-15). A bare year is NOT a date.
3. Compare with the DB values and decide:
   - card matches DB              -> verified true, note "match (card: .. / ..)"
   - card differs from DB         -> fix to the card (include the date field in
                                     the result), note "fixed[ swap]: <field>
                                     old -> new (card: ..)"
   - DB NULL, card has a date     -> fill it, note "filled <field> from card .."
   - card has no <field>, DB NULL -> verified true, note "card has no <field> date"
   - card has no <field>, DB set  -> verified FALSE, note it (needs human)
   - no memorial card in any frame (ops video / speech / nasheed) ->
     verified FALSE, note "not a martyr post" (needs human)
   - the card ITSELF prints an impossible date -> verified FALSE, note it
4. SANITY before writing: martyrdom within 2023-10 .. today+1month; age 15-70.
   If a reading fails sanity, re-read the frame; if the card really prints it,
   verified FALSE. If you are unsure what a card says after re-reading, SKIP
   the row entirely (leave it pending for a manual session) - never guess.

THEN:
5. Write $results as
   {"results":[{"msg_id":N, "birth_date":"yyyy-mm-dd" (only when fixing/filling),
     "martyrdom_date":"yyyy-mm-dd" (only when fixing/filling),
     "verified":true|false, "note":"..." (<=255 chars, English, include the
     card reading)}]}  - one entry per PROCESSED row (skipped rows omitted).
6. Apply it:  .venv\Scripts\python.exe scripts\ai_verify.py apply $results
7. For every verified-FALSE row, add its msg_id to data/ai_batches/noted_ids.json
   (keep it a sorted JSON array) so tomorrow's run skips it.
8. Append one section to docs/ai-verify-daily-log.md:
   "## $stamp - N processed" plus a markdown table of every change
   (msg | field | was | now | card shows) and every needs-human row with its
   reason; list exact matches as a comma-separated msg_id line.
9. Verify: re-run pending and confirm it returns only noted msg_ids; state the
   final counts in your last message.

HARD RULES: touch ONLY birth_date/martyrdom_date via ai_verify.py apply -
never any other column or file outside data/ai_batches, docs/ai-verify-daily-log.md.
NEVER run git add/commit/push or any git state-changing command.
"@

# 3. Drive Claude Code headless. Tools are restricted: file tools plus ONLY
#    .venv python commands; git is explicitly disallowed on top of the prompt.
$prompt | claude -p --output-format text `
    --allowedTools "Read" "Write" "Edit" "Glob" "Grep" "Bash(.venv*)" `
    --disallowedTools "Bash(git*)" `
    2>&1 | Tee-Object -FilePath $log -Append

"--- daily run finished $(Get-Date -Format u) (log: $log)" | Tee-Object -FilePath $log -Append
