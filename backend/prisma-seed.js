// Direct Prisma database seeding for QuickCredit
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedData() {
    console.log('🌱 Starting database seeding...');

    try {
        // Clear existing data in proper order (due to foreign key constraints)
        console.log('🧹 Clearing existing data...');
        await prisma.repayment.deleteMany();
        await prisma.loan.deleteMany();
        await prisma.loanApplication.deleteMany();
        await prisma.savings.deleteMany();
        await prisma.borrower.deleteMany();
        await prisma.expense.deleteMany();
        
        // Don't delete users - we need the admin user for login

        // Get the admin user (should exist from migrations or previous setup)
        let defaultUser = await prisma.user.findFirst({
            where: { username: 'admin' }
        });

        // If no admin user exists, create one
        if (!defaultUser) {
            console.log('👤 Creating default admin user...');
            defaultUser = await prisma.user.create({
                data: {
                    username: 'admin',
                    email: 'admin@quickcredit.com',
                    password: 'hashed_password_placeholder',
                    firstName: 'System',
                    lastName: 'Administrator',
                    role: 'ADMIN',
                    status: 'ACTIVE'
                }
            });
            console.log('✅ Created default user');
        } else {
            console.log('✅ Using existing admin user');
        }

        // Create borrowers
        console.log('👥 Creating borrowers...');
        const borrower1 = await prisma.borrower.create({
            data: {
                borrowerId: 'B001',
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@email.com',
                phone: '256701234567',
                nationalId: 'CM123456789',
                dateOfBirth: new Date('1990-05-15'),
                occupation: 'Teacher',
                district: 'Kampala',
                monthlyIncome: 1500000,
                status: 'ACTIVE',
                creditRating: 'GOOD',
                createdById: defaultUser.id
            }
        });

        const borrower2 = await prisma.borrower.create({
            data: {
                borrowerId: 'B002',
                firstName: 'Jane',
                lastName: 'Smith',
                email: 'jane.smith@email.com',
                phone: '256707654321',
                nationalId: 'CM987654321',
                dateOfBirth: new Date('1985-08-22'),
                occupation: 'Nurse',
                district: 'Entebbe',
                monthlyIncome: 2000000,
                status: 'ACTIVE',
                creditRating: 'GOOD',
                createdById: defaultUser.id
            }
        });

        const borrower3 = await prisma.borrower.create({
            data: {
                borrowerId: 'B003',
                firstName: 'Robert',
                lastName: 'Johnson',
                email: 'robert.johnson@email.com',
                phone: '256703456789',
                nationalId: 'CM456789123',
                dateOfBirth: new Date('1988-12-10'),
                occupation: 'Business Owner',
                district: 'Jinja',
                monthlyIncome: 3000000,
                status: 'ACTIVE',
                creditRating: 'EXCELLENT',
                createdById: defaultUser.id
            }
        });

        console.log('✅ Created 3 borrowers');

        // Create loan applications
        console.log('📝 Creating loan applications...');
        const app1 = await prisma.loanApplication.create({
            data: {
                applicationId: 'APP001',
                borrowerId: borrower1.id,
                requestedAmount: 5000000,
                purpose: 'Business expansion',
                termMonths: 12,
                status: 'APPROVED',
                submittedAt: new Date('2024-01-15'),
                reviewedAt: new Date('2024-01-18'),
                reviewedById: defaultUser.id,
                approvedAmount: 5000000
            }
        });

        const app2 = await prisma.loanApplication.create({
            data: {
                applicationId: 'APP002',
                borrowerId: borrower2.id,
                requestedAmount: 3000000,
                purpose: 'Education',
                termMonths: 18,
                status: 'PENDING',
                submittedAt: new Date('2024-10-05')
            }
        });

        console.log('✅ Created 2 loan applications');

        // Create loans based on approved applications
        console.log('💰 Creating loans...');
        const loan1 = await prisma.loan.create({
            data: {
                loanId: 'LN001',
                applicationId: app1.id,
                borrowerId: borrower1.id,
                loanOfficerId: defaultUser.id,
                principal: 5000000,
                interestRate: 15.0,
                termMonths: 12,
                totalInterest: 750000,
                totalAmount: 5750000,
                monthlyPayment: 479167,
                outstandingBalance: 3200000,
                status: 'ACTIVE',
                disbursedAt: new Date('2024-01-20'),
                disbursedAmount: 5000000,
                nextPaymentDate: new Date('2024-11-20'),
                nextPaymentAmount: 479167,
                purpose: 'Business expansion'
            }
        });

        const loan2 = await prisma.loan.create({
            data: {
                loanId: 'LN002',
                borrowerId: borrower3.id,
                loanOfficerId: defaultUser.id,
                principal: 6000000,
                interestRate: 18.0,
                termMonths: 24,
                totalInterest: 2160000,
                totalAmount: 8160000,
                monthlyPayment: 340000,
                outstandingBalance: 2800000,
                status: 'OVERDUE',
                disbursedAt: new Date('2024-03-15'),
                disbursedAmount: 6000000,
                nextPaymentDate: new Date('2024-09-15'),
                nextPaymentAmount: 340000,
                purpose: 'Equipment purchase'
            }
        });

        console.log('✅ Created 2 loans');

        // Create repayments
        console.log('💳 Creating repayments...');
        await prisma.repayment.create({
            data: {
                receiptNumber: 'RCP001',
                loanId: loan1.id,
                borrowerId: borrower1.id,
                amount: 479167,
                principalAmount: 400000,
                interestAmount: 79167,
                paymentMethod: 'MOBILE_MONEY',
                status: 'COMPLETED',
                paidAt: new Date('2024-02-20'),
                transactionId: 'TXN001'
            }
        });

        await prisma.repayment.create({
            data: {
                receiptNumber: 'RCP002',
                loanId: loan1.id,
                borrowerId: borrower1.id,
                amount: 479167,
                principalAmount: 400000,
                interestAmount: 79167,
                paymentMethod: 'BANK_TRANSFER',
                status: 'COMPLETED',
                paidAt: new Date('2024-03-20'),
                transactionId: 'TXN002'
            }
        });

        await prisma.repayment.create({
            data: {
                receiptNumber: 'RCP003',
                loanId: loan2.id,
                borrowerId: borrower3.id,
                amount: 340000,
                principalAmount: 250000,
                interestAmount: 90000,
                paymentMethod: 'CASH',
                status: 'COMPLETED',
                paidAt: new Date('2024-04-15'),
                transactionId: 'TXN003'
            }
        });

        console.log('✅ Created 3 repayments');

        // Create some expenses
        console.log('💸 Creating expenses...');
        await prisma.expense.create({
            data: {
                expenseId: 'EXP001',
                description: 'Office rent',
                amount: 2000000,
                category: 'OPERATIONAL',
                expenseDate: new Date('2024-10-01')
            }
        });

        await prisma.expense.create({
            data: {
                expenseId: 'EXP002',
                description: 'Staff salaries',
                amount: 8000000,
                category: 'SALARY',
                expenseDate: new Date('2024-10-01')
            }
        });

        console.log('✅ Created 2 expenses');

        console.log('🎉 Database seeding completed successfully!');
        
        // Display summary
        const borrowerCount = await prisma.borrower.count();
        const loanCount = await prisma.loan.count();
        const repaymentCount = await prisma.repayment.count();
        const applicationCount = await prisma.loanApplication.count();
        const expenseCount = await prisma.expense.count();
        
        console.log('\n📊 Summary:');
        console.log(`   Borrowers: ${borrowerCount}`);
        console.log(`   Loan Applications: ${applicationCount}`);
        console.log(`   Loans: ${loanCount}`);
        console.log(`   Repayments: ${repaymentCount}`);
        console.log(`   Expenses: ${expenseCount}`);
        console.log('\n🚀 You can now refresh the dashboard to see the data!');

    } catch (error) {
        console.error('❌ Error seeding data:', error);
        console.error(error.stack);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the seeding
seedData();