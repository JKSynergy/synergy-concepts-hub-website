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

function normalizePhone(phone) {
  if (!phone || phone === '') return null;
  
  // Remove spaces and special characters
  phone = phone.replace(/[\s\-\(\)]/g, '');
  
  // Check if it looks like a phone number (digits only)
  if (!/^\d+$/.test(phone)) return null;
  
  // Handle Ugandan numbers
  if (phone.length === 9) {
    return `+256${phone}`;
  } else if (phone.length === 10 && phone.startsWith('0')) {
    return `+256${phone.substring(1)}`;
  } else if (phone.length === 12 && phone.startsWith('256')) {
    return `+${phone}`;
  } else if (phone.length === 13 && phone.startsWith('+256')) {
    return phone;
  }
  
  return phone; // Return as-is if doesn't match patterns
}

async function updatePhoneNumbers() {
  try {
    console.log('=================================================');
    console.log('   UPDATE PHONE NUMBERS FROM CSV');
    console.log('=================================================\n');

    const saversCSVPath = path.join(__dirname, '../../Tables/Final Quick Credit Loan Management System - Savers.csv');
    const csvSavers = parseCSV(saversCSVPath);

    const savings = await prisma.savings.findMany({
      include: { borrower: true }
    });

    console.log('📱 ANALYZING CSV DATA:\n');
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const csvSaver of csvSavers) {
      const accountId = csvSaver['Account ID'];
      const csvName = csvSaver['Customer Name'];
      const csvEmail = csvSaver['Email']; // This column might have phone numbers
      const csvPhone = csvSaver['Phone Number']; // This column might have addresses
      
      // Check both columns for phone numbers
      let actualPhone = null;
      let actualEmail = null;
      
      // The "Email" column has phone numbers for first 5 accounts
      if (/^\d{9,10}$/.test(csvEmail)) {
        actualPhone = csvEmail;
        actualEmail = null;
      } else {
        actualPhone = csvPhone;
        actualEmail = csvEmail;
      }

      const dbAccount = savings.find(s => s.savingsId === accountId);
      
      if (!dbAccount || !dbAccount.borrower) {
        console.log(`⚠️  ${accountId}: No borrower linked`);
        skipped++;
        continue;
      }

      const borrower = dbAccount.borrower;
      const normalizedPhone = normalizePhone(actualPhone);
      const currentPhone = borrower.phone;

      // Only update if we have a valid phone and it's different
      if (normalizedPhone && normalizedPhone !== currentPhone) {
        try {
          await prisma.borrower.update({
            where: { id: borrower.id },
            data: {
              phone: normalizedPhone,
              ...(actualEmail && actualEmail !== '' ? { email: actualEmail } : {})
            }
          });

          console.log(`✅ ${accountId} | ${csvName}`);
          console.log(`   Updated: ${currentPhone} → ${normalizedPhone}`);
          if (actualEmail && actualEmail !== borrower.email) {
            console.log(`   Email: ${borrower.email || 'NONE'} → ${actualEmail}`);
          }
          console.log('');
          updated++;
        } catch (error) {
          console.error(`❌ ${accountId}: Failed to update - ${error.message}`);
          errors++;
        }
      } else if (!normalizedPhone) {
        console.log(`⏭️  ${accountId} | ${csvName}: No valid phone number in CSV`);
        skipped++;
      } else {
        console.log(`✓  ${accountId} | ${csvName}: Already up to date (${currentPhone})`);
        skipped++;
      }
    }

    console.log('\n=================================================');
    console.log('                  SUMMARY');
    console.log('=================================================\n');
    console.log(`✅ Updated:  ${updated} records`);
    console.log(`⏭️  Skipped:  ${skipped} records`);
    console.log(`❌ Errors:   ${errors} records`);
    console.log('\n=================================================\n');

    if (updated > 0) {
      console.log('🔄 Verifying updates...\n');
      const updatedSavings = await prisma.savings.findMany({
        include: { borrower: true },
        orderBy: { savingsId: 'asc' }
      });

      console.log('📋 UPDATED DATABASE:\n');
      updatedSavings.forEach(account => {
        if (account.borrower) {
          console.log(`${account.savingsId} | ${account.borrower.firstName} ${account.borrower.lastName}`);
          console.log(`  Phone: ${account.borrower.phone}`);
          if (account.borrower.email) {
            console.log(`  Email: ${account.borrower.email}`);
          }
          console.log('');
        }
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updatePhoneNumbers();
