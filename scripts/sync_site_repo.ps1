# scripts/sync_site_repo.ps1
#
# Mirror the published site files from this working tree into the public
# site repo clone (SITE_REPO_DIR), commit and push. The public repo IS the
# site: webui + root entry files + martyrs.json/settings.json + ONLY the
# photos/covers referenced by the published JSON (unpublished people's
# files must never leak). Clone recreated / hard-reset as needed — it
# holds no unique state.
#
# Usage: .\scripts\sync_site_repo.ps1 -CheckJson logs\publish_check.json `
#            -CommitMessage "publish v16: nightly auto" [-DryRun] [-NoPush]

param(
    [Parameter(Mandatory=$true)][string]$CheckJson,
    [Parameter(Mandatory=$true)][string]$CommitMessage,
    [switch]$DryRun,
    [switch]$NoPush,
    [switch]$Bootstrap   # first-time: caller prepared an orphan branch; skip fetch/reset
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path "$PSScriptRoot\..").Path

# --- read SITE_REPO_URL / SITE_REPO_DIR from .env (defaults if absent) ---
$siteUrl = "https://github.com/mohamedkhamis/AQMAR.git"
$siteDir = Join-Path (Split-Path -Parent $repo) "AQMAR-site"
$envFile = Join-Path $repo ".env"
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*SITE_REPO_URL\s*=\s*(.+)$') { $siteUrl = $Matches[1].Trim() }
        if ($line -match '^\s*SITE_REPO_DIR\s*=\s*(.+)$') { $siteDir = $Matches[1].Trim() }
    }
}
# A relative SITE_REPO_DIR must resolve against the repo root, NOT the
# caller's CWD (publish_core Push-Locations to $repo, but be defensive).
if (-not [System.IO.Path]::IsPathRooted($siteDir)) {
    $siteDir = Join-Path $repo $siteDir
}

$check = Get-Content (Join-Path $repo $CheckJson) -Raw -Encoding UTF8 | ConvertFrom-Json

# Dry run must touch NOTHING (no clone, no fetch) - return before any git.
if ($DryRun) {
    Write-Host ("(dry run) would sync {0} photos, {1} frames, webui/, JSON into {2}" -f `
        $check.referenced_photos.Count, $check.referenced_frames.Count, $siteDir)
    return
}

# Safety: this sync mirror+prunes the target repo to the referenced-only file
# set. If SITE_REPO_URL is the SAME GitHub repo as origin's push URL, the target
# IS the private full-backup repo, and the prune would delete the unpublished-
# people / backup-only files the two-repo design exists to preserve. Refuse.
# (Pre-migration, origin still points at the public repo which is also the
# default site URL, so this fires until origin is repointed to the private
# backup — exactly the intended guard.)
$originPush = (git -C $repo remote get-url --push origin 2>$null)
if ($LASTEXITCODE -eq 0 -and $originPush -and ($originPush.Trim() -eq $siteUrl.Trim())) {
    Write-Error ("SITE_REPO_URL ($siteUrl) equals origin's push URL - refusing to sync " +
        "(it would mirror/prune the backup repo). Complete the migration first: repoint " +
        "origin to the private backup and set SITE_REPO_URL to the distinct public site repo.")
}

# --- ensure a clean clone (skipped in -Bootstrap: caller owns the branch) ---
if ($Bootstrap) {
    if (-not (Test-Path (Join-Path $siteDir ".git"))) {
        Write-Error "-Bootstrap requires an already-initialized $siteDir (git init + branch -m master)."
    }
    Write-Host "Bootstrap mode: using caller-prepared orphan branch, skipping fetch/reset."
} elseif (-not (Test-Path (Join-Path $siteDir ".git"))) {
    Write-Host "Site clone missing - cloning $siteUrl -> $siteDir"
    git clone $siteUrl $siteDir
    if ($LASTEXITCODE -ne 0) { Write-Error "git clone failed" }
} else {
    git -C $siteDir fetch origin
    if ($LASTEXITCODE -ne 0) { Write-Error "git fetch failed in site clone" }
    git -C $siteDir reset --hard origin/master
    if ($LASTEXITCODE -ne 0) { Write-Error "git reset failed in site clone" }
    git -C $siteDir clean -fd
}

# --- copy roots + webui (mirror deletes removed webui files) ---
Copy-Item (Join-Path $repo "index.html") $siteDir -Force
Copy-Item (Join-Path $repo "sw.js") $siteDir -Force
robocopy (Join-Path $repo "webui") (Join-Path $siteDir "webui") /MIR /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Error "robocopy webui failed ($LASTEXITCODE)" }
New-Item -ItemType Directory -Force (Join-Path $siteDir "data") | Out-Null
Copy-Item (Join-Path $repo "data\martyrs.json") (Join-Path $siteDir "data\martyrs.json") -Force
Copy-Item (Join-Path $repo "data\settings.json") (Join-Path $siteDir "data\settings.json") -Force

# --- deploy workflow + README templates ---
New-Item -ItemType Directory -Force (Join-Path $siteDir ".github\workflows") | Out-Null
Copy-Item (Join-Path $repo "scripts\site_repo\deploy-pages.yml") (Join-Path $siteDir ".github\workflows\deploy-pages.yml") -Force
Copy-Item (Join-Path $repo "scripts\site_repo\README.md") (Join-Path $siteDir "README.md") -Force

# --- photos + frames: exactly the referenced files, pruning extras ---
function Sync-Referenced([string[]]$relPaths, [string]$siteSubdir) {
    $destRoot = Join-Path $siteDir $siteSubdir
    New-Item -ItemType Directory -Force $destRoot | Out-Null
    $want = @{}
    foreach ($rel in $relPaths) {
        $win = $rel -replace '/', '\'
        $src = Join-Path $repo $win
        $dst = Join-Path $siteDir $win
        $want[(Split-Path $win -Leaf)] = $true
        if (Test-Path $src) {
            New-Item -ItemType Directory -Force (Split-Path $dst -Parent) | Out-Null
            Copy-Item $src $dst -Force
        } else {
            Write-Warning "referenced file missing on disk: $rel"
        }
    }
    Get-ChildItem $destRoot -File -Recurse | ForEach-Object {
        if (-not $want.ContainsKey($_.Name)) { Remove-Item $_.FullName -Force }
    }
}
Sync-Referenced $check.referenced_photos "data\photos"
Sync-Referenced $check.referenced_frames "data\frames"

# --- commit + push ---
git -C $siteDir add -A
$dirty = git -C $siteDir status --porcelain
if (-not $dirty) {
    Write-Host "Site clone unchanged - nothing to push."
    return
}
git -C $siteDir commit -m $CommitMessage
if ($LASTEXITCODE -ne 0) { Write-Error "site commit failed" }
if ($NoPush) {
    Write-Host "(-NoPush) site commit created, not pushed."
    return
}
git -C $siteDir push origin master
if ($LASTEXITCODE -ne 0) { Write-Error "site push failed" }
Write-Host "Site repo pushed: $CommitMessage"
