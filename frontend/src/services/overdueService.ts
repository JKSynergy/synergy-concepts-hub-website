/**
 * Overdue Records Service
 * 
 * This service handles logic-based overdue detection and status calculation
 * based on loan data rather than static overdue records.
 */

export interface OverdueItem {
  loanId: string;
  borrowerId: string;
  customerName: string;
  phone: string;
  email: string;
  amount: number;
  totalAmount: number;
  outstandingBalance: number;
  nextPaymentDate: string;
  nextPaymentAmount: number;
  daysOverdue: number;
  status: string;
  totalRepayments: number;
  interestRate: number;
  termMonths: number;
  monthlyPayment: number;
  createdAt: string;
  disbursedAt: string;
  totalOverdueCycles: number;
  overdueDetails: OverdueCycleDetail[];
}

export interface OverdueCycleDetail {
  cycle: number;
  dueDate: string;
  amount: number;
  daysOverdue: number;
}

/**
 * Calculate actual loan status based on business logic
 */
export const calculateActualStatus = (
  loan: any,
  currentDate: Date = new Date()
): string => {
  // If loan has no outstanding balance, it should be closed
  if (loan.outstandingBalance <= 0) {
    return 'CLOSED';
  }

  // If loan has outstanding balance and is past due date, it's overdue
  if (loan.nextPaymentDate) {
    const dueDate = new Date(loan.nextPaymentDate);
    const daysPastDue = Math.floor((currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysPastDue > 0) {
      return 'OVERDUE';
    }
  }

  // If loan has outstanding balance and not past due, it's active
  if (loan.outstandingBalance > 0) {
    return 'ACTIVE';
  }

  // Default to current status
  return loan.status || 'ACTIVE';
};

/**
 * Check if a loan is overdue based on logic
 */
export const isLoanOverdue = (
  loan: any,
  currentDate: Date = new Date()
): boolean => {
  if (loan.outstandingBalance <= 0) {
    return false;
  }

  if (!loan.nextPaymentDate) {
    return false;
  }

  const dueDate = new Date(loan.nextPaymentDate);
  return currentDate > dueDate;
};

/**
 * Get overdue loans from API
 */
export const getOverdueLoans = async (): Promise<OverdueItem[]> => {
  try {
    const response = await fetch('http://localhost:3002/api/overdue');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching overdue loans:', error);
    return [];
  }
};

/**
 * Calculate total overdue amount from overdue loans
 */
export const calculateTotalOverdueAmount = (overdueLoans: OverdueItem[]): number => {
  return overdueLoans.reduce((total, loan) => total + loan.outstandingBalance, 0);
};

/**
 * Calculate total overdue cycles across all loans
 */
export const calculateTotalOverdueCycles = (overdueLoans: OverdueItem[]): number => {
  return overdueLoans.reduce((total, loan) => total + loan.totalOverdueCycles, 0);
};

/**
 * Get overdue statistics
 */
export const getOverdueStatistics = async () => {
  try {
    const overdueLoans = await getOverdueLoans();
    
    return {
      totalOverdueLoans: overdueLoans.length,
      totalOverdueAmount: calculateTotalOverdueAmount(overdueLoans),
      totalOverdueCycles: calculateTotalOverdueCycles(overdueLoans),
      averageDaysOverdue: overdueLoans.length > 0 
        ? Math.round(overdueLoans.reduce((sum, loan) => sum + loan.daysOverdue, 0) / overdueLoans.length)
        : 0
    };
  } catch (error) {
    console.error('Error calculating overdue statistics:', error);
    return {
      totalOverdueLoans: 0,
      totalOverdueAmount: 0,
      totalOverdueCycles: 0,
      averageDaysOverdue: 0
    };
  }
};

/**
 * Determine if a loan should be marked as closed based on business rules
 */
export const shouldMarkLoanAsClosed = (
  outstandingBalance: number
): boolean => {
  return outstandingBalance <= 0;
};

/**
 * Get the correct loan status based on business rules
 */
export const getCorrectLoanStatus = (
  loan: any,
  currentDate: Date = new Date()
): string => {
  return calculateActualStatus(loan, currentDate);
};

/**
 * Validate loan closure conditions
 */
export const validateLoanClosureConditions = (
  loan: any
): {
  canBeClosed: boolean;
  reasons: string[];
  recommendations: string[];
} => {
  const reasons: string[] = [];
  const recommendations: string[] = [];
  
  // Check outstanding balance
  if (loan.outstandingBalance > 0) {
    reasons.push(`Outstanding balance is ${loan.outstandingBalance.toLocaleString()} (must be 0)`);
    recommendations.push('Collect remaining payments to reduce outstanding balance to zero');
  }
  
  // Check if loan is overdue
  if (isLoanOverdue(loan)) {
    const daysOverdue = Math.floor((new Date().getTime() - new Date(loan.nextPaymentDate).getTime()) / (1000 * 60 * 60 * 24));
    reasons.push(`Loan is ${daysOverdue} days overdue`);
    recommendations.push('Resolve overdue status before marking loan as closed');
  }
  
  const canBeClosed = reasons.length === 0;
  
  if (canBeClosed) {
    recommendations.push('✅ Loan meets all conditions for closure');
  }
  
  return {
    canBeClosed,
    reasons,
    recommendations
  };
};

/**
 * Business logic documentation for future reference
 */
export const BUSINESS_RULES = {
  LOAN_CLOSURE: {
    description: 'A loan can only be marked as "Closed" when both conditions are met',
    conditions: [
      'Outstanding balance must be exactly UGX 0',
      'Loan must not be overdue (past next payment date)'
    ]
  },
  OVERDUE_DETECTION: {
    description: 'A loan is considered overdue when',
    conditions: [
      'Outstanding balance > 0',
      'Current date > next payment date'
    ]
  },
  STATUS_PRIORITY: {
    description: 'Status determination priority (highest to lowest)',
    order: [
      'CLOSED (outstanding balance = 0)',
      'OVERDUE (past due date with outstanding balance)',
      'ACTIVE (has outstanding balance, not past due)',
      'Current status (fallback)'
    ]
  }
};

export default {
  calculateActualStatus,
  isLoanOverdue,
  getOverdueLoans,
  calculateTotalOverdueAmount,
  calculateTotalOverdueCycles,
  getOverdueStatistics,
  shouldMarkLoanAsClosed,
  getCorrectLoanStatus,
  validateLoanClosureConditions,
  BUSINESS_RULES
};