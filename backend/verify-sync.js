const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifySync() {
  const deposits = await prisma.deposit.findMany();
  const withdrawals = await prisma.withdrawal.findMany();
  
  const depositTotal = deposits.reduce((sum, d) => sum + d.amount, 0);
  const withdrawalTotal = withdrawals.reduce((sum, w) => sum + w.amount, 0);
  const netBalance = depositTotal - withdrawalTotal;
  
  const octStart = new Date('2025-10-01');
  const octDeposits = deposits.filter(d => d.depositDate >= octStart);
  const octTotal = octDeposits.reduce((sum, d) => sum + d.amount, 0);
  
  console.log('=== FINAL DATABASE STATUS ===');
  console.log('✅ Deposits:', deposits.length, 'records');
  console.log('✅ Total Deposits: UGX', depositTotal.toLocaleString());
  console.log('✅ Withdrawals:', withdrawals.length, 'records');
  console.log('✅ Total Withdrawals: UGX', withdrawalTotal.toLocaleString());
  console.log('✅ Net Balance: UGX', netBalance.toLocaleString());
  console.log('');
  console.log('📅 October 2025 Deposits:', octDeposits.length, 'transactions');
  console.log('📅 October Amount: UGX', octTotal.toLocaleString());
  
  await prisma.$disconnect();
}

verifySync();
