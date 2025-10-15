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

function parseDate(dateStr) {
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/');
    return new Date(`${year}-${month}-${day}`);
  }
  return new Date(dateStr);
}

function parseAmount(amountStr) {
  return parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;
}

async function syncDeposits() {
  console.log('📥 Syncing Deposits...');
  
  const depositsCSVPath = path.join(__dirname, '../../Tables/Final Quick Credit Loan Management System - Deposits.csv');
  const csvDeposits = parseCSV(depositsCSVPath);

  const existingDeposits = await prisma.deposit.findMany({
    select: { depositId: true }
  });
  const existingIds = new Set(existingDeposits.map(d => d.depositId));

  const missingDeposits = csvDeposits.filter(d => !existingIds.has(d['Deposit ID']));

  let imported = 0;
  let skipped = 0;

  for (const deposit of missingDeposits) {
    const depositId = deposit['Deposit ID'];
    const accountId = deposit['Account ID'];
    const amount = parseAmount(deposit['Amount']);
    const method = deposit['Method'] || 'Cash';

    try {
      const account = await prisma.savings.findUnique({
        where: { savingsId: accountId }
      });

      if (!account) {
        console.log(`   ⚠️  Skipped ${depositId}: Account ${accountId} not found`);
        skipped++;
        continue;
      }

      const depositDate = parseDate(deposit['Date']);

      await prisma.deposit.create({
        data: { depositId, accountId, depositDate, amount, method }
      });

      await prisma.savings.update({
        where: { savingsId: accountId },
        data: { balance: { increment: amount } }
      });

      imported++;
    } catch (error) {
      console.log(`   ❌ Failed ${depositId}: ${error.message}`);
      skipped++;
    }
  }

  return { type: 'Deposits', imported, skipped, total: csvDeposits.length };
}

async function syncWithdrawals() {
  console.log('📤 Syncing Withdrawals...');
  
  const withdrawalsCSVPath = path.join(__dirname, '../../Tables/Final Quick Credit Loan Management System - Withdrawals.csv');
  const csvWithdrawals = parseCSV(withdrawalsCSVPath);

  const existingWithdrawals = await prisma.withdrawal.findMany();
  
  // Create a unique key for matching (accountId + date + amount)
  const existingKeys = new Set(
    existingWithdrawals.map(w => 
      `${w.accountId}_${w.withdrawalDate.toISOString().split('T')[0]}_${w.amount}`
    )
  );

  let imported = 0;
  let skipped = 0;

  for (const withdrawal of csvWithdrawals) {
    const accountId = withdrawal['Account ID'];
    const amount = parseAmount(withdrawal['Amount']);
    const method = withdrawal['Method'] || 'Cash';
    const withdrawalDate = parseDate(withdrawal['Date']);
    
    const key = `${accountId}_${withdrawalDate.toISOString().split('T')[0]}_${amount}`;

    if (existingKeys.has(key)) {
      continue; // Already exists
    }

    try {
      const account = await prisma.savings.findUnique({
        where: { savingsId: accountId }
      });

      if (!account) {
        console.log(`   ⚠️  Skipped withdrawal: Account ${accountId} not found`);
        skipped++;
        continue;
      }

      await prisma.withdrawal.create({
        data: { accountId, withdrawalDate, amount, method }
      });

      await prisma.savings.update({
        where: { savingsId: accountId },
        data: { balance: { decrement: amount } }
      });

      imported++;
    } catch (error) {
      console.log(`   ❌ Failed withdrawal: ${error.message}`);
      skipped++;
    }
  }

  return { type: 'Withdrawals', imported, skipped, total: csvWithdrawals.length };
}

async function autoSync() {
  try {
    console.log('\n=================================================');
    console.log('   AUTOMATIC CSV TO DATABASE SYNC');
    console.log('=================================================\n');
    console.log(`Started at: ${new Date().toLocaleString()}\n`);

    const depositResult = await syncDeposits();
    const withdrawalResult = await syncWithdrawals();

    console.log('\n=================================================');
    console.log('                 SYNC SUMMARY');
    console.log('=================================================\n');

    console.log(`📥 ${depositResult.type}:`);
    console.log(`   CSV Records:     ${depositResult.total}`);
    console.log(`   New Imported:    ${depositResult.imported}`);
    console.log(`   Skipped/Failed:  ${depositResult.skipped}`);
    console.log(`   Database Total:  ${depositResult.total - depositResult.skipped + depositResult.imported}`);

    console.log(`\n📤 ${withdrawalResult.type}:`);
    console.log(`   CSV Records:     ${withdrawalResult.total}`);
    console.log(`   New Imported:    ${withdrawalResult.imported}`);
    console.log(`   Skipped/Failed:  ${withdrawalResult.skipped}`);
    console.log(`   Database Total:  ${withdrawalResult.total - withdrawalResult.skipped + withdrawalResult.imported}`);

    // Get updated totals
    const allDeposits = await prisma.deposit.findMany();
    const allWithdrawals = await prisma.withdrawal.findMany();
    const depositTotal = allDeposits.reduce((sum, d) => sum + d.amount, 0);
    const withdrawalTotal = allWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    const netBalance = depositTotal - withdrawalTotal;

    console.log('\n💰 FINANCIAL SUMMARY:');
    console.log(`   Total Deposits:    UGX ${depositTotal.toLocaleString()}`);
    console.log(`   Total Withdrawals: UGX ${withdrawalTotal.toLocaleString()}`);
    console.log(`   Net Balance:       UGX ${netBalance.toLocaleString()}`);

    console.log('\n=================================================');
    if (depositResult.imported > 0 || withdrawalResult.imported > 0) {
      console.log('✅ Sync completed successfully!');
    } else {
      console.log('✅ Database already up to date!');
    }
    console.log('=================================================\n');

  } catch (error) {
    console.error('❌ Sync failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  autoSync();
}

module.exports = { autoSync };
