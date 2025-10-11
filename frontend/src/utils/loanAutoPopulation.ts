/**
 * Loan Auto-Population Utilities
 * 
 * This module provides functions to automatically calculate and populate
 * loan financial values based on QuickCredit's business logic.
 * 
 * Key Insights from Data Analysis:
 * 1. Projected Profits = Principal × Monthly Interest Rate × Term (in months)
 * 2. Realized Profits = Total Payments Received - Principal Amount
 * 3. Outstanding Balance = (Principal + Projected Profits) - Total Payments Received
 * 4. Total Profit = Realized Profits (for closed loans) + Any Additional Fees
 */

import {
  autoCalculateProjectedProfits,
  autoCalculateRealizedProfits,
  autoCalculateOutstandingBalance,
  autoCalculateTotalProfit,
  autoCalculateAllLoanValues
} from './loanCalculations';

export interface LoanInput {
  principal: number;
  monthlyInterestRate: number;
  termInMonths: number;
  status?: string;
}

export interface PaymentInfo {
  totalPaymentsReceived: number;
  principalPaid: number;
  additionalFees: number;
  hasOverdueRecords: boolean; // Key addition based on business logic
}

export interface AutoPopulatedLoanValues {
  projectedProfits: number;
  realizedProfits: number;
  outstandingBalance: number;
  totalProfit: number;
  totalAmountDue: number;
  principalRemaining: number;
  shouldBeClosed: boolean;
  shouldBePendingOverdue: boolean;
}

/**
 * Auto-populate all loan values for a new loan application
 * Use this when creating a new loan to pre-fill calculated fields
 */
export const autoPopulateNewLoan = (loanInput: LoanInput): AutoPopulatedLoanValues => {
  const { principal, monthlyInterestRate, termInMonths, status = 'Pending' } = loanInput;
  
  return autoCalculateAllLoanValues(
    principal,
    monthlyInterestRate,
    termInMonths,
    status,
    0, // No payments received yet
    0, // No principal paid yet
    0, // No additional fees yet
    false // No overdue records for new loan
  );
};

/**
 * Auto-populate loan values based on payment history and overdue status
 * Use this when updating an existing loan with payment information
 */
export const autoPopulateFromPayments = (
  loanInput: LoanInput,
  paymentInfo: PaymentInfo
): AutoPopulatedLoanValues => {
  const { principal, monthlyInterestRate, termInMonths, status = 'Active' } = loanInput;
  const { totalPaymentsReceived, principalPaid, additionalFees, hasOverdueRecords } = paymentInfo;
  
  return autoCalculateAllLoanValues(
    principal,
    monthlyInterestRate,
    termInMonths,
    status,
    totalPaymentsReceived,
    principalPaid,
    additionalFees,
    hasOverdueRecords
  );
};

/**
 * Auto-populate values when loan status changes
 * Use this when updating loan status (e.g., from Active to Closed)
 */
export const autoPopulateOnStatusChange = (
  loanInput: LoanInput & { currentOutstanding: number },
  newStatus: string,
  hasOverdueRecords: boolean = false
): Partial<AutoPopulatedLoanValues> => {
  const { principal, monthlyInterestRate, termInMonths, currentOutstanding } = loanInput;
  const projectedProfits = autoCalculateProjectedProfits(principal, monthlyInterestRate, termInMonths);
  const totalAmountDue = principal + projectedProfits;
  const totalPaymentsReceived = totalAmountDue - currentOutstanding;
  
  switch (newStatus.toLowerCase()) {
    case 'closed':
    case 'completed':
      return {
        outstandingBalance: 0,
        realizedProfits: autoCalculateRealizedProfits(principal, projectedProfits, newStatus, totalAmountDue, hasOverdueRecords),
        totalProfit: autoCalculateTotalProfit(projectedProfits, newStatus),
        shouldBeClosed: true,
        shouldBePendingOverdue: false
      };
    
    case 'defaulted':
      return {
        realizedProfits: autoCalculateRealizedProfits(principal, projectedProfits, newStatus, totalPaymentsReceived, hasOverdueRecords),
        totalProfit: autoCalculateTotalProfit(Math.max(0, totalPaymentsReceived - principal), newStatus),
        shouldBeClosed: false,
        shouldBePendingOverdue: false
      };
    
    case 'pending overdue':
      return {
        realizedProfits: 0, // Always zero for overdue loans
        shouldBeClosed: false,
        shouldBePendingOverdue: true
      };
    
    default:
      return {};
  }
};

/**
 * Validate auto-calculated values against existing database values
 * Use this for data integrity checks and migration validation
 */
export const validateAutoCalculations = (
  loanInput: LoanInput,
  paymentInfo: PaymentInfo,
  existingValues: {
    projectedProfits: number;
    realizedProfits: number;
    outstandingBalance: number;
    totalProfit: number;
  }
) => {
  const autoValues = autoPopulateFromPayments(loanInput, paymentInfo);
  
  const validation = {
    projectedProfits: {
      existing: existingValues.projectedProfits,
      calculated: autoValues.projectedProfits,
      matches: Math.abs(existingValues.projectedProfits - autoValues.projectedProfits) < 1,
      formula: 'Principal × Interest Rate × Term'
    },
    realizedProfits: {
      existing: existingValues.realizedProfits,
      calculated: autoValues.realizedProfits,
      matches: Math.abs(existingValues.realizedProfits - autoValues.realizedProfits) < 100, // Allow some variance for business logic
      formula: 'Total Payments Received - Principal'
    },
    outstandingBalance: {
      existing: existingValues.outstandingBalance,
      calculated: autoValues.outstandingBalance,
      matches: Math.abs(existingValues.outstandingBalance - autoValues.outstandingBalance) < 1,
      formula: '(Principal + Projected Profits) - Total Payments'
    },
    totalProfit: {
      existing: existingValues.totalProfit,
      calculated: autoValues.totalProfit,
      matches: Math.abs(existingValues.totalProfit - autoValues.totalProfit) < 100,
      formula: 'Realized Profits + Additional Fees'
    }
  };
  
  const allMatch = Object.values(validation).every(v => v.matches);
  
  return {
    allMatch,
    validation,
    recommendations: generateRecommendations(validation)
  };
};

/**
 * Generate recommendations based on validation results
 */
const generateRecommendations = (validation: any): string[] => {
  const recommendations: string[] = [];
  
  if (!validation.projectedProfits.matches) {
    recommendations.push('Projected profits should be recalculated using: Principal × Interest Rate × Term');
  }
  
  if (!validation.realizedProfits.matches) {
    recommendations.push('Realized profits may need adjustment based on actual payment history');
  }
  
  if (!validation.outstandingBalance.matches) {
    recommendations.push('Outstanding balance should be updated based on payments received');
  }
  
  if (!validation.totalProfit.matches) {
    recommendations.push('Total profit calculation may include additional fees or adjustments');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('All calculations match expected values ✅');
  }
  
  return recommendations;
};

/**
 * Pre-fill form fields for loan creation/editing
 * Returns an object that can be spread into form state
 */
export const getFormAutoFillValues = (loanInput: LoanInput): Record<string, number> => {
  const values = autoPopulateNewLoan(loanInput);
  
  return {
    projectedProfits: values.projectedProfits,
    realizedProfits: values.realizedProfits,
    outstandingBalance: values.outstandingBalance,
    totalProfit: values.totalProfit,
    totalAmountDue: values.totalAmountDue
  };
};

/**
 * Usage Examples:
 * 
 * // For new loan creation
 * const newLoanValues = autoPopulateNewLoan({
 *   principal: 250000,
 *   monthlyInterestRate: 0.15,
 *   termInMonths: 1
 * });
 * 
 * // For loan with payment history
 * const updatedValues = autoPopulateFromPayments(
 *   { principal: 250000, monthlyInterestRate: 0.15, termInMonths: 1, status: 'Active' },
 *   { totalPaymentsReceived: 100000, principalPaid: 85000, additionalFees: 0 }
 * );
 * 
 * // For status change
 * const statusChangeValues = autoPopulateOnStatusChange(
 *   { principal: 250000, monthlyInterestRate: 0.15, termInMonths: 1, currentOutstanding: 0 },
 *   'Closed'
 * );
 */