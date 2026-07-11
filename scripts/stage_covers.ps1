# scripts/stage_covers.ps1
#
# Force-stage exactly the SELECTED cover frames referenced by
# data/martyrs.json (its `featured_frame_path` values) so GitHub Pages can
# serve the public detail-page cover image.
#
# Why force-add: the whole data/frames/ directory is gitignored (~2,500 raw
# intermediate card frames, ~256 MB). Only the ~765 chosen covers (~76 MB) —
# one per published martyr — belong in the repo. `git add -f` overrides the
# ignore for just those files; once tracked, git keeps them normally.
#
# Idempotent: re-run any time (e.g. after each AI-verify pass) to pick up
# covers for newly-published rows. scripts/publish.ps1 calls this automatically
# so covers ship with every publish.
#
# Usage:
#   .\scripts\stage_covers.ps1           # force-add the current covers
#   .\scripts\stage_covers.ps1 -DryRun   # report only; stage nothing

param([switch]$DryRun)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path "$PSScriptRoot\..").Path
Push-Location $projectRoot
try {
    $jsonPath = Join-Path $projectRoot "data\martyrs.json"
    if (-not (Test-Path $jsonPath)) {
        Write-Error "data/martyrs.json not found - run the export first (scripts\export_to_json.py)."
    }

    $data = Get-Content $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $covers = @(
        $data.martyrs |
        ForEach-Object { $_.featured_frame_path } |
        Where-Object { $_ } |
        ForEach-Object { $_ -replace '\\', '/' } |
        Select-Object -Unique
    )

    if ($covers.Count -eq 0) {
        Write-Host "No featured_frame_path values in data/martyrs.json - nothing to stage."
        return
    }

    $present = @($covers | Where-Object { Test-Path $_ })
    $missing = @($covers | Where-Object { -not (Test-Path $_) })

    Write-Host ("Selected covers referenced by martyrs.json: {0}" -f $covers.Count)
    Write-Host ("  present on disk: {0}" -f $present.Count)
    if ($missing.Count -gt 0) {
        $sample = ($missing | Select-Object -First 5) -join ', '
        Write-Warning ("  MISSING on disk: {0} (skipped) - e.g. {1}" -f $missing.Count, $sample)
    }

    if ($DryRun) {
        if ($present.Count -gt 0) {
            Write-Host ("  sample: {0}" -f (($present | Select-Object -First 3) -join ', '))
        }
        Write-Host "(dry run: nothing staged)"
        return
    }

    if ($present.Count -eq 0) {
        Write-Error "None of the referenced covers exist on disk - aborting (did the frame extraction run?)."
    }

    # Force-add in chunks to stay well under the command-line length limit.
    $chunkSize = 100
    for ($i = 0; $i -lt $present.Count; $i += $chunkSize) {
        $end = [Math]::Min($i + $chunkSize - 1, $present.Count - 1)
        $chunk = $present[$i..$end]
        & git add -f -- $chunk
        if ($LASTEXITCODE -ne 0) {
            Write-Error "git add -f failed on chunk starting at index $i"
        }
    }

    Write-Host ("Staged {0} cover frame(s) with git add -f." -f $present.Count)
    Write-Host "Review with:  git status --short   then commit."
}
finally {
    Pop-Location
}
