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

async function verifyPhoneNumbers() {
  try {
    console.log('=================================================');
    console.log('   PHONE NUMBER VERIFICATION');
    console.log('=================================================\n');

    // Load CSV file
    const saversCSVPath = path.join(__dirname, '../../Tables/Final Quick Credit Loan Management System - Savers.csv');
    const csvSavers = parseCSV(saversCSVPath);

    // Load database borrowers (linked to savings accounts)
    const savings = await prisma.savings.findMany({
      include: {
        borrower: true
      },
      orderBy: {
        savingsId: 'asc'
      }
    });

    console.log('📊 ACCOUNT VERIFICATION:\n');

    let matches = 0;
    let mismatches = 0;
    let missingInDB = 0;
    let phoneIssues = [];

    for (const csvSaver of csvSavers) {
      const accountId = csvSaver['Account ID'];
      const csvName = csvSaver['Customer Name'];
      const csvPhone = csvSaver['Phone Number'];
      const csvEmail = csvSaver['Email'];

      const dbAccount = savings.find(s => s.savingsId === accountId);

      if (!dbAccount) {
        console.log(`❌ ${accountId} | ${csvName} | NOT FOUND IN DATABASE`);
        missingInDB++;
        continue;
      }

      const borrower = dbAccount.borrower;
      const dbName = borrower ? `${borrower.firstName} ${borrower.lastName}` : 'NO BORROWER LINKED';
      const dbPhone = borrower?.phone || 'NO PHONE';
      const dbEmail = borrower?.email || 'NO EMAIL';

      // Compare details
      const nameMatch = csvName.toUpperCase().includes(borrower?.firstName?.toUpperCase() || '');
      const phoneMatch = csvPhone === dbPhone || (csvPhone === '' && dbPhone === 'NO PHONE');
      const emailMatch = csvEmail === dbEmail || (csvEmail === '' && dbEmail === 'NO EMAIL');

      if (nameMatch && (phoneMatch || csvPhone === '')) {
        console.log(`✅ ${accountId} | ${csvName}`);
        console.log(`   CSV Phone: ${csvPhone || 'NOT PROVIDED'} | DB Phone: ${dbPhone}`);
        if (csvEmail || dbEmail !== 'NO EMAIL') {
          console.log(`   CSV Email: ${csvEmail || 'NOT PROVIDED'} | DB Email: ${dbEmail}`);
        }
        console.log('');
        matches++;
      } else {
        console.log(`⚠️  ${accountId} | MISMATCH DETECTED:`);
        console.log(`   CSV Name:  ${csvName}`);
        console.log(`   DB Name:   ${dbName}`);
        console.log(`   CSV Phone: ${csvPhone || 'NOT PROVIDED'}`);
        console.log(`   DB Phone:  ${dbPhone}`);
        if (csvEmail || dbEmail !== 'NO EMAIL') {
          console.log(`   CSV Email: ${csvEmail || 'NOT PROVIDED'}`);
          console.log(`   DB Email:  ${dbEmail}`);
        }
        console.log('');
        
        if (!phoneMatch && csvPhone) {
          phoneIssues.push({
            accountId,
            name: csvName,
            csvPhone,
            dbPhone
          });
        }
        mismatches++;
      }
    }

    console.log('\n=================================================');
    console.log('                  SUMMARY');
    console.log('=================================================\n');
    console.log(`✅ Matching Accounts:    ${matches}`);
    console.log(`⚠️  Mismatched Accounts: ${mismatches}`);
    console.log(`❌ Missing in Database:  ${missingInDB}`);
    console.log(`📱 Phone Issues:         ${phoneIssues.length}`);

    if (phoneIssues.length > 0) {
      console.log('\n📱 PHONE NUMBER ISSUES DETAIL:\n');
      phoneIssues.forEach(issue => {
        console.log(`${issue.accountId} | ${issue.name}`);
        console.log(`  CSV: ${issue.csvPhone}`);
        console.log(`  DB:  ${issue.dbPhone}`);
        console.log('');
      });
    }

    // Check for phone format issues
    console.log('\n📞 PHONE FORMAT ANALYSIS:\n');
    const phoneFormats = {
      'Valid (10 digits)': 0,
      'Valid (with +256)': 0,
      'Missing/Empty': 0,
      'Invalid Format': 0
    };

    csvSavers.forEach(saver => {
      const phone = saver['Phone Number'];
      if (!phone || phone === '') {
        phoneFormats['Missing/Empty']++;
      } else if (/^\d{9,10}$/.test(phone)) {
        phoneFormats['Valid (10 digits)']++;
      } else if (/^\+256\d{9}$/.test(phone)) {
        phoneFormats['Valid (with +256)']++;
      } else {
        phoneFormats['Invalid Format']++;
      }
    });

    Object.entries(phoneFormats).forEach(([format, count]) => {
      console.log(`${format}: ${count}`);
    });

    // List all database borrowers with their savings accounts
    console.log('\n\n📋 DATABASE BORROWERS WITH SAVINGS:\n');
    for (const account of savings) {
      if (account.borrower) {
        const b = account.borrower;
        console.log(`${account.savingsId} | ${b.firstName} ${b.lastName}`);
        console.log(`  Phone: ${b.phone || 'NOT SET'}`);
        console.log(`  Email: ${b.email || 'NOT SET'}`);
        console.log(`  Balance: UGX ${account.balance.toLocaleString()}`);
        console.log('');
      } else {
        console.log(`${account.savingsId} | NO BORROWER LINKED`);
        console.log(`  Balance: UGX ${account.balance.toLocaleString()}`);
        console.log('');
      }
    }

    console.log('=================================================\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyPhoneNumbers();
