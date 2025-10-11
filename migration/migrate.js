#!/usr/bin/env node

/**
 * QuickCredit Migration Script
 * Migrates data from the existing HTML/IndexedDB system to the new modular system
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

// Use the database from the backend
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:../backend/prisma/dev.db'
    }
  }
});

class QuickCreditMigration {
  constructor() {
    this.csvPath = path.join(__dirname, 'sample-data'); // Use sample data for testing
    this.migrationLog = [];
    this.stats = {
      borrowers: 0,
      loans: 0,
      applications: 0,
      repayments: 0,
      savings: 0,
      expenses: 0,
      users: 0,
      errors: 0
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
    console.log(logEntry);
    this.migrationLog.push(logEntry);
  }

  async readCSV(filename) {
    return new Promise((resolve, reject) => {
      const results = [];
      const filePath = path.join(this.csvPath, filename);
      
      if (!fs.existsSync(filePath)) {
        this.log(`CSV file not found: ${filename}`, 'warn');
        resolve([]);
        return;
      }

      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          this.log(`Read ${results.length} records from ${filename}`);
          resolve(results);
        })
        .on('error', reject);
    });
  }

  async createDefaultUsers() {
    this.log('Creating default users...');
    
    const defaultUsers = [
      {
        username: 'admin',
        email: 'admin@quickcredit.ug',
        password: 'admin123',
        firstName: 'System',
        lastName: 'Administrator',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
      },
      {
        username: 'manager',
        email: 'manager@quickcredit.ug',
        password: 'manager123',
        firstName: 'Loan',
        lastName: 'Manager',
        role: 'MANAGER',
        status: 'ACTIVE'
      },
      {
        username: 'officer',
        email: 'officer@quickcredit.ug',
        password: 'officer123',
        firstName: 'Loan',
        lastName: 'Officer',
        role: 'LOAN_OFFICER',
        status: 'ACTIVE'
      },
      {
        username: 'accountant',
        email: 'accountant@quickcredit.ug',
        password: 'accountant123',
        firstName: 'System',
        lastName: 'Accountant',
        role: 'ACCOUNTANT',
        status: 'ACTIVE'
      },
      {
        username: 'readonly',
        email: 'readonly@quickcredit.ug',
        password: 'readonly123',
        firstName: 'Read',
        lastName: 'Only',
        role: 'READONLY',
        status: 'ACTIVE'
      }
    ];

    for (const userData of defaultUsers) {
      try {
        const hashedPassword = await bcrypt.hash(userData.password, 12);
        await prisma.user.upsert({
          where: { username: userData.username },
          update: {},
          create: {
            ...userData,
            password: hashedPassword
          }
        });
        this.stats.users++;
        this.log(`Created user: ${userData.username}`);
      } catch (error) {
        this.log(`Error creating user ${userData.username}: ${error.message}`, 'error');
        this.stats.errors++;
      }
    }
  }

  async migrateBorrowers() {
    this.log('Migrating borrowers...');
    
    const borrowersData = await this.readCSV('Final Quick Credit Loan Management System - Borrowers.csv');
    
    for (const row of borrowersData) {
      try {
        const borrower = await prisma.borrower.create({
          data: {
            borrowerId: row['Borrower ID'] || `BWQC${String(this.stats.borrowers + 1).padStart(3, '0')}`,
            firstName: this.extractFirstName(row['Name'] || ''),
            lastName: this.extractLastName(row['Name'] || ''),
            phone: this.cleanPhoneNumber(row['Phone Number'] || ''),
            email: row['Email Address'] || null,
            address: row['Residential Address'] || null,
            nationalId: row['National ID / Passport'] || null,
            dateOfBirth: this.parseDate(row['Date of Birth']),
            occupation: row['Occupation'] || null,
            employerName: row['Employer Name'] || null,
            employerAddress: row['Employer Address'] || null,
            monthlyIncome: this.parseDecimal(row['Monthly Income']),
            creditScore: parseInt(row['Credit Score']) || 0,
            creditRating: this.mapCreditRating(row['Credit Rating']),
            status: 'ACTIVE',
            kycCompleted: true,
            emergencyContact: row['Emergency Contact'] ? JSON.stringify({
              name: row['Emergency Contact'],
              phone: row['Emergency Phone'] || '',
              relationship: row['Emergency Relationship'] || ''
            }) : null
          }
        });
        
        this.stats.borrowers++;
        this.log(`Migrated borrower: ${borrower.borrowerId} - ${borrower.firstName} ${borrower.lastName}`);
      } catch (error) {
        this.log(`Error migrating borrower ${row['Name']}: ${error.message}`, 'error');
        this.stats.errors++;
      }
    }
  }

  async migrateApplications() {
    this.log('Migrating loan applications...');
    
    const applicationsData = await this.readCSV('Final Quick Credit Loan Management System - Applications.csv');
    
    for (const row of applicationsData) {
      try {
        // Find borrower by name or create if not exists
        const borrowerName = row['Customer Name'] || row['Borrower Name'] || '';
        const borrower = await this.findOrCreateBorrower(borrowerName, row['Phone'] || '');
        
        if (!borrower) {
          this.log(`Could not find/create borrower for application: ${borrowerName}`, 'warn');
          continue;
        }

        const application = await prisma.loanApplication.create({
          data: {
            applicationId: row['Application ID'] || `APP${String(this.stats.applications + 1).padStart(6, '0')}`,
            borrowerId: borrower.id,
            requestedAmount: this.parseDecimal(row['Requested Amount'] || row['Loan Amount']),
            purpose: row['Purpose'] || row['Loan Purpose'] || 'Business',
            term: parseInt(row['Term'] || row['Loan Term']) || 12,
            interestRate: this.parseDecimal(row['Interest Rate']) || 0.15,
            status: this.mapApplicationStatus(row['Status']),
            submittedAt: this.parseDate(row['Application Date'] || row['Submitted Date']) || new Date(),
            reviewNotes: row['Notes'] || row['Review Notes'] || null,
            approvedAt: row['Status'] === 'Approved' ? this.parseDate(row['Approved Date']) : null,
            rejectedAt: row['Status'] === 'Rejected' ? this.parseDate(row['Rejected Date']) : null,
            rejectionReason: row['Rejection Reason'] || null
          }
        });
        
        this.stats.applications++;
        this.log(`Migrated application: ${application.applicationId} for ${borrowerName}`);
      } catch (error) {
        this.log(`Error migrating application ${row['Application ID']}: ${error.message}`, 'error');
        this.stats.errors++;
      }
    }
  }

  async migrateLoans() {
    this.log('Migrating loans...');
    
    const loansData = await this.readCSV('Final Quick Credit Loan Management System - Loans.csv');
    const adminUser = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    
    for (const row of loansData) {
      try {
        const borrowerName = row['Customer Name'] || row['Borrower Name'] || '';
        const borrower = await this.findOrCreateBorrower(borrowerName, row['Phone'] || '');
        
        if (!borrower) {
          this.log(`Could not find/create borrower for loan: ${borrowerName}`, 'warn');
          continue;
        }

        const loanAmount = this.parseDecimal(row['Loan Amount'] || row['Principal']);
        const interestRate = this.parseDecimal(row['Interest Rate (Months)'] || row['Interest Rate']) || 0.15;
        const term = parseInt(row['Loan Term '] || row['Term']) || 1;
        const totalAmount = loanAmount * (1 + (interestRate * term));
        const outstandingBalance = this.parseDecimal(row['Outstanding Balance']) || 0;

        const loan = await prisma.loan.create({
          data: {
            loanId: row['Loan ID'] || `LN${String(this.stats.loans + 1).padStart(3, '0')}`,
            borrowerId: borrower.id,
            loanOfficerId: adminUser?.id || null,
            principal: loanAmount,
            interestRate: interestRate,
            termMonths: term,
            totalInterest: loanAmount * interestRate * term,
            totalAmount: totalAmount,
            monthlyPayment: totalAmount / term,
            status: this.mapLoanStatus(row['Status']),
            purpose: row['Purpose'] || 'Business',
            disbursedAt: this.parseDate(row['Origination Date'] || row['Disbursed Date']) || new Date(),
            disbursedAmount: loanAmount,
            outstandingBalance: outstandingBalance,
            nextPaymentDate: this.calculateNextPaymentDate(row['Due Date']),
            nextPaymentAmount: totalAmount / term
          }
        });
        
        this.stats.loans++;
        this.log(`Migrated loan: ${loan.loanId} for ${borrowerName} - Amount: ${loanAmount}`);
      } catch (error) {
        this.log(`Error migrating loan ${row['Loan ID']}: ${error.message}`, 'error');
        this.stats.errors++;
      }
    }
  }

  async migrateRepayments() {
    this.log('Migrating repayments...');
    
    const repaymentsData = await this.readCSV('Final Quick Credit Loan Management System - Repayments.csv');
    const adminUser = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    
    for (const row of repaymentsData) {
      try {
        // Find loan by loan ID
        const loanId = row['Loan ID'];
        const loan = await prisma.loan.findFirst({ 
          where: { loanId: loanId },
          include: { borrower: true }
        });
        
        if (!loan) {
          this.log(`Could not find loan for repayment: ${loanId}`, 'warn');
          continue;
        }

        const amount = this.parseDecimal(row['Amount'] || row['Payment Amount']);
        const principal = this.parseDecimal(row['Principal']) || amount * 0.8;
        const interest = this.parseDecimal(row['Interest']) || amount * 0.2;

        const repayment = await prisma.repayment.create({
          data: {
            repaymentId: row['Repayment ID'] || `REP${String(this.stats.repayments + 1).padStart(6, '0')}`,
            loanId: loan.id,
            borrowerId: loan.borrowerId,
            amount: amount,
            principal: principal,
            interest: interest,
            penalty: this.parseDecimal(row['Penalty']) || 0,
            paymentMethod: this.mapPaymentMethod(row['Payment Method']),
            paymentReference: row['Payment Reference'] || row['Transaction ID'] || null,
            paidAt: this.parseDate(row['Payment Date'] || row['Paid Date']) || new Date(),
            processedBy: adminUser?.id || null,
            notes: row['Notes'] || null,
            status: 'COMPLETED'
          }
        });
        
        this.stats.repayments++;
        this.log(`Migrated repayment: ${repayment.repaymentId} - Amount: ${amount}`);
      } catch (error) {
        this.log(`Error migrating repayment ${row['Repayment ID']}: ${error.message}`, 'error');
        this.stats.errors++;
      }
    }
  }

  async migrateSavings() {
    this.log('Migrating savings...');
    
    const saversData = await this.readCSV('Final Quick Credit Loan Management System - Savers.csv');
    const savingsData = await this.readCSV('Final Quick Credit Loan Management System - Savings.csv');
    const depositsData = await this.readCSV('Final Quick Credit Loan Management System - Deposits.csv');
    const withdrawalsData = await this.readCSV('Final Quick Credit Loan Management System - Withdrawals.csv');
    
    // First, create savings accounts from savers
    for (const row of saversData) {
      try {
        const saverName = row['Saver Name'] || row['Customer Name'] || '';
        const borrower = await this.findOrCreateBorrower(saverName, row['Phone'] || '');
        
        if (!borrower) {
          this.log(`Could not find/create borrower for savings: ${saverName}`, 'warn');
          continue;
        }

        const savings = await prisma.savings.create({
          data: {
            savingsId: row['Saver ID'] || `SAV${String(this.stats.savings + 1).padStart(6, '0')}`,
            borrowerId: borrower.id,
            accountType: 'REGULAR',
            balance: this.parseDecimal(row['Balance'] || row['Current Balance']) || 0,
            interestRate: this.parseDecimal(row['Interest Rate']) || 0.05,
            minimumBalance: this.parseDecimal(row['Minimum Balance']) || 10000,
            status: 'ACTIVE',
            openedAt: this.parseDate(row['Account Opened'] || row['Created Date']) || new Date()
          }
        });
        
        this.stats.savings++;
        this.log(`Migrated savings account: ${savings.savingsId} for ${saverName}`);
      } catch (error) {
        this.log(`Error migrating savings for ${row['Saver Name']}: ${error.message}`, 'error');
        this.stats.errors++;
      }
    }

    // Then migrate deposits
    for (const row of depositsData) {
      try {
        const savingsId = row['Savings ID'] || row['Account ID'];
        const savings = await prisma.savings.findFirst({ where: { savingsId: savingsId } });
        
        if (!savings) {
          this.log(`Could not find savings account for deposit: ${savingsId}`, 'warn');
          continue;
        }

        await prisma.deposit.create({
          data: {
            depositId: row['Deposit ID'] || `DEP${Date.now()}`,
            savingsId: savings.id,
            amount: this.parseDecimal(row['Amount']) || 0,
            paymentMethod: this.mapPaymentMethod(row['Payment Method']) || 'CASH',
            paymentReference: row['Reference'] || null,
            depositedAt: this.parseDate(row['Deposit Date']) || new Date(),
            notes: row['Notes'] || null,
            status: 'COMPLETED'
          }
        });
        
        this.log(`Migrated deposit: ${row['Deposit ID']} - Amount: ${row['Amount']}`);
      } catch (error) {
        this.log(`Error migrating deposit ${row['Deposit ID']}: ${error.message}`, 'error');
        this.stats.errors++;
      }
    }
  }

  async migrateExpenses() {
    this.log('Migrating expenses...');
    
    const expensesData = await this.readCSV('Final Quick Credit Loan Management System - Expenses.csv');
    const adminUser = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    
    for (const row of expensesData) {
      try {
        const expense = await prisma.expense.create({
          data: {
            expenseId: row['Expense ID'] || `EXP${Date.now()}`,
            category: this.mapExpenseCategory(row['Category']),
            description: row['Description'] || row['Item'] || 'Business Expense',
            amount: this.parseDecimal(row['Amount']) || 0,
            paymentMethod: this.mapPaymentMethod(row['Payment Method']),
            paymentReference: row['Reference'] || null,
            incurredAt: this.parseDate(row['Date'] || row['Expense Date']) || new Date(),
            processedBy: adminUser?.id || null,
            receipt: row['Receipt'] || null,
            status: 'APPROVED',
            notes: row['Notes'] || null
          }
        });
        
        this.log(`Migrated expense: ${expense.expenseId} - ${expense.description} - Amount: ${expense.amount}`);
      } catch (error) {
        this.log(`Error migrating expense ${row['Expense ID']}: ${error.message}`, 'error');
        this.stats.errors++;
      }
    }
  }

  async migrateSettings() {
    this.log('Creating default settings...');
    
    const defaultSettings = [
      {
        key: 'DEFAULT_INTEREST_RATE',
        value: '0.15',
        description: 'Default interest rate for loans (15%)',
        category: 'LOAN',
        dataType: 'NUMBER'
      },
      {
        key: 'DEFAULT_LOAN_TERM',
        value: '12',
        description: 'Default loan term in months',
        category: 'LOAN',
        dataType: 'NUMBER'
      },
      {
        key: 'MAX_LOAN_AMOUNT',
        value: '10000000',
        description: 'Maximum loan amount (UGX 10M)',
        category: 'LOAN',
        dataType: 'NUMBER'
      },
      {
        key: 'MIN_LOAN_AMOUNT',
        value: '50000',
        description: 'Minimum loan amount (UGX 50K)',
        category: 'LOAN',
        dataType: 'NUMBER'
      },
      {
        key: 'PENALTY_RATE',
        value: '0.05',
        description: 'Penalty rate for overdue payments (5%)',
        category: 'PAYMENT',
        dataType: 'NUMBER'
      },
      {
        key: 'COMPANY_NAME',
        value: 'QuickCredit Uganda',
        description: 'Company name',
        category: 'GENERAL',
        dataType: 'STRING'
      },
      {
        key: 'COMPANY_ADDRESS',
        value: 'Kampala, Uganda',
        description: 'Company address',
        category: 'GENERAL',
        dataType: 'STRING'
      },
      {
        key: 'COMPANY_PHONE',
        value: '+256-XXX-XXXXXX',
        description: 'Company phone number',
        category: 'GENERAL',
        dataType: 'STRING'
      },
      {
        key: 'ENABLE_SMS_NOTIFICATIONS',
        value: 'true',
        description: 'Enable SMS notifications',
        category: 'NOTIFICATION',
        dataType: 'BOOLEAN'
      },
      {
        key: 'ENABLE_EMAIL_NOTIFICATIONS',
        value: 'true',
        description: 'Enable email notifications',
        category: 'NOTIFICATION',
        dataType: 'BOOLEAN'
      }
    ];

    for (const setting of defaultSettings) {
      try {
        await prisma.setting.upsert({
          where: { key: setting.key },
          update: {},
          create: setting
        });
        this.log(`Created setting: ${setting.key}`);
      } catch (error) {
        this.log(`Error creating setting ${setting.key}: ${error.message}`, 'error');
        this.stats.errors++;
      }
    }
  }

  // Helper methods
  extractFirstName(fullName) {
    return fullName.split(' ')[0] || 'Unknown';
  }

  extractLastName(fullName) {
    const parts = fullName.split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : 'User';
  }

  cleanPhoneNumber(phone) {
    if (!phone) return '';
    // Remove any non-digit characters and ensure Uganda format
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('256')) return '+' + cleaned;
    if (cleaned.startsWith('0')) return '+256' + cleaned.substring(1);
    return '+256' + cleaned;
  }

  parseDate(dateString) {
    if (!dateString) return null;
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  }

  parseDecimal(value) {
    if (!value) return 0;
    const cleaned = String(value).replace(/[^\d.-]/g, '');
    return parseFloat(cleaned) || 0;
  }

  mapCreditRating(rating) {
    const ratingMap = {
      'Excellent': 'EXCELLENT',
      'Good': 'GOOD',
      'Fair': 'FAIR',
      'Poor': 'POOR'
    };
    return ratingMap[rating] || 'NO_CREDIT';
  }

  mapApplicationStatus(status) {
    const statusMap = {
      'Pending': 'PENDING',
      'Under Review': 'UNDER_REVIEW',
      'Approved': 'APPROVED',
      'Rejected': 'REJECTED',
      'Cancelled': 'CANCELLED'
    };
    return statusMap[status] || 'PENDING';
  }

  mapLoanStatus(status) {
    const statusMap = {
      'Active': 'ACTIVE',
      'Closed': 'CLOSED',
      'Pending': 'PENDING',
      'Approved': 'APPROVED',
      'Disbursed': 'DISBURSED',
      'Defaulted': 'DEFAULTED'
    };
    return statusMap[status] || 'ACTIVE';
  }

  mapPaymentMethod(method) {
    const methodMap = {
      'Cash': 'CASH',
      'Bank Transfer': 'BANK_TRANSFER',
      'Mobile Money': 'MOBILE_MONEY',
      'MTN': 'MOBILE_MONEY',
      'Airtel': 'MOBILE_MONEY',
      'Card': 'CARD',
      'Check': 'CHECK'
    };
    return methodMap[method] || 'CASH';
  }

  mapExpenseCategory(category) {
    const categoryMap = {
      'Operational': 'OPERATIONAL',
      'Marketing': 'MARKETING',
      'Office': 'OFFICE_SUPPLIES',
      'Utilities': 'UTILITIES',
      'Salaries': 'SALARIES',
      'Rent': 'RENT',
      'Insurance': 'INSURANCE',
      'Legal': 'LEGAL'
    };
    return categoryMap[category] || 'OTHER';
  }

  calculateNextPaymentDate(dueDateString) {
    if (!dueDateString) return null;
    const dueDate = new Date(dueDateString);
    if (isNaN(dueDate.getTime())) return null;
    
    // Add 30 days to due date for next payment
    const nextDate = new Date(dueDate);
    nextDate.setDate(nextDate.getDate() + 30);
    return nextDate;
  }

  async findOrCreateBorrower(name, phone) {
    if (!name) return null;
    
    // Try to find existing borrower
    let borrower = await prisma.borrower.findFirst({
      where: {
        OR: [
          { 
            AND: [
              { firstName: { contains: this.extractFirstName(name), mode: 'insensitive' } },
              { lastName: { contains: this.extractLastName(name), mode: 'insensitive' } }
            ]
          },
          ...(phone ? [{ phone: this.cleanPhoneNumber(phone) }] : [])
        ]
      }
    });

    // If not found, create new borrower
    if (!borrower && name.trim()) {
      try {
        borrower = await prisma.borrower.create({
          data: {
            borrowerId: `BWQC${String(this.stats.borrowers + 1).padStart(3, '0')}`,
            firstName: this.extractFirstName(name),
            lastName: this.extractLastName(name),
            phone: this.cleanPhoneNumber(phone) || '',
            status: 'ACTIVE',
            creditScore: 0,
            creditRating: 'NO_CREDIT'
          }
        });
        this.stats.borrowers++;
        this.log(`Created new borrower: ${borrower.firstName} ${borrower.lastName}`);
      } catch (error) {
        this.log(`Error creating borrower ${name}: ${error.message}`, 'error');
        return null;
      }
    }

    return borrower;
  }

  async generateMigrationReport() {
    const reportPath = path.join(__dirname, 'migration_report.txt');
    const report = [
      '='.repeat(80),
      'QUICKCREDIT MIGRATION REPORT',
      '='.repeat(80),
      `Migration completed at: ${new Date().toISOString()}`,
      '',
      'MIGRATION STATISTICS:',
      '-'.repeat(40),
      `Users created: ${this.stats.users}`,
      `Borrowers migrated: ${this.stats.borrowers}`,
      `Applications migrated: ${this.stats.applications}`,
      `Loans migrated: ${this.stats.loans}`,
      `Repayments migrated: ${this.stats.repayments}`,
      `Savings accounts migrated: ${this.stats.savings}`,
      `Expenses migrated: ${this.stats.expenses}`,
      `Errors encountered: ${this.stats.errors}`,
      '',
      'MIGRATION LOG:',
      '-'.repeat(40),
      ...this.migrationLog,
      '',
      '='.repeat(80)
    ].join('\n');

    fs.writeFileSync(reportPath, report);
    this.log(`Migration report saved to: ${reportPath}`);
  }

  async run() {
    try {
      this.log('Starting QuickCredit migration...');
      
      // Clear existing data (optional - remove if you want to preserve existing data)
      this.log('Clearing existing data...');
      await prisma.repayment.deleteMany({});
      await prisma.deposit.deleteMany({});
      await prisma.withdrawal.deleteMany({});
      await prisma.savings.deleteMany({});
      await prisma.loan.deleteMany({});
      await prisma.loanApplication.deleteMany({});
      await prisma.borrower.deleteMany({});
      await prisma.expense.deleteMany({});
      await prisma.user.deleteMany({});
      await prisma.setting.deleteMany({});

      // Run migration steps
      await this.createDefaultUsers();
      await this.migrateBorrowers();
      await this.migrateApplications();
      await this.migrateLoans();
      await this.migrateRepayments();
      await this.migrateSavings();
      await this.migrateExpenses();
      await this.migrateSettings();

      this.log('Migration completed successfully!');
      await this.generateMigrationReport();

      console.log('\n🎉 MIGRATION SUMMARY:');
      console.log('====================');
      console.log(`✅ Users: ${this.stats.users}`);
      console.log(`✅ Borrowers: ${this.stats.borrowers}`);
      console.log(`✅ Applications: ${this.stats.applications}`);
      console.log(`✅ Loans: ${this.stats.loans}`);
      console.log(`✅ Repayments: ${this.stats.repayments}`);
      console.log(`✅ Savings: ${this.stats.savings}`);
      console.log(`✅ Expenses: ${this.stats.expenses}`);
      console.log(`❌ Errors: ${this.stats.errors}`);

    } catch (error) {
      this.log(`Migration failed: ${error.message}`, 'error');
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const migration = new QuickCreditMigration();
  migration.run().catch(console.error);
}

module.exports = QuickCreditMigration;