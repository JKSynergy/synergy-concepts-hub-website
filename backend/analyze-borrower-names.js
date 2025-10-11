const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Analyzing existing borrower names...');
    
    // Get sample borrowers to see their names
    const borrowers = await prisma.borrower.findMany({
      take: 10,
      orderBy: { createdAt: 'asc' }
    });
    
    console.log('\n📋 Sample borrower names:');
    borrowers.forEach(borrower => {
      console.log(`- ${borrower.borrowerId}: ${borrower.firstName} ${borrower.lastName}`);
    });
    
    // Check how many unique names we have
    const uniqueNames = new Set();
    const allBorrowers = await prisma.borrower.findMany({
      select: { firstName: true, lastName: true, borrowerId: true }
    });
    
    allBorrowers.forEach(borrower => {
      uniqueNames.add(`${borrower.firstName} ${borrower.lastName}`);
    });
    
    console.log(`\n📊 Total borrowers: ${allBorrowers.length}`);
    console.log(`📊 Unique names: ${uniqueNames.size}`);
    
    if (uniqueNames.size < allBorrowers.length) {
      console.log('⚠️  Many borrowers have duplicate names!');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();