# QuickCredit System Startup Methods

## 🚀 Quick Start (Recommended)

### Method 1: Use the Startup Script
**Double-click this file:**
```
Start-QuickCredit-System.bat
```

This will:
- ✅ Start the backend server (port 3002)
- ✅ Start the frontend server (port 3000)
- ✅ Open the dashboard in your browser
- ✅ Keep both servers running in separate windows

**Servers will stay running until you close the terminal windows!**

---

## 📋 Alternative Methods

### Method 2: Manual Start (Two Terminals)

**Terminal 1 - Backend:**
```powershell
cd "E:\SYSTEMS AND WEBSITES\Quickcredit sysytem\quickcredit-modern\backend"
npm run dev
```

**Terminal 2 - Frontend:**
```powershell
cd "E:\SYSTEMS AND WEBSITES\Quickcredit sysytem\quickcredit-modern\frontend"
npm run dev
```

---

### Method 3: PowerShell Script

Run this in PowerShell:
```powershell
# Start backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'E:\SYSTEMS AND WEBSITES\Quickcredit sysytem\quickcredit-modern\backend'; npm run dev"

# Wait 5 seconds
Start-Sleep -Seconds 5

# Start frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'E:\SYSTEMS AND WEBSITES\Quickcredit sysytem\quickcredit-modern\frontend'; npm run dev"

# Wait 3 seconds
Start-Sleep -Seconds 3

# Open browser
Start-Process "http://localhost:3000"
```

---

## 🔍 Check If Servers Are Running

Run this command:
```powershell
netstat -ano | findstr "3000 3002" | findstr "LISTENING"
```

You should see:
```
TCP    0.0.0.0:3002    ...    LISTENING    <PID>
TCP    0.0.0.0:3000    ...    LISTENING    <PID>
```

---

## 🛑 Stop All Servers

If servers are stuck or you want to restart:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

Then wait 2-3 seconds before starting again.

---

## 🌐 Access URLs

- **Dashboard (Frontend):** http://localhost:3000
- **API (Backend):** http://localhost:3002/api
- **API Health Check:** http://localhost:3002/api/health

---

## ⚙️ Making It Permanent (Auto-start on Boot)

### Option A: Windows Startup Folder
1. Press `Win + R`
2. Type: `shell:startup`
3. Create a shortcut to `Start-QuickCredit-System.bat` in this folder
4. Servers will auto-start when Windows boots

### Option B: Task Scheduler (Better for Production)
1. Open Task Scheduler
2. Create Basic Task
3. Name: "QuickCredit System"
4. Trigger: "When I log on"
5. Action: "Start a program"
6. Program: `E:\SYSTEMS AND WEBSITES\Quickcredit sysytem\quickcredit-modern\Start-QuickCredit-System.bat`
7. ✅ Check "Run with highest privileges"

### Option C: Windows Service (Most Reliable)
Use PM2 or NSSM to run as a Windows service:

**Install PM2:**
```powershell
npm install -g pm2
npm install -g pm2-windows-startup
pm2-startup install
```

**Start with PM2:**
```powershell
cd "E:\SYSTEMS AND WEBSITES\Quickcredit sysytem\quickcredit-modern\backend"
pm2 start npm --name "quickcredit-backend" -- run dev

cd "E:\SYSTEMS AND WEBSITES\Quickcredit sysytem\quickcredit-modern\frontend"
pm2 start npm --name "quickcredit-frontend" -- run dev

pm2 save
```

**Manage PM2 services:**
```powershell
pm2 list              # View all services
pm2 restart all       # Restart all
pm2 stop all          # Stop all
pm2 logs             # View logs
pm2 monit            # Monitor in real-time
```

---

## 🐛 Troubleshooting

### Frontend shows "ERR_CONNECTION_REFUSED"
- Check if frontend is running: `netstat -ano | findstr "3000"`
- If not running, start it: `cd frontend && npm run dev`

### Backend not responding
- Check if backend is running: `netstat -ano | findstr "3002"`
- Check logs in the terminal window
- Restart: Stop all node processes and run startup script again

### Port already in use
```powershell
# Find process using port 3000
netstat -ano | findstr "3000"

# Kill the process (replace <PID> with actual number)
taskkill /PID <PID> /F
```

### Servers keep stopping
- Don't close the terminal windows!
- Use PM2 for persistent running
- Check if antivirus is blocking Node.js

---

## 💡 Tips

1. **Keep terminal windows open** - Closing them stops the servers
2. **Use the BAT file** - It's the easiest way to start both servers
3. **Check logs** - Terminal windows show errors if something goes wrong
4. **Bookmark the dashboard** - http://localhost:3000
5. **Use PM2 for production** - Much more reliable than terminal windows

---

## 📊 Current Configuration

- **Backend Port:** 3002
- **Frontend Port:** 3000
- **Database:** SQLite (backend/database.db)
- **API Base URL:** http://localhost:3002/api

---

*Last updated: October 15, 2025*
