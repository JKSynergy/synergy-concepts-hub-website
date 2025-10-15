# ⚡ Quick Reference: CSV Sync Commands

## 📊 Current Status
```
✅ Deposits:    134 records | UGX 4,958,700
✅ Withdrawals:  21 records | UGX 1,972,500
✅ Net Balance:              UGX 2,986,200
```

---

## 🚀 Quick Commands

### Sync Everything (Recommended)
```bash
cd backend
npm run sync
```
✅ Imports new deposits & withdrawals
✅ Safe to run anytime
✅ Shows detailed summary

---

### Compare CSV vs Database
```bash
cd backend
npm run compare
```
📊 Shows differences
📊 Validates dates
📊 Checks amounts

---

### Import Missing Deposits Only
```bash
cd backend
npm run import-deposits
```
📥 Imports deposits only
📥 Updates account balances

---

## 📁 CSV File Locations
```
E:\SYSTEMS AND WEBSITES\Quickcredit sysytem\Tables\
├── Final Quick Credit Loan Management System - Deposits.csv
└── Final Quick Credit Loan Management System - Withdrawals.csv
```

---

## 🔄 Workflow

1. **Update CSV files** in Tables folder
2. **Run sync:** `npm run sync`
3. **Verify:** Check dashboard at http://localhost:3000
4. **Done!** ✅

---

## ✅ What's Synced

### Deposits CSV → Database
- ✅ Deposit ID
- ✅ Account ID  
- ✅ Date (auto-parsed)
- ✅ Amount (auto-formatted)
- ✅ Method
- ✅ Updates account balance

### Withdrawals CSV → Database
- ✅ Account ID
- ✅ Date (auto-parsed)
- ✅ Amount
- ✅ Method
- ✅ Updates account balance

---

## 🛡️ Safety Features

✅ **No Duplicates** - Checks before import
✅ **Account Validation** - Only valid accounts
✅ **Balance Updates** - Automatic calculation
✅ **Error Handling** - Continues on failure
✅ **Detailed Logs** - See what happened

---

## 📞 Need Help?

Run comparison to diagnose:
```bash
npm run compare
```

Check full documentation:
```
CSV-SYNC-GUIDE.md
```

---

*Scripts: backend/auto-sync-csv.js, import-missing-deposits.js, compare-savings-data.js*
