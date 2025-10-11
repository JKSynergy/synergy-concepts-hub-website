import api from './api';

export interface SavingsAccount {
  id: string;
  savingsId: string;
  borrowerId: string;
  balance: number;
  interestRate: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  borrower?: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface SavingsTransaction {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  balance: number;
  description: string;
  transactionDate: string;
  status: string;
}

export interface DepositRequest {
  amount: number;
  description?: string;
  paymentMethod: string;
}

export interface WithdrawalRequest {
  amount: number;
  description?: string;
}

export const savingsApi = {
  // Get savings account
  getAccount: async () => {
    const response = await api.get('/client/savings/account');
    return response.data;
  },

  // Get savings transactions
  getTransactions: async (page: number = 1, limit: number = 10) => {
    const response = await api.get('/client/savings/transactions', {
      params: { page, limit }
    });
    return response.data;
  },

  // Make deposit
  makeDeposit: async (data: DepositRequest) => {
    const response = await api.post('/client/savings/deposit', data);
    return response.data;
  },

  // Request withdrawal
  requestWithdrawal: async (data: WithdrawalRequest) => {
    const response = await api.post('/client/savings/withdrawal', data);
    return response.data;
  }
};
