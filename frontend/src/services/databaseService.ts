import axios from 'axios';

const API_BASE_URL = 'http://localhost:3002/api'; // Backend server URL

export interface BorrowerData {
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
  // Computed fields for loan information
  totalLoans?: number;
  activeLoans?: number;
  totalBorrowed?: number;
  outstandingBalance?: number;
  creditScore?: number;
}

export interface LoanData {
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
  purpose?: string;
  disbursedAt?: string;
  outstandingBalance: number;
  nextPaymentDate?: string;
  borrower?: BorrowerData;
}

export interface RepaymentData {
  id: string;
  receiptNumber: string;
  loanId: string;
  borrowerId: string;
  amount: number;
  principalAmount?: number;
  interestAmount?: number;
  paymentMethod: string;
  status: string;
  paidAt: string;
  loan?: LoanData;
  borrower?: BorrowerData;
  // Enhanced fields from backend API
  customerName?: string;
  loanReference?: string;
  customerPhone?: string;
  loanStatus?: string;
  remainingBalance?: number;
}

export interface SavingsData {
  id: string;
  savingsId: string;
  borrowerId: string;
  balance: number;
  interestRate: number;
  status: string;
  borrower?: BorrowerData;
}

export interface SaverData {
  id: string;
  accountId: string;
  customerName: string;
  email?: string;
  phone: string;
  dateOfBirth?: string;
  nationalId?: string;
  district?: string;
  subcounty?: string;
  village?: string;
  occupation?: string;
  monthlyIncome?: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepositData {
  id: string;
  depositId: string;
  accountId: string;
  depositDate: string;
  amount: number;
  method: string;
  createdAt: string;
  updatedAt: string;
}

export interface WithdrawalData {
  id: string;
  withdrawalId: string;
  accountId: string;
  withdrawalDate: string;
  amount: number;
  method: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseData {
  id: string;
  expenseId: string;
  description: string;
  amount: number;
  category: string;
  expenseDate: string;
}

export interface ApplicationData {
  id: string;
  applicationId: string;
  borrowerId: string;
  requestedAmount: number;
  purpose: string;
  termMonths: number;
  status: string;
  submittedAt: string;
  reviewedAt?: string;
  borrower?: BorrowerData;
}

export interface DashboardStats {
  totalBorrowers: number;
  totalLoans: number;
  totalPortfolioValue: number;
  totalCollections: number;
  activeLoans: number;
  overdueLoans: number;
  defaultRate: number;
  collectionRate: number;
  avgLoanSize: number;
  monthlyGrowth: number;
}

class DatabaseService {
  private apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  constructor() {
    // Add request interceptor for authentication if needed
    this.apiClient.interceptors.request.use(
      (config) => {
        // Add auth token if available
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('API Error:', error);
        if (error.response?.status === 401) {
          // Handle authentication errors
          localStorage.removeItem('authToken');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Borrowers
  async getBorrowers(): Promise<BorrowerData[]> {
    try {
      // Use the new endpoint that includes loan statistics
      const response = await this.apiClient.get('/borrowers-with-loans');
      let borrowers = response.data.data || response.data;
      
      // Add credit score calculation
      borrowers = borrowers.map((borrower: any) => ({
        ...borrower,
        creditScore: this.calculateCreditScore(borrower.creditRating),
        // Map the new field names to match our interface
        totalLoans: borrower.loanCount || 0,
        activeLoans: borrower.activeLoanCount || 0,
        outstandingBalance: borrower.totalOutstanding || 0
      }));
      
      return borrowers;
    } catch (error) {
      console.warn('New endpoint failed, falling back to basic borrowers endpoint:', error);
      
      // Fallback to original endpoint
      const response = await this.apiClient.get('/borrowers');
      let borrowers = response.data.data || response.data;
      
      // Get loan data to enrich borrower information
      try {
        const loansResponse = await this.apiClient.get('/loans');
        const loans = loansResponse.data.data || loansResponse.data;
        
        // Calculate loan statistics for each borrower
        borrowers = borrowers.map((borrower: BorrowerData) => {
          const borrowerLoans = loans.filter((loan: LoanData) => loan.borrowerId === borrower.id);
          
          return {
            ...borrower,
            totalLoans: borrowerLoans.length,
            activeLoans: borrowerLoans.filter((loan: LoanData) => 
              loan.status === 'ACTIVE' || loan.status === 'DISBURSED'
            ).length,
            totalBorrowed: borrowerLoans.reduce((sum: number, loan: LoanData) => 
              sum + (loan.principal || 0), 0
            ),
            outstandingBalance: borrowerLoans.reduce((sum: number, loan: LoanData) => 
              sum + (loan.outstandingBalance || 0), 0
            ),
            creditScore: this.calculateCreditScore(borrower.creditRating)
          };
        });
      } catch (error) {
        console.warn('Could not fetch loan data for borrowers:', error);
        // Add default values if loan data cannot be fetched
        borrowers = borrowers.map((borrower: BorrowerData) => ({
          ...borrower,
          totalLoans: 0,
          activeLoans: 0,
          totalBorrowed: 0,
          outstandingBalance: 0,
          creditScore: this.calculateCreditScore(borrower.creditRating)
        }));
      }
      
      return borrowers;
    }
  }

  private calculateCreditScore(creditRating: string): number {
    // Convert credit rating to numeric score (300-850 scale)
    const ratingScores: { [key: string]: number } = {
      'Excellent': 800,
      'Very Good': 750,
      'Good': 700,
      'Fair': 650,
      'Poor': 600,
      'Very Poor': 550,
      'NO_CREDIT': 500
    };
    
    return ratingScores[creditRating] || 500;
  }

  async getBorrower(id: string): Promise<BorrowerData> {
    const response = await this.apiClient.get(`/borrowers/${id}`);
    return response.data.data || response.data;
  }

  async createBorrower(data: Partial<BorrowerData>): Promise<BorrowerData> {
    const response = await this.apiClient.post('/borrowers', data);
    return response.data.data || response.data;
  }

  async updateBorrower(id: string, data: Partial<BorrowerData>): Promise<BorrowerData> {
    const response = await this.apiClient.put(`/borrowers/${id}`, data);
    return response.data.data || response.data;
  }

  async deleteBorrower(id: string): Promise<void> {
    await this.apiClient.delete(`/borrowers/${id}`);
  }

  // Loans
  async getLoans(): Promise<LoanData[]> {
    const response = await this.apiClient.get('/loans');
    return response.data.data || response.data;
  }

  async getLoan(id: string): Promise<LoanData> {
    const response = await this.apiClient.get(`/loans/${id}`);
    return response.data.data || response.data;
  }

  async createLoan(data: Partial<LoanData>): Promise<LoanData> {
    const response = await this.apiClient.post('/loans', data);
    return response.data.data || response.data;
  }

  async updateLoan(id: string, data: Partial<LoanData>): Promise<LoanData> {
    const response = await this.apiClient.put(`/loans/${id}`, data);
    return response.data.data || response.data;
  }

  async deleteLoan(id: string): Promise<void> {
    await this.apiClient.delete(`/loans/${id}`);
  }

  // Repayments
  async getRepayments(): Promise<RepaymentData[]> {
    const response = await this.apiClient.get('/repayments');
    return response.data.data || response.data;
  }

  async getRepayment(id: string): Promise<RepaymentData> {
    const response = await this.apiClient.get(`/repayments/${id}`);
    return response.data.data || response.data;
  }

  async createRepayment(data: Partial<RepaymentData>): Promise<RepaymentData> {
    const response = await this.apiClient.post('/repayments', data);
    return response.data.data || response.data;
  }

  async updateRepayment(id: string, data: Partial<RepaymentData>): Promise<RepaymentData> {
    const response = await this.apiClient.put(`/repayments/${id}`, data);
    return response.data.data || response.data;
  }

  async deleteRepayment(id: string): Promise<void> {
    await this.apiClient.delete(`/repayments/${id}`);
  }

  // Process manual payment (uses new payment processing endpoint)
  async processPayment(paymentData: {
    loanId: string;
    borrowerId: string;
    amount: number;
    paymentMethod: string;
    paidAt: string;
  }): Promise<{
    success: boolean;
    receiptNumber: string;
    updatedLoan: LoanData;
    repayment: RepaymentData;
  }> {
    const response = await this.apiClient.post('/payments', paymentData);
    return response.data;
  }

  async getPayments(): Promise<RepaymentData[]> {
    const response = await this.apiClient.get('/payments');
    return response.data;
  }

  // Savings
  async getSavings(): Promise<SavingsData[]> {
    const response = await this.apiClient.get('/savings');
    return response.data.data || response.data;
  }

  async createSavings(data: Partial<SavingsData>): Promise<SavingsData> {
    const response = await this.apiClient.post('/savings', data);
    return response.data.data || response.data;
  }

  // Savers
  async getSavers(): Promise<SaverData[]> {
    const response = await this.apiClient.get('/savers');
    return response.data.data || response.data;
  }

  async getSaver(id: string): Promise<SaverData> {
    const response = await this.apiClient.get(`/savers/${id}`);
    return response.data.data || response.data;
  }

  async createSaver(data: Partial<SaverData>): Promise<SaverData> {
    const response = await this.apiClient.post('/savers', data);
    return response.data.data || response.data;
  }

  // Deposits
  async getDeposits(): Promise<DepositData[]> {
    const response = await this.apiClient.get('/deposits');
    return response.data.data || response.data;
  }

  async getDepositsByAccount(accountId: string): Promise<DepositData[]> {
    const response = await this.apiClient.get(`/deposits/account/${accountId}`);
    return response.data.data || response.data;
  }

  async createDeposit(data: Partial<DepositData>): Promise<DepositData> {
    const response = await this.apiClient.post('/deposits', data);
    return response.data.data || response.data;
  }

  // Withdrawals
  async getWithdrawals(): Promise<WithdrawalData[]> {
    const response = await this.apiClient.get('/withdrawals');
    return response.data.data || response.data;
  }

  async getWithdrawalsByAccount(accountId: string): Promise<WithdrawalData[]> {
    const response = await this.apiClient.get(`/withdrawals/account/${accountId}`);
    return response.data.data || response.data;
  }

  async createWithdrawal(data: Partial<WithdrawalData>): Promise<WithdrawalData> {
    const response = await this.apiClient.post('/withdrawals', data);
    return response.data.data || response.data;
  }

  // Expenses
  async getExpenses(): Promise<ExpenseData[]> {
    const response = await this.apiClient.get('/expenses');
    return response.data.data || response.data;
  }

  async createExpense(data: Partial<ExpenseData>): Promise<ExpenseData> {
    const response = await this.apiClient.post('/expenses', data);
    return response.data.data || response.data;
  }

  // Applications
  async getApplications(): Promise<ApplicationData[]> {
    const response = await this.apiClient.get('/applications');
    return response.data.data || response.data;
  }

  async createApplication(data: Partial<ApplicationData>): Promise<ApplicationData> {
    const response = await this.apiClient.post('/applications', data);
    return response.data.data || response.data;
  }

  async updateApplication(id: string, data: Partial<ApplicationData>): Promise<ApplicationData> {
    const response = await this.apiClient.put(`/applications/${id}`, data);
    return response.data.data || response.data;
  }

  // Dashboard Stats
  async getDashboardStats(): Promise<DashboardStats> {
    const response = await this.apiClient.get('/dashboard/stats');
    return response.data.data || response.data;
  }

  // Reports
  async getReportData(reportType: string, dateRange?: string) {
    const params = dateRange ? { dateRange } : {};
    const response = await this.apiClient.get(`/reports/${reportType}`, { params });
    return response.data;
  }

  // Migration Status
  async getMigrationStatus() {
    const response = await this.apiClient.get('/migration/status');
    return response.data;
  }

  async runMigration() {
    const response = await this.apiClient.post('/migration/run');
    return response.data;
  }

  // Health Check
  async healthCheck() {
    try {
      const response = await this.apiClient.get('/health');
      return response.data;
    } catch (error) {
      return { status: 'error', message: 'Backend not available' };
    }
  }
}

// Create singleton instance
export const databaseService = new DatabaseService();

// Export service class for testing
export default DatabaseService;