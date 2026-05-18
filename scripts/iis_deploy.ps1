# scripts/iis_deploy.ps1
#
# One-shot IIS site setup for the AQMAR admin portal.
#
# What it does (idempotent — safe to re-run):
#   1. Creates the AqmarAdmin app pool (No Managed Code, ApplicationPoolIdentity,
#      idle timeout disabled so the Python process doesn't recycle on idle).
#   2. Grants the app pool identity ('IIS APPPOOL\AqmarAdmin'):
#        - Read+Execute on the project root
#        - Full Control on logs\ and data\
#   3. Creates the AqmarAdmin IIS site on port 8082 pointing at the project root.
#   4. Creates a SQL Server login for the app pool identity + grants db_owner
#      on the aqmar database.
#   5. Restarts IIS so the new app pool + virtual account become live.
#   6. Starts the site and prints final status.
#
# Prerequisites:
#   - HttpPlatformHandler module installed (from https://www.iis.net/downloads)
#   - web.config at the project root pointing httpPlatform at .venv\Scripts\python.exe
#   - SQL Server running on localhost with the aqmar database created
#
# Usage:
#   .\scripts\iis_deploy.ps1
#   # (UAC prompt — accept; admin needed for IIS + SQL Server logins)

$logPath = "$env:TEMP\aqmar_iis_deploy.log"
function Log($msg) {
    $line = "$(Get-Date -Format 'HH:mm:ss')  $msg"
    Write-Host $line
    Add-Content -Path $logPath -Value $line -Encoding UTF8
}
"" | Out-File $logPath -Encoding UTF8
Log "=== AQMAR IIS deploy ==="
Log "User: $(whoami)"

# Detect elevated; relaunch if not (so user can double-click the .ps1)
$isElevated = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent() `
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isElevated) {
    Write-Host "Re-launching elevated (UAC prompt — click Yes)..."
    Start-Process powershell.exe -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-File", "`"$PSCommandPath`""
    ) -Verb RunAs -Wait
    exit
}

$ErrorActionPreference = "Continue"

$siteName  = "AqmarAdmin"
$poolName  = "AqmarAdmin"
$sitePath  = (Resolve-Path "$PSScriptRoot\..").Path
$sitePort  = 8082
$poolUser  = "IIS APPPOOL\$poolName"
$appcmd    = "$env:windir\System32\inetsrv\appcmd.exe"

Log "Site name:  $siteName"
Log "Pool name:  $poolName  (Identity: $poolUser)"
Log "Site path:  $sitePath"
Log "Site port:  $sitePort"

# ---------------------------------------------------------------------------
# Sanity check: HttpPlatformHandler must be installed
# ---------------------------------------------------------------------------
$hpDll = "$env:windir\System32\inetsrv\httpPlatformHandler.dll"
if (-not (Test-Path $hpDll)) {
    Log "FATAL: HttpPlatformHandler not installed at $hpDll"
    Log "  Download + install from https://www.iis.net/downloads/microsoft/httpplatformhandler"
    exit 1
}
Log "HttpPlatformHandler: present ($((Get-Item $hpDll).Length) bytes)"

if (-not (Test-Path "$sitePath\web.config")) {
    Log "FATAL: $sitePath\web.config not found — IIS won't know how to spawn Python"
    exit 1
}
Log "web.config: present at $sitePath\web.config"

# ---------------------------------------------------------------------------
# 1. App pool — idempotent (recreate if exists)
# ---------------------------------------------------------------------------
$existing = & $appcmd list apppool $poolName 2>&1
if ($LASTEXITCODE -eq 0) {
    Log "[1/6] App pool '$poolName' exists — removing for clean rebuild"
    & $appcmd delete apppool $poolName 2>&1 | Out-Null
}
Log "[1/6] Creating app pool '$poolName' (No Managed Code, ApplicationPoolIdentity)..."
& $appcmd add apppool /name:$poolName /managedRuntimeVersion:"" /processModel.identityType:ApplicationPoolIdentity 2>&1 | ForEach-Object { Log "  $_" }
& $appcmd set apppool /apppool.name:$poolName /processModel.idleTimeout:00:00:00 2>&1 | Out-Null

# ---------------------------------------------------------------------------
# 2. Filesystem permissions
# ---------------------------------------------------------------------------
Log "[2/6] Granting filesystem permissions to $poolUser..."
& icacls $sitePath /grant "${poolUser}:(OI)(CI)RX" /T /Q 2>&1 | Out-Null
Log "  RX on $sitePath (exit $LASTEXITCODE)"
if (-not (Test-Path "$sitePath\logs")) { New-Item -ItemType Directory -Path "$sitePath\logs" -Force | Out-Null }
& icacls "$sitePath\logs" /grant "${poolUser}:(OI)(CI)F" /T /Q 2>&1 | Out-Null
Log "  F on logs\ (exit $LASTEXITCODE)"
& icacls "$sitePath\data" /grant "${poolUser}:(OI)(CI)F" /T /Q 2>&1 | Out-Null
Log "  F on data\ (exit $LASTEXITCODE)"

# ---------------------------------------------------------------------------
# 3. IIS site
# ---------------------------------------------------------------------------
$existing = & $appcmd list site $siteName 2>&1
if ($LASTEXITCODE -eq 0) {
    Log "[3/6] Site '$siteName' exists — removing for clean rebuild"
    & $appcmd delete site $siteName 2>&1 | Out-Null
}
Log "[3/6] Creating site '$siteName' on port $sitePort..."
& $appcmd add site /name:$siteName /physicalPath:"$sitePath" /bindings:"http/*:${sitePort}:" 2>&1 | ForEach-Object { Log "  $_" }
& $appcmd set site /site.name:$siteName /[path='/'].applicationPool:$poolName 2>&1 | Out-Null

# ---------------------------------------------------------------------------
# 4. SQL Server grant
# ---------------------------------------------------------------------------
Log "[4/6] Granting SQL Server access to $poolUser..."
# CREATE LOGIN must run BEFORE the iisreset for the virtual account to exist,
# but the app pool needs to be created (step 1 done) for the account to be
# resolvable. iisreset (step 5) finalizes things; the login + role grant work
# now because step 1 already created the pool.
$tsql1 = "USE [master]; IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = '$poolUser') CREATE LOGIN [$poolUser] FROM WINDOWS;"
& sqlcmd -E -S localhost -Q $tsql1 2>&1 | ForEach-Object { Log "  sqlcmd: $_" }
Log "  CREATE LOGIN exit: $LASTEXITCODE"

$tsql2 = "USE [aqmar]; IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '$poolUser') CREATE USER [$poolUser] FOR LOGIN [$poolUser]; ALTER ROLE db_owner ADD MEMBER [$poolUser];"
& sqlcmd -E -S localhost -d aqmar -Q $tsql2 2>&1 | ForEach-Object { Log "  sqlcmd: $_" }
Log "  CREATE USER + db_owner exit: $LASTEXITCODE"

# ---------------------------------------------------------------------------
# 5. IIS restart
# ---------------------------------------------------------------------------
Log "[5/6] Restarting IIS..."
& iisreset /restart 2>&1 | ForEach-Object { Log "  iisreset: $_" }

# ---------------------------------------------------------------------------
# 6. Start site + print final status
# ---------------------------------------------------------------------------
Log "[6/6] Starting site '$siteName'..."
& $appcmd start site /site.name:$siteName 2>&1 | ForEach-Object { Log "  $_" }
Log "  Final state:"
& $appcmd list site $siteName 2>&1 | ForEach-Object { Log "    $_" }

Log ""
Log "Deploy complete. Test with:"
Log "  Invoke-WebRequest http://localhost:$sitePort/api/health"
Log "  Open in browser:  http://localhost:$sitePort/"
Log ""
Log "Full log: $logPath"
