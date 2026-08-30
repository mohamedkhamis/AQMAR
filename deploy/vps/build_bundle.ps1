# deploy/vps/build_bundle.ps1
#
# Assembles ONE self-contained folder you copy to the VPS by hand - no git, no
# push. It contains the application, the referenced media, your secrets, a fresh
# database backup, and the install instructions. Layout produced:
#
#   <OutDir>\
#     INSTALL.md            <- read this first on the VPS
#     app\                  <- copy this whole folder to C:\AQMAR on the VPS
#       src\ scripts\ webui\ deploy\ data\ session\ .env requirements.txt ...
#     database\
#       aqmar_<stamp>.bak   <- restore with app\deploy\vps\03_restore_db_vps.ps1
#
# Excluded from app\: .venv (rebuilt on the VPS), .git, __pycache__, logs,
# and by default the raw OCR frames (only the ~958 referenced COVER frames are
# copied - the portal never displays the rest; pass -IncludeAllFrames to keep
# the admin "re-pick a cover" carousel working for pre-migration rows).
#
# Run on your LOCAL machine (needs the local SQL Server for the backup):
#   .\deploy\vps\build_bundle.ps1
#   .\deploy\vps\build_bundle.ps1 -OutDir D:\AQMAR-VPS-Bundle -IncludeAllFrames

param(
    [string]$OutDir = (Join-Path (Split-Path (Resolve-Path "$PSScriptRoot\..\..").Path -Parent) "AQMAR-VPS-Bundle"),
    [string]$DbServer = "localhost",
    [string]$DbName   = "aqmar",
    [switch]$IncludeAllFrames
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path "$PSScriptRoot\..\..").Path

# Guard: OutDir must be OUTSIDE the repo, or robocopy would recurse into it.
if ((Resolve-Path -LiteralPath (Split-Path $OutDir -Parent) -ErrorAction SilentlyContinue).Path -like "$repo*") {
    Write-Error "OutDir must be outside the repo ($repo). Pick a sibling/other drive."
}

Write-Host "=== Building AQMAR VPS bundle ===" -ForegroundColor Cyan
Write-Host "Repo:   $repo"
Write-Host "OutDir: $OutDir"
Write-Host ""

$app = Join-Path $OutDir "app"
$dbOut = Join-Path $OutDir "database"
if (Test-Path $OutDir) {
    Write-Host "Removing existing $OutDir ..." -ForegroundColor DarkYellow
    Remove-Item $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Path $app, $dbOut -Force | Out-Null

# ---------------------------------------------------------------------------
# 1. Application tree (code + secrets + session), EXCLUDING data\ and heavy/
#    machine-specific dirs. data\ is curated separately in step 2.
#    robocopy exit codes 0-7 are success (bit flags); >=8 is a real failure.
# ---------------------------------------------------------------------------
Write-Host "[1/4] Copying application (code, .env, session)..." -ForegroundColor Cyan
$xd = @(".git", ".venv", "__pycache__", "logs", ".pytest_cache", "node_modules", "data")
$rcArgs = @($repo, $app, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP", "/R:1", "/W:1") +
          ($xd | ForEach-Object { @("/XD", (Join-Path $repo $_)) } )
& robocopy @rcArgs | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Error "robocopy (app) failed with code $LASTEXITCODE" }
Write-Host "  code + secrets copied (excluded: $($xd -join ', '))"

# ---------------------------------------------------------------------------
# 2. Curated data\ : json + notify + all photos + referenced cover frames.
# ---------------------------------------------------------------------------
Write-Host "[2/4] Copying data (json, photos, covers)..." -ForegroundColor Cyan
$dataDst = Join-Path $app "data"
New-Item -ItemType Directory (Join-Path $dataDst "photos"), (Join-Path $dataDst "frames") -Force | Out-Null

foreach ($f in "martyrs.json", "settings.json", "notify_settings.json") {
    $src = Join-Path $repo "data\$f"
    if (Test-Path $src) { Copy-Item $src (Join-Path $dataDst $f) -Force }
}

# state.json = the scraper cursor. WITHOUT it the VPS re-fetches + re-OCRs every
# historical message and upsert_martyr overwrites AI/admin-corrected dates with
# raw OCR. noted_ids.json = the nightly "reviewed, unverifiable" skip list.
if (Test-Path (Join-Path $repo "data\state.json")) {
    Copy-Item (Join-Path $repo "data\state.json") (Join-Path $dataDst "state.json") -Force
}
New-Item -ItemType Directory -Force (Join-Path $dataDst "ai_batches") | Out-Null
if (Test-Path (Join-Path $repo "data\ai_batches\noted_ids.json")) {
    Copy-Item (Join-Path $repo "data\ai_batches\noted_ids.json") (Join-Path $dataDst "ai_batches\noted_ids.json") -Force
}

# photos: all of them (each referenced by a row's photo_path)
& robocopy (Join-Path $repo "data\photos") (Join-Path $dataDst "photos") /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Error "robocopy (photos) failed with code $LASTEXITCODE" }
$photoCount = @(Get-ChildItem (Join-Path $dataDst "photos") -Filter *.jpg).Count

# frames: only the referenced covers unless -IncludeAllFrames
if ($IncludeAllFrames) {
    & robocopy (Join-Path $repo "data\frames") (Join-Path $dataDst "frames") /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { Write-Error "robocopy (frames) failed with code $LASTEXITCODE" }
} else {
    # Pull the featured_frame_path list straight from martyrs.json (no python).
    $rows = (Get-Content (Join-Path $repo "data\martyrs.json") -Raw -Encoding UTF8 | ConvertFrom-Json).martyrs
    $covers = $rows | ForEach-Object { $_.featured_frame_path } |
              Where-Object { $_ } | ForEach-Object { $_ -replace '/', '\' } | Sort-Object -Unique
    foreach ($rel in $covers) {
        # $rel is like "data\frames\1780_28.jpg" — mirror it under app\ verbatim.
        $src = Join-Path $repo $rel
        if (Test-Path $src) { Copy-Item $src (Join-Path $app $rel) -Force -ErrorAction SilentlyContinue }
    }
}
$frameCount = @(Get-ChildItem (Join-Path $dataDst "frames") -Filter *.jpg).Count
Write-Host "  photos: $photoCount  |  frames: $frameCount  ($(if($IncludeAllFrames){'all'}else{'covers only'}))"

# Drop a stray web.config from the app copy - the VPS deploy regenerates it.
$wc = Join-Path $app "web.config"
if (Test-Path $wc) { Remove-Item $wc -Force }

# ---------------------------------------------------------------------------
# 3. Fresh database backup straight into the bundle.
# ---------------------------------------------------------------------------
Write-Host "[3/4] Backing up [$DbName] on [$DbServer]..." -ForegroundColor Cyan
if (-not (Get-Command sqlcmd -ErrorAction SilentlyContinue)) { Write-Error "sqlcmd not found - cannot back up the DB." }
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$bak = Join-Path $dbOut "$($DbName)_$stamp.bak"
$tsql = "BACKUP DATABASE [$DbName] TO DISK = N'$bak' WITH INIT, FORMAT, COMPRESSION, CHECKSUM, NAME = N'$DbName $stamp'; RESTORE VERIFYONLY FROM DISK = N'$bak' WITH CHECKSUM;"
& sqlcmd -E -S $DbServer -b -Q $tsql
if ($LASTEXITCODE -ne 0) { Write-Error "DB backup failed (sqlcmd exit $LASTEXITCODE)." }
Write-Host "  $bak  ($('{0:N1} MB' -f ((Get-Item $bak).Length/1MB)))"

# ---------------------------------------------------------------------------
# 4. Instructions at the bundle root.
# ---------------------------------------------------------------------------
Write-Host "[4/4] Writing INSTALL.md..." -ForegroundColor Cyan
$installSrc = Join-Path $PSScriptRoot "BUNDLE-INSTALL.md"
Copy-Item $installSrc (Join-Path $OutDir "INSTALL.md") -Force

$total = "{0:N0} MB" -f (((Get-ChildItem $OutDir -Recurse -File | Measure-Object Length -Sum).Sum)/1MB)
Write-Host ""
Write-Host "Bundle ready: $OutDir  ($total)" -ForegroundColor Green
Write-Host "It contains your .env, Telegram session and Gmail app password -" -ForegroundColor Yellow
Write-Host "treat it as secret and delete it once the VPS is up." -ForegroundColor Yellow
Write-Host "Copy the whole folder to the VPS and open INSTALL.md."

