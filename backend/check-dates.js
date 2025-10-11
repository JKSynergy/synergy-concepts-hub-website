const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDates() {
  try {
    const apps = await prisma.loanApplication.findMany({
      select: {
        applicationId: true,
        submittedAt: true,
        createdAt: true
      },
      orderBy: {
        submittedAt: 'desc'
      }
    });
    
    console.log('Applications with dates:');
    console.log('========================');
    apps.forEach(app => {
      console.log(`${app.applicationId}: submitted=${app.submittedAt}, created=${app.createdAt}`);
    });
    
    if (apps.length > 0) {
      console.log('\nFirst app submitted:', apps[apps.length - 1].submittedAt);
      console.log('Last app submitted:', apps[0].submittedAt);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDates();