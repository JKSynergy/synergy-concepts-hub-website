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

Write-Host "Copying site files to _deploy (no local videos)..." -ForegroundColor Cyan
$excludeDirs = @("node_modules", ".git", "_deploy", ".github", "academy images", "scripts")
$excludePathPrefixes = @("images\albums\videos", "images/albums/videos")
$maxFileBytes = 24MB
$excludeFiles = @("package.json", "package-lock.json", "tailwind.config.js", "deploy.ps1", "prepare-upload.ps1", ".gitignore", "wrangler.toml", "README.md")

function Should-SkipPath([string]$relativePath, [bool]$isDirectory) {
    foreach ($prefix in $excludePathPrefixes) {
        if ($relativePath -eq $prefix -or $relativePath.StartsWith("$prefix/") -or $relativePath.StartsWith("$prefix\")) {
            return $true
        }
    }
    $parts = $relativePath -split '[\\/]'
    foreach ($part in $parts) {
        if ($excludeDirs -contains $part) { return $true }
    }
    if (-not $isDirectory) {
        if ($excludeFiles -contains $parts[-1]) { return $true }
        if ($parts[-1] -like "tailwind.input.css") { return $true }
    }
    return $false
}

function Copy-DeployTree([string]$source, [string]$dest, [string]$relative = "") {
    Get-ChildItem -Path $source -Force | ForEach-Object {
        $rel = if ($relative) { Join-Path $relative $_.Name } else { $_.Name }
        if (Should-SkipPath $rel $_.PSIsContainer) { return }

        $target = Join-Path $dest $_.Name
        if ($_.PSIsContainer) {
            New-Item -ItemType Directory -Path $target -Force | Out-Null
            Copy-DeployTree $_.FullName $target $rel
        } elseif ($_.Length -le $maxFileBytes) {
            Copy-Item $_.FullName -Destination $target -Force
        } else {
            Write-Host "  skip (>24 MiB): $rel ($([math]::Round($_.Length/1MB, 1)) MiB)" -ForegroundColor Yellow
        }
    }
}

Copy-DeployTree $PSScriptRoot $outDir

$fileCount = (Get-ChildItem $outDir -Recurse -File | Measure-Object).Count
Write-Host ""
Write-Host "Ready: $outDir ($fileCount files)" -ForegroundColor Green
Write-Host "In Cloudflare Pages, upload the _deploy folder (not the project root)." -ForegroundColor Yellow
