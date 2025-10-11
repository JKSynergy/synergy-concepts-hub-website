#!/usr/bin/env pwsh
# Simple launcher for QuickCredit System
# Can be run from any directory

param(
    [switch]$Backend,
    [switch]$Frontend
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BaseDir = $ScriptDir
$BackendDir = Join-Path $BaseDir "backend"
$FrontendDir = Join-Path $BaseDir "frontend"

# If no specific server is requested, start both
$StartBoth = -not ($Backend -or $Frontend)

if ($Backend -or $StartBoth) {
    Write-Host "Starting Backend Server..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$BackendDir'; node simple-api-server.js"
}

if ($Frontend -or $StartBoth) {
    Write-Host "Starting Frontend Server..." -ForegroundColor Green  
    Start-Sleep 2
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$FrontendDir'; npm run dev"
}

if ($StartBoth) {
    Write-Host "Both servers starting..." -ForegroundColor Yellow
    Write-Host "Backend: http://localhost:3002" -ForegroundColor Cyan
    Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
}