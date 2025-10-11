import axios from 'axios';
import {
  AuthResponse,
  LoginCredentials,
  RegisterData,
  Borrower,
  Loan,
  LoanApplication,
  Repayment,
  Savings,
  SavingsTransaction,
  DashboardStats,
  PaymentRequest,
  PaymentResponse,
  ApiResponse,
  PaginatedResponse,
} from '../types';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('client_auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('client_auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await api.post('/client/auth/login', credentials);
    return response.data;
  },

  register: async (data: RegisterData): Promise<AuthResponse> => {
    const response = await api.post('/client/auth/register', data);
    return response.data;
  },

  verifyToken: async (): Promise<AuthResponse> => {
    const response = await api.get('/client/auth/verify');
    return response.data;
  },

  resetPassword: async (phone: string): Promise<ApiResponse<null>> => {
    const response = await api.post('/client/auth/reset-password', { phone });
    return response.data;
  },

  updateProfile: async (data: Partial<Borrower>): Promise<ApiResponse<Borrower>> => {
    const response = await api.put('/client/profile', data);
    return response.data;
  },
};

// Dashboard API
export const dashboardApi = {
  getStats: async (): Promise<ApiResponse<DashboardStats>> => {
    const response = await api.get('/client/dashboard/stats');
    return response.data;
  },

  getRecentActivity: async (): Promise<ApiResponse<any[]>> => {
    const response = await api.get('/client/dashboard/activity');
    return response.data;
  },
};

// Loans API
export const loansApi = {
  getLoans: async (page = 1, limit = 10): Promise<PaginatedResponse<Loan>> => {
    const response = await api.get(`/client/loans?page=${page}&limit=${limit}`);
    return response.data;
  },

  getLoan: async (loanId: string): Promise<ApiResponse<Loan>> => {
    const response = await api.get(`/client/loans/${loanId}`);
    return response.data;
  },

  getLoanRepayments: async (loanId: string): Promise<ApiResponse<Repayment[]>> => {
    const response = await api.get(`/client/loans/${loanId}/repayments`);
    return response.data;
  },
};

// Applications API
export const applicationsApi = {
  getApplications: async (page = 1, limit = 10): Promise<PaginatedResponse<LoanApplication>> => {
    const response = await api.get(`/client/applications?page=${page}&limit=${limit}`);
    return response.data;
  },

  getApplication: async (applicationId: string): Promise<ApiResponse<LoanApplication>> => {
    const response = await api.get(`/client/applications/${applicationId}`);
    return response.data;
  },

  createApplication: async (data: {
    requestedAmount: number;
    purpose: string;
    termMonths: number;
  }): Promise<ApiResponse<LoanApplication>> => {
    const response = await api.post('/client/applications', data);
    return response.data;
  },

  cancelApplication: async (applicationId: string): Promise<ApiResponse<null>> => {
    const response = await api.delete(`/client/applications/${applicationId}`);
    return response.data;
  },
};

// Payments API
export const paymentsApi = {
  makePayment: async (data: PaymentRequest): Promise<PaymentResponse> => {
    const response = await api.post('/client/payments', data);
    return response.data;
  },

  getPaymentHistory: async (page = 1, limit = 10): Promise<PaginatedResponse<Repayment>> => {
    const response = await api.get(`/client/payments/history?page=${page}&limit=${limit}`);
    return response.data;
  },

  getPaymentStatus: async (transactionId: string): Promise<ApiResponse<Repayment>> => {
    const response = await api.get(`/client/payments/status/${transactionId}`);
    return response.data;
  },
};

// Savings API
export const savingsApi = {
  getSavingsAccounts: async (): Promise<ApiResponse<Savings[]>> => {
    const response = await api.get('/client/savings');
    return response.data;
  },

  getSavingsAccount: async (accountId: string): Promise<ApiResponse<Savings>> => {
    const response = await api.get(`/client/savings/${accountId}`);
    return response.data;
  },

  getSavingsTransactions: async (
    accountId: string,
    page = 1,
    limit = 10
  ): Promise<PaginatedResponse<SavingsTransaction>> => {
    const response = await api.get(`/client/savings/${accountId}/transactions?page=${page}&limit=${limit}`);
    return response.data;
  },

  deposit: async (accountId: string, amount: number, reference?: string): Promise<ApiResponse<SavingsTransaction>> => {
    const response = await api.post(`/client/savings/${accountId}/deposit`, {
      amount,
      reference,
    });
    return response.data;
  },

  withdraw: async (accountId: string, amount: number, reference?: string): Promise<ApiResponse<SavingsTransaction>> => {
    const response = await api.post(`/client/savings/${accountId}/withdraw`, {
      amount,
      reference,
    });
    return response.data;
  },
};

// Notifications API
export const notificationsApi = {
  getNotifications: async (page = 1, limit = 10): Promise<PaginatedResponse<any>> => {
    const response = await api.get(`/client/notifications?page=${page}&limit=${limit}`);
    return response.data;
  },

  markAsRead: async (notificationId: string): Promise<ApiResponse<null>> => {
    const response = await api.put(`/client/notifications/${notificationId}/read`);
    return response.data;
  },

  markAllAsRead: async (): Promise<ApiResponse<null>> => {
    const response = await api.put('/client/notifications/read-all');
    return response.data;
  },
};

export default api;