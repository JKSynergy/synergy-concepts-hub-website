// API Types for the client portal
export interface Borrower {
  id: string;
  borrowerId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  gender?: string;
  dateOfBirth?: string;
  nationalId?: string;
  district?: string;
  subcounty?: string;
  village?: string;
  occupation?: string;
  monthlyIncome?: number;
  creditRating: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Loan {
  id: string;
  loanId: string;
  borrowerId: string;
  principal: number;
  interestRate: number;
  termMonths: number;
  totalInterest: number;
  totalAmount: number;
  monthlyPayment: number;
  status: string;
  disbursedAt?: string;
  nextPaymentDate?: string;
  balanceRemaining: number;
  createdAt: string;
  updatedAt: string;
}

export interface LoanApplication {
  id: string;
  applicationId: string;
  borrowerId: string;
  requestedAmount: number;
  purpose: string;
  termMonths: number;
  status: string;
  submittedAt: string;
  reviewedAt?: string;
  approvedAmount?: number;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Repayment {
  id: string;
  loanId: string;
  amount: number;
  paymentMethod: string;
  transactionRef?: string;
  status: string;
  paidAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Savings {
  id: string;
  borrowerId: string;
  accountNumber: string;
  balance: number;
  interestRate: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavingsTransaction {
  id: string;
  savingsId: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  description?: string;
  transactionRef?: string;
  status: string;
  createdAt: string;
}

// Auth Types
export interface LoginCredentials {
  phone: string;
  password: string;
}

export interface RegisterData {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  password: string;
  confirmPassword: string;
  nationalId?: string;
  dateOfBirth?: string;
  gender?: string;
  district?: string;
  subcounty?: string;
  village?: string;
  occupation?: string;
  monthlyIncome?: number;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: Borrower;
  message?: string;
}

// Dashboard Types
export interface DashboardStats {
  totalLoans: number;
  activeLoans: number;
  totalBorrowed: number;
  totalPaid: number;
  totalBalance: number;
  nextPaymentAmount: number;
  nextPaymentDate?: string;
  savingsBalance: number;
  creditScore: number;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Payment Types
export interface PaymentRequest {
  loanId: string;
  amount: number;
  paymentMethod: 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH';
  phoneNumber?: string;
  reference?: string;
}

export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  message: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
}