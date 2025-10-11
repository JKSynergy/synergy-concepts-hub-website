@echo off
REM QuickCredit System Launcher
REM This batch file reliably starts the PowerShell script

echo Starting QuickCredit System...
echo.

REM Change to the script directory
cd /d "%~dp0"

REM Run the PowerShell script
powershell.exe -ExecutionPolicy Bypass -File ".\Start-QuickCredit-System.ps1"

REM If PowerShell fails, try the quickstart script
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Trying alternative launcher...
    powershell.exe -ExecutionPolicy Bypass -File ".\quickstart.ps1"
)

echo.
echo Press any key to close this window...
pause >nul