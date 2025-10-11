const { PrismaClient } = require('@prisma/client');

async function updateApplicationStatuses() {
  const prisma = new PrismaClient();
  
  try {
    // First, let's check current statuses
    const apps = await prisma.loanApplication.findMany({
      select: { id: true, status: true }
    });
    
    console.log('Current status distribution:');
    const statusCounts = {};
    apps.forEach(app => {
      const status = app.status || 'null';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    console.log(statusCounts);
    
    // Update all applications with PENDING status to APPROVED
    const updateResult = await prisma.loanApplication.updateMany({
      where: {
        status: 'PENDING'
      },
      data: {
        status: 'APPROVED'
      }
    });
    
    console.log(`Updated ${updateResult.count} applications to APPROVED status`);
    
    // Check final status distribution
    const updatedApps = await prisma.loanApplication.findMany({
      select: { id: true, status: true }
    });
    
    console.log('Final status distribution:');
    const finalStatusCounts = {};
    updatedApps.forEach(app => {
      const status = app.status || 'null';
      finalStatusCounts[status] = (finalStatusCounts[status] || 0) + 1;
    });
    console.log(finalStatusCounts);
    
  } catch (error) {
    console.error('Error updating statuses:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateApplicationStatuses();