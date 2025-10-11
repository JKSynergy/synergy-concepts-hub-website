const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Analyzing application fields...');
    
    // Get sample applications to see available fields
    const sampleApplications = await prisma.loanApplication.findMany({
      take: 3,
      orderBy: { createdAt: 'asc' }
    });
    
    console.log('\n📋 Sample application data structure:');
    sampleApplications.forEach((app, index) => {
      console.log(`\nApplication ${index + 1} (${app.applicationId}):`);
      Object.keys(app).forEach(key => {
        console.log(`  ${key}: ${app[key]}`);
      });
    });
    
    // Check if there are any applications with useful name fields
    const allFields = new Set();
    sampleApplications.forEach(app => {
      Object.keys(app).forEach(key => allFields.add(key));
    });
    
    console.log('\n🔑 All available fields:');
    Array.from(allFields).sort().forEach(field => {
      console.log(`- ${field}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();