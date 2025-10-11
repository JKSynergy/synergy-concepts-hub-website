@echo off
title QuickCredit System Startup
color 0A

echo =====================================
echo    QuickCredit Loan Management
echo         System Startup
echo =====================================
echo.

REM Set the base directory
set "BASE_DIR=E:\SYSTEMS AND WEBSITES\Quickcredit sysytem\quickcredit-modern"
set "BACKEND_DIR=%BASE_DIR%\backend"
set "FRONTEND_DIR=%BASE_DIR%\frontend"

REM Check if directories exist
if not exist "%BACKEND_DIR%" (
    echo Error: Backend directory not found at %BACKEND_DIR%
    pause
    exit /b 1
)

if not exist "%FRONTEND_DIR%" (
    echo Error: Frontend directory not found at %FRONTEND_DIR%
    pause
    exit /b 1
)

echo [1] Starting Backend Server...
start "QuickCredit Backend" cmd /c "cd /d \"%BACKEND_DIR%\" && node simple-api-server.js && pause"

timeout /t 3 /nobreak >nul

echo [2] Starting Frontend Development Server...
start "QuickCredit Frontend" cmd /c "cd /d \"%FRONTEND_DIR%\" && npm run dev && pause"

timeout /t 2 /nobreak >nul

echo.
echo =====================================
echo    System Started Successfully!
echo =====================================
echo.
echo Backend: http://localhost:3002
echo Frontend: http://localhost:3000
echo.
echo Press any key to open the dashboard...
pause >nul

start http://localhost:3000

echo.
echo Both servers are running in separate windows.
echo Close those windows to stop the servers.
echo.
pause