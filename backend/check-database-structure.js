const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('🔍 Checking database structure...');
    
    // Try to introspect what models exist
    console.log('📊 Available Prisma models:');
    console.log(Object.keys(prisma));
    
    // Check if we can query any application-related tables
    try {
      const loans = await prisma.loan.findMany({
        take: 5,
        select: {
          id: true,
          status: true,
          createdAt: true
        }
      });
      console.log('💰 Loans table exists with', loans.length, 'entries');
    } catch (error) {
      console.log('❌ No loans table or error:', error.message);
    }
    
    try {
      const borrowers = await prisma.borrower.findMany({
        take: 5,
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      });
      console.log('👥 Borrowers table exists with', borrowers.length, 'entries');
    } catch (error) {
      console.log('❌ No borrowers table or error:', error.message);
    }
    
    // Check what the frontend might be calling "applications"
    // Maybe applications are actually loans in PENDING status?
    try {
      const pendingLoans = await prisma.loan.findMany({
        where: {
          status: 'PENDING'
        },
        take: 5,
        include: {
          borrower: true
        }
      });
      console.log('📋 Found', pendingLoans.length, 'pending loans (might be applications)');
      if (pendingLoans.length > 0) {
        console.log('Sample pending loan:', {
          id: pendingLoans[0].id,
          borrower: pendingLoans[0].borrower.firstName + ' ' + pendingLoans[0].borrower.lastName,
          amount: pendingLoans[0].principal,
          createdAt: pendingLoans[0].createdAt
        });
      }
    } catch (error) {
      console.log('❌ Error checking pending loans:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();