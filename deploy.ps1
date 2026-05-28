# Manual Cloudflare Pages deploy (run after: npx wrangler login)
# Or set env: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Building Tailwind CSS..." -ForegroundColor Cyan
npm run build

Write-Host "Deploying to Cloudflare Pages..." -ForegroundColor Cyan
npx wrangler pages deploy . --project-name=synergy-concepts-hub-website --branch=master --commit-dirty=true

Write-Host "Done. Purge browser cache and unregister old service worker if needed." -ForegroundColor Green
