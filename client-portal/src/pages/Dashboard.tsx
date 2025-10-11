import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { dashboardApi } from '../services/api';
import { DashboardStats } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import PaymentModal from '../components/PaymentModal';
import toast from 'react-hot-toast';
import { formatDate } from '../utils/dateFormatter';
import {
  BanknotesIcon,
  CreditCardIcon,
  PlusIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ClockIcon,
  BuildingLibraryIcon,
  ChartBarIcon,
  CalculatorIcon,
} from '@heroicons/react/24/outline';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  
  // Loan Calculator State
  const [showCalculator, setShowCalculator] = useState(true); // Changed to true to show by default
  const [calcAmount, setCalcAmount] = useState('1000000');
  const [calcTerm, setCalcTerm] = useState('12');
  const [calcInterestRate, setCalcInterestRate] = useState('15');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [statsResponse, activityResponse] = await Promise.all([
          dashboardApi.getStats(),
          dashboardApi.getRecentActivity(),
        ]);

        if (statsResponse.success && statsResponse.data) {
          setStats(statsResponse.data);
        }

        if (activityResponse.success && activityResponse.data) {
          setRecentActivity(activityResponse.data);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        toast.error('Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Loan Calculator Functions
  const calculateLoan = () => {
    const principal = parseFloat(calcAmount) || 0;
    const months = parseInt(calcTerm) || 12;
    const annualRate = parseFloat(calcInterestRate) || 15;
    const monthlyRate = annualRate / 100 / 12;
    
    if (principal <= 0 || months <= 0) {
      return {
        monthlyPayment: 0,
        totalPayment: 0,
        totalInterest: 0
      };
    }
    
    // Calculate monthly payment using amortization formula
    const monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
    const totalPayment = monthlyPayment * months;
    const totalInterest = totalPayment - principal;
    
    return {
      monthlyPayment: isNaN(monthlyPayment) ? 0 : monthlyPayment,
      totalPayment: isNaN(totalPayment) ? 0 : totalPayment,
      totalInterest: isNaN(totalInterest) ? 0 : totalInterest
    };
  };

  const loanCalc = calculateLoan();

  // Auto-update interest rate based on loan amount
  useEffect(() => {
    const amount = parseFloat(calcAmount) || 0;
    if (amount >= 5000000) {
      setCalcInterestRate('10');
    } else if (amount >= 2000000) {
      setCalcInterestRate('12');
    } else if (amount >= 500000) {
      setCalcInterestRate('15');
    } else {
      setCalcInterestRate('20');
    }
  }, [calcAmount]);

  const quickActions = [
    {
      name: 'Apply for Loan',
      description: 'Submit a new loan application',
      href: '/applications/new',
      icon: PlusIcon,
      color: 'bg-blue-500',
    },
    {
      name: 'Make Payment',
      description: 'Pay via Mobile Money',
      href: '#',
      icon: CreditCardIcon,
      color: 'bg-green-500',
      onClick: () => setIsPaymentModalOpen(true),
    },
    {
      name: 'View Loans',
      description: 'Check your loan details',
      href: '/loans',
      icon: BanknotesIcon,
      color: 'bg-purple-500',
    },
    {
      name: 'Savings Account',
      description: 'Manage your savings',
      href: '/savings',
      icon: BuildingLibraryIcon,
      color: 'bg-yellow-500',
    },
    {
      name: 'Loan Calculator',
      description: 'Calculate loan payments',
      href: '#',
      icon: CalculatorIcon,
      color: 'bg-indigo-500',
      onClick: () => setShowCalculator(!showCalculator),
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section with Logo */}
      <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg shadow-lg text-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="/logo.png" 
              alt="QuickCredit Logo" 
              className="h-16 w-16 rounded-lg bg-white/10 p-2 shadow-lg"
            />
            <div>
              <h1 className="text-2xl font-bold">
                Welcome back, {user?.firstName}! 👋
              </h1>
              <p className="text-primary-100 mt-1">
                Here's an overview of your financial portfolio
              </p>
            </div>
          </div>
          <div className="hidden sm:block">
            <div className="bg-white/20 rounded-lg p-4">
              <ChartBarIcon className="h-8 w-8" />
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <BanknotesIcon className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Active Loans</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats?.activeLoans || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ArrowUpIcon className="h-8 w-8 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Borrowed</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatCurrency(stats?.totalBorrowed || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ArrowDownIcon className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Paid</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatCurrency(stats?.totalPaid || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <BuildingLibraryIcon className="h-8 w-8 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Savings Balance</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatCurrency(stats?.savingsBalance || 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Next Payment Alert */}
      {stats?.nextPaymentDate && stats?.nextPaymentAmount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <ClockIcon className="h-6 w-6 text-yellow-600 mt-0.5" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Upcoming Payment Due
              </h3>
              <p className="text-sm text-yellow-700 mt-1">
                You have a payment of{' '}
                <span className="font-semibold">
                  {formatCurrency(stats.nextPaymentAmount)}
                </span>{' '}
                due on{' '}
                <span className="font-semibold">
                  {formatDate(stats.nextPaymentDate)}
                </span>
              </p>
              <div className="mt-3">
                <button
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-yellow-800 bg-yellow-200 hover:bg-yellow-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                >
                  Make Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="card">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {quickActions.map((action) => {
            if (action.onClick) {
              return (
                <button
                  key={action.name}
                  onClick={action.onClick}
                  className="group p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:shadow-md transition-all duration-200 w-full text-left"
                >
                  <div className="flex items-center">
                    <div className={`flex-shrink-0 p-2 rounded-lg ${action.color}`}>
                      <action.icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-gray-900 group-hover:text-primary-600">
                        {action.name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">
                        {action.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            }
            
            return (
              <Link
                key={action.name}
                to={action.href}
                className="group p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-center">
                  <div className={`flex-shrink-0 p-2 rounded-lg ${action.color}`}>
                    <action.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-gray-900 group-hover:text-primary-600">
                      {action.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {action.description}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Loan Calculator Widget */}
      {showCalculator && (
        <div className="card bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="bg-indigo-600 p-2 rounded-lg">
                <CalculatorIcon className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 ml-3">Loan Calculator</h2>
            </div>
            <button
              onClick={() => setShowCalculator(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Input Section */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Loan Amount (UGX)
                </label>
                <input
                  type="number"
                  value={calcAmount}
                  onChange={(e) => setCalcAmount(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg font-semibold"
                  placeholder="1,000,000"
                  min="100000"
                  step="100000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Loan Term (Months)
                </label>
                <input
                  type="number"
                  value={calcTerm}
                  onChange={(e) => setCalcTerm(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg font-semibold"
                  placeholder="12"
                  min="1"
                  max="60"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Interest Rate (% per annum)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={calcInterestRate}
                    onChange={(e) => setCalcInterestRate(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg font-semibold"
                    placeholder="15"
                    min="1"
                    max="50"
                    step="0.5"
                  />
                  <div className="mt-2 text-xs text-gray-600">
                    <p>📊 Our rates: 10% (5M+), 12% (2M-5M), 15% (500K-2M), 20% (Below 500K)</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Results Section */}
            <div className="space-y-4">
              <div className="bg-white rounded-lg p-5 shadow-sm border border-indigo-200">
                <p className="text-sm text-gray-600 mb-1">Monthly Payment</p>
                <p className="text-3xl font-bold text-indigo-600">
                  {formatCurrency(loanCalc.monthlyPayment)}
                </p>
              </div>

              <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                <p className="text-sm text-gray-600 mb-1">Total Amount to Pay</p>
                <p className="text-xl font-bold text-gray-900">
                  {formatCurrency(loanCalc.totalPayment)}
                </p>
              </div>

              <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                <p className="text-sm text-gray-600 mb-1">Total Interest</p>
                <p className="text-xl font-bold text-orange-600">
                  {formatCurrency(loanCalc.totalInterest)}
                </p>
              </div>

              <Link
                to="/applications"
                className="block w-full bg-indigo-600 text-white text-center py-3 rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
              >
                Apply for This Loan →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">Recent Activity</h2>
          <Link
            to="/payments"
            className="text-sm text-primary-600 hover:text-primary-500 font-medium"
          >
            View all
          </Link>
        </div>
        
        {recentActivity.length > 0 ? (
          <div className="space-y-4">
            {recentActivity.slice(0, 5).map((activity, index) => (
              <div key={index} className="flex items-center justify-between py-3 border-b last:border-b-0">
                <div className="flex items-center">
                  <div className={`p-2 rounded-full ${
                    activity.type === 'payment' ? 'bg-green-100' :
                    activity.type === 'loan' ? 'bg-blue-100' :
                    'bg-yellow-100'
                  }`}>
                    {activity.type === 'payment' ? (
                      <ArrowDownIcon className="h-4 w-4 text-green-600" />
                    ) : activity.type === 'loan' ? (
                      <BanknotesIcon className="h-4 w-4 text-blue-600" />
                    ) : (
                      <BuildingLibraryIcon className="h-4 w-4 text-yellow-600" />
                    )}
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">
                      {activity.description}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(activity.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${
                    activity.type === 'payment' ? 'text-green-600' :
                    activity.type === 'loan' ? 'text-blue-600' :
                    'text-yellow-600'
                  }`}>
                    {activity.amount && formatCurrency(activity.amount)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No recent activity</h3>
            <p className="mt-1 text-sm text-gray-500">
              Start by applying for a loan or making a payment.
            </p>
          </div>
        )}
      </div>

      {/* Credit Score Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Credit Score */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Credit Score</h3>
              <p className="text-sm text-gray-500 mt-1">
                Your creditworthiness rating
              </p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-primary-600">
                {stats?.creditScore || 'N/A'}
              </div>
              <p className="text-sm font-medium text-gray-600">
                {stats?.creditScore ? 
                  (stats.creditScore >= 700 ? 'Excellent ⭐' :
                   stats.creditScore >= 600 ? 'Good ✓' :
                   stats.creditScore >= 500 ? 'Fair ○' : 'Needs Improvement') : 
                  'Not rated'
                }
              </p>
            </div>
          </div>
          
          {/* Credit Score Progress Bar */}
          {stats?.creditScore && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>300</span>
                <span>850</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${
                    stats.creditScore >= 700 ? 'bg-green-500' :
                    stats.creditScore >= 600 ? 'bg-blue-500' :
                    stats.creditScore >= 500 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${((stats.creditScore - 300) / 550) * 100}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* Financial Health Score */}
        <div className="card bg-gradient-to-br from-primary-50 to-primary-100">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Financial Health</h3>
              <p className="text-sm text-gray-600 mt-1">
                Overall account status
              </p>
            </div>
            <div className="text-center">
              <div className="relative inline-flex">
                <svg className="w-20 h-20">
                  <circle
                    className="text-gray-300"
                    strokeWidth="6"
                    stroke="currentColor"
                    fill="transparent"
                    r="32"
                    cx="40"
                    cy="40"
                  />
                  <circle
                    className="text-primary-600"
                    strokeWidth="6"
                    strokeDasharray={2 * Math.PI * 32}
                    strokeDashoffset={2 * Math.PI * 32 * (1 - 0.75)}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r="32"
                    cx="40"
                    cy="40"
                    transform="rotate(-90 40 40)"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-primary-600">
                  75%
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-2">Good Standing</p>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Tips */}
      <div className="card bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <div className="p-3 bg-blue-500 rounded-lg">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="ml-4 flex-1">
            <h3 className="text-lg font-semibold text-gray-900">💡 Financial Tip</h3>
            <p className="text-sm text-gray-700 mt-2">
              {user?.creditRating === 'EXCELLENT' ? (
                "Great job! Your excellent credit rating qualifies you for our best interest rates. Consider applying for a larger loan amount if needed."
              ) : user?.creditRating === 'GOOD' ? (
                "You're doing well! Keep making timely payments to improve your credit score further and unlock better loan terms."
              ) : (
                "Start building your credit by applying for a small loan and making consistent, on-time payments. This will improve your credit score over time."
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Account Milestone Progress */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Account Milestones</h3>
        <div className="space-y-4">
          {/* First Loan */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Complete first loan application</span>
              <span className="font-medium text-gray-900">
                {stats?.activeLoans || 0 > 0 ? '✓ Completed' : '0/1'}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  stats?.activeLoans || 0 > 0 ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{ width: stats?.activeLoans || 0 > 0 ? '100%' : '30%' }}
              ></div>
            </div>
          </div>

          {/* Payment Milestone */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Make 5 on-time payments</span>
              <span className="font-medium text-gray-900">
                0/5
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="h-2 rounded-full bg-blue-500"
                style={{ width: '0%' }}
              ></div>
            </div>
          </div>

          {/* Savings Goal */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Build savings to USh 500,000</span>
              <span className="font-medium text-gray-900">
                {formatCurrency(Math.min(stats?.savingsBalance || 0, 500000))} / USh 500,000
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="h-2 rounded-full bg-yellow-500"
                style={{ width: `${Math.min((stats?.savingsBalance || 0) / 500000 * 100, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        loanAmount={stats?.totalBorrowed || 0}
        nextPaymentAmount={stats?.nextPaymentAmount || 50000}
      />
    </div>
  );
};

export default Dashboard;