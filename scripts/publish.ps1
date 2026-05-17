# scripts/publish.ps1
#
# One-command publish: read verified rows from SQL Server, write versioned
# data/martyrs.json, commit, push to origin. GitHub Pages picks it up
# automatically.
#
# Usage:
#   .\scripts\publish.ps1                     # publish with no note
#   .\scripts\publish.ps1 -Note "weekly cut"  # publish with a note
#   .\scripts\publish.ps1 -DryRun             # show stats, don't publish
#
# Requires: .venv exists, SQLSERVER_CONN_STR set in .env

param(
    [string]$Note = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$venvPython  = Join-Path $projectRoot ".venv\Scripts\python.exe"
$exportScript = Join-Path $projectRoot "scripts\export_to_json.py"

if (-not (Test-Path $venvPython)) {
    Write-Error "Venv python not found at $venvPython. Run: python -m venv .venv first."
}

$env:PYTHONIOENCODING = "utf-8"
Push-Location $projectRoot
try {
    if ($DryRun) {
        & $venvPython $exportScript --dry-run
        Write-Host ""
        Write-Host "(dry run: nothing written, no commit, no push)"
        return
    }

    # 1. Export — writes data/martyrs.json + records publish_versions row
    Write-Host "Step 1/3: exporting verified rows to JSON..."
    $noteArg = if ($Note) { @("--note", $Note) } else { @() }
    & $venvPython $exportScript @noteArg
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Export failed with exit code $LASTEXITCODE"
    }

    # 2. Read version from the just-written JSON for the commit message
    $version = & $venvPython -c "import json; print(json.load(open('data/martyrs.json',encoding='utf-8'))['version'])"
    $version = $version.Trim()
    if (-not $version) { Write-Error "Could not read version from data/martyrs.json" }

    # 3. Commit + push
    Write-Host ""
    Write-Host "Step 2/3: committing data/martyrs.json..."
    $commitMsg = if ($Note) { "publish v${version}: $Note" } else { "publish v$version" }
    git add data/martyrs.json
    git commit -m $commitMsg
    if ($LASTEXITCODE -ne 0) {
        Write-Error "git commit failed (possibly no changes to commit?)"
    }

    Write-Host ""
    Write-Host "Step 3/3: pushing to origin..."
    git push
    if ($LASTEXITCODE -ne 0) {
        Write-Error "git push failed"
    }

    Write-Host ""
    Write-Host "Published v$version successfully."
} finally {
    Pop-Location
}
