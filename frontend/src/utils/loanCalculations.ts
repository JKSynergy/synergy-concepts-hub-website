/**
 * Comprehensive loan calculation utilities
 */

export interface LoanCalculationInput {
  principal: number;
  monthlyInterestRate: number; // As decimal (e.g., 0.10 for 10%)
  termInMonths: number;
  originationDate: Date;
}

export interface PaymentScheduleItem {
  paymentNumber: number;
  date: Date;
  monthlyPayment: number;
  principalPayment: number;
  interestPayment: number;
  remainingBalance: number;
}

export interface LoanCalculationResult {
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
  paymentSchedule: PaymentScheduleItem[];
}

export interface OverdueCalculation {
  daysOverdue: number;
  overdueInterest: number;
  penaltyRate: number;
  totalOverdue: number;
}

/**
 * Validate interest rate is within acceptable ranges
 */
export const validateInterestRate = (rate: number): boolean => {
  const acceptableRates = [0.10, 0.12, 0.15, 0.20]; // 10%, 12%, 15%, 20%
  return acceptableRates.includes(rate);
};

/**
 * Get the nearest acceptable interest rate
 */
export const getNearestAcceptableRate = (rate: number): number => {
  const acceptableRates = [0.10, 0.12, 0.15, 0.20];
  return acceptableRates.reduce((prev, curr) => 
    Math.abs(curr - rate) < Math.abs(prev - rate) ? curr : prev
  );
};

/**
 * Calculate monthly payment using standard loan payment formula
 * PMT = P * [r(1+r)^n] / [(1+r)^n - 1]
 */
export const calculateMonthlyPayment = (
  principal: number,
  monthlyRate: number,
  termInMonths: number
): number => {
  if (monthlyRate === 0) {
    return principal / termInMonths;
  }
  
  const factor = Math.pow(1 + monthlyRate, termInMonths);
  return principal * (monthlyRate * factor) / (factor - 1);
};

/**
 * Calculate total interest for the loan
 */
export const calculateTotalInterest = (
  principal: number,
  monthlyRate: number,
  termInMonths: number
): number => {
  const monthlyPayment = calculateMonthlyPayment(principal, monthlyRate, termInMonths);
  return (monthlyPayment * termInMonths) - principal;
};

/**
 * Generate complete payment schedule (amortization table)
 */
export const generatePaymentSchedule = (input: LoanCalculationInput): LoanCalculationResult => {
  const { principal, monthlyInterestRate, termInMonths, originationDate } = input;
  
  const monthlyPayment = calculateMonthlyPayment(principal, monthlyInterestRate, termInMonths);
  const totalPayment = monthlyPayment * termInMonths;
  const totalInterest = totalPayment - principal;
  
  const paymentSchedule: PaymentScheduleItem[] = [];
  let remainingBalance = principal;
  
  for (let i = 1; i <= termInMonths; i++) {
    const interestPayment = remainingBalance * monthlyInterestRate;
    const principalPayment = monthlyPayment - interestPayment;
    remainingBalance = Math.max(0, remainingBalance - principalPayment);
    
    const paymentDate = new Date(originationDate);
    paymentDate.setMonth(paymentDate.getMonth() + i);
    
    paymentSchedule.push({
      paymentNumber: i,
      date: paymentDate,
      monthlyPayment,
      principalPayment,
      interestPayment,
      remainingBalance
    });
  }
  
  return {
    monthlyPayment,
    totalPayment,
    totalInterest,
    paymentSchedule
  };
};

/**
 * Calculate outstanding balance at a specific point in time
 */
export const calculateOutstandingBalance = (
  principal: number,
  monthlyRate: number,
  termInMonths: number,
  paymentsMade: number
): number => {
  if (paymentsMade >= termInMonths) return 0;
  if (paymentsMade <= 0) return principal;
  
  const monthlyPayment = calculateMonthlyPayment(principal, monthlyRate, termInMonths);
  let balance = principal;
  
  for (let i = 0; i < paymentsMade; i++) {
    const interestPayment = balance * monthlyRate;
    const principalPayment = monthlyPayment - interestPayment;
    balance = Math.max(0, balance - principalPayment);
  }
  
  return balance;
};

/**
 * Calculate overdue interest and penalties
 */
export const calculateOverdueAmount = (
  outstandingAmount: number,
  daysOverdue: number,
  baseMonthlyRate: number,
  penaltyMultiplier: number = 1.5
): OverdueCalculation => {
  const dailyRate = baseMonthlyRate / 30; // Convert monthly to daily
  const penaltyRate = dailyRate * penaltyMultiplier;
  const overdueInterest = outstandingAmount * penaltyRate * daysOverdue;
  
  return {
    daysOverdue,
    overdueInterest,
    penaltyRate: penaltyRate * 100, // Convert to percentage
    totalOverdue: outstandingAmount + overdueInterest
  };
};

/**
 * Calculate early payment discount
 */
export const calculateEarlyPaymentDiscount = (
  remainingBalance: number,
  remainingTerms: number,
  discountRate: number = 0.05 // 5% discount
): number => {
  if (remainingTerms <= 0) return 0;
  
  // Discount based on remaining terms
  const discountFactor = Math.min(discountRate * (remainingTerms / 12), discountRate);
  return remainingBalance * discountFactor;
};

/**
 * Calculate projected profits based on loan status and payment history
 */
export const calculateProjectedProfits = (
  principal: number,
  monthlyRate: number,
  termInMonths: number,
  paymentsMade: number = 0,
  status: string = 'Active'
): number => {
  const totalInterest = calculateTotalInterest(principal, monthlyRate, termInMonths);
  
  switch (status.toLowerCase()) {
    case 'completed':
      return totalInterest;
    case 'active':
      // Calculate based on payments made
      const remainingTerms = termInMonths - paymentsMade;
      const remainingRatio = remainingTerms / termInMonths;
      return totalInterest * (1 - remainingRatio * 0.1); // Slight reduction for risk
    case 'defaulted':
      // Calculate realized interest up to default point
      const realizedRatio = paymentsMade / termInMonths;
      return totalInterest * realizedRatio * 0.7; // 70% recovery rate
    case 'pending':
      return 0;
    default:
      return totalInterest * 0.8; // Conservative estimate
  }
};

/**
 * Calculate realized profits based on actual payments received
 */
export const calculateRealizedProfits = (
  totalPaymentsReceived: number,
  originalPrincipal: number
): number => {
  return Math.max(0, totalPaymentsReceived - originalPrincipal);
};

/**
 * Auto-calculate projected profits using QuickCredit's standard formula
 * Formula: Principal × Interest Rate × Term (in months)
 * This is the total interest expected over the loan term
 */
export const autoCalculateProjectedProfits = (
  principal: number,
  monthlyInterestRate: number,
  termInMonths: number
): number => {
  return Math.round(principal * monthlyInterestRate * termInMonths);
};

/**
 * Auto-calculate realized profits based on QuickCredit's business logic
 * 
 * Business Rules:
 * 1. Realized profits are ONLY calculated when a loan is marked as "Closed"
 * 2. A loan is marked "Closed" when:
 *    - Outstanding balance is zero (UGX 0)
 *    - No pending overdue records exist for that loan
 * 3. For "Pending Overdue" loans: realized profits = UGX 0
 * 4. For "Active" loans: realized profits = UGX 0 (until closed)
 * 5. For "Closed" loans: realized profits = actual total payments received - principal
 */
export const autoCalculateRealizedProfits = (
  principal: number,
  projectedProfits: number,
  loanStatus: string,
  totalPaymentsReceived: number = 0,
  hasOverdueRecords: boolean = false
): number => {
  switch (loanStatus.toLowerCase()) {
    case 'closed':
    case 'completed':
      // Only if truly closed (no outstanding balance AND no overdue records)
      if (!hasOverdueRecords) {
        return Math.max(0, totalPaymentsReceived - principal);
      }
      return 0; // If has overdue records, not truly closed yet
    
    case 'pending overdue':
      // Explicitly zero for overdue loans
      return 0;
    
    case 'active':
    case 'pending':
      // No realized profits until loan is closed
      return 0;
    
    case 'defaulted':
      // Recovery amount minus principal (if any)
      return Math.max(0, totalPaymentsReceived - principal);
    
    default:
      return 0;
  }
};

/**
 * Determine if a loan should be marked as "Closed" based on business rules
 */
export const shouldLoanBeClosed = (
  outstandingBalance: number,
  hasOverdueRecords: boolean
): boolean => {
  return outstandingBalance === 0 && !hasOverdueRecords;
};

/**
 * Determine if a loan should be marked as "Pending Overdue" 
 */
export const shouldLoanBePendingOverdue = (
  hasOverdueRecords: boolean,
  outstandingBalance: number
): boolean => {
  return hasOverdueRecords && outstandingBalance > 0;
};

/**
 * Auto-calculate the correct loan status based on business rules
 */
export const autoCalculateLoanStatus = (
  outstandingBalance: number,
  hasOverdueRecords: boolean,
  dueDate: Date,
  currentDate: Date = new Date()
): string => {
  // Check if loan should be closed
  if (shouldLoanBeClosed(outstandingBalance, hasOverdueRecords)) {
    return 'Closed';
  }
  
  // Check if loan should be pending overdue
  if (shouldLoanBePendingOverdue(hasOverdueRecords, outstandingBalance)) {
    return 'Pending Overdue';
  }
  
  // Check if loan is past due date
  if (currentDate > dueDate && outstandingBalance > 0) {
    return 'Pending Overdue'; // This should trigger creation of overdue record
  }
  
  // Check if loan is fully paid but within term
  if (outstandingBalance === 0) {
    return 'Closed';
  }
  
  // Default to active if payments are being made and not overdue
  return 'Active';
};

/**
 * Auto-calculate outstanding balance based on payments made
 * Formula: Principal + Projected Profits - Total Payments Received
 */
export const autoCalculateOutstandingBalance = (
  principal: number,
  projectedProfits: number,
  totalPaymentsReceived: number = 0,
  loanStatus: string = 'Active'
): number => {
  if (loanStatus.toLowerCase() === 'closed' || loanStatus.toLowerCase() === 'completed') {
    return 0;
  }
  
  const totalAmountDue = principal + projectedProfits;
  const outstanding = totalAmountDue - totalPaymentsReceived;
  
  return Math.max(0, outstanding);
};

/**
 * Auto-calculate total profit (final profit when loan is completed)
 * This is typically the same as realized profits for closed loans
 */
export const autoCalculateTotalProfit = (
  realizedProfits: number,
  loanStatus: string,
  additionalFees: number = 0
): number => {
  if (loanStatus.toLowerCase() === 'closed' || loanStatus.toLowerCase() === 'completed') {
    return realizedProfits + additionalFees;
  }
  
  // For active/pending loans, total profit is not yet determined
  return realizedProfits;
};

/**
 * Complete auto-calculation function that returns all calculated values
 */
export const autoCalculateAllLoanValues = (
  principal: number,
  monthlyInterestRate: number,
  termInMonths: number,
  loanStatus: string,
  totalPaymentsReceived: number = 0,
  principalPaid: number = 0,
  additionalFees: number = 0,
  hasOverdueRecords: boolean = false
) => {
  const projectedProfits = autoCalculateProjectedProfits(principal, monthlyInterestRate, termInMonths);
  const realizedProfits = autoCalculateRealizedProfits(principal, projectedProfits, loanStatus, totalPaymentsReceived, hasOverdueRecords);
  const outstandingBalance = autoCalculateOutstandingBalance(principal, projectedProfits, totalPaymentsReceived, loanStatus);
  const totalProfit = autoCalculateTotalProfit(realizedProfits, loanStatus, additionalFees);
  
  return {
    projectedProfits,
    realizedProfits,
    outstandingBalance,
    totalProfit,
    totalAmountDue: principal + projectedProfits,
    principalRemaining: Math.max(0, principal - principalPaid),
    shouldBeClosed: shouldLoanBeClosed(outstandingBalance, hasOverdueRecords),
    shouldBePendingOverdue: shouldLoanBePendingOverdue(hasOverdueRecords, outstandingBalance)
  };
};

/**
 * Format currency for display
 */
export const formatCurrency = (amount: number, currency: string = 'UGX'): string => {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

/**
 * Calculate loan performance metrics
 */
export const calculateLoanPerformance = (
  loans: Array<{
    amount: number;
    interestRate: number;
    term: number;
    status: string;
    paymentsMade?: number;
  }>
) => {
  const totalDisbursed = loans.reduce((sum, loan) => sum + loan.amount, 0);
  const totalProjectedInterest = loans.reduce((sum, loan) => 
    sum + calculateTotalInterest(loan.amount, loan.interestRate, loan.term), 0
  );
  
  const activeLoanCount = loans.filter(loan => loan.status === 'Active').length;
  const completedLoanCount = loans.filter(loan => loan.status === 'Completed').length;
  const defaultedLoanCount = loans.filter(loan => loan.status === 'Defaulted').length;
  
  const portfolioRisk = defaultedLoanCount / loans.length;
  const completionRate = completedLoanCount / loans.length;
  
  return {
    totalDisbursed,
    totalProjectedInterest,
    activeLoanCount,
    completedLoanCount,
    defaultedLoanCount,
    portfolioRisk: portfolioRisk * 100,
    completionRate: completionRate * 100,
    averageLoanAmount: totalDisbursed / loans.length,
    totalPortfolioValue: totalDisbursed + totalProjectedInterest
  };
};