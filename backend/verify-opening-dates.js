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
  
  // Try direct parsing
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  if (!date) return 'N/A';
  return date.toISOString().split('T')[0];
}

async function verifyOpeningDates() {
  try {
    console.log('=================================================');
    console.log('   OPENING DATES VERIFICATION');
    console.log('=================================================\n');

    // Load CSV files
    const savingsCSVPath = path.join(__dirname, '../../Tables/Final Quick Credit Loan Management System - Savings.csv');
    const saversCSVPath = path.join(__dirname, '../../Tables/Final Quick Credit Loan Management System - Savers.csv');
    
    const csvSavings = parseCSV(savingsCSVPath);
    const csvSavers = parseCSV(saversCSVPath);

    // Load database
    const dbSavings = await prisma.savings.findMany({
      orderBy: { savingsId: 'asc' }
    });

    console.log('📅 DATE FORMAT ANALYSIS:\n');
    
    console.log('Savings CSV Opening Dates (first 5):');
    csvSavings.slice(0, 5).forEach(s => {
      console.log(`  ${s['Account ID']}: ${s['Opening Date']}`);
    });

    console.log('\nSavers CSV Opening Dates (first 10):');
    csvSavers.slice(0, 10).forEach(s => {
      console.log(`  ${s['Account ID']}: ${s['Opening Date'] || 'EMPTY'}`);
    });

    console.log('\n\n📊 COMPARISON:\n');

    let matches = 0;
    let mismatches = 0;
    let needsUpdate = [];

    for (const csvAccount of csvSavings) {
      const accountId = csvAccount['Account ID'];
      const csvDate = parseDate(csvAccount['Opening Date']);
      
      const dbAccount = dbSavings.find(s => s.savingsId === accountId);
      
      if (!dbAccount) {
        console.log(`❌ ${accountId}: Not found in database`);
        continue;
      }

      const dbDate = dbAccount.createdAt;
      
      const csvDateStr = formatDate(csvDate);
      const dbDateStr = formatDate(dbDate);

      if (csvDateStr === dbDateStr) {
        console.log(`✅ ${accountId}: ${csvDateStr} (Match)`);
        matches++;
      } else {
        console.log(`⚠️  ${accountId}:`);
        console.log(`   CSV:      ${csvDateStr}`);
        console.log(`   Database: ${dbDateStr}`);
        console.log('');
        mismatches++;
        
        if (csvDate) {
          needsUpdate.push({
            id: dbAccount.id,
            savingsId: accountId,
            csvDate,
            dbDate
          });
        }
      }
    }

    console.log('\n=================================================');
    console.log('                  SUMMARY');
    console.log('=================================================\n');
    console.log(`✅ Matching:  ${matches} accounts`);
    console.log(`⚠️  Mismatched: ${mismatches} accounts`);
    console.log(`🔄 Need Update: ${needsUpdate.length} accounts`);

    if (needsUpdate.length > 0) {
      console.log('\n📋 ACCOUNTS THAT NEED UPDATING:\n');
      needsUpdate.forEach(account => {
        console.log(`${account.savingsId}:`);
        console.log(`  Current: ${formatDate(account.dbDate)}`);
        console.log(`  Should be: ${formatDate(account.csvDate)}`);
        console.log('');
      });
    }

    console.log('\n=================================================\n');

    return needsUpdate;

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyOpeningDates();
