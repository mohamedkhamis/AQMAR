# deploy/vps/00_gather_secrets_local.ps1
#
# RUN ON YOUR LOCAL MACHINE. Copies the files the git clone does NOT contain
# (all gitignored) into ONE folder you carry to the VPS and drop onto the repo
# root, preserving relative paths. Pair it with 02_backup_db_local.ps1 (the DB)
# and you have everything the VPS clone is missing.
#
# What it gathers:
#   .env                              Telegram creds, ADMIN_TOKEN, DB conn string
#   session\  (+ any *.session)       authenticated Telegram login
#   data\notify_settings.json         Gmail app password + report recipients
#   data\state.json                   scraper cursor - WITHOUT it the VPS
#                                     re-scrapes from msg 1 and overwrites every
#                                     AI/admin-corrected date with raw OCR
#   data\ai_batches\noted_ids.json    nightly "reviewed, unverifiable" skip list
#
# Usage:
#   .\deploy\vps\00_gather_secrets_local.ps1
#   .\deploy\vps\00_gather_secrets_local.ps1 -OutDir D:\AQMAR-secrets

param(
    [string]$OutDir = (Join-Path (Split-Path (Resolve-Path "$PSScriptRoot\..\..").Path -Parent) "AQMAR-secrets")
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path "$PSScriptRoot\..\..").Path

if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

function Copy-Rel([string]$rel) {
    $src = Join-Path $repo $rel
    if (-not (Test-Path $src)) { Write-Warning "not found, skipped: $rel"; return }
    $dst = Join-Path $OutDir $rel
    New-Item -ItemType Directory -Force (Split-Path $dst -Parent) | Out-Null
    if ((Get-Item $src).PSIsContainer) {
        & robocopy $src $dst /E /NFL /NDL /NJH /NJS /NP | Out-Null
        if ($LASTEXITCODE -ge 8) { Write-Error "robocopy failed for $rel (exit $LASTEXITCODE)" }
    } else {
        Copy-Item $src $dst -Force
    }
    Write-Host "  + $rel" -ForegroundColor Green
}

Write-Host "Gathering gitignored files into $OutDir" -ForegroundColor Cyan
Copy-Rel ".env"
Copy-Rel "session"
Copy-Rel "data\notify_settings.json"
Copy-Rel "data\state.json"
Copy-Rel "data\ai_batches\noted_ids.json"

# Loose *.session files at the repo root (older layouts), if any.
$looseSessions = @(Get-ChildItem -Path $repo -Filter "*.session" -File -ErrorAction SilentlyContinue)
foreach ($s in $looseSessions) {
    Copy-Item $s.FullName (Join-Path $OutDir $s.Name) -Force
    Write-Host "  + $($s.Name)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. The folder layout mirrors the repo root." -ForegroundColor Yellow
Write-Host "On the VPS, copy its CONTENTS into your clone (merge, keep structure)." -ForegroundColor Yellow
Write-Host "It holds secrets (Telegram session, Gmail app password) - move it" -ForegroundColor Yellow
Write-Host "privately and delete it from both machines once the VPS is verified." -ForegroundColor Yellow

exit 0   # robocopy leaves a non-zero (success) code in $LASTEXITCODE; normalize it
