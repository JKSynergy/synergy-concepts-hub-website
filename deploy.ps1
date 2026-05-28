# Manual Cloudflare Pages deploy (run after: npx wrangler login)
# Or set env: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Preparing deploy folder (excludes local videos and files over 25 MiB)..." -ForegroundColor Cyan
node scripts/prepare-deploy.mjs

Write-Host "Deploying to Cloudflare Pages..." -ForegroundColor Cyan
npx wrangler pages deploy _deploy --project-name=synergywebsite --branch=main --commit-dirty=true

Write-Host "Done. Purge browser cache and unregister old service worker if needed." -ForegroundColor Green
