const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLoanDates() {
  try {
    const loans = await prisma.loan.findMany({
      include: { borrower: true },
      orderBy: { loanId: 'asc' }
    });
    
    console.log('Checking loans with null dates:\n');
    
    const loansWithNullDates = loans.filter(l => !l.disbursedAt || !l.nextPaymentDate);
    
    console.log(`Found ${loansWithNullDates.length} loans with null dates out of ${loans.length} total loans\n`);
    
    loansWithNullDates.forEach(loan => {
      console.log(`Loan: ${loan.loanId} | ${loan.borrower.firstName} ${loan.borrower.lastName}`);
      console.log(`  Status: ${loan.status}`);
      console.log(`  Disbursed At: ${loan.disbursedAt ? loan.disbursedAt.toISOString() : 'NULL'}`);
      console.log(`  Next Payment Date: ${loan.nextPaymentDate ? loan.nextPaymentDate.toISOString() : 'NULL'}`);
      console.log(`  Outstanding Balance: ${loan.outstandingBalance}`);
      console.log(`  Created At: ${loan.createdAt.toISOString()}\n`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkLoanDates();
