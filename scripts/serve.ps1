# scripts/serve.ps1
#
# Starts the SPA's local web server with the correct working directory
# (the project root, NOT webui/), so that ../data/ relative paths from
# webui/index.html resolve to <project>/data/.
#
# Usage:
#   .\scripts\serve.ps1            # default port 8000
#   .\scripts\serve.ps1 -Port 9999 # custom port
#
# Then open: http://localhost:<port>/webui/

param([int]$Port = 8000)

$projectRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $projectRoot

# data/martyrs.json is produced by the publish step (scripts/export_to_json.py
# or the admin "publish" button) — this script only serves the SPA.
$venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"

Write-Host ""
Write-Host "=== AqmarTofan SPA ===" -ForegroundColor Yellow
Write-Host "Open: http://localhost:$Port/webui/" -ForegroundColor Green
Write-Host "Tests: http://localhost:$Port/webui/tests.html" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""

# Serve from the project root (explicit --directory so cd mistakes don't matter)
if (Test-Path $venvPython) {
    & $venvPython -m http.server $Port --directory $projectRoot
} else {
    python -m http.server $Port --directory $projectRoot
}
