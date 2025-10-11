const { PrismaClient } = require('@prisma/client');

async function analyzeApplicationsForBorrowers() {
  const prisma = new PrismaClient();
  
  try {
    // Get sample application data with borrower info
    const applications = await prisma.loanApplication.findMany({
      take: 3,
      include: {
        borrower: true
      }
    });
    
    console.log('Sample application data:');
    applications.forEach((app, index) => {
      console.log(`\nApplication ${index + 1}:`);
      console.log('Application ID:', app.id);
      console.log('Application Number:', app.applicationId);
      console.log('Borrower ID:', app.borrowerId);
      console.log('Requested Amount:', app.requestedAmount);
      console.log('Purpose:', app.purpose);
      console.log('Status:', app.status);
      
      if (app.borrower) {
        console.log('Linked Borrower:', {
          id: app.borrower.borrowerId,
          name: `${app.borrower.firstName} ${app.borrower.lastName}`,
          phone: app.borrower.phone,
          creditRating: app.borrower.creditRating
        });
      } else {
        console.log('No linked borrower found');
      }
    });
    
    // Check for applications without borrowers
    const appsWithoutBorrowers = await prisma.loanApplication.count({
      where: {
        borrowerId: null
      }
    });
    
    console.log(`\nApplications without linked borrowers: ${appsWithoutBorrowers}`);
    
    // Total applications
    const totalApps = await prisma.loanApplication.count();
    console.log(`Total applications: ${totalApps}`);
    
  } catch (error) {
    console.error('Error analyzing applications:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeApplicationsForBorrowers();