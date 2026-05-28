# Build CSS and copy only deployable site files (for Cloudflare dashboard upload).
# Dashboard limit: 1000 files. Do NOT upload node_modules or .git.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$outDir = Join-Path $PSScriptRoot "_deploy"
if (Test-Path $outDir) {
    Remove-Item $outDir -Recurse -Force
}

Write-Host "Building Tailwind CSS..." -ForegroundColor Cyan
npm run build

Write-Host "Copying site files to _deploy..." -ForegroundColor Cyan
$excludeDirs = @("node_modules", ".git", "_deploy", ".github")
$excludeFiles = @("package.json", "package-lock.json", "tailwind.config.js", "deploy.ps1", "prepare-upload.ps1", ".gitignore", "wrangler.toml", "README.md")

Get-ChildItem -Path $PSScriptRoot -Force | ForEach-Object {
    if ($_.PSIsContainer) {
        if ($excludeDirs -contains $_.Name) { return }
        Copy-Item $_.FullName -Destination (Join-Path $outDir $_.Name) -Recurse -Force
    } else {
        if ($excludeFiles -contains $_.Name) { return }
        if ($_.Name -like "tailwind.input.css") { return }
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null
        Copy-Item $_.FullName -Destination (Join-Path $outDir $_.Name) -Force
    }
}

$fileCount = (Get-ChildItem $outDir -Recurse -File | Measure-Object).Count
Write-Host ""
Write-Host "Ready: $outDir ($fileCount files)" -ForegroundColor Green
Write-Host "In Cloudflare Pages, upload the _deploy folder (not the project root)." -ForegroundColor Yellow
