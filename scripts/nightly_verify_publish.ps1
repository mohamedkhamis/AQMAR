# scripts/nightly_verify_publish.ps1
#
# The 22:30 nightly task: AI-verify pending rows (headless Claude, verify
# ONLY - git stays script-side), publish via publish_core.ps1 (local commit
# -> private backup push -> public site push), then email the summary
# (nightly_report.py: new people / stuck rows / errors only).
#
# Runs hidden via scripts\_run_nightly_silent.vbs (Task Scheduler), which
# redirects all output to logs\nightly_publish.log. Direct runs print to console.
#
# Usage: .\scripts\nightly_verify_publish.ps1 [-DryRun] [-SkipVerify]
#   -DryRun     verify runs; publish + email only print what they would do
#   -SkipVerify skip the Claude phase (publish + report only)

param(
    [switch]$DryRun,
    [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $repo
$env:PYTHONIOENCODING = "utf-8"
# PS 5.1's $OutputEncoding defaults to ASCII, which mangles the Arabic label
# names in the verify prompt to '?' when piped to the native `claude`. Force
# UTF-8 (no BOM) so the prompt reaches Claude intact.
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$py = Join-Path $repo ".venv\Scripts\python.exe"

New-Item -ItemType Directory -Force (Join-Path $repo "logs") | Out-Null
# NOTE: logging is handled by the scheduled wrapper (_run_nightly_silent.vbs
# runs `cmd /c powershell ... >> logs\nightly_publish.log 2>&1`), which
# captures native python/git output that Start-Transcript would silently drop
# in a hidden window. Direct/interactive runs print to the console.
Write-Host "=== AQMAR nightly run $(Get-Date -Format u) ==="

$lock = Join-Path $repo "logs\nightly_publish.lock"
$lockAcquired = $false   # only delete the lock WE created (never another run's)
$runStart = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$errors = @()          # each: "stage:detail" for nightly_report.py --error
$exitCode = 0

try {
    # ---------- Phase 0: guards ----------
    if (Test-Path $lock) {
        $age = (Get-Date) - (Get-Item $lock).LastWriteTime
        if ($age.TotalHours -lt 6) {
            Write-Host "Another nightly run appears active (lock age $([int]$age.TotalMinutes)m) - exiting."
            $exitCode = 1
            return
        }
        Write-Host "Stale lock ($([int]$age.TotalHours)h) - taking over."
    }
    $runStart | Set-Content $lock
    $lockAcquired = $true

    if (-not (Test-Path $py)) { throw "venv python missing: $py" }
    if (-not (Test-Path (Join-Path $repo ".env"))) { throw ".env missing" }

    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        throw "Index not clean (something already staged) - refusing to run."
    }

    & $py -c "from src.config import load_config; from src.sqlserver_client import make_conn; make_conn(load_config()).close(); print('DB OK')"
    if ($LASTEXITCODE -ne 0) { throw "DB connection check failed" }

    # Baseline BEFORE anything changes (publish_core rewrites it identically).
    cmd /c "git show HEAD:data/martyrs.json > logs\nightly_baseline.json 2>nul"

    # ---------- Phase 1: AI verify (headless Claude, verify only) ----------
    if (-not $SkipVerify) {
        $claudeOk = (Get-Command claude -ErrorAction SilentlyContinue)
        if (-not $claudeOk) {
            Write-Host "claude CLI not found - skipping verify phase."
            $errors += "verify:claude CLI not found on PATH"
        } else {
            $stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
            for ($pass = 1; $pass -le 3; $pass++) {
                $pendingJson = "data\ai_batches\pending_nightly.json"
                $argsJson    = "data\ai_batches\args_nightly.json"
                $results     = "data\ai_batches\results_nightly_${stamp}_p$pass.json"

                & $py scripts\ai_verify.py pending --limit 100 --json $pendingJson
                if ($LASTEXITCODE -ne 0) { $errors += "verify:pending pull failed (pass $pass)"; break }
                & $py scripts\ai_mk_args.py $pendingJson $argsJson
                if ($LASTEXITCODE -ne 0) { $errors += "verify:ai_mk_args failed (pass $pass)"; break }

                $count = & $py -c "import json; print(len(json.load(open(r'$argsJson',encoding='utf-8'))['rows']))"
                if ([int]$count -eq 0) {
                    Write-Host "Pass ${pass}: nothing verifiable left (only noted rows or empty queue)."
                    break
                }
                Write-Host "Pass ${pass}: $count row(s) - launching headless Claude..."

                $prompt = @"
You are running the AQMAR NIGHTLY AI date-verification cycle (repo: $repo).
Work list: $argsJson (msg_id + "frames" image paths + optional "photo";
rows already noted needs-human are excluded). Current DB values are in
$pendingJson (birth_date / martyrdom_date per msg_id).

FOR EACH row in the work list:
1. Read the MIDDLE frame image with the Read tool, then Read ONE other frame
   and confirm the digits agree (single-frame photo posts: read carefully once).
2. Read the dates printed next to the yellow labels:
   - birth.....: "تاريخ الميلاد" / "تاريخ الولادة"
   - martyrdom.: "تاريخ الشهادة" / "تاريخ الاستشهاد"
   Numeric rule (validated on 550+ cards): the MONTH is ALWAYS the middle
   group; the DAY is the outer group on the OPPOSITE side from the 4-digit
   year. "03 - 10 - 1994" -> 1994-10-03; "1994 - 10 - 03" -> 1994-10-03.
   The poster (photo) prints DD-MM-YYYY while the card prints YYYY-MM-DD -
   use the poster to break fully-ambiguous swaps where both tokens <= 12.
   A bare year is NOT a date.
3. Compare with the DB values and decide:
   - card matches DB              -> verified true, note "match (card: .. / ..)"
   - card differs from DB         -> fix to the card (include the date field in
                                     the result), note "fixed[ swap]: <field>
                                     old -> new (card: ..)"
   - DB NULL, card has a date     -> fill it, note "filled <field> from card .."
   - card has no <field>, DB NULL -> verified true, note "card has no <field> date"
   - card has no <field>, DB set  -> verified FALSE, note it (needs human)
   - card vs poster CONFLICT on a date        -> verified FALSE, note
     "conflict card .. vs poster .. (needs human)" - NEVER guess
   - month-name + year with NO day (e.g. "مايو - 2025") -> verified FALSE,
     note "day-less date on card: <what it prints> (needs human)" - the
     admin decides the day; do NOT invent day 15
   - no memorial card in any frame (ops video / speech / nasheed) ->
     verified FALSE, note "not a martyr post" (needs human)
   - the card ITSELF prints an impossible date -> verified FALSE, note it
4. COVER FRAME: for verified-true rows pick featured_frame_path = the
   sharpest fully-rendered frame showing the whole card (portrait + both
   dates + name clean, no animated title overlay). It is almost always the
   _28 frame; _32 is the transition frame. The value MUST be one of that
   row's own "frames" paths. Omit it if no frame qualifies.
5. SANITY before writing: martyrdom within 2023-10 .. today+1month; age 15-70.
   If a reading fails sanity, re-read; if the card really prints it,
   verified FALSE. If still unsure after re-reading, SKIP the row entirely.

THEN:
6. Write $results as {"results":[{"msg_id":N,
     "birth_date":"yyyy-mm-dd" (only when fixing/filling),
     "martyrdom_date":"yyyy-mm-dd" (only when fixing/filling),
     "verified":true|false,
     "featured_frame_path":"data/frames/..." (verified-true rows, when a
       clean frame exists),
     "note":"..." (<=255 chars, English, include the card reading)}]}
   - one entry per PROCESSED row (skipped rows omitted).
7. Apply it:  .venv\Scripts\python.exe scripts\ai_verify.py apply $results
8. For every verified-FALSE row, add its msg_id to
   data/ai_batches/noted_ids.json (keep it a sorted JSON array).
9. Append one section to docs/ai-verify-daily-log.md:
   "## $stamp nightly p$pass - N processed" plus a markdown table of every
   change (msg | field | was | now | card shows) and every needs-human row
   with its reason; list exact matches as one comma-separated msg_id line.

HARD RULES: touch ONLY birth_date/martyrdom_date/featured_frame_path via
scripts/ai_verify.py apply - never any other column or any file outside
data/ai_batches and docs/ai-verify-daily-log.md.
NEVER run git add/commit/push or any git state-changing command.
"@

                # Native claude call: relax Stop locally so claude writing
                # progress to stderr (merged by 2>&1) can't raise a terminating
                # NativeCommandError; capture the real exit code explicitly.
                # Output flows to stdout where the wrapper's cmd redirection logs it.
                $eap = $ErrorActionPreference
                $ErrorActionPreference = 'Continue'
                $prompt | claude -p --output-format text `
                    --dangerously-skip-permissions `
                    --disallowedTools "Bash(git*)" 2>&1
                $claudeExit = $LASTEXITCODE
                $ErrorActionPreference = $eap
                if ($claudeExit -ne 0) {
                    $errors += "verify:claude exited $claudeExit (pass $pass)"
                    break
                }
            }
        }
    }

    # ---------- Phase 2: publish (deterministic) ----------
    # Compose the spec's "nightly auto (X new, Y fixed)" note. A read-only
    # pre-check (no version consumed) gives both counts in one call; publish_core
    # re-checks internally for its own change decision.
    $noteText = "nightly auto"
    try {
        & $py scripts\publish_check.py --baseline logs\nightly_baseline.json `
            --since $runStart --json logs\precheck.json
        if ($LASTEXITCODE -eq 0 -and (Test-Path "logs\precheck.json")) {
            $pc = Get-Content "logs\precheck.json" -Raw -Encoding UTF8 | ConvertFrom-Json
            $noteText = "nightly auto ($($pc.new_count) new, $($pc.fixed_count) fixed)"
        }
    } catch { $errors += "publish:precheck failed: $($_.Exception.Message)" }

    # publish_core uses Write-Error under $ErrorActionPreference=Stop, which
    # propagates here as a terminating exception — catch it so a publish failure
    # is a reported phase error, not a bare fatal. It hands its result back via
    # logs\publish_result.json (NOT stdout — Write-Host isn't capturable and
    # 2>&1 would risk NativeCommandError on git stderr), so we do NOT pipe-capture.
    Remove-Item "logs\publish_result.json" -Force -ErrorAction SilentlyContinue
    # HASHTABLE splat (binds by NAME). Array splat @("-Note",..) binds
    # POSITIONALLY to a .ps1 in PS 5.1 — "-DryRun" would land in $Note and a
    # dry run would become a real publish. (Fixed in Task 9's scripts too.)
    $coreArgs = @{ Note = $noteText }
    if ($DryRun) { $coreArgs["DryRun"] = $true }
    try {
        & (Join-Path $PSScriptRoot "publish_core.ps1") @coreArgs
        if (-not (Test-Path "logs\publish_result.json")) {
            $errors += "publish:publish_core produced no result file"
            $exitCode = 2
        }
    } catch {
        $errors += "publish:$($_.Exception.Message)"
        $exitCode = 2
    }

    # ---------- Phase 3: report + email ----------
    $repArgs = @("scripts\nightly_report.py",
                 "--baseline", "logs\nightly_baseline.json",
                 "--run-start", $runStart,
                 "--json", "logs\nightly_report.json")
    foreach ($e in $errors) { $repArgs += @("--error", $e) }
    if ($DryRun) { $repArgs += "--dry-run" }
    & $py @repArgs
    if ($LASTEXITCODE -eq 3) {
        Write-Host "EMAIL SEND FAILED - see log."
        if ($exitCode -eq 0) { $exitCode = 3 }
    }

    if ($errors.Count -gt 0 -and $exitCode -eq 0) { $exitCode = 2 }
    Write-Host "Nightly run finished $(Get-Date -Format u) (exit $exitCode, errors: $($errors.Count))"
}
catch {
    Write-Host "FATAL: $($_.Exception.Message)"
    # best-effort error email (never throws the run further)
    try {
        & $py scripts\nightly_report.py --baseline logs\nightly_baseline.json `
            --run-start $runStart --error "fatal:$($_.Exception.Message)"
    } catch {}
    $exitCode = 1
}
finally {
    if ($lockAcquired -and (Test-Path $lock)) {
        Remove-Item $lock -Force -ErrorAction SilentlyContinue
    }
    exit $exitCode
}
