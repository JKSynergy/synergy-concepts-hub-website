const { PrismaClient } = require('@prisma/client');

async function clearBorrowersData() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Starting borrowers data cleanup...');
    
    // First, get count of current borrowers
    const currentCount = await prisma.borrower.count();
    console.log(`Current borrowers: ${currentCount}`);
    
    // Get count of applications
    const appCount = await prisma.loanApplication.count();
    console.log(`Current applications: ${appCount}`);
    
    // Since borrowerId is required, we'll need to create the new borrowers 
    // during the migration instead of just clearing everything
    // For now, let's just prepare the clearing logic
    
    console.log('⚠️  Note: Borrowers are linked to applications with required foreign keys');
    console.log('📋 Plan: We will regenerate borrowers from applications directly');
    console.log('✅ Analysis complete. Ready for borrower regeneration!');
    
  } catch (error) {
    console.error('Error analyzing borrowers data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearBorrowersData();