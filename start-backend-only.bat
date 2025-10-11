@echo off
echo Starting QuickCredit Backend Server...
cd /d "%~dp0backend"
node simple-api-server.js
pause