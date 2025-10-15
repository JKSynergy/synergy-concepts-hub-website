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
  if (!dateStr || dateStr === '') return null;
  
  // Handle YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr);
  }
  
  // Handle MM/DD/YYYY format
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const [month, day, year] = dateStr.split('/');
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  }
  
  // Handle DD/MM/YYYY format
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split('-');
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  }
  
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  if (!date) return 'N/A';
  return date.toISOString().split('T')[0];
}

async function updateOpeningDates() {
  try {
    console.log('=================================================');
    console.log('   UPDATE OPENING DATES FROM CSV');
    console.log('=================================================\n');

    // Load CSV file (use Savings.csv as primary source)
    const savingsCSVPath = path.join(__dirname, '../../Tables/Final Quick Credit Loan Management System - Savings.csv');
    const csvSavings = parseCSV(savingsCSVPath);

    // Load database
    const dbSavings = await prisma.savings.findMany({
      orderBy: { savingsId: 'asc' }
    });

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    console.log('🔄 Updating opening dates...\n');

    for (const csvAccount of csvSavings) {
      const accountId = csvAccount['Account ID'];
      const csvDateStr = csvAccount['Opening Date'];
      const csvDate = parseDate(csvDateStr);
      
      if (!csvDate) {
        console.log(`⏭️  ${accountId}: No valid opening date in CSV`);
        skipped++;
        continue;
      }

      const dbAccount = dbSavings.find(s => s.savingsId === accountId);
      
      if (!dbAccount) {
        console.log(`❌ ${accountId}: Not found in database`);
        errors++;
        continue;
      }

      const dbDateStr = formatDate(dbAccount.createdAt);
      const csvDateFormatted = formatDate(csvDate);

      if (dbDateStr === csvDateFormatted) {
        console.log(`✓  ${accountId}: Already correct (${csvDateFormatted})`);
        skipped++;
        continue;
      }

      try {
        await prisma.savings.update({
          where: { id: dbAccount.id },
          data: { createdAt: csvDate }
        });

        console.log(`✅ ${accountId}: ${dbDateStr} → ${csvDateFormatted}`);
        updated++;
      } catch (error) {
        console.error(`❌ ${accountId}: Failed - ${error.message}`);
        errors++;
      }
    }

    console.log('\n=================================================');
    console.log('                  SUMMARY');
    console.log('=================================================\n');
    console.log(`✅ Updated:  ${updated} accounts`);
    console.log(`⏭️  Skipped:  ${skipped} accounts`);
    console.log(`❌ Errors:   ${errors} accounts`);
    console.log('\n=================================================\n');

    if (updated > 0) {
      console.log('🔄 Verifying updates...\n');
      const updatedAccounts = await prisma.savings.findMany({
        orderBy: { savingsId: 'asc' }
      });

      console.log('📋 UPDATED DATABASE:\n');
      updatedAccounts.forEach(account => {
        console.log(`${account.savingsId}: ${formatDate(account.createdAt)}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateOpeningDates();
