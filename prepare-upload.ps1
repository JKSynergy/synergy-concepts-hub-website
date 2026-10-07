# Builds the deploy folder for the PUBLIC website (for a Cloudflare dashboard upload).
# Source is site-v2/ (the approved site); output is _deploy/. The portal is never included.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
node scripts/prepare-deploy.mjs
Write-Host "In Cloudflare Pages, upload the _deploy folder (not the project root)." -ForegroundColor Yellow
