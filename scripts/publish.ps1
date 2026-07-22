# scripts/publish.ps1
#
# Manual one-command publish — thin wrapper over publish_core.ps1
# (export -> local commit -> private backup push -> public site push).
# The nightly task runs the same core plus AI-verify + email.
#
# Usage:
#   .\scripts\publish.ps1                     # publish with no note
#   .\scripts\publish.ps1 -Note "weekly cut"  # publish with a note
#   .\scripts\publish.ps1 -DryRun             # show what would happen

param(
    [string]$Note = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
# Hashtable splat: PS 5.1 array splatting binds POSITIONALLY when calling a
# .ps1, so @("-DryRun") would land in $Note (leaving $DryRun $false and
# triggering a real publish). A hashtable binds the switches by name.
$coreArgs = @{}
if ($Note)   { $coreArgs.Note = $Note }
if ($DryRun) { $coreArgs.DryRun = $true }
& (Join-Path $PSScriptRoot "publish_core.ps1") @coreArgs
