# CSV to Database Sync Guide

## ✅ Success! Database is Now Synced

**Current Status:**
- ✅ Deposits: 134/134 records (100% match)
- ✅ Withdrawals: 21/21 records (100% match)
- ✅ Total Deposits: UGX 4,958,700
- ✅ Total Withdrawals: UGX 1,972,500
- ✅ Net Balance: UGX 2,986,200

---

## 🔧 Available Sync Scripts

### 1. **Compare CSV vs Database**
Check for differences without making changes:

```bash
cd backend
node compare-savings-data.js
```

**Output:**
- Record counts comparison
- Missing/extra records
- Date format validation
- Amount totals verification

---

### 2. **Import Missing Deposits**
Import only new deposits that don't exist in database:

```bash
cd backend
node import-missing-deposits.js
```

**What it does:**
- ✅ Finds deposits in CSV but not in database
- ✅ Validates account existence
- ✅ Imports with proper date parsing
- ✅ Updates savings account balances
- ✅ Shows detailed import results

---

### 3. **Automatic Sync (Recommended)**
Sync both deposits and withdrawals automatically:

```bash
cd backend
node auto-sync-csv.js
```

**Features:**
- 🔄 Syncs deposits from CSV
- 🔄 Syncs withdrawals from CSV
- 🔍 Detects duplicates (won't create duplicates)
- 📊 Shows comprehensive summary
- ✅ Safe to run multiple times

---

## 📋 How to Use (Step by Step)

### Daily/Weekly Sync Workflow:

1. **Update your CSV files** in the `Tables` folder:
   - `Final Quick Credit Loan Management System - Deposits.csv`
   - `Final Quick Credit Loan Management System - Withdrawals.csv`

2. **Run the auto-sync:**
   ```bash
   cd "E:\SYSTEMS AND WEBSITES\Quickcredit sysytem\quickcredit-modern\backend"
   node auto-sync-csv.js
   ```

3. **Verify the sync:**
   ```bash
   node compare-savings-data.js
   ```

4. **Check your dashboard:**
   - Open http://localhost:3000
   - Summary cards should show updated totals
   - Savings page should show new deposits/withdrawals

---

## 🛠️ NPM Commands (Coming Soon)

Add these to `package.json` in the backend folder:

```json
{
  "scripts": {
    "sync": "node auto-sync-csv.js",
    "compare": "node compare-savings-data.js",
    "import-deposits": "node import-missing-deposits.js"
  }
}
```

Then you can simply run:
```bash
npm run sync          # Auto-sync all data
npm run compare       # Compare CSV vs DB
npm run import-deposits  # Import missing deposits only
```

---

## 📅 Date Format Support

Both scripts handle multiple date formats:

✅ **YYYY-MM-DD** (e.g., 2025-10-06)
✅ **DD/MM/YYYY** (e.g., 17/07/2025)

The scripts automatically detect and parse correctly!

---

## 💾 CSV File Structure

### Deposits CSV Format:
```csv
Deposit ID,Account ID,Date,Amount,Method
DEP-1759953607742,SAV012,2025-10-06,"UGX2,000.00",Airtel
```

**Required columns:**
- `Deposit ID` - Unique identifier
- `Account ID` - Must match a savings account (e.g., SAV012)
- `Date` - YYYY-MM-DD or DD/MM/YYYY
- `Amount` - Can include "UGX" and commas
- `Method` - Payment method (optional, defaults to "Cash")

### Withdrawals CSV Format:
```csv
Account ID,Date,Amount,Method
SAV0001,2025-08-03,250000,MTN
```

**Required columns:**
- `Account ID` - Must match a savings account
- `Date` - YYYY-MM-DD or DD/MM/YYYY
- `Amount` - Numeric value
- `Method` - Payment method (optional)

---

## 🔐 Safety Features

✅ **Duplicate Prevention:**
- Deposits: Checked by `depositId`
- Withdrawals: Checked by `accountId + date + amount` combination

✅ **Account Validation:**
- Only imports if savings account exists
- Shows warning for missing accounts

✅ **Balance Updates:**
- Deposits: Automatically increases account balance
- Withdrawals: Automatically decreases account balance

✅ **Error Handling:**
- Failed imports are logged
- Successful imports continue even if one fails
- Detailed error messages for troubleshooting

---

## 📊 What Was Fixed

### Before Sync:
```
CSV Deposits:      134
Database Deposits: 131
Missing:           3 deposits (UGX 1,004,000)
```

### After Sync:
```
CSV Deposits:      134
Database Deposits: 134
Missing:           0 ✅
```

**The 3 imported deposits:**
1. DEP-1759953607742 | SAV012 | 2025-10-06 | UGX 2,000
2. DEP-1759956600320 | SAV012 | 2025-10-07 | UGX 2,000
3. DEP-1759956643106 | SAV010 | 2025-10-08 | UGX 1,000,000

---

## 🚀 Automated Scheduling (Optional)

### Option A: Windows Task Scheduler
Run sync automatically every day:

1. Open Task Scheduler
2. Create Basic Task → "QuickCredit Daily Sync"
3. Trigger: Daily at 11:00 PM
4. Action: Start a program
5. Program: `node`
6. Arguments: `auto-sync-csv.js`
7. Start in: `E:\SYSTEMS AND WEBSITES\Quickcredit sysytem\quickcredit-modern\backend`

### Option B: Manual Sync After CSV Updates
Simply run the auto-sync command whenever you update the CSV files.

---

## 🐛 Troubleshooting

### "Account not found" errors
**Problem:** CSV has account ID that doesn't exist in database

**Solution:** Check the Savings table in database:
```bash
node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); p.savings.findMany().then(s => s.forEach(a => console.log(a.savingsId)))"
```

### Dates not parsing correctly
**Problem:** Unusual date format in CSV

**Solution:** Update the `parseDate()` function in the sync scripts to handle your format

### Duplicate entries
**Problem:** Same deposit appearing twice

**Solution:** The scripts automatically prevent duplicates. Run `compare-savings-data.js` to verify.

---

## 📞 Support

If you encounter issues:
1. Run `compare-savings-data.js` to diagnose the problem
2. Check the error messages in terminal
3. Verify CSV file format matches expected structure
4. Ensure all savings accounts exist in database

---

*Last updated: October 15, 2025*
*Scripts location: `backend/` folder*
