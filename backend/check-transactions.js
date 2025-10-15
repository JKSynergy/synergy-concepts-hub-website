const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTransactions() {
  try {
    // Check for SAV018
    const deposits = await prisma.deposits.findMany({
      where: { accountId: 'SAV018' }
    });
    
    const withdrawals = await prisma.withdrawals.findMany({
      where: { accountId: 'SAV018' }
    });
    
    console.log('\n=== SAV018 (DEBORAH MBATUDDE) ===');
    console.log('Deposits:', deposits.length);
    console.log('Withdrawals:', withdrawals.length);
    
    if (deposits.length > 0) {
      console.log('\nSample deposit:');
      console.log(JSON.stringify(deposits[0], null, 2));
    }
    
    // Check total deposits and withdrawals
    const allDeposits = await prisma.deposits.count();
    const allWithdrawals = await prisma.withdrawals.count();
    
    console.log('\n=== TOTAL DATABASE ===');
    console.log('Total deposits:', allDeposits);
    console.log('Total withdrawals:', allWithdrawals);
    
    // Check first deposit record to see the structure
    const firstDeposit = await prisma.deposits.findFirst();
    if (firstDeposit) {
      console.log('\nFirst deposit in database:');
      console.log(JSON.stringify(firstDeposit, null, 2));
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
  }
}

checkTransactions();
