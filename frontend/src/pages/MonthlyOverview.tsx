import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Users, PieChart, BarChart3, Calendar, RefreshCw, AlertCircle } from 'lucide-react';
import { databaseService } from '../services/databaseService';

interface MonthlyStats {
  month: string;
  year: number;
  totalLoans: number;
  loanAmount: number;
  totalRepayments: number;
  repaymentAmount: number;
  newBorrowers: number;
  activeBorrowers: number;
  overdueLoans: number;
  overdueAmount: number;
  totalSavings: number;
  totalExpenses: number;
  profit: number;
}

const MonthlyOverview: React.FC = () => {
  console.log('MonthlyOverview component rendered');
  
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<number>(0); // 0 means show all years
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 12; // Show more rows to see more months

  useEffect(() => {
    console.log('useEffect triggered, loading monthly data...');
    const loadMonthlyData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Helper function to create month key
        const createMonthKey = (dateString: string) => {
          if (!dateString) return null;
          const date = new Date(dateString);
          
          if (isNaN(date.getTime())) {
            console.warn('Invalid date:', dateString);
            return null;
          }
          return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        };

        // Helper function to initialize month data with proper month name
        const initializeMonthData = (dateString: string): MonthlyStats | null => {
          if (!dateString) return null;
          const date = new Date(dateString);
          
          if (isNaN(date.getTime())) {
            console.warn('Invalid date for initialization:', dateString);
            return null;
          }
          
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                             'July', 'August', 'September', 'October', 'November', 'December'];
          
          return {
            month: `${monthNames[date.getMonth()]} ${date.getFullYear()}`, // Format as "January 2024"
            year: date.getFullYear(),
            totalLoans: 0,
            loanAmount: 0,
            totalRepayments: 0,
            repaymentAmount: 0,
            newBorrowers: 0,
            activeBorrowers: 0,
            overdueLoans: 0,
            overdueAmount: 0,
            totalSavings: 0,
            totalExpenses: 0,
            profit: 0
          };
        };
        
        // Load all data from database API
        console.log('Starting API calls...');
        const [loans, repayments, borrowers, savings, expenses, applications] = await Promise.all([
          databaseService.getLoans(),
          databaseService.getRepayments(),
          databaseService.getBorrowers(),
          databaseService.getSavings(),
          databaseService.getExpenses(),
          databaseService.getApplications()
        ]);

        console.log('Loaded data from database:', { 
          loans: loans.length, 
          repayments: repayments.length, 
          borrowers: borrowers.length,
          savings: savings.length,
          expenses: expenses.length,
          applications: applications.length
        });

        // Quick test - check first few repayments
        console.log('Sample repayments:', repayments.slice(0, 3).map(r => ({ id: r.id, paidAt: r.paidAt, amount: r.amount })));
        console.log('Sample loans:', loans.slice(0, 3).map(l => ({ id: l.id, disbursedAt: l.disbursedAt, principal: l.principal })));

        // Create a set of months that have loans or repayments activity
        const activeMonths = new Set<string>();

        // Add months that have loans
        loans.forEach(loan => {
          if (loan.disbursedAt) {
            const key = createMonthKey(loan.disbursedAt);
            if (key) activeMonths.add(key);
          }
        });

        // Add months that have repayments  
        repayments.forEach(repayment => {
          if (repayment.paidAt) {
            const key = createMonthKey(repayment.paidAt);
            if (key) activeMonths.add(key);
          }
        });

        console.log('Active months found:', Array.from(activeMonths).sort());

        // Initialize data for only active months
        const monthlyData: { [key: string]: MonthlyStats } = {};
        
        activeMonths.forEach(monthKey => {
          // Create a sample date for this month to get proper month name
          const [year, month] = monthKey.split('-').map(Number);
          const sampleDate = new Date(year, month - 1, 1);
          const monthData = initializeMonthData(sampleDate.toISOString());
          if (monthData) {
            monthlyData[monthKey] = monthData;
          }
        });

        // Process loans (using disbursedAt date)
        loans.forEach(loan => {
          const key = createMonthKey(loan.disbursedAt || '');
          if (!key || !monthlyData[key]) return;
          
          monthlyData[key].totalLoans++;
          monthlyData[key].loanAmount += loan.principal || 0;
        });

        // Process repayments (using paidAt date)
        repayments.forEach(repayment => {
          const key = createMonthKey(repayment.paidAt);
          if (!key || !monthlyData[key]) return;
          
          monthlyData[key].totalRepayments++;
          monthlyData[key].repaymentAmount += repayment.amount || 0;
        });

        // Process new borrowers (only for months that already exist)
        borrowers.forEach(borrower => {
          const key = createMonthKey(borrower.createdAt);
          if (!key || !monthlyData[key]) return;
          
          monthlyData[key].newBorrowers++;
        });

        // Process overdue loans (loans with status 'OVERDUE' or 'DEFAULTED')
        const overdueLoans = loans.filter(loan => 
          loan.status === 'OVERDUE' || loan.status === 'DEFAULTED'
        );
        
        overdueLoans.forEach(loan => {
          const key = createMonthKey(loan.nextPaymentDate || loan.disbursedAt || '');
          if (!key || !monthlyData[key]) return;
          
          monthlyData[key].overdueLoans++;
          monthlyData[key].overdueAmount += loan.outstandingBalance || 0;
        });

        // Process expenses (only for months that already exist)
        expenses.forEach(expense => {
          const key = createMonthKey(expense.expenseDate);
          if (!key || !monthlyData[key]) return;
          
          monthlyData[key].totalExpenses += expense.amount || 0;
        });

        // Calculate active borrowers for each month (borrowers with active loans)
        Object.keys(monthlyData).forEach(key => {
          const [year, month] = key.split('-').map(Number);
          const monthEnd = new Date(year, month + 1, 0); // Last day of the month
          
          const activeBorrowersCount = borrowers.filter(borrower => {
            const borrowerLoans = loans.filter(loan => 
              loan.borrowerId === borrower.id && 
              loan.status === 'ACTIVE' &&
              new Date(loan.disbursedAt || '') <= monthEnd
            );
            return borrowerLoans.length > 0;
          }).length;
          
          monthlyData[key].activeBorrowers = activeBorrowersCount;
        });

        // Calculate profit for each month (repayments - expenses)
        Object.keys(monthlyData).forEach(key => {
          const stats = monthlyData[key];
          stats.profit = stats.repaymentAmount - stats.totalExpenses;
        });

        // Convert to array and sort by date
        const sortedStats = Object.values(monthlyData).sort((a, b) => {
          // Sort by year first, then by month
          if (a.year !== b.year) return a.year - b.year;
          
          // Extract month name and convert to number for proper sorting
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                             'July', 'August', 'September', 'October', 'November', 'December'];
          const aMonthName = a.month.split(' ')[0];
          const bMonthName = b.month.split(' ')[0];
          const aMonthIndex = monthNames.indexOf(aMonthName);
          const bMonthIndex = monthNames.indexOf(bMonthName);
          
          return aMonthIndex - bMonthIndex;
        });

        setMonthlyStats(sortedStats);
        console.log('Generated monthly stats:', sortedStats.length, 'months');
        console.log('First few months:', sortedStats.slice(0, 3));
        
        // Don't set any initial selection - show all months by default
      } catch (error) {
        console.error('Error loading monthly data:', error);
        setError('Failed to load monthly data. Please check if the backend server is running.');
      } finally {
        setLoading(false);
        console.log('Loading completed, loading state set to false');
      }
    };

    loadMonthlyData();
  }, [selectedMonth]);

  // Get available years and months
  const availableYears = [...new Set(monthlyStats.map(stat => stat.year))].sort();
  const availableMonths = [...new Set(monthlyStats.map(stat => stat.month))];
  
  // Filter data based on selected filters
  const filteredStats = monthlyStats.filter(stat => {
    const matchesMonth = !selectedMonth || selectedMonth === '' || stat.month === selectedMonth;
    const matchesYear = !selectedYear || selectedYear === 0 || stat.year === selectedYear;
    return matchesMonth && matchesYear;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredStats.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentData = filteredStats.slice(startIndex, endIndex);

  // Calculate summary statistics for all filtered data
  const totalMetrics = filteredStats.reduce(
    (acc, stat) => ({
      totalLoans: acc.totalLoans + stat.totalLoans,
      loanAmount: acc.loanAmount + stat.loanAmount,
      totalRepayments: acc.totalRepayments + stat.totalRepayments,
      repaymentAmount: acc.repaymentAmount + stat.repaymentAmount,
      newBorrowers: acc.newBorrowers + stat.newBorrowers,
      overdueAmount: acc.overdueAmount + stat.overdueAmount,
      totalSavings: acc.totalSavings + stat.totalSavings,
      totalExpenses: acc.totalExpenses + stat.totalExpenses,
      profit: acc.profit + stat.profit,
    }),
    {
      totalLoans: 0,
      loanAmount: 0,
      totalRepayments: 0,
      repaymentAmount: 0,
      newBorrowers: 0,
      overdueAmount: 0,
      totalSavings: 0,
      totalExpenses: 0,
      profit: 0,
    }
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading monthly overview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-lg shadow-md max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading Data</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Monthly Overview</h1>
              <p className="text-gray-600 mt-2">Track your lending business performance month by month</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-gray-500" />
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Months</option>
                  {availableMonths.map(month => (
                    <option key={month} value={month}>{month}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center space-x-2">
                <select
                  value={selectedYear || ''}
                  onChange={(e) => {
                    setSelectedYear(e.target.value ? parseInt(e.target.value) : 0);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Years</option>
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Loans</p>
                <p className="text-2xl font-bold text-gray-900">{formatNumber(totalMetrics.totalLoans)}</p>
                <p className="text-green-600 text-sm">{formatCurrency(totalMetrics.loanAmount)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Repayments</p>
                <p className="text-2xl font-bold text-gray-900">{formatNumber(totalMetrics.totalRepayments)}</p>
                <p className="text-green-600 text-sm">{formatCurrency(totalMetrics.repaymentAmount)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">New Borrowers</p>
                <p className="text-2xl font-bold text-gray-900">{formatNumber(totalMetrics.newBorrowers)}</p>
                <p className="text-gray-500 text-sm">Customer growth</p>
              </div>
              <Users className="w-8 h-8 text-purple-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Net Profit</p>
                <p className={`text-2xl font-bold ${totalMetrics.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(totalMetrics.profit)}
                </p>
                <p className="text-gray-500 text-sm">Revenue - Expenses</p>
              </div>
              {totalMetrics.profit >= 0 ? (
                <TrendingUp className="w-8 h-8 text-green-600" />
              ) : (
                <TrendingDown className="w-8 h-8 text-red-600" />
              )}
            </div>
          </div>
        </div>

        {/* Monthly Data Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Monthly Performance</h2>
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <span>Showing {startIndex + 1}-{Math.min(endIndex, filteredStats.length)} of {filteredStats.length} months</span>
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Disbursed</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Repayments</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expenses</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Profit / Loss</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"># Borrowers</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {currentData.map((stat, index) => (
                  <tr key={stat.month} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{stat.month}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatCurrency(stat.loanAmount)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatCurrency(stat.repaymentAmount)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatCurrency(stat.totalExpenses)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-medium ${stat.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(stat.profit)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatNumber(stat.newBorrowers)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing {startIndex + 1} to {Math.min(endIndex, filteredStats.length)} of {filteredStats.length} results
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 border rounded text-sm ${
                        currentPage === page
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Additional Insights */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Insights</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Average Loan Size</span>
                <span className="font-medium">
                  {totalMetrics.totalLoans > 0 ? formatCurrency(totalMetrics.loanAmount / totalMetrics.totalLoans) : formatCurrency(0)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Average Repayment</span>
                <span className="font-medium">
                  {totalMetrics.totalRepayments > 0 ? formatCurrency(totalMetrics.repaymentAmount / totalMetrics.totalRepayments) : formatCurrency(0)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Collection Efficiency</span>
                <span className="font-medium">
                  {totalMetrics.loanAmount > 0 ? `${((totalMetrics.repaymentAmount / totalMetrics.loanAmount) * 100).toFixed(1)}%` : '0%'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Summary</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Total Revenue</span>
                <span className="font-medium text-green-600">{formatCurrency(totalMetrics.repaymentAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Total Expenses</span>
                <span className="font-medium text-red-600">{formatCurrency(totalMetrics.totalExpenses)}</span>
              </div>
              <div className="border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-900 font-medium">Net Profit</span>
                  <span className={`font-bold ${totalMetrics.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(totalMetrics.profit)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthlyOverview;