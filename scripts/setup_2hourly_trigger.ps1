# scripts/setup_2hourly_trigger.ps1
#
# Registers a Windows Scheduled Task that runs phase3_daily.py every 2 hours.
# Replaces the once-a-day "AqmarTofan Daily Scrape" cadence for users who
# want near-realtime mirroring of the Telegram channel.
#
# Idempotent — re-running re-registers the task. To remove:
#   Unregister-ScheduledTask -TaskName "AqmarTofan 2-Hourly Scrape" -Confirm:$false
#
# Trigger model:
#   Daily at 00:00 + RepetitionInterval=2h + RepetitionDuration=1d
#   → fires at 00, 02, 04, 06, 08, 10, 12, 14, 16, 18, 20, 22 every day (12 runs/day)
#
# The phase3_daily.py script is itself idempotent — it only fetches messages
# newer than the last cursor in dbo.state, so running it 12 times/day is safe
# (most runs will be no-ops with "No new messages.")

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$venvPython  = Join-Path $projectRoot ".venv\Scripts\python.exe"
$script      = Join-Path $projectRoot "scripts\phase3_daily.py"
$logDir      = Join-Path $projectRoot "logs"
$logFile     = Join-Path $logDir   "scrape_2hourly.log"
$taskName    = "AqmarTofan 2-Hourly Scrape"

if (-not (Test-Path $venvPython)) {
    Write-Error "Venv python not found at $venvPython. Run: python -m venv .venv first."
}
if (-not (Test-Path $script)) {
    Write-Error "Script not found at $script."
}
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

# Strategy: generate a wrapper .bat file that runs phase3_daily.py with the
# right env + cwd, then point schtasks at the .bat. This sidesteps the triple-
# nested quoting hell of trying to embed a multi-line PowerShell command
# directly in /tr.
#
# Why schtasks.exe and not Register-ScheduledTask:
#   - Register-ScheduledTask + LogonType S4U needs UAC elevation
#   - schtasks /it (interactive only) doesn't, and survives reboot/sleep
#   - Task runs only when the user is logged in, which is fine for a
#     personal Windows machine
$wrapperBat = Join-Path $projectRoot "scripts\_run_phase3_silent.bat"

# Build the wrapper as a here-string so we don't fight PowerShell's quoting.
# - chcp 65001 sets the console codepage to UTF-8 so Python prints Arabic
#   cleanly to the log file (otherwise cp1252 crashes on row.name)
# - PYTHONIOENCODING is set as a belt-and-suspenders fallback for older PY
# - cd /d handles drive-changing cd (D: vs C:)
# - >> appends both stdout and stderr (2>&1 redirects err to out, then the
#   combined stream appends to the log)
$batContent = @"
@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "$projectRoot"
"$venvPython" -W ignore "$script" >> "$logFile" 2>&1
"@
Set-Content -Path $wrapperBat -Value $batContent -Encoding ASCII

# Delete any prior registration so we can re-run this script cleanly.
# Wrapped in `cmd /c` because PowerShell 5.1 treats schtasks's stderr (which
# fires when the task doesn't exist yet on first run) as a terminating error
# and halts the script.
& cmd /c "schtasks /delete /tn ""$taskName"" /f >nul 2>nul"

# /sc HOURLY /mo 2 = fire every 2 hours, indefinitely
# /st 00:00          = first fire of the day is at 00:00 (slots: 00,02,04,...,22)
# /it                = "interactive only" — runs only while user is logged in
#                       (avoids the stored-credential prompt that needs admin)
# /rl LIMITED        = limited (non-elevated) run level
# /tr "<path>"       = path to the wrapper .bat
& cmd /c "schtasks /create /tn ""$taskName"" /sc HOURLY /mo 2 /st 00:00 /it /rl LIMITED /tr ""$wrapperBat"" /f"

if ($LASTEXITCODE -ne 0) {
    Write-Error "schtasks failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "Scheduled task '$taskName' created."
Write-Host "  Cadence:    every 2 hours, 24/7 (12 runs per day)"
Write-Host "  Slots:      00, 02, 04, 06, 08, 10, 12, 14, 16, 18, 20, 22"
Write-Host "  Script:     $script"
Write-Host "  Log file:   $logFile"
Write-Host ""

# Show the resolved next-run time so the user can verify
$task = Get-ScheduledTask -TaskName $taskName
$info = Get-ScheduledTaskInfo -TaskName $taskName
Write-Host "  Next run:   $($info.NextRunTime)"
Write-Host "  Last run:   $(if ($info.LastRunTime.Year -gt 1) { $info.LastRunTime } else { 'never (just registered)' })"
Write-Host ""
Write-Host "Manual fire:    Start-ScheduledTask -TaskName '$taskName'"
Write-Host "Tail the log:   Get-Content '$logFile' -Wait -Tail 20"
Write-Host "Remove later:   Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
