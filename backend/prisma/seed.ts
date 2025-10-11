import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with admin users...');

  // Hash passwords
  const adminPassword = await bcrypt.hash('QuickCredit2025!', 10);
  const financePassword = await bcrypt.hash('Finance2025!', 10);

  // Create Admin user
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      password: adminPassword,
      email: 'admin@quickcredit.ug',
      firstName: 'System',
      lastName: 'Administrator',
      role: 'ADMIN',
      status: 'ACTIVE'
    },
    create: {
      username: 'admin',
      email: 'admin@quickcredit.ug',
      password: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
      role: 'ADMIN',
      status: 'ACTIVE'
    }
  });

  console.log('✅ Admin user created/updated:', {
    username: admin.username,
    email: admin.email,
    role: admin.role
  });

  // Create Finance Manager user
  const financeManager = await prisma.user.upsert({
    where: { username: 'finance' },
    update: {
      password: financePassword,
      email: 'finance@quickcredit.ug',
      firstName: 'Finance',
      lastName: 'Manager',
      role: 'FINANCE_MANAGER',
      status: 'ACTIVE'
    },
    create: {
      username: 'finance',
      email: 'finance@quickcredit.ug',
      password: financePassword,
      firstName: 'Finance',
      lastName: 'Manager',
      role: 'FINANCE_MANAGER',
      status: 'ACTIVE'
    }
  });

  console.log('✅ Finance Manager created/updated:', {
    username: financeManager.username,
    email: financeManager.email,
    role: financeManager.role
  });

  console.log('\n📋 Login Credentials:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👤 Admin User:');
  console.log('   Username: admin');
  console.log('   Password: QuickCredit2025!');
  console.log('   Email: admin@quickcredit.ug');
  console.log('');
  console.log('💼 Finance Manager:');
  console.log('   Username: finance');
  console.log('   Password: Finance2025!');
  console.log('   Email: finance@quickcredit.ug');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
