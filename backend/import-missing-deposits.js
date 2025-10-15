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
  // Handle both YYYY-MM-DD and DD/MM/YYYY formats
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/');
    return new Date(`${year}-${month}-${day}`);
  }
  return new Date(dateStr);
}

function parseAmount(amountStr) {
  return parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;
}

async function importMissingDeposits() {
  try {
    console.log('=================================================');
    console.log('   IMPORTING MISSING DEPOSITS');
    console.log('=================================================\n');

    // Load CSV file
    const depositsCSVPath = path.join(__dirname, '../../Tables/Final Quick Credit Loan Management System - Deposits.csv');
    const csvDeposits = parseCSV(depositsCSVPath);

    // Get existing deposit IDs from database
    const existingDeposits = await prisma.deposit.findMany({
      select: { depositId: true }
    });
    const existingIds = new Set(existingDeposits.map(d => d.depositId));

    // Find missing deposits
    const missingDeposits = csvDeposits.filter(d => !existingIds.has(d['Deposit ID']));

    if (missingDeposits.length === 0) {
      console.log('✅ No missing deposits found. Database is up to date!');
      return;
    }

    console.log(`Found ${missingDeposits.length} missing deposits:\n`);

    let imported = 0;
    let failed = 0;

    for (const deposit of missingDeposits) {
      const depositId = deposit['Deposit ID'];
      const accountId = deposit['Account ID'];
      const dateStr = deposit['Date'];
      const amount = parseAmount(deposit['Amount']);
      const method = deposit['Method'] || 'Cash';

      try {
        // Check if savings account exists
        const account = await prisma.savings.findUnique({
          where: { savingsId: accountId }
        });

        if (!account) {
          console.log(`⚠️  Skipping ${depositId}: Account ${accountId} not found`);
          failed++;
          continue;
        }

        // Parse date
        const depositDate = parseDate(dateStr);

        // Insert deposit
        await prisma.deposit.create({
          data: {
            depositId,
            accountId,
            depositDate,
            amount,
            method
          }
        });

        // Update savings account balance
        await prisma.savings.update({
          where: { savingsId: accountId },
          data: {
            balance: {
              increment: amount
            }
          }
        });

        console.log(`✅ Imported: ${depositId} | ${accountId} | ${dateStr} | UGX ${amount.toLocaleString()}`);
        imported++;

      } catch (error) {
        console.error(`❌ Failed to import ${depositId}:`, error.message);
        failed++;
      }
    }

    console.log('\n=================================================');
    console.log(`✅ Successfully imported: ${imported} deposits`);
    if (failed > 0) {
      console.log(`❌ Failed to import: ${failed} deposits`);
    }
    console.log('=================================================\n');

    // Verify totals
    const allDeposits = await prisma.deposit.findMany();
    const totalAmount = allDeposits.reduce((sum, d) => sum + d.amount, 0);
    console.log(`📊 Database now has ${allDeposits.length} deposits totaling UGX ${totalAmount.toLocaleString()}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

importMissingDeposits();
