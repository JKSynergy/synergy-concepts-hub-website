const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateDates() {
  try {
    const apps = await prisma.loanApplication.findMany({
      select: {
        id: true,
        applicationId: true
      },
      orderBy: {
        applicationId: 'asc'
      }
    });
    
    console.log(`Found ${apps.length} applications to update`);
    
    // Create realistic dates spread over the last 3 months
    const today = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    const updates = [];
    
    for (let i = 0; i < apps.length; i++) {
      const app = apps[i];
      
      // Create a random date between 3 months ago and today
      const timeRange = today.getTime() - threeMonthsAgo.getTime();
      const randomTime = Math.random() * timeRange;
      const randomDate = new Date(threeMonthsAgo.getTime() + randomTime);
      
      // Round to the nearest hour for cleaner times
      randomDate.setMinutes(0);
      randomDate.setSeconds(0);
      randomDate.setMilliseconds(0);
      
      updates.push({
        id: app.id,
        applicationId: app.applicationId,
        newDate: randomDate
      });
    }
    
    // Sort by date so we update them in chronological order
    updates.sort((a, b) => a.newDate.getTime() - b.newDate.getTime());
    
    console.log('Updating dates...');
    
    // Update each application with a realistic date
    for (const update of updates) {
      await prisma.loanApplication.update({
        where: { id: update.id },
        data: {
          submittedAt: update.newDate,
          createdAt: update.newDate // Also update createdAt to match
        }
      });
      
      console.log(`${update.applicationId}: ${update.newDate.toISOString().split('T')[0]}`);
    }
    
    console.log('\\nDate update completed successfully!');
    console.log(`Updated ${updates.length} applications with realistic dates`);
    
  } catch (error) {
    console.error('Error updating dates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateDates();