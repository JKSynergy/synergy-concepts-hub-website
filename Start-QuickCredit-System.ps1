# QuickCredit System Startup Script
# PowerShell version for reliable execution

Write-Host "=====================================" -ForegroundColor Green
Write-Host "   QuickCredit Loan Management" -ForegroundColor Green
Write-Host "        System Startup" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""

# Define the base directory
$BaseDir = "E:\SYSTEMS AND WEBSITES\Quickcredit sysytem\quickcredit-modern"
$BackendDir = Join-Path $BaseDir "backend"
$FrontendDir = Join-Path $BaseDir "frontend"

# Verify directories exist
if (!(Test-Path $BackendDir)) {
    Write-Host "Error: Backend directory not found at $BackendDir" -ForegroundColor Red
    exit 1
}

if (!(Test-Path $FrontendDir)) {
    Write-Host "Error: Frontend directory not found at $FrontendDir" -ForegroundColor Red
    exit 1
}

Write-Host "[1] Starting Backend Server..." -ForegroundColor Cyan
# Start backend server in new PowerShell window
$BackendScript = "Set-Location '$BackendDir'; node simple-api-server.js; Read-Host 'Press Enter to close this window'"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $BackendScript -WindowStyle Normal

Start-Sleep 3

Write-Host "[2] Starting Frontend Development Server..." -ForegroundColor Cyan
# Start frontend server in new PowerShell window
$FrontendScript = "Set-Location '$FrontendDir'; npm run dev; Read-Host 'Press Enter to close this window'"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $FrontendScript -WindowStyle Normal

Start-Sleep 2

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "   System Started Successfully!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend: http://localhost:3002" -ForegroundColor Yellow
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Yellow
Write-Host ""

# Wait a bit for servers to start
Write-Host "Waiting for servers to initialize..." -ForegroundColor Gray
Start-Sleep 5

# Test if servers are running
Write-Host "Testing server connections..." -ForegroundColor Gray

try {
    $BackendTest = Test-NetConnection -ComputerName localhost -Port 3002 -WarningAction SilentlyContinue
    if ($BackendTest.TcpTestSucceeded) {
        Write-Host "✓ Backend server is running on port 3002" -ForegroundColor Green
    } else {
        Write-Host "✗ Backend server is not responding on port 3002" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Could not test backend server connection" -ForegroundColor Red
}

try {
    $FrontendTest = Test-NetConnection -ComputerName localhost -Port 3000 -WarningAction SilentlyContinue
    if ($FrontendTest.TcpTestSucceeded) {
        Write-Host "✓ Frontend server is running on port 3000" -ForegroundColor Green
    } else {
        Write-Host "✗ Frontend server is not responding on port 3000" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Could not test frontend server connection" -ForegroundColor Red
}

Write-Host ""
Write-Host "Press any key to open the dashboard..." -ForegroundColor Cyan
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Open dashboard in default browser
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "Both servers are running in separate windows." -ForegroundColor Yellow
Write-Host "Close those windows to stop the servers." -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to exit this script..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")