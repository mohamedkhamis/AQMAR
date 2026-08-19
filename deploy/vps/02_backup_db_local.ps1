# deploy/vps/02_backup_db_local.ps1
#
# RUN ON YOUR LOCAL MACHINE (where the current `aqmar` DB lives).
# Takes a full backup of the aqmar database to a timestamped .bak you then
# copy to the VPS and restore with 03_restore_db_vps.ps1.
#
# Windows auth against the default local instance, matching the app's
# Trusted_Connection=yes config. Override -Server / -Database if yours differ.
#
# Usage:
#   .\deploy\vps\02_backup_db_local.ps1
#   .\deploy\vps\02_backup_db_local.ps1 -OutDir D:\backups

param(
    [string]$Server   = "localhost",
    [string]$Database = "aqmar",
    [string]$OutDir   = "$PSScriptRoot"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command sqlcmd -ErrorAction SilentlyContinue)) {
    Write-Error "sqlcmd not found. Install SQL Server command-line tools."
}
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$bak   = Join-Path (Resolve-Path $OutDir).Path "$($Database)_$stamp.bak"

Write-Host "Backing up [$Database] on [$Server] -> $bak" -ForegroundColor Cyan

# COMPRESSION shrinks the file; some editions (Express) ignore it harmlessly.
# CHECKSUM + VERIFY catch a corrupt copy before you carry it to the VPS.
$tsql = @"
BACKUP DATABASE [$Database] TO DISK = N'$bak'
    WITH INIT, FORMAT, COMPRESSION, CHECKSUM,
    NAME = N'$Database full backup $stamp';
RESTORE VERIFYONLY FROM DISK = N'$bak' WITH CHECKSUM;
"@

& sqlcmd -E -S $Server -b -Q $tsql
if ($LASTEXITCODE -ne 0) { Write-Error "Backup failed (sqlcmd exit $LASTEXITCODE)." }

$size = "{0:N1} MB" -f ((Get-Item $bak).Length / 1MB)
Write-Host ""
Write-Host "Backup complete + verified: $bak  ($size)" -ForegroundColor Green
Write-Host "Copy this file to the VPS, then run on the VPS:" -ForegroundColor Yellow
Write-Host "  .\deploy\vps\03_restore_db_vps.ps1 -BakFile C:\path\to\$([IO.Path]::GetFileName($bak))"
