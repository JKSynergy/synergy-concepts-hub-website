# QuickCredit System - Startup Options

This document explains the different ways to start the QuickCredit Loan Management System.

## Server Configuration
- **Backend Server**: Port 3002 (http://localhost:3002)
- **Frontend Server**: Port 3000 (http://localhost:3000)

## Startup Methods

### Method 1: PowerShell Script (Recommended)
The most reliable method with error checking and status monitoring:

```powershell
# From PowerShell (in the quickcredit-modern directory)
powershell.exe -ExecutionPolicy Bypass -File "Start-QuickCredit-System.ps1"
```

### Method 2: Quick Start Script
Simple launcher for both servers:

```powershell
# From PowerShell (in the quickcredit-modern directory)
.\quickstart.ps1

# Or start individual servers:
.\quickstart.ps1 -Backend     # Start only backend
.\quickstart.ps1 -Frontend    # Start only frontend
```

### Method 3: Batch File
Traditional batch file approach:

```cmd
# From Command Prompt (in the quickcredit-modern directory)
Start-QuickCredit-System.bat
```

### Method 4: Individual Server Scripts
Start servers separately:

```cmd
# Start only backend
start-backend-only.bat

# Start only frontend  
start-frontend-only.bat
```

### Method 5: Manual Start
Start servers manually from their respective directories:

```powershell
# Terminal 1 - Backend
cd "backend"
node simple-api-server.js

# Terminal 2 - Frontend
cd "frontend"  
npm run dev
```

## Troubleshooting

### Common Issues
1. **PowerShell execution policy**: Run `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`
2. **Directory navigation**: Always run scripts from the `quickcredit-modern` folder
3. **Port conflicts**: Ensure ports 3000 and 3002 are not in use by other applications

### Checking if servers are running
```powershell
# Test backend
Test-NetConnection -ComputerName localhost -Port 3002

# Test frontend
Test-NetConnection -ComputerName localhost -Port 3000
```

### Stopping the servers
Close the PowerShell/Command Prompt windows where the servers are running, or use Ctrl+C in the terminal.

## File Structure
```
quickcredit-modern/
├── Start-QuickCredit-System.ps1    # Main PowerShell launcher
├── Start-QuickCredit-System.bat    # Batch file launcher
├── quickstart.ps1                  # Simple PowerShell launcher
├── launch.bat                      # Batch file that calls PowerShell
├── start-backend-only.bat          # Backend only
├── start-frontend-only.bat         # Frontend only
├── backend/
│   └── simple-api-server.js
└── frontend/
    └── package.json
```