import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CreditCard, 
  TrendingUp, 
  AlertTriangle,
  DollarSign,
  Calendar,
  ArrowUp,
  ArrowDown,
  FileText
} from 'lucide-react';
import { databaseService } from '../services/databaseService';
import toast from 'react-hot-toast';

// Import all modals
import ManualPaymentModal from '../components/modals/ManualPaymentModal';
import ApprovePendingLoansModal from '../components/modals/ApprovePendingLoansModal';
import RefreshDashboardModal from '../components/modals/RefreshDashboardModal';
import PaymentDetailsModal from '../components/modals/PaymentDetailsModal';
import RefreshOverduesModal from '../components/modals/RefreshOverduesModal';
import UpdateCreditScoresModal from '../components/modals/UpdateCreditScoresModal';
import NewApplicationModal from '../components/modals/NewApplicationModal';

interface DashboardStat {
  title: string;
  value: string;
  change: string;
  changeType: 'increase' | 'decrease';
  icon: string;
  color: string;
}

interface RecentApplication {
  id: string;
  applicantName: string;
  amount: number;
  date: string;
  status: 'pending' | 'approved' | 'rejected' | 'under_review';
}

interface OverdueLoan {
  id: string;
  borrowerName: string;
  amount: number;
  daysOverdue: number;
  status: string;
}

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'increase' | 'decrease';
  icon: React.ReactNode;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  change, 
  changeType, 
  icon, 
  color 
}) => (
  <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6 transition-colors duration-200">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{value}</p>
        {change && (
          <div className="flex items-center mt-2">
            {changeType === 'increase' ? (
              <ArrowUp className="h-4 w-4 text-green-500 mr-1" />
            ) : (
              <ArrowDown className="h-4 w-4 text-red-500 mr-1" />
            )}
            <span className={`text-sm ${
              changeType === 'increase' ? 'text-green-600' : 'text-red-600'
            }`}>
              {change}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">vs last month</span>
          </div>
        )}
      </div>
      <div className={`p-3 rounded-full ${color}`}>
        {icon}
      </div>
    </div>
  </div>
);

// Helper function to get icon component by name
const getIconComponent = (iconName: string) => {
  const iconProps = { className: "w-6 h-6" };
  
  switch (iconName) {
    case 'Users':
      return <Users {...iconProps} />;
    case 'CreditCard':
      return <CreditCard {...iconProps} />;
    case 'DollarSign':
      return <DollarSign {...iconProps} />;
    case 'TrendingUp':
      return <TrendingUp {...iconProps} />;
    case 'AlertTriangle':
      return <AlertTriangle {...iconProps} />;
    case 'Calendar':
      return <Calendar {...iconProps} />;
    default:
      return <DollarSign {...iconProps} />;
  }
};

const Dashboard: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [recentApplications, setRecentApplications] = useState<RecentApplication[]>([]);
  const [overdueLoans, setOverdueLoans] = useState<OverdueLoan[]>([]);
  const [financialMetrics, setFinancialMetrics] = useState({
    totalRepayments: 0,
    totalOutstanding: 0,
    totalInterest: 0,
    monthlyReceipts: 0,
    realizedRepayments: 0,
    projectedProfit: 0,
    realizedProfit: 0,
    totalSavings: 0,
    totalApplications: 0,
    approvalRate: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    monthlyDeposits: 0,
    monthlyWithdrawals: 0
  });

  // Modal states
  const [modals, setModals] = useState({
    manualPayment: false,
    approvePendingLoans: false,
    refreshDashboard: false,
    paymentDetails: false,
    refreshOverdues: false,
    updateCreditScores: false,
    newApplication: false
  });

  const openModal = (modalName: keyof typeof modals) => {
    setModals(prev => ({ ...prev, [modalName]: true }));
  };

  const closeModal = (modalName: keyof typeof modals) => {
    setModals(prev => ({ ...prev, [modalName]: false }));
  };

  const closeModalAndRefresh = (modalName: keyof typeof modals) => {
    setModals(prev => ({ ...prev, [modalName]: false }));
    // Small delay to ensure modal is closed before refresh
    setTimeout(() => {
      refreshDashboard();
    }, 500);
  };

  // Manual refresh function for dynamic updates
  const refreshDashboard = async () => {
    console.log('🔄 Manually refreshing dashboard data...');
    await loadDashboardData();
  };

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      console.log('🔄 Loading dashboard data from database...');
      
      // Load all data from database API including deposits and withdrawals
      const [loans, repayments, borrowers, applications, savings, deposits, withdrawals] = await Promise.all([
        databaseService.getLoans(),
        databaseService.getRepayments(),
        databaseService.getBorrowers(),
        databaseService.getApplications(),
        databaseService.getSavings(),
        databaseService.getDeposits(),
        databaseService.getWithdrawals()
      ]);

        console.log('📊 Loaded data:', { 
          loans: loans.length, 
          repayments: repayments.length, 
          borrowers: borrowers.length,
          applications: applications.length,
          savings: savings.length,
          deposits: deposits.length,
          withdrawals: withdrawals.length
        });

        // Helper function to calculate actual loan status (same as overdue page)
        const calculateActualStatus = (loan: any) => {
          const outstandingBalance = loan.outstandingBalance || 0;
          const dueDate = loan.nextPaymentDate ? new Date(loan.nextPaymentDate) : null;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          if (outstandingBalance <= 0) {
            return 'Closed';
          }
          
          if (dueDate && dueDate < today) {
            return 'OVERDUE';
          }
          
          return loan.status;
        };

        // Ensure all data arrays are properly initialized
        const borrowersArray = Array.isArray(borrowers) ? borrowers : [];
        const loansArray = Array.isArray(loans) ? loans : [];
        const applicationsArray = Array.isArray(applications) ? applications : [];
        const savingsArray = Array.isArray(savings) ? savings : [];

        // Calculate dashboard statistics
        const totalBorrowers = borrowersArray.length;
        const activeLoans = loansArray.filter(loan => {
          const actualStatus = calculateActualStatus(loan);
          return actualStatus === 'ACTIVE' || actualStatus === 'PENDING';
        }).length;
        const overdueLoans = loansArray.filter(loan => calculateActualStatus(loan) === 'OVERDUE').length;
        const closedLoans = loansArray.filter(loan => calculateActualStatus(loan) === 'Closed').length;
        const pendingApplications = applicationsArray.filter(app => app.status === 'PENDING' || app.status === 'UNDER_REVIEW').length;
        const totalApplications = applicationsArray.length;
        // Count actual approved/disbursed loans using dynamic status
        const approvedLoans = loansArray.filter(loan => {
          const actualStatus = calculateActualStatus(loan);
          return actualStatus === 'ACTIVE' || 
                 actualStatus === 'PENDING' || 
                 actualStatus === 'Closed' ||
                 actualStatus === 'OVERDUE';
        }).length;
        const approvalRate = totalApplications > 0 ? (approvedLoans / totalApplications) * 100 : 0;
        
        // Calculate deposits and withdrawals
        const depositsArray = Array.isArray(deposits) ? deposits : [];
        const withdrawalsArray = Array.isArray(withdrawals) ? withdrawals : [];
        
        // Calculate total deposits and withdrawals
        const totalDeposits = depositsArray.reduce((sum, deposit) => sum + (deposit.amount || 0), 0);
        const totalWithdrawals = withdrawalsArray.reduce((sum, withdrawal) => sum + (withdrawal.amount || 0), 0);
        
        // Calculate net savings (deposits - withdrawals)
        const netSavings = totalDeposits - totalWithdrawals;
        
        // Calculate savings balance from database (should match net savings ideally)
        const totalSavingsBalance = savingsArray.reduce((sum, saving) => sum + (saving.balance || 0), 0);
        
        // Use the actual calculated net savings for accuracy
        const totalSavings = netSavings;
        
        // Calculate this month's deposits and withdrawals
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        const thisMonthDeposits = depositsArray.filter(deposit => {
          const depositDate = new Date(deposit.depositDate);
          return depositDate.getMonth() === currentMonth && depositDate.getFullYear() === currentYear;
        });
        const monthlyDepositAmount = thisMonthDeposits.reduce((sum, deposit) => sum + (deposit.amount || 0), 0);
        
        const thisMonthWithdrawals = withdrawalsArray.filter(withdrawal => {
          const withdrawalDate = new Date(withdrawal.withdrawalDate);
          return withdrawalDate.getMonth() === currentMonth && withdrawalDate.getFullYear() === currentYear;
        });
        const monthlyWithdrawalAmount = thisMonthWithdrawals.reduce((sum, withdrawal) => sum + (withdrawal.amount || 0), 0);
        
        console.log('💰 Savings calculations:', {
          totalDeposits,
          totalWithdrawals,
          netSavings,
          totalSavingsBalance,
          monthlyDeposits: monthlyDepositAmount,
          monthlyWithdrawals: monthlyWithdrawalAmount
        });
        
        // Calculate total disbursed (sum of all loan principals)
        const totalDisbursed = loansArray.reduce((sum, loan) => sum + (loan.principal || 0), 0);
        
        // Calculate total repayments (ensure repayments is an array)
        const repaymentsArray = Array.isArray(repayments) ? repayments : [];
        const totalRepayments = repaymentsArray.reduce((sum, payment) => sum + (payment.amount || 0), 0);
        
        // Calculate collection rate (total repayments / total disbursed * 100)
        const collectionRate = totalDisbursed > 0 ? (totalRepayments / totalDisbursed) * 100 : 0;
        
        // Calculate this month's revenue (repayments from current month)
        const thisMonthRepayments = repaymentsArray.filter(payment => {
          const paymentDate = new Date(payment.paidAt);
          return paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear;
        });
        const monthlyRevenue = thisMonthRepayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);

        // Calculate dynamic changes (comparing to last month for meaningful metrics)
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        
        const lastMonthRepayments = repaymentsArray.filter(payment => {
          const paymentDate = new Date(payment.paidAt);
          return paymentDate.getMonth() === lastMonth && paymentDate.getFullYear() === lastMonthYear;
        });
        const lastMonthRevenue = lastMonthRepayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
        
        const revenueChange = lastMonthRevenue > 0 ? 
          ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue * 100) : 0;
        
        // Calculate savings growth (last month vs this month)
        const lastMonthDeposits = depositsArray.filter(deposit => {
          const depositDate = new Date(deposit.depositDate);
          return depositDate.getMonth() === lastMonth && depositDate.getFullYear() === lastMonthYear;
        });
        const lastMonthDepositAmount = lastMonthDeposits.reduce((sum, deposit) => sum + (deposit.amount || 0), 0);
        
        const savingsGrowth = lastMonthDepositAmount > 0 ? 
          ((monthlyDepositAmount - lastMonthDepositAmount) / lastMonthDepositAmount * 100) : 0;
        
        // Calculate overdue trend (percentage of total active loans)
        const overdueRate = activeLoans > 0 ? (overdueLoans / activeLoans * 100) : 0;
        const overdueChange = overdueRate < 10 ? 'decrease' : 'increase';
        const overdueChangePercent = Math.abs(overdueRate - 12); // Assuming 12% baseline

        // Transform stats for display
        const transformedStats = [
          {
            title: 'Total Borrowers',
            value: totalBorrowers.toLocaleString(),
            change: `${totalBorrowers > 50 ? '+' : ''}${Math.round((totalBorrowers - 45) / 45 * 100)}%`,
            changeType: totalBorrowers > 50 ? 'increase' as const : 'decrease' as const,
            icon: 'Users',
            color: 'bg-primary-100'
          },
          {
            title: 'Active Loans',
            value: activeLoans.toLocaleString(),
            change: `${activeLoans > closedLoans ? '+' : ''}${Math.round((activeLoans - closedLoans) / Math.max(closedLoans, 1) * 100)}%`,
            changeType: activeLoans > closedLoans ? 'increase' as const : 'decrease' as const,
            icon: 'CreditCard',
            color: 'bg-green-100'
          },
          {
            title: 'Total Disbursed',
            value: `UGX ${(totalDisbursed / 1000000).toFixed(1)}M`,
            change: `${approvalRate > 70 ? '+' : ''}${approvalRate.toFixed(0)}%`,
            changeType: approvalRate > 70 ? 'increase' as const : 'decrease' as const,
            icon: 'DollarSign',
            color: 'bg-purple-100'
          },
          {
            title: 'Total Savings',
            value: `UGX ${(totalSavings / 1000000).toFixed(2)}M`,
            change: `${savingsGrowth >= 0 ? '+' : ''}${savingsGrowth.toFixed(1)}%`,
            changeType: savingsGrowth >= 0 ? 'increase' as const : 'decrease' as const,
            icon: 'DollarSign',
            color: 'bg-blue-100'
          },
          {
            title: 'Collection Rate',
            value: `${collectionRate.toFixed(1)}%`,
            change: `${collectionRate > 80 ? '+' : ''}${(collectionRate - 75).toFixed(1)}%`,
            changeType: collectionRate > 80 ? 'increase' as const : 'decrease' as const,
            icon: 'TrendingUp',
            color: 'bg-indigo-100'
          },
          {
            title: 'Overdue Loans',
            value: overdueLoans.toLocaleString(),
            change: `${overdueChange === 'decrease' ? '-' : '+'}${overdueChangePercent.toFixed(1)}%`,
            changeType: overdueChange as 'increase' | 'decrease',
            icon: 'AlertTriangle',
            color: 'bg-orange-100'
          },
          {
            title: 'Monthly Deposits',
            value: `UGX ${(monthlyDepositAmount / 1000000).toFixed(2)}M`,
            change: `${thisMonthDeposits.length} deposits`,
            changeType: thisMonthDeposits.length > 0 ? 'increase' as const : 'decrease' as const,
            icon: 'TrendingUp',
            color: 'bg-green-100'
          },
          {
            title: 'Monthly Withdrawals',
            value: `UGX ${(monthlyWithdrawalAmount / 1000000).toFixed(2)}M`,
            change: `${thisMonthWithdrawals.length} withdrawals`,
            changeType: 'decrease' as const,
            icon: 'ArrowDown',
            color: 'bg-red-100'
          },
          {
            title: 'This Month Revenue',
            value: `UGX ${(monthlyRevenue / 1000000).toFixed(1)}M`,
            change: `${revenueChange >= 0 ? '+' : ''}${revenueChange.toFixed(1)}%`,
            changeType: revenueChange >= 0 ? 'increase' as const : 'decrease' as const,
            icon: 'Calendar',
            color: 'bg-emerald-100'
          }
        ];

        // Get recent applications (last 5, sorted by date)
        const recentApplications = applications
          .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
          .slice(0, 5)
          .map(app => ({
            id: app.id,
            applicantName: app.borrower ? `${app.borrower.firstName} ${app.borrower.lastName}` : 'Unknown',
            amount: app.requestedAmount,
            date: app.submittedAt,
            status: app.status.toLowerCase() as 'pending' | 'approved' | 'rejected' | 'under_review'
          }));

        // Get overdue loans (last 10, sorted by days overdue)
        const overdueLoansData = loans
          .filter(loan => calculateActualStatus(loan) === 'OVERDUE')
          .slice(0, 10)
          .map(loan => {
            const daysOverdue = loan.nextPaymentDate ? 
              Math.floor((new Date().getTime() - new Date(loan.nextPaymentDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
            return {
              id: loan.id,
              borrowerName: loan.borrower ? `${loan.borrower.firstName} ${loan.borrower.lastName}` : 'Unknown',
              amount: loan.outstandingBalance || loan.principal || 0,
              dueDate: loan.nextPaymentDate ? new Date(loan.nextPaymentDate).toLocaleDateString() : 'Unknown',
              daysOverdue: Math.max(0, daysOverdue),
              status: calculateActualStatus(loan)
            };
          });

        setStats(transformedStats);
        setRecentApplications(recentApplications);
        setOverdueLoans(overdueLoansData);

        // Calculate financial metrics dynamically
        const totalOutstanding = loans.reduce((sum, loan) => sum + (loan.outstandingBalance || 0), 0);
        
        // Calculate total interest from all loans (total potential profit)
        const totalPotentialInterest = loans.reduce((sum, loan) => sum + (loan.totalInterest || 0), 0);
        
        // Calculate realized profit (total interest from closed loans)
        // This represents actual profit fully earned from completed loans
        const realizedProfit = loans
          .filter(loan => calculateActualStatus(loan) === 'Closed')
          .reduce((sum, loan) => sum + (loan.totalInterest || 0), 0);
        
        // Projected profit is the total potential interest from all loans
        const projectedProfit = totalPotentialInterest;

        setFinancialMetrics({
          totalRepayments,
          totalOutstanding,
          totalInterest: totalPotentialInterest, // Total potential interest (same as projected profit)
          monthlyReceipts: monthlyRevenue,
          realizedRepayments: totalRepayments,
          projectedProfit: projectedProfit, // Total potential interest (same as interest amount)
          realizedProfit,
          totalSavings,
          totalApplications,
          approvalRate,
          totalDeposits,
          totalWithdrawals,
          monthlyDeposits: monthlyDepositAmount,
          monthlyWithdrawals: monthlyWithdrawalAmount
        });
        
      } catch (error: any) {
        console.error('Failed to load dashboard data:', error);
        toast.error('Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

  useEffect(() => {
    loadDashboardData();
    
    // Set up automatic refresh every 30 seconds to ensure dynamic updates
    // But only refresh if no modals are open (to prevent form data loss)
    const refreshInterval = setInterval(() => {
      const anyModalOpen = Object.values(modals).some(isOpen => isOpen);
      if (!anyModalOpen) {
        console.log('🔄 Auto-refreshing dashboard data...');
        loadDashboardData();
      } else {
        console.log('⏸️ Skipping auto-refresh (modal is open)');
      }
    }, 30000);
    
    // Cleanup interval on unmount
    return () => clearInterval(refreshInterval);
  }, [modals]); // Add modals as dependency to track their state

  // Show loading state
  if (isLoading) {
    return (
      <div className="space-y-6 dark:bg-black min-h-screen p-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Loading your data...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-4"></div>
              <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 dark:bg-black min-h-screen p-6">
      {/* Page header with Quick Action Buttons */}
      <div className="flex flex-col space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        </div>
        
        {/* Quick Actions */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Quick Actions</h3>
          <div className="flex items-center space-x-4">
            <div className="flex flex-col items-center space-y-2">
              <button 
                onClick={() => openModal('newApplication')}
                className="w-12 h-12 rounded-full bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200 shadow-lg flex items-center justify-center"
              >
                <FileText className="w-6 h-6 text-white" />
              </button>
              <span className="text-xs text-gray-600 dark:text-gray-400 text-center">New Application</span>
            </div>
            
            <div className="flex flex-col items-center space-y-2">
              <button 
                onClick={() => openModal('manualPayment')}
                className="w-12 h-12 rounded-full bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-200 shadow-lg flex items-center justify-center"
              >
                <DollarSign className="w-6 h-6 text-white" />
              </button>
              <span className="text-xs text-gray-600 dark:text-gray-400 text-center">Manual Payment</span>
            </div>
            
            <div className="flex flex-col items-center space-y-2">
              <button 
                onClick={() => openModal('approvePendingLoans')}
                className="w-12 h-12 rounded-full bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-200 shadow-lg flex items-center justify-center"
              >
                <CreditCard className="w-6 h-6 text-white" />
              </button>
              <span className="text-xs text-gray-600 dark:text-gray-400 text-center">Approve Pending Loans</span>
            </div>
            
            <div className="flex flex-col items-center space-y-2">
              <button 
                onClick={() => openModal('refreshDashboard')}
                className="w-12 h-12 rounded-full bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-200 shadow-lg flex items-center justify-center"
              >
                <Users className="w-6 h-6 text-white" />
              </button>
              <span className="text-xs text-gray-600 dark:text-gray-400 text-center">Refresh Dashboard</span>
            </div>
            
            <div className="flex flex-col items-center space-y-2">
              <button 
                onClick={() => openModal('paymentDetails')}
                className="w-12 h-12 rounded-full bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-200 shadow-lg flex items-center justify-center"
              >
                <TrendingUp className="w-6 h-6 text-white" />
              </button>
              <span className="text-xs text-gray-600 dark:text-gray-400 text-center">View Payment Details</span>
            </div>
            
            <div className="flex flex-col items-center space-y-2">
              <button 
                onClick={() => openModal('refreshDashboard')}
                className="w-12 h-12 rounded-full bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-200 shadow-lg flex items-center justify-center"
              >
                <AlertTriangle className="w-6 h-6 text-white" />
              </button>
              <span className="text-xs text-gray-600 dark:text-gray-400 text-center">Refresh Dashboard</span>
            </div>
            
            <div className="flex flex-col items-center space-y-2">
              <button 
                onClick={() => openModal('refreshOverdues')}
                className="w-12 h-12 rounded-full bg-yellow-500 hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-colors duration-200 shadow-lg flex items-center justify-center"
              >
                <Calendar className="w-6 h-6 text-white" />
              </button>
              <span className="text-xs text-gray-600 dark:text-gray-400 text-center">Refresh Overdues</span>
            </div>
            
            <div className="flex flex-col items-center space-y-2">
              <button 
                onClick={() => openModal('updateCreditScores')}
                className="w-12 h-12 rounded-full bg-yellow-500 hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-colors duration-200 shadow-lg flex items-center justify-center"
              >
                <ArrowUp className="w-6 h-6 text-white" />
              </button>
              <span className="text-xs text-gray-600 dark:text-gray-400 text-center">Update Credit Scores</span>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Stats Grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Key Metrics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stats.map((stat, index) => {
            const iconComponent = getIconComponent(stat.icon);
            return (
              <StatCard
                key={index}
                title={stat.title}
                value={stat.value}
                change={stat.change}
                changeType={stat.changeType}
                icon={iconComponent}
                color={stat.color}
              />
            );
          })}
        </div>
      </div>

      {/* Financial Overview - Single Card */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Financial Overview</h2>
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
          {/* Top Row - Main Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-x divide-gray-200 dark:divide-gray-700">
            <div className="p-6 text-center">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Repayments</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mb-1">
                UGX {(financialMetrics.totalRepayments / 1000000).toFixed(1)}M
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Repayments</p>
            </div>

            <div className="p-6 text-center">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Outstanding</p>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mb-1">
                UGX {(financialMetrics.totalOutstanding / 1000000).toFixed(1)}M
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Outstanding</p>
            </div>

            <div className="p-6 text-center">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Interest Amount</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                UGX {(financialMetrics.totalInterest / 1000000).toFixed(1)}M
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Interest Amount</p>
            </div>

            <div className="p-6 text-center">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Monthly Receipts</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mb-1">
                UGX {(financialMetrics.monthlyReceipts / 1000000).toFixed(1)}M
              </p>
              <p className="text-xs text-red-500 dark:text-red-400">Current Month</p>
            </div>
          </div>

          {/* Bottom Row - Secondary Metrics */}
          <div className="border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 divide-x divide-gray-200 dark:divide-gray-700">
              <div className="p-6 text-center">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Realized Repayments</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">
                  UGX {(financialMetrics.realizedRepayments / 1000000).toFixed(1)}M
                </p>
              </div>

              <div className="p-6 text-center">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Projected Profit</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  UGX {(financialMetrics.projectedProfit / 1000000).toFixed(1)}M
                </p>
              </div>

              <div className="p-6 text-center">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Realized Profit</p>
                <p className={`text-xl font-bold ${financialMetrics.realizedProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  UGX {(financialMetrics.realizedProfit / 1000000).toFixed(1)}M
                </p>
              </div>

              <div className="p-6 text-center">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Deposits</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">
                  UGX {(financialMetrics.totalDeposits / 1000000).toFixed(2)}M
                </p>
              </div>

              <div className="p-6 text-center">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Withdrawals</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">
                  UGX {(financialMetrics.totalWithdrawals / 1000000).toFixed(2)}M
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activities - Left Side (2/3 width) */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Activities</h3>
            </div>
            <div className="p-4">
              <div className="space-y-2">
                {recentApplications.length > 0 ? recentApplications.map((application, index) => (
                  <div key={application.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                    <div className="flex items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                        application.status === 'approved' ? 'bg-green-500' :
                        application.status === 'pending' ? 'bg-yellow-500' :
                        application.status === 'rejected' ? 'bg-red-500' :
                        'bg-blue-500'
                      }`}>
                        <span className="text-white font-semibold text-xs">
                          {application.applicantName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                          {application.applicantName} 
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {new Date(application.date).toLocaleDateString()} • {application.status.charAt(0).toUpperCase() + application.status.slice(1)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        UGX {(application.amount / 1000000).toFixed(1)}M
                      </p>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-4">
                    <p className="text-gray-500 dark:text-gray-400 text-sm">No recent applications</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Summary - Right Side (1/3 width) */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Quick Summary</h3>
            </div>
            <div className="p-6">
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Total Savings</span>
                  <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                    UGX {(financialMetrics.totalSavings / 1000000).toFixed(1)}M
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Active Borrowers</span>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats.find(s => s.title === 'Total Borrowers')?.value || '0'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Active Loans</span>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats.find(s => s.title === 'Active Loans')?.value || '0'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Pending Applications</span>
                  <span className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {recentApplications.filter(app => app.status === 'pending').length}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Overdue Loans</span>
                  <span className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {overdueLoans.length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Loans Overview - Bottom Section */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Loans Overview</h2>
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
          <div className="space-y-1">
            {/* Total Applications */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Applications</span>
              <span className="text-lg font-bold text-green-600 dark:text-green-400">
                {financialMetrics.totalApplications}
              </span>
            </div>

            {/* Active Loans */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active Loans</span>
              <span className="text-lg font-bold text-green-600 dark:text-green-400">
                {stats.find(s => s.title === 'Active Loans')?.value || '0'}
              </span>
            </div>

            {/* Total Borrowers */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Borrowers</span>
              <span className="text-lg font-bold text-green-600 dark:text-green-400">
                {stats.find(s => s.title === 'Total Borrowers')?.value || '0'}
              </span>
            </div>

            {/* Overdue Loans */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Overdue Loans</span>
              <span className="text-lg font-bold text-red-600 dark:text-red-400">
                {overdueLoans.length}
              </span>
            </div>

            {/* Avg Interest Rate */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Avg Interest Rate</span>
              <span className="text-lg font-bold text-green-600 dark:text-green-400">
                17.7%
              </span>
            </div>

            {/* Approval Rate */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Approval Rate</span>
              <span className="text-lg font-bold text-green-600 dark:text-green-400">
                {financialMetrics.approvalRate.toFixed(1)}%
              </span>
            </div>

            {/* Pending Applications */}
            <div className="flex justify-between items-center py-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Pending Applications</span>
              <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                {recentApplications.filter(app => app.status === 'pending').length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Components */}
      <NewApplicationModal 
        isOpen={modals.newApplication} 
        onClose={() => closeModalAndRefresh('newApplication')} 
      />
      <ManualPaymentModal 
        isOpen={modals.manualPayment} 
        onClose={() => closeModal('manualPayment')} 
      />
      <ApprovePendingLoansModal 
        isOpen={modals.approvePendingLoans} 
        onClose={() => closeModal('approvePendingLoans')} 
        onRefresh={refreshDashboard}
      />
      <RefreshDashboardModal 
        isOpen={modals.refreshDashboard} 
        onClose={() => closeModal('refreshDashboard')} 
      />
      <PaymentDetailsModal 
        isOpen={modals.paymentDetails} 
        onClose={() => closeModal('paymentDetails')} 
      />
      <RefreshOverduesModal 
        isOpen={modals.refreshOverdues} 
        onClose={() => closeModal('refreshOverdues')} 
      />
      <UpdateCreditScoresModal 
        isOpen={modals.updateCreditScores} 
        onClose={() => closeModal('updateCreditScores')} 
      />
    </div>
  );
};

export default Dashboard;
