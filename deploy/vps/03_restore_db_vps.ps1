# deploy/vps/03_restore_db_vps.ps1
#
# RUN ON THE VPS. Restores the .bak produced by 02_backup_db_local.ps1 into a
# fresh `aqmar` database on the VPS's local SQL Server, remapping the data/log
# files to this machine's default data directory (the source paths from your
# dev box won't exist here - that's what MOVE handles).
#
# Idempotent: if `aqmar` already exists it is overwritten (REPLACE). Run
# elevated enough to have sysadmin on the local SQL instance (Windows auth).
#
# Usage:
#   .\deploy\vps\03_restore_db_vps.ps1 -BakFile C:\tmp\aqmar_20260101_030405.bak

param(
    [Parameter(Mandatory = $true)][string]$BakFile,
    [string]$Server   = "localhost",
    [string]$Database = "aqmar"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command sqlcmd -ErrorAction SilentlyContinue)) {
    Write-Error "sqlcmd not found. Install SQL Server command-line tools."
}
if (-not (Test-Path $BakFile)) { Write-Error "Backup file not found: $BakFile" }
$BakFile = (Resolve-Path $BakFile).Path

Write-Host "Restoring [$Database] on [$Server] from $BakFile" -ForegroundColor Cyan

# 1) Read the logical file names out of the backup - they can differ from the
#    DB name, so we must not assume 'aqmar' / 'aqmar_log'.
$listing = & sqlcmd -E -S $Server -h -1 -W -s "|" -Q `
    "SET NOCOUNT ON; RESTORE FILELISTONLY FROM DISK = N'$BakFile';"
if ($LASTEXITCODE -ne 0) { Write-Error "Could not read backup header (sqlcmd exit $LASTEXITCODE)." }

$dataLogical = $null; $logLogical = $null
foreach ($line in $listing) {
    $cols = $line -split '\|'
    if ($cols.Count -lt 3) { continue }
    $logical = $cols[0].Trim()
    $type    = $cols[2].Trim()   # 'D' = data, 'L' = log
    if ($type -eq 'D' -and -not $dataLogical) { $dataLogical = $logical }
    elseif ($type -eq 'L' -and -not $logLogical) { $logLogical = $logical }
}
if (-not $dataLogical -or -not $logLogical) {
    Write-Error "Could not parse logical file names from the backup header."
}
Write-Host "  data logical: $dataLogical" -ForegroundColor DarkGray
Write-Host "  log  logical: $logLogical"  -ForegroundColor DarkGray

# 2) Resolve this instance's default data directory for the MOVE targets.
$dataDir = (& sqlcmd -E -S $Server -h -1 -W -Q `
    "SET NOCOUNT ON; SELECT CAST(SERVERPROPERTY('InstanceDefaultDataPath') AS nvarchar(4000));").Trim()
if (-not $dataDir) { $dataDir = "C:\Program Files\Microsoft SQL Server\MSSQL\DATA\" }
$dataTo = Join-Path $dataDir "$Database.mdf"
$logTo  = Join-Path $dataDir "$($Database)_log.ldf"
Write-Host "  restoring files into: $dataDir" -ForegroundColor DarkGray

# 3) Restore. SINGLE_USER + ROLLBACK IMMEDIATE evicts any open connection so
#    a re-run can't hang; REPLACE overwrites an existing aqmar; back to
#    MULTI_USER at the end.
$tsql = @"
IF DB_ID(N'$Database') IS NOT NULL
    ALTER DATABASE [$Database] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
RESTORE DATABASE [$Database] FROM DISK = N'$BakFile'
    WITH REPLACE, RECOVERY, CHECKSUM,
    MOVE N'$dataLogical' TO N'$dataTo',
    MOVE N'$logLogical'  TO N'$logTo';
ALTER DATABASE [$Database] SET MULTI_USER;
"@
& sqlcmd -E -S $Server -b -Q $tsql
if ($LASTEXITCODE -ne 0) { Write-Error "Restore failed (sqlcmd exit $LASTEXITCODE)." }

# 4) Confirm the data made it.
$count = (& sqlcmd -E -S $Server -d $Database -h -1 -W -Q `
    "SET NOCOUNT ON; SELECT COUNT(*) FROM dbo.martyrs;").Trim()
Write-Host ""
Write-Host "Restore complete. dbo.martyrs row count on the VPS: $count" -ForegroundColor Green
Write-Host "Cross-check this against your local machine before going live." -ForegroundColor Yellow

