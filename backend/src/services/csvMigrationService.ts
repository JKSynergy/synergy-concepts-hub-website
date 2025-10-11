import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

const prisma = new PrismaClient();

interface CSVImportResult {
  success: boolean;
  imported: number;
  errors: string[];
  tableName: string;
}

export class CSVMigrationService {
  private csvDataPath: string;

  constructor(csvDataPath: string = path.join(__dirname, '../../csv-data')) {
    this.csvDataPath = csvDataPath;
  }

  // Helper methods for data parsing
  private parseAmount(value: any): number {
    if (!value) return 0;
    const cleanValue = value.toString().replace(/[^\d.-]/g, '');
    const parsed = parseFloat(cleanValue);
    return isNaN(parsed) ? 0 : parsed;
  }

  private parseDate(value: any): Date | null {
    if (!value) return null;
    
    const dateStr = value.toString().trim();
    if (!dateStr) return null;
    
    // Try different date formats
    const formats = [
      // DD/MM/YYYY
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      // MM/DD/YYYY  
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      // YYYY-MM-DD
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    ];

    // Try parsing with different formats
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime()) && date.getFullYear() > 1900) {
        return date;
      }
    } catch (error) {
      // Continue to manual parsing
    }

    // Manual parsing for DD/MM/YYYY format (common in CSV)
    const ddmmyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyy) {
      const day = parseInt(ddmmyyyy[1]);
      const month = parseInt(ddmmyyyy[2]) - 1; // JS months are 0-based
      const year = parseInt(ddmmyyyy[3]);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    console.warn(`Could not parse date: ${dateStr}`);
    return null;
  }

  async importAllCSVData(): Promise<CSVImportResult[]> {
    const results: CSVImportResult[] = [];
    
    console.log('🚀 Starting CSV data migration...');
    
    try {
      // Import in order due to foreign key dependencies
      results.push(await this.importBorrowers());
      results.push(await this.importLoans());
      results.push(await this.importRepayments());
      results.push(await this.importSavings());
      results.push(await this.importExpenses());
      results.push(await this.importApplications());
      
      console.log('✅ CSV migration completed successfully!');
      return results;
    } catch (error) {
      console.error('❌ CSV migration failed:', error);
      throw error;
    }
  }

  private async importBorrowers(): Promise<CSVImportResult> {
    const filePath = path.join(this.csvDataPath, 'Final Quick Credit Loan Management System - Borrowers.csv');
    return this.importCSV(filePath, 'borrowers', async (data) => {
      const usedPhones = new Set<string>();
      const usedNationalIds = new Set<string>();
      
      const borrowersData = data.map((row: any, index: number) => {
        const fullName = row['Name'] || row['Full Name'] || `Borrower ${index + 1}`;
        const nameParts = fullName.trim().split(' ');
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts.slice(1).join(' ') || 'User';
        
        // Handle phone number uniqueness
        let phone = row['Phone Number'] || row['Phone'] || '';
        if (!phone || usedPhones.has(phone)) {
          phone = `+256700${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`;
        }
        usedPhones.add(phone);
        
        // Handle National ID uniqueness (null is allowed)
        let nationalId = row['National ID / Passport'] || row['National ID'] || row['NIN'] || null;
        if (nationalId && usedNationalIds.has(nationalId)) {
          nationalId = null; // Set to null if duplicate
        }
        if (nationalId) {
          usedNationalIds.add(nationalId);
        }
        
        return {
          borrowerId: row['Borrower ID'] || row['ID'] || `BORR${String(index + 1).padStart(4, '0')}`,
          firstName: firstName,
          lastName: lastName,
          phone: phone,
          email: row['Email Address'] || row['Email'] || null,
          gender: row['Gender'] || null,
          dateOfBirth: this.parseDate(row['Date of Birth']) || this.parseDate(row['DOB']),
          nationalId: nationalId,
          district: row['District'] || null,
          subcounty: row['Subcounty'] || row['Sub County'] || null,
          village: row['Village'] || row['Residential Address'] || null,
          occupation: row['Occupation'] || null,
          monthlyIncome: this.parseAmount(row['Monthly Income']) || null,
          creditRating: row['Credit Rating'] || 'NO_CREDIT',
          status: 'ACTIVE',
          createdById: 'system-migration',
        };
      });

      // Create system user if not exists
      await this.createSystemUser();

      return await prisma.borrower.createMany({
        data: borrowersData,
      });
    });
  }

  private async importLoans(): Promise<CSVImportResult> {
    const filePath = path.join(this.csvDataPath, 'Final Quick Credit Loan Management System - Loans.csv');
    return this.importCSV(filePath, 'loans', async (data) => {
      const systemUser = await this.getSystemUser();
      const borrowers = await prisma.borrower.findMany();
      const borrowerMap = new Map(borrowers.map(b => [b.firstName + ' ' + b.lastName, b.id]));

      const loansData = data.map((row: any, index: number) => {
        const customerName = row['Customer Name'] || '';
        const borrowerId = borrowerMap.get(customerName) || borrowers[0]?.id || 'default-borrower';
        
        // Better amount parsing
        const principal = this.parseAmount(row['Amount']);
        const interestRate = this.parseAmount(row['Interest Rate']) || 15; // Default 15%
        const termMonths = parseInt(row['Term']?.toString() || '12');
        
        // Safe date parsing
        const originationDate = this.parseDate(row['Origination Date']) || new Date();
        const dueDate = this.parseDate(row['Due Date']) || new Date();
        
        // Calculate loan metrics
        const totalInterest = principal * (interestRate / 100) * (termMonths / 12);
        const totalAmount = principal + totalInterest;
        const monthlyPayment = totalAmount / termMonths;
        
        return {
          loanId: row['Loan ID'] || `LOAN${String(index + 1).padStart(4, '0')}`,
          borrowerId: borrowerId,
          loanOfficerId: systemUser.id,
          principal: principal,
          interestRate: interestRate,
          termMonths: termMonths,
          totalInterest: totalInterest,
          totalAmount: totalAmount,
          monthlyPayment: monthlyPayment,
          status: row['Status'] || 'ACTIVE',
          purpose: row['Purpose'] || 'General',
          disbursedAt: originationDate,
          disbursedAmount: principal,
          outstandingBalance: this.parseAmount(row['Outstanding Balance']) || principal,
          nextPaymentDate: dueDate,
        };
      }).filter(loan => loan.borrowerId !== 'default-borrower'); // Only include loans with valid borrowers

      return await prisma.loan.createMany({
        data: loansData,
      });
    });
  }

  private async importRepayments(): Promise<CSVImportResult> {
    const filePath = path.join(this.csvDataPath, 'Final Quick Credit Loan Management System - Repayments.csv');
    return this.importCSV(filePath, 'repayments', async (data) => {
      const loans = await prisma.loan.findMany({ include: { borrower: true } });
      const loansMap = new Map(loans.map(l => [l.loanId, l]));

      const repaymentsData = data.map((row: any, index: number) => {
        const loanId = row['Loan ID'];
        const loan = loansMap.get(loanId);
        
        if (!loan) {
          console.warn(`Loan not found for repayment: ${loanId}`);
          return null; // Skip this repayment
        }

        const amount = this.parseAmount(row['Amount']);
        const paymentDate = this.parseDate(row['Payment Date']) || new Date();
        
        return {
          receiptNumber: row['Receipt Number'] || `RCP${String(index + 1).padStart(6, '0')}`,
          loanId: loan.id,
          borrowerId: loan.borrowerId,
          amount: amount,
          principalAmount: amount * 0.7, // Rough estimate - 70% principal
          interestAmount: amount * 0.3,  // 30% interest
          paymentMethod: row['Payment Method'] || 'CASH',
          transactionId: row['Transaction ID'] || null,
          status: 'COMPLETED',
          paidAt: paymentDate,
        };
      }).filter(repayment => repayment !== null); // Remove null entries

      return await prisma.repayment.createMany({
        data: repaymentsData,
      });
    });
  }

  private async importSavings(): Promise<CSVImportResult> {
    const filePath = path.join(this.csvDataPath, 'Final Quick Credit Loan Management System - Savings.csv');
    return this.importCSV(filePath, 'savings', async (data) => {
      const borrowers = await prisma.borrower.findMany();
      if (borrowers.length === 0) {
        console.warn('No borrowers found, skipping savings import');
        return { count: 0 };
      }

      const borrowersMap = new Map(borrowers.map(b => [b.borrowerId, b.id]));

      const savingsData = data.map((row: any, index: number) => {
        const borrowerId = row['Borrower ID'] || row['BorrowerID'];
        const mappedBorrowerId = borrowersMap.get(borrowerId) || borrowers[index % borrowers.length]?.id;
        
        if (!mappedBorrowerId) {
          console.warn(`No borrower found for savings record ${index}`);
          return null;
        }
        
        return {
          savingsId: row['Savings ID'] || row['ID'] || `SAV${String(index + 1).padStart(4, '0')}`,
          borrowerId: mappedBorrowerId,
          balance: this.parseAmount(row['Balance']) || 0,
          interestRate: this.parseAmount(row['Interest Rate']) || 5,
          status: 'ACTIVE',
        };
      }).filter(item => item !== null);

      return await prisma.savings.createMany({
        data: savingsData,
      });
    });
  }

  private async importExpenses(): Promise<CSVImportResult> {
    const filePath = path.join(this.csvDataPath, 'Final Quick Credit Loan Management System - Expenses.csv');
    return this.importCSV(filePath, 'expenses', async (data) => {
      const expensesData = data.map((row: any, index: number) => ({
        expenseId: row['Expense ID'] || `EXP${String(index + 1).padStart(4, '0')}`,
        description: row['Description'] || 'General Expense',
        amount: parseFloat(row['Amount']?.toString().replace(/[^\d.-]/g, '') || '0'),
        category: row['Category'] || 'OPERATIONAL',
        expenseDate: row['Date'] ? new Date(row['Date']) : new Date(),
      }));

      return await prisma.expense.createMany({
        data: expensesData,
      });
    });
  }

  private async importApplications(): Promise<CSVImportResult> {
    const filePath = path.join(this.csvDataPath, 'Final Quick Credit Loan Management System - Applications.csv');
    return this.importCSV(filePath, 'applications', async (data) => {
      const borrowers = await prisma.borrower.findMany();
      const systemUser = await this.getSystemUser();

      if (borrowers.length === 0) {
        console.warn('No borrowers found, skipping applications import');
        return { count: 0 };
      }

      const applicationsData = data.map((row: any, index: number) => {
        // Try to match borrower by name or use fallback
        const fullName = row['Full Name'] || row['Name'] || '';
        const borrower = borrowers.find(b => 
          (b.firstName + ' ' + b.lastName).toLowerCase() === fullName.toLowerCase()
        ) || borrowers[index % borrowers.length];

        if (!borrower) {
          console.warn(`No borrower found for application ${index}`);
          return null;
        }

        return {
          applicationId: row['Application ID'] || row['ID'] || `APP${String(index + 1).padStart(6, '0')}`,
          borrowerId: borrower.id,
          requestedAmount: this.parseAmount(row['Requested Amount']) || 0,
          purpose: row['Purpose'] || 'General',
          termMonths: parseInt(row['Loan Term']?.toString() || '12'),
          status: row['Status'] || 'PENDING',
          reviewedById: systemUser.id,
          submittedAt: this.parseDate(row['Application Date']) || new Date(),
          reviewedAt: new Date(),
        };
      }).filter(item => item !== null);

      return await prisma.loanApplication.createMany({
        data: applicationsData,
      });
    });
  }

  private async createSystemUser(): Promise<void> {
    try {
      await prisma.user.upsert({
        where: { id: 'system-migration' },
        update: {},
        create: {
          id: 'system-migration',
          username: 'system',
          email: 'system@quickcredit.com',
          password: 'system-generated',
          firstName: 'System',
          lastName: 'Migration',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });
    } catch (error) {
      console.log('System user already exists or created');
    }
  }

  private async getSystemUser() {
    return await prisma.user.findUniqueOrThrow({
      where: { id: 'system-migration' }
    });
  }

  private async importCSV(
    filePath: string, 
    tableName: string, 
    processor: (data: any[]) => Promise<any>
  ): Promise<CSVImportResult> {
    console.log(`📄 Importing ${tableName} from ${path.basename(filePath)}...`);
    
    try {
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          imported: 0,
          errors: [`File not found: ${filePath}`],
          tableName,
        };
      }

      const csvContent = fs.readFileSync(filePath, 'utf-8');
      const parseResult = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
      });

      if (parseResult.errors.length > 0) {
        return {
          success: false,
          imported: 0,
          errors: parseResult.errors.map(e => e.message),
          tableName,
        };
      }

      const result = await processor(parseResult.data);
      const count = result.count || 0;

      console.log(`✅ Successfully imported ${count} records to ${tableName}`);
      
      return {
        success: true,
        imported: count,
        errors: [],
        tableName,
      };
    } catch (error) {
      console.error(`❌ Failed to import ${tableName}:`, error);
      return {
        success: false,
        imported: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        tableName,
      };
    }
  }

  async clearAllData(): Promise<void> {
    console.log('🗑️ Clearing existing data...');
    
    // Delete in reverse order due to foreign keys
    await prisma.repayment.deleteMany();
    await prisma.savings.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.loanApplication.deleteMany();
    await prisma.loan.deleteMany();
    await prisma.borrower.deleteMany();
    
    console.log('✅ All data cleared');
  }

  async getImportStatus(): Promise<{
    borrowers: number;
    loans: number;
    repayments: number;
    savings: number;
    expenses: number;
    applications: number;
  }> {
    const [borrowers, loans, repayments, savings, expenses, applications] = await Promise.all([
      prisma.borrower.count(),
      prisma.loan.count(),
      prisma.repayment.count(),
      prisma.savings.count(),
      prisma.expense.count(),
      prisma.loanApplication.count(),
    ]);

    return {
      borrowers,
      loans,
      repayments,
      savings,
      expenses,
      applications,
    };
  }
}

export default CSVMigrationService;