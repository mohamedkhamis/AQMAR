# scripts/setup_daily_trigger.ps1
#
# Registers a Windows Scheduled Task that runs phase3_daily.py every day.
# Time is read from DAILY_RUN_HOUR in .env (default 9).
#
# Run once after Phase 2 backfill completes. Idempotent — re-registers
# the task if it already exists. To remove:
#   Unregister-ScheduledTask -TaskName "AqmarTofan Daily Scrape" -Confirm:$false

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$venvPython  = Join-Path $projectRoot ".venv\Scripts\python.exe"
$script      = Join-Path $projectRoot "scripts\phase3_daily.py"
$logFile     = Join-Path $projectRoot "logs\daily_errors.log"
$taskName    = "AqmarTofan Daily Scrape"

if (-not (Test-Path $venvPython)) {
    Write-Error "Venv python not found at $venvPython. Run: python -m venv .venv first."
}
if (-not (Test-Path $script)) {
    Write-Error "Script not found at $script."
}

# Read DAILY_RUN_HOUR from .env (default 9)
$envFile = Join-Path $projectRoot ".env"
$hour = 9
if (Test-Path $envFile) {
    $line = (Get-Content $envFile | Where-Object { $_ -match "^DAILY_RUN_HOUR=" })
    if ($line) { $hour = [int]($line -replace "DAILY_RUN_HOUR=", "") }
}
$triggerTime = (Get-Date).Date.AddHours($hour)
if ($triggerTime -lt (Get-Date)) {
    # If the target hour has already passed today, the first run is tomorrow
    $triggerTime = $triggerTime.AddDays(1)
}

# The action launches PowerShell which cd's into the project, sets PYTHONIOENCODING
# for proper UTF-8 logging, runs the script, and redirects stderr to the log file.
$psArgs = "-NoProfile -WindowStyle Hidden -Command `"`$env:PYTHONIOENCODING='utf-8'; cd '$projectRoot'; & '$venvPython' -W ignore '$script' 2>> '$logFile'`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $psArgs -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $triggerTime
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Daily incremental scrape of @AqmarTofan channel" | Out-Null

Write-Host "Scheduled task '$taskName' created."
Write-Host "First run: $($triggerTime.ToString('yyyy-MM-dd HH:mm'))"
Write-Host "To remove: Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
