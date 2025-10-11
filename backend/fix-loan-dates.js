const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixLoanDates() {
  console.log('🔧 Starting to fix loan dates...\n');
  
  try {
    // Get all loans
    const loans = await prisma.loan.findMany({
      orderBy: { createdAt: 'asc' }
    });
    
    console.log(`Found ${loans.length} loans to process\n`);
    
    let updatedCount = 0;
    
    for (const loan of loans) {
      const updates = {};
      let needsUpdate = false;
      
      // Fix disbursedAt for active, completed, or closed loans
      if (!loan.disbursedAt && ['ACTIVE', 'COMPLETED', 'CLOSED', 'DISBURSED'].includes(loan.status)) {
        updates.disbursedAt = loan.createdAt;
        needsUpdate = true;
        console.log(`  Loan ${loan.loanId}: Setting disbursedAt to ${loan.createdAt.toISOString()}`);
      }
      
      // Calculate nextPaymentDate for active loans
      if (!loan.nextPaymentDate && ['ACTIVE', 'DISBURSED'].includes(loan.status)) {
        const baseDate = loan.disbursedAt || loan.createdAt;
        const nextDate = new Date(baseDate);
        nextDate.setMonth(nextDate.getMonth() + 1);
        updates.nextPaymentDate = nextDate;
        needsUpdate = true;
        console.log(`  Loan ${loan.loanId}: Setting nextPaymentDate to ${nextDate.toISOString()}`);
      }
      
      // Update loan if needed
      if (needsUpdate) {
        await prisma.loan.update({
          where: { id: loan.id },
          data: updates
        });
        updatedCount++;
      }
    }
    
    console.log(`\n✅ Successfully updated ${updatedCount} loans`);
    
  } catch (error) {
    console.error('❌ Error fixing loan dates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixLoanDates();
