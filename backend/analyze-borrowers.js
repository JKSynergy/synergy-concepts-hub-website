const { PrismaClient } = require('@prisma/client');

async function analyzeBorrowerData() {
  const prisma = new PrismaClient();
  
  try {
    // Get sample borrower data
    const borrowers = await prisma.borrower.findMany({
      take: 3,
      select: {
        id: true,
        borrowerId: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        gender: true,
        dateOfBirth: true,
        nationalId: true,
        district: true,
        subcounty: true,
        village: true,
        occupation: true,
        monthlyIncome: true,
        creditRating: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    console.log('Sample borrower data:');
    console.log(JSON.stringify(borrowers, null, 2));
    
    // Get total count
    const totalCount = await prisma.borrower.count();
    console.log(`\nTotal borrowers: ${totalCount}`);
    
    // Get borrower ID patterns
    const borrowerIds = await prisma.borrower.findMany({
      select: { borrowerId: true },
      take: 10
    });
    
    console.log('\nBorrower ID patterns:');
    borrowerIds.forEach(b => console.log(b.borrowerId));
    
  } catch (error) {
    console.error('Error analyzing borrower data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeBorrowerData();