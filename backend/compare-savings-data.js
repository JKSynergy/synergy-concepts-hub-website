const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(h => h.trim());
  
  return lines.slice(1).map(line => {
    const values = line.match(/(?:\"[^\"]*\"|[^,])+/g) || [];
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] ? values[index].replace(/^"|"$/g, '').trim() : '';
    });
    return obj;
  });
}

async function compareData() {
  try {
    console.log('=================================================');
    console.log('   SAVINGS DATA COMPARISON - CSV vs DATABASE');
    console.log('=================================================\n');

    // Load CSV files
    const depositsCSVPath = path.join(__dirname, '../../Tables/Final Quick Credit Loan Management System - Deposits.csv');
    const withdrawalsCSVPath = path.join(__dirname, '../../Tables/Final Quick Credit Loan Management System - Withdrawals.csv');
    
    const csvDeposits = parseCSV(depositsCSVPath);
    const csvWithdrawals = parseCSV(withdrawalsCSVPath);

    // Load database records
    const dbDeposits = await prisma.deposit.findMany({
      orderBy: { depositDate: 'asc' }
    });
    const dbWithdrawals = await prisma.withdrawal.findMany({
      orderBy: { withdrawalDate: 'asc' }
    });

    console.log('📊 RECORD COUNTS:');
    console.log('─────────────────────────────────────────────────');
    console.log(`CSV Deposits:      ${csvDeposits.length}`);
    console.log(`Database Deposits: ${dbDeposits.length}`);
    console.log(`Difference:        ${csvDeposits.length - dbDeposits.length}`);
    console.log();
    console.log(`CSV Withdrawals:      ${csvWithdrawals.length}`);
    console.log(`Database Withdrawals: ${dbWithdrawals.length}`);
    console.log(`Difference:           ${csvWithdrawals.length - dbWithdrawals.length}`);
    console.log();

    // Compare deposits
    console.log('🔍 DEPOSITS ANALYSIS:');
    console.log('─────────────────────────────────────────────────');
    
    const csvDepositIds = new Set(csvDeposits.map(d => d['Deposit ID']));
    const dbDepositIds = new Set(dbDeposits.map(d => d.depositId));

    const missingInDB = csvDeposits.filter(d => !dbDepositIds.has(d['Deposit ID']));
    const extraInDB = dbDeposits.filter(d => !csvDepositIds.has(d.depositId));

    if (missingInDB.length > 0) {
      console.log(`\n❌ ${missingInDB.length} deposits in CSV but MISSING in database:`);
      missingInDB.forEach(d => {
        console.log(`   ${d['Deposit ID']} | ${d['Account ID']} | ${d['Date']} | ${d['Amount']}`);
      });
    } else {
      console.log('✅ All CSV deposits found in database');
    }

    if (extraInDB.length > 0) {
      console.log(`\n⚠️  ${extraInDB.length} deposits in database but NOT in CSV:`);
      extraInDB.slice(0, 10).forEach(d => {
        console.log(`   ${d.depositId} | ${d.accountId} | ${d.depositDate} | ${d.amount}`);
      });
      if (extraInDB.length > 10) console.log(`   ... and ${extraInDB.length - 10} more`);
    }

    // Check date formats
    console.log('\n📅 DEPOSIT DATE FORMATS:');
    console.log('─────────────────────────────────────────────────');
    console.log('First 5 CSV dates:');
    csvDeposits.slice(0, 5).forEach(d => {
      console.log(`   ${d['Deposit ID']}: ${d['Date']}`);
    });
    console.log('\nFirst 5 Database dates:');
    dbDeposits.slice(0, 5).forEach(d => {
      console.log(`   ${d.depositId}: ${d.depositDate}`);
    });

    // Compare withdrawals
    console.log('\n\n🔍 WITHDRAWALS ANALYSIS:');
    console.log('─────────────────────────────────────────────────');

    console.log('\nAll CSV Withdrawals:');
    csvWithdrawals.forEach((w, idx) => {
      console.log(`   ${idx + 1}. ${w['Account ID']} | ${w['Date']} | ${w['Amount']} | ${w['Method']}`);
    });

    console.log('\nAll Database Withdrawals:');
    dbWithdrawals.forEach((w, idx) => {
      console.log(`   ${idx + 1}. ${w.accountId} | ${w.withdrawalDate} | ${w.amount} | ${w.method || 'N/A'}`);
    });

    // Date format analysis for withdrawals
    console.log('\n📅 WITHDRAWAL DATE FORMATS:');
    console.log('─────────────────────────────────────────────────');
    console.log('CSV dates format check:');
    csvWithdrawals.slice(0, 5).forEach(w => {
      const dateStr = w['Date'];
      console.log(`   ${dateStr} | Format: ${dateStr.includes('/') ? 'DD/MM/YYYY' : 'YYYY-MM-DD'}`);
    });
    console.log('\nDatabase dates format check:');
    dbWithdrawals.slice(0, 5).forEach(w => {
      console.log(`   ${w.withdrawalDate} | Type: ${typeof w.withdrawalDate}`);
    });

    // Amount comparison
    console.log('\n\n💰 AMOUNT ANALYSIS:');
    console.log('─────────────────────────────────────────────────');
    
    const csvDepositTotal = csvDeposits.reduce((sum, d) => {
      const amount = parseFloat(d['Amount'].replace(/[^0-9.]/g, '')) || 0;
      return sum + amount;
    }, 0);
    
    const dbDepositTotal = dbDeposits.reduce((sum, d) => sum + d.amount, 0);
    
    const csvWithdrawalTotal = csvWithdrawals.reduce((sum, w) => {
      const amount = parseFloat(w['Amount'].replace(/[^0-9.]/g, '')) || 0;
      return sum + amount;
    }, 0);
    
    const dbWithdrawalTotal = dbWithdrawals.reduce((sum, w) => sum + w.amount, 0);

    console.log(`CSV Deposits Total:      UGX ${csvDepositTotal.toLocaleString()}`);
    console.log(`Database Deposits Total: UGX ${dbDepositTotal.toLocaleString()}`);
    console.log(`Difference:              UGX ${(csvDepositTotal - dbDepositTotal).toLocaleString()}`);
    console.log();
    console.log(`CSV Withdrawals Total:      UGX ${csvWithdrawalTotal.toLocaleString()}`);
    console.log(`Database Withdrawals Total: UGX ${dbWithdrawalTotal.toLocaleString()}`);
    console.log(`Difference:                 UGX ${(csvWithdrawalTotal - dbWithdrawalTotal).toLocaleString()}`);

    console.log('\n=================================================');
    console.log('                 END OF COMPARISON');
    console.log('=================================================\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

compareData();
