const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Analyzing borrower-application relationships...');
    
    // Get all applications grouped by borrowerId to see the pattern
    const appsByBorrower = await prisma.loanApplication.groupBy({
      by: ['borrowerId'],
      _count: {
        applicationId: true
      },
      orderBy: {
        _count: {
          applicationId: 'desc'
        }
      }
    });
    
    console.log('\n📊 Applications per borrower:');
    console.log(`Total unique borrowers with applications: ${appsByBorrower.length}`);
    
    // Show top borrowers with multiple applications
    const topBorrowers = appsByBorrower.slice(0, 10);
    for (const borrowerData of topBorrowers) {
      const borrower = await prisma.borrower.findUnique({
        where: { id: borrowerData.borrowerId },
        select: { firstName: true, lastName: true, borrowerId: true }
      });
      
      console.log(`- ${borrower?.borrowerId || 'Unknown'}: ${borrower?.firstName || 'Unknown'} ${borrower?.lastName || 'User'} (${borrowerData._count.applicationId} applications)`);
    }
    
    // Check what data exists in applications that could give us names
    const sampleApps = await prisma.loanApplication.findMany({
      take: 5,
      include: {
        borrower: {
          select: { firstName: true, lastName: true, borrowerId: true }
        }
      }
    });
    
    console.log('\n📋 Sample application-borrower links:');
    sampleApps.forEach(app => {
      console.log(`- App ${app.applicationId}: ${app.borrower.firstName} ${app.borrower.lastName} (${app.purpose})`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();