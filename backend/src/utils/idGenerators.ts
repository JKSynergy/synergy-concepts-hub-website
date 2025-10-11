import { prisma } from '../config/database';

/**
 * Generate sequential Application ID (APP001, APP002, etc.)
 */
export async function generateApplicationId(): Promise<string> {
  try {
    // Get the latest application ID
    const latestApplication = await prisma.loanApplication.findFirst({
      where: {
        applicationId: {
          startsWith: 'APP'
        }
      },
      orderBy: {
        applicationId: 'desc'
      }
    });

    if (!latestApplication) {
      return 'APP001';
    }

    // Extract number from the latest ID (e.g., APP001 -> 001)
    const lastNumber = parseInt(latestApplication.applicationId.replace('APP', ''), 10);
    const nextNumber = lastNumber + 1;
    
    // Pad with zeros to maintain 3-digit format
    return `APP${nextNumber.toString().padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating application ID:', error);
    // Fallback to timestamp-based ID if there's an error
    const timestamp = Date.now().toString().slice(-6);
    return `APP${timestamp}`;
  }
}

/**
 * Generate sequential Loan ID (LN001, LN002, etc.)
 */
export async function generateLoanId(): Promise<string> {
  try {
    // Get the latest loan ID
    const latestLoan = await prisma.loan.findFirst({
      where: {
        loanId: {
          startsWith: 'LN'
        }
      },
      orderBy: {
        loanId: 'desc'
      }
    });

    if (!latestLoan) {
      return 'LN001';
    }

    // Extract number from the latest ID (e.g., LN001 -> 001)
    const lastNumber = parseInt(latestLoan.loanId.replace('LN', ''), 10);
    const nextNumber = lastNumber + 1;
    
    // Pad with zeros to maintain 3-digit format
    return `LN${nextNumber.toString().padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating loan ID:', error);
    // Fallback to timestamp-based ID if there's an error
    const timestamp = Date.now().toString().slice(-6);
    return `LN${timestamp}`;
  }
}

/**
 * Generate sequential Borrower ID (B001, B002, etc.)
 */
export async function generateBorrowerId(): Promise<string> {
  try {
    // Get the latest borrower ID
    const latestBorrower = await prisma.borrower.findFirst({
      where: {
        borrowerId: {
          startsWith: 'B'
        }
      },
      orderBy: {
        borrowerId: 'desc'
      }
    });

    if (!latestBorrower) {
      return 'B001';
    }

    // Extract number from the latest ID (e.g., B001 -> 001)
    const lastNumber = parseInt(latestBorrower.borrowerId.replace('B', ''), 10);
    const nextNumber = lastNumber + 1;
    
    // Pad with zeros to maintain 3-digit format
    return `B${nextNumber.toString().padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating borrower ID:', error);
    // Fallback to timestamp-based ID if there's an error
    const timestamp = Date.now().toString().slice(-6);
    return `B${timestamp}`;
  }
}

/**
 * Generate receipt number for repayments (REC001, REC002, etc.)
 */
export async function generateReceiptNumber(): Promise<string> {
  try {
    // Get the latest receipt number
    const latestRepayment = await prisma.repayment.findFirst({
      where: {
        receiptNumber: {
          startsWith: 'REC'
        }
      },
      orderBy: {
        receiptNumber: 'desc'
      }
    });

    if (!latestRepayment) {
      return 'REC001';
    }

    // Extract number from the latest ID (e.g., REC001 -> 001)
    const lastNumber = parseInt(latestRepayment.receiptNumber.replace('REC', ''), 10);
    const nextNumber = lastNumber + 1;
    
    // Pad with zeros to maintain 3-digit format
    return `REC${nextNumber.toString().padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating receipt number:', error);
    // Fallback to timestamp-based ID if there's an error
    const timestamp = Date.now().toString().slice(-6);
    return `REC${timestamp}`;
  }
}