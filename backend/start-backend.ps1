#!/usr/bin/env powershell

# QuickCredit Backend Startup Script
Write-Host "Starting QuickCredit Backend..." -ForegroundColor Green

# Change to backend directory
Set-Location "e:\SYSTEMS AND WEBSITES\Quickcredit sysytem\quickcredit-modern\backend"

# Start the backend server
Write-Host "Starting simple API server on port 3002..." -ForegroundColor Yellow
node simple-api-server.js

# Keep the script running
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Red
while ($true) {
    Start-Sleep -Seconds 1
}