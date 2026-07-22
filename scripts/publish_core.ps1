# scripts/publish_core.ps1
#
# The deterministic publish used by BOTH the nightly task and manual
# publish.ps1:
#   1. staged-index guard (never sweep unrelated staged work)
#   2. baseline = HEAD data/martyrs.json; publish_check.py (no version burn)
#   3. if changed: export + stage covers/photos/JSON + local commit
#   4. ALWAYS: push local master -> origin (private backup)
#   5. if changed: sync + push the public site repo
# Writes: logs\publish_result.json = {"published":bool,"version":N|null}
#   (plus a human-readable PUBLISH_RESULT log line)
#
# Usage: .\scripts\publish_core.ps1 [-Note "..."] [-DryRun]

param(
    [string]$Note = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path "$PSScriptRoot\..").Path
$py = Join-Path $repo ".venv\Scripts\python.exe"
$env:PYTHONIOENCODING = "utf-8"
Push-Location $repo
try {
    # 1. guard: nothing may be pre-staged
    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Index is not clean (something is already staged) - aborting so the publish commit can't sweep it in."
    }

    # 2. baseline + change check (no publish version consumed)
    New-Item -ItemType Directory -Force (Join-Path $repo "logs") | Out-Null
    $baseline = "logs\nightly_baseline.json"
    cmd /c "git show HEAD:data/martyrs.json > $baseline 2>nul"
    $checkJson = "logs\publish_check.json"
    & $py scripts\publish_check.py --baseline $baseline --json $checkJson
    if ($LASTEXITCODE -ne 0) { Write-Error "publish_check.py failed" }
    $check = Get-Content $checkJson -Raw -Encoding UTF8 | ConvertFrom-Json

    $version = $null
    $published = $false

    if (-not $check.changed) {
        Write-Host "No data changes since last publish - skipping export/commit."
    } elseif ($DryRun) {
        Write-Host ("(dry run) WOULD publish: {0} new, photos {1}, frames {2}" -f `
            $check.new_count, $check.referenced_photos.Count, $check.referenced_frames.Count)
    } else {
        # 3. export + stage + commit
        $noteArg = @()
        if ($Note) { $noteArg = @("--note", $Note) }
        & $py scripts\export_to_json.py @noteArg
        if ($LASTEXITCODE -ne 0) { Write-Error "export failed" }
        # Native python: check exit AND null before calling .Trim() (a null
        # would throw a confusing 'method on null' and mask the real error).
        $version = & $py -c "import json; print(json.load(open('data/martyrs.json',encoding='utf-8'))['version'])"
        if ($LASTEXITCODE -ne 0 -or -not $version) { Write-Error "could not read version after export" }
        $version = "$version".Trim()

        # stage_covers/stage_photos set $ErrorActionPreference=Stop + Write-Error
        # internally, so a failure THROWS and propagates here (caught by the
        # caller). Do NOT test $LASTEXITCODE after them - it holds the inner
        # git's code, a misleading stale value.
        & (Join-Path $PSScriptRoot "stage_covers.ps1")
        & (Join-Path $PSScriptRoot "stage_photos.ps1")
        git add data/martyrs.json
        if ($LASTEXITCODE -ne 0) { Write-Error "git add martyrs.json failed" }
        git add data/settings.json
        if ($LASTEXITCODE -ne 0) { Write-Error "git add settings.json failed" }

        $msg = "publish v${version}"
        if ($Note) { $msg = "publish v${version}: $Note" }
        git commit -m $msg
        if ($LASTEXITCODE -ne 0) { Write-Error "local publish commit failed" }
        $published = $true
    }

    # 4. private backup push (every run, even unchanged)
    if ($DryRun) {
        Write-Host "(dry run) would push origin master (private backup)"
    } else {
        git push origin master
        if ($LASTEXITCODE -ne 0) { Write-Error "backup push to origin failed" }
    }

    # 5. site sync + public push (only when something was published)
    if ($published -or $DryRun) {
        $msg2 = "publish v${version}"
        if ($Note) { $msg2 = "publish v${version}: $Note" }
        # Hashtable splat: PS 5.1 array splatting binds POSITIONALLY and does
        # not honor -Name tokens when calling a .ps1, so @("-CheckJson", ...)
        # throws PositionalParameterNotFound. A hashtable binds by name.
        $syncArgs = @{ CheckJson = $checkJson; CommitMessage = $msg2 }
        if ($DryRun) { $syncArgs.DryRun = $true }
        # sync_site_repo.ps1 throws (Stop + Write-Error) on any failure, which
        # propagates here — no $LASTEXITCODE guard (it would read a stale value).
        & (Join-Path $PSScriptRoot "sync_site_repo.ps1") @syncArgs
    }

    # Hand the result to the orchestrator via a FILE, not stdout. Write-Host
    # goes to the PS 5.1 information stream (6) which the caller's capture
    # never sees, and 2>&1-capturing the child would risk NativeCommandError
    # on git's stderr under Stop. A file sidesteps both.
    $verNum = $null
    if ($version) { $verNum = [int]$version }
    @{ published = [bool]$published; version = $verNum } |
        ConvertTo-Json -Compress |
        Set-Content -Path (Join-Path $repo "logs\publish_result.json") -Encoding utf8
    Write-Host ("PUBLISH_RESULT: published=$published version=$version")   # human-readable log line
}
finally {
    Pop-Location
}
