const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient({
  log: ['error', 'warn'],
  errorFormat: 'pretty',
  datasources: {
    db: {
      url: "file:./prisma/dev.db"
    }
  }
});

// Function to parse CSV data
function parseCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',');
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim()) {
      const values = lines[i].split(',');
      const row = {};
      headers.forEach((header, index) => {
        row[header.trim()] = values[index] ? values[index].trim() : '';
      });
      data.push(row);
    }
  }
  return data;
}

// Function to parse date from DD/MM/YYYY format
function parseDate(dateString) {
  if (!dateString) return new Date();
  const [day, month, year] = dateString.split('/');
  return new Date(year, month - 1, day);
}

async function updateRepaymentsWithRealData() {
  try {
    console.log('🔄 Starting repayments update with real data...');

    // Read the CSV file
    const csvPath = "E:\\SYSTEMS AND WEBSITES\\Quickcredit sysytem\\Ref\\Final Quick Credit Loan Management System - Repayments.csv";
    console.log('📁 Reading CSV from:', csvPath);
    
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const repaymentData = parseCSV(csvContent);
    
    console.log(`📊 Found ${repaymentData.length} repayment records in CSV`);

    // Get existing loans and borrowers from database
    const loans = await prisma.loan.findMany({
      select: { id: true, loanId: true, borrowerId: true }
    });
    
    const borrowers = await prisma.borrower.findMany({
      select: { id: true, borrowerId: true }
    });

    console.log(`🏦 Found ${loans.length} loans and ${borrowers.length} borrowers in database`);

    // Create lookup maps
    const loanMap = new Map();
    loans.forEach(loan => {
      loanMap.set(loan.loanId, loan);
    });

    const borrowerMap = new Map();
    borrowers.forEach(borrower => {
      borrowerMap.set(borrower.borrowerId, borrower);
    });

    // Clear existing repayments
    console.log('🗑️ Clearing existing repayments...');
    await prisma.repayment.deleteMany();

    // Create new repayments with real data
    console.log('💳 Creating repayments with real data...');
    let createdCount = 0;
    let skippedCount = 0;

    for (const record of repaymentData) {
      try {
        const loanId = record['Loan ID'];
        const borrowerId = record['Borrower ID'];
        const amount = parseFloat(record['Amount']);
        const paymentDate = parseDate(record['Payment Date']);
        
        // Find matching loan and borrower
        const loan = loanMap.get(loanId);
        const borrower = borrowerMap.get(borrowerId);

        if (!loan || !borrower) {
          console.log(`⚠️ Skipping record - Loan: ${loanId} (${loan ? 'found' : 'not found'}), Borrower: ${borrowerId} (${borrower ? 'found' : 'not found'})`);
          skippedCount++;
          continue;
        }

        // Create the repayment record
        await prisma.repayment.create({
          data: {
            receiptNumber: record['Repayment ID'] || `RCP-${Date.now()}-${createdCount}`,
            loanId: loan.id,
            borrowerId: borrower.id,
            amount: amount,
            principalAmount: Math.floor(amount * 0.85), // Estimate 85% principal
            interestAmount: Math.floor(amount * 0.15), // Estimate 15% interest
            paymentMethod: record['Payment Method'] || 'CASH',
            status: 'COMPLETED',
            paidAt: paymentDate,
            transactionId: `TXN-${record['Repayment ID']}-${Date.now()}`,
            month: record['Month'] || null,
            notes: `Real data import - Original Repayment ID: ${record['Repayment ID']}`
          }
        });

        createdCount++;
        
        if (createdCount % 10 === 0) {
          console.log(`📈 Created ${createdCount} repayments...`);
        }

      } catch (error) {
        console.error(`❌ Error creating repayment for record:`, record, error.message);
        skippedCount++;
      }
    }

    console.log(`✅ Successfully created ${createdCount} repayments`);
    console.log(`⚠️ Skipped ${skippedCount} records due to missing references`);

    // Update loan balances based on repayments
    console.log('🔄 Updating loan outstanding balances...');
    for (const loan of loans) {
      const totalRepayments = await prisma.repayment.aggregate({
        where: { loanId: loan.id },
        _sum: { amount: true }
      });

      const totalRepaid = totalRepayments._sum.amount || 0;
      
      // Get the loan's principal to calculate outstanding balance
      const loanData = await prisma.loan.findUnique({
        where: { id: loan.id },
        select: { principal: true, interestRate: true, term: true }
      });

      if (loanData) {
        const totalOwed = loanData.principal + (loanData.principal * (loanData.interestRate / 100) * (loanData.term / 12));
        const outstandingBalance = Math.max(0, totalOwed - totalRepaid);
        
        await prisma.loan.update({
          where: { id: loan.id },
          data: { 
            outstandingBalance: outstandingBalance,
            status: outstandingBalance <= 0 ? 'COMPLETED' : 'ACTIVE'
          }
        });
      }
    }

    console.log('💰 Updated loan outstanding balances');

    // Show summary
    const finalCount = await prisma.repayment.count();
    const totalAmount = await prisma.repayment.aggregate({
      _sum: { amount: true }
    });

    console.log('\n📊 REPAYMENTS UPDATE SUMMARY:');
    console.log(`   Total Repayments: ${finalCount}`);
    console.log(`   Total Amount: UGX ${(totalAmount._sum.amount || 0).toLocaleString()}`);
    console.log(`   Created: ${createdCount}`);
    console.log(`   Skipped: ${skippedCount}`);

  } catch (error) {
    console.error('❌ Error updating repayments:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the update
updateRepaymentsWithRealData();