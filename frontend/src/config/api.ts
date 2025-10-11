// API Configuration
const API_BASE_URL = 'http://localhost:3002/api';

export const API_ENDPOINTS = {
  // Authentication
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  REFRESH: '/auth/refresh',
  PROFILE: '/auth/profile',
  
  // Borrowers
  BORROWERS: '/borrowers',
  BORROWER_BY_ID: (id: string) => `/borrowers/${id}`,
  
  // Loans
  LOANS: '/loans',
  LOAN_BY_ID: (id: string) => `/loans/${id}`,
  APPROVE_LOAN: (id: string) => `/loans/${id}/approve`,
  DISBURSE_LOAN: (id: string) => `/loans/${id}/disburse`,
  
  // Applications
  APPLICATIONS: '/applications',
  APPLICATION_BY_ID: (id: string) => `/applications/${id}`,
  APPLICATION_STATS: '/applications/stats',
  APPROVE_APPLICATION: (id: string) => `/applications/${id}/approve`,
  REJECT_APPLICATION: (id: string) => `/applications/${id}/reject`,
  
  // Repayments
  REPAYMENTS: '/repayments',
  REPAYMENT_BY_ID: (id: string) => `/repayments/${id}`,
  RECORD_REPAYMENT: '/repayments',
  
  // Savings
  SAVINGS: '/savings',
  DEPOSITS: '/savings/deposits',
  WITHDRAWALS: '/savings/withdrawals',
  
  // Reports
  DASHBOARD_STATS: '/dashboard/stats',
  PORTFOLIO_REPORT: '/reports/portfolio',
  COLLECTIONS_REPORT: '/reports/collections',
  
  // Expenses
  EXPENSES: '/expenses',
  
  // Notifications
  NOTIFICATIONS: '/notifications',
  MARK_READ: (id: string) => `/notifications/${id}/read`,
};

export { API_BASE_URL };