# deploy/vps/01_prerequisites.ps1
#
# Read-only check that the VPS has everything the AQMAR migration needs.
# Prints a PASS/MISSING line per item and exits non-zero if anything is
# missing, so you can gate the rest of the runbook on it. Changes nothing.
#
# Run (elevated not required to check, but recommended):
#   .\deploy\vps\01_prerequisites.ps1

$ErrorActionPreference = "Continue"
$repo = (Resolve-Path "$PSScriptRoot\..\..").Path
$missing = 0

function Check($label, [bool]$ok, $hint) {
    if ($ok) {
        Write-Host ("  [PASS] {0}" -f $label) -ForegroundColor Green
    } else {
        Write-Host ("  [MISS] {0}" -f $label) -ForegroundColor Red
        if ($hint) { Write-Host ("         -> {0}" -f $hint) -ForegroundColor DarkYellow }
        $script:missing++
    }
}
function HasCmd($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }

Write-Host ""
Write-Host "=== AQMAR VPS prerequisites ===" -ForegroundColor Cyan
Write-Host "Repo: $repo"
Write-Host ""

# --- runtimes on PATH ---
Check "Python on PATH"      (HasCmd "python")  "Install Python 3.11+ (64-bit), tick 'Add to PATH'"
Check "git on PATH"         (HasCmd "git")     "Install Git for Windows; configure push creds for GitHub"
Check "ffmpeg on PATH"      (HasCmd "ffmpeg")  "Install ffmpeg and add its bin\ to PATH"
Check "sqlcmd on PATH"      (HasCmd "sqlcmd")  "Install SQL Server command-line tools (mssql-tools)"
Check "claude CLI on PATH"  (HasCmd "claude")  "Install + 'claude' once to log in (nightly AI verify). Optional."

# --- ODBC Driver 17 for SQL Server ---
$odbc = $false
try {
    $odbc = @(Get-OdbcDriver -ErrorAction Stop |
              Where-Object { $_.Name -like "ODBC Driver 17*SQL Server*" }).Count -gt 0
} catch {
    # Get-OdbcDriver missing on some cores; fall back to the registry.
    $odbc = Test-Path "HKLM:\SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 17 for SQL Server"
}
Check "ODBC Driver 17 for SQL Server" $odbc "Download the MSI from Microsoft and install"

# --- IIS + HttpPlatformHandler ---
# Get-WindowsFeature is Server-only; on client Windows fall back to the W3SVC
# service, so this doesn't false-alarm when IIS is present via optional features.
$iis = $false
try { $iis = (Get-WindowsFeature -Name Web-Server -ErrorAction Stop).Installed }
catch { $iis = [bool](Get-Service -Name W3SVC -ErrorAction SilentlyContinue) }
Check "IIS (Web-Server / W3SVC)" $iis "Install-WindowsFeature Web-Server, Web-Mgmt-Console"

$hp = Test-Path "$env:windir\System32\inetsrv\httpPlatformHandler.dll"
Check "HttpPlatformHandler module" $hp "Install from iis.net/downloads/microsoft/httpplatformhandler"

$appcmd = Test-Path "$env:windir\System32\inetsrv\appcmd.exe"
Check "appcmd.exe (IIS mgmt)" $appcmd "Comes with the IIS role; install IIS first"

# --- SQL Server reachable via Windows auth on localhost ---
$sql = $false
if (HasCmd "sqlcmd") {
    & sqlcmd -E -S localhost -b -Q "SELECT 1" *> $null
    $sql = ($LASTEXITCODE -eq 0)
}
Check "SQL Server localhost (Windows auth)" $sql "Install SQL Server (Express OK) with a default instance"

# --- project bits ---
Check ".env present"          (Test-Path "$repo\.env")          "Copy your local .env here (gitignored)"
Check "requirements.txt"      (Test-Path "$repo\requirements.txt") $null
Check "Telegram session dir"  ((Test-Path "$repo\session") -or (@(Get-ChildItem "$repo\*.session" -ErrorAction SilentlyContinue).Count -gt 0)) "Copy your local session/ (authenticated Telegram login)"

Write-Host ""
if ($missing -eq 0) {
    Write-Host "All prerequisites satisfied." -ForegroundColor Green
    exit 0
} else {
    Write-Host "$missing missing item(s). Fix the [MISS] lines above, then re-run." -ForegroundColor Red
    exit 1
}
