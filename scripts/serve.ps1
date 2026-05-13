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

# Regenerate JSON in case the Excel has changed
$venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
if (Test-Path $venvPython) {
    & $venvPython "scripts\excel_to_json.py"
} else {
    Write-Warning "Venv python not found at $venvPython. Skipping JSON regeneration."
    Write-Warning "Make sure data/martyrs.json exists, or run: python scripts\excel_to_json.py"
}

Write-Host ""
Write-Host "=== AqmarTofan SPA ===" -ForegroundColor Yellow
Write-Host "Open: http://localhost:$Port/webui/" -ForegroundColor Green
Write-Host "Tests: http://localhost:$Port/webui/tests.html" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""

# Serve from the project root so /webui/ + /data/ are both accessible
if (Test-Path $venvPython) {
    & $venvPython -m http.server $Port
} else {
    python -m http.server $Port
}
