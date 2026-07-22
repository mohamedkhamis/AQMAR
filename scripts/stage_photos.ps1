# scripts/stage_photos.ps1
#
# Stage exactly the portrait photos referenced by data/martyrs.json
# (photo_path values). data/photos/ is TRACKED (not ignored) but nothing
# ever staged new scraper photos - published rows pointed at untracked
# files and rendered broken images. Publish flows call this so every
# referenced photo ships. Idempotent; plain `git add` (no -f needed).
#
# Usage:  .\scripts\stage_photos.ps1 [-DryRun]

param([switch]$DryRun)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path "$PSScriptRoot\..").Path
Push-Location $projectRoot
try {
    $jsonPath = Join-Path $projectRoot "data\martyrs.json"
    if (-not (Test-Path $jsonPath)) {
        Write-Error "data/martyrs.json not found - run the export first."
    }

    $data = Get-Content $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $photos = @(
        $data.martyrs |
        ForEach-Object { $_.photo_path } |
        Where-Object { $_ } |
        ForEach-Object { $_ -replace '\\', '/' } |
        Select-Object -Unique
    )

    if ($photos.Count -eq 0) {
        Write-Host "No photo_path values in data/martyrs.json - nothing to stage."
        return
    }

    $present = @($photos | Where-Object { Test-Path $_ })
    $missing = @($photos | Where-Object { -not (Test-Path $_) })

    Write-Host ("Photos referenced by martyrs.json: {0}" -f $photos.Count)
    Write-Host ("  present on disk: {0}" -f $present.Count)
    if ($missing.Count -gt 0) {
        $sample = ($missing | Select-Object -First 5) -join ', '
        Write-Warning ("  MISSING on disk: {0} (skipped) - e.g. {1}" -f $missing.Count, $sample)
    }

    if ($DryRun) {
        Write-Host "(dry run: nothing staged)"
        return
    }
    if ($present.Count -eq 0) {
        Write-Error "None of the referenced photos exist on disk - aborting."
    }

    $chunkSize = 100
    for ($i = 0; $i -lt $present.Count; $i += $chunkSize) {
        $end = [Math]::Min($i + $chunkSize - 1, $present.Count - 1)
        $chunk = $present[$i..$end]
        & git add -- $chunk
        if ($LASTEXITCODE -ne 0) {
            Write-Error "git add failed on chunk starting at index $i"
        }
    }
    Write-Host ("Staged {0} photo(s)." -f $present.Count)
}
finally {
    Pop-Location
}
