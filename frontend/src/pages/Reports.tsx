import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Calendar,
  Filter,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  CreditCard,
  FileText,
  BarChart3,
  PieChart,
  LineChart,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { databaseService } from '../services/databaseService';

interface ReportData {
  totalPortfolioValue: number;
  activeBorrowers: number;
  collectionRate: number;
  defaultRate: number;
  monthlyDisbursements: Array<{ month: string; amount: number }>;
  loanStatusDistribution: Array<{ status: string; count: number; percentage: number }>;
  avgLoanSize: number;
  avgTerm: number;
  todaysCollections: number;
  monthlyCollections: number;
  recoveryRate: number;
}

const Reports: React.FC = () => {
  const [selectedReport, setSelectedReport] = useState('overview');
  const [dateRange, setDateRange] = useState('thisMonth');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reportTypes = [
    { id: 'overview', name: 'Business Overview', icon: BarChart3, description: 'High-level business metrics and KPIs' },
    { id: 'loans', name: 'Loan Portfolio', icon: CreditCard, description: 'Detailed loan portfolio analysis' },
    { id: 'collections', name: 'Collections Report', icon: DollarSign, description: 'Payment collections and recovery' },
    { id: 'borrowers', name: 'Borrower Analysis', icon: Users, description: 'Customer demographics and behavior' },
    { id: 'financial', name: 'Financial Statement', icon: FileText, description: 'Income, expenses, and profitability' },
    { id: 'risk', name: 'Risk Assessment', icon: PieChart, description: 'Portfolio risk and default analysis' }
  ];

  // Load real data
  useEffect(() => {
    const loadReportData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Load all data from database API
        const [loans, repayments, borrowers, savings, expenses] = await Promise.all([
          databaseService.getLoans(),
          databaseService.getRepayments(),
          databaseService.getBorrowers(),
          databaseService.getSavings(),
          databaseService.getExpenses()
        ]);

        console.log('Loaded report data from database:', { 
          loans: loans.length, 
          repayments: repayments.length, 
          borrowers: borrowers.length,
          savings: savings.length,
          expenses: expenses.length
        });

        // Calculate metrics
        const totalPortfolioValue = loans.reduce((sum, loan) => sum + (loan.principal || 0), 0);
        const activeBorrowers = borrowers.filter(b => 
          b.status === 'ACTIVE'
        ).length;
        
        const totalLoanAmount = loans.reduce((sum, loan) => sum + (loan.principal || 0), 0);
        const totalRepaymentAmount = repayments.reduce((sum, repayment) => sum + (repayment.amount || 0), 0);
        const collectionRate = totalLoanAmount > 0 ? (totalRepaymentAmount / totalLoanAmount) * 100 : 0;
        
        const overdueLoans = loans.filter(loan => loan.status === 'OVERDUE' || loan.status === 'DEFAULTED');
        const totalLoans = loans.length;
        const defaultRate = totalLoans > 0 ? (overdueLoans.length / totalLoans) * 100 : 0;

        // Calculate monthly disbursements (last 6 months)
        const monthlyDisbursements = calculateMonthlyDisbursements(loans);
        
        // Calculate loan status distribution
        const loanStatusDistribution = calculateLoanStatusDistribution(loans);
        
        // Calculate loan metrics
        const avgLoanSize = totalLoans > 0 ? totalPortfolioValue / totalLoans : 0;
        const avgTerm = totalLoans > 0 ? loans.reduce((sum, loan) => sum + (loan.termMonths || 0), 0) / totalLoans : 0;
        
        // Calculate collections
        const today = new Date();
        const todaysCollections = repayments
          .filter(r => {
            const repaymentDate = new Date(r.paidAt);
            return repaymentDate.toDateString() === today.toDateString();
          })
          .reduce((sum, r) => sum + (r.amount || 0), 0);
        
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const monthlyCollections = repayments
          .filter(r => {
            const repaymentDate = new Date(r.paidAt);
            return repaymentDate.getMonth() === currentMonth && repaymentDate.getFullYear() === currentYear;
          })
          .reduce((sum, r) => sum + (r.amount || 0), 0);
        
        const recoveryRate = totalLoanAmount > 0 ? (totalRepaymentAmount / totalLoanAmount) * 100 : 0;

        setReportData({
          totalPortfolioValue,
          activeBorrowers,
          collectionRate,
          defaultRate,
          monthlyDisbursements,
          loanStatusDistribution,
          avgLoanSize,
          avgTerm,
          todaysCollections,
          monthlyCollections,
          recoveryRate
        });
        
      } catch (error) {
        console.error('Failed to load report data:', error);
        setError(error instanceof Error ? error.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadReportData();
  }, [dateRange]);

  // Helper function to calculate monthly disbursements
  const calculateMonthlyDisbursements = (loans: any[]) => {
    const monthlyData: { [key: string]: number } = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    loans.forEach(loan => {
      if (!loan.disbursedAt) return;
      
      const date = new Date(loan.disbursedAt);
      if (isNaN(date.getTime())) return;
      
      const monthKey = `${months[date.getMonth()]} ${date.getFullYear()}`;
      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + (loan.principal || 0);
    });

    // Get last 6 months
    const result = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${months[date.getMonth()]} ${date.getFullYear()}`;
      result.push({
        month: months[date.getMonth()],
        amount: monthlyData[monthKey] || 0
      });
    }
    
    return result;
  };

  // Helper function to calculate loan status distribution
  const calculateLoanStatusDistribution = (loans: any[]) => {
    const statusCounts: { [key: string]: number } = {
      'Active': 0,
      'Completed': 0,
      'Overdue': 0,
      'Defaulted': 0,
      'Pending': 0
    };
    
    loans.forEach(loan => {
      const status = loan.status || 'Pending';
      if (status === 'ACTIVE') {
        statusCounts['Active']++;
      } else if (status === 'COMPLETED' || status === 'CLOSED') {
        statusCounts['Completed']++;
      } else if (status === 'OVERDUE') {
        statusCounts['Overdue']++;
      } else if (status === 'DEFAULTED') {
        statusCounts['Defaulted']++;
      } else {
        statusCounts['Pending']++;
      }
    });

    const total = loans.length;
    return Object.entries(statusCounts)
      .map(([status, count]) => ({
        status,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0
      }))
      .filter(item => item.count > 0);
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Format large numbers
  const formatLargeNumber = (num: number) => {
    if (num >= 1000000000) {
      return (num / 1000000000).toFixed(1) + 'B';
    } else if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  // Export functions
  const exportToCSV = () => {
    if (!reportData) {
      alert('No data available to export');
      return;
    }
    
    try {
      const headers = ['Metric', 'Value'];
      const data = [
        ['Total Portfolio Value', formatCurrency(reportData.totalPortfolioValue)],
        ['Active Borrowers', reportData.activeBorrowers.toString()],
        ['Collection Rate', `${reportData.collectionRate.toFixed(1)}%`],
        ['Default Rate', `${reportData.defaultRate.toFixed(1)}%`],
        ['Average Loan Size', formatCurrency(reportData.avgLoanSize)],
        ['Average Term', `${Math.round(reportData.avgTerm)} months`],
        ['Today\'s Collections', formatCurrency(reportData.todaysCollections)],
        ['Monthly Collections', formatCurrency(reportData.monthlyCollections)],
        ['Recovery Rate', `${reportData.recoveryRate.toFixed(1)}%`]
      ];

      const csvContent = [headers, ...data]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `report-${selectedReport}-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } catch (error) {
      console.error('CSV export failed:', error);
      alert('Failed to export CSV');
    }
  };

  const exportToPDF = () => {
    if (!reportData) {
      alert('No data available to export');
      return;
    }

    try {
      // Create a simple text-based PDF content
      const content = `
QUICKCREDIT BUSINESS REPORT
Generated on: ${new Date().toLocaleDateString()}
Report Type: ${reportTypes.find(r => r.id === selectedReport)?.name || selectedReport}

PORTFOLIO OVERVIEW
==================
Total Portfolio Value: ${formatCurrency(reportData.totalPortfolioValue)}
Active Borrowers: ${reportData.activeBorrowers}
Collection Rate: ${reportData.collectionRate.toFixed(1)}%
Default Rate: ${reportData.defaultRate.toFixed(1)}%
Average Loan Size: ${formatCurrency(reportData.avgLoanSize)}
Average Term: ${Math.round(reportData.avgTerm)} months

COLLECTIONS SUMMARY
==================
Today's Collections: ${formatCurrency(reportData.todaysCollections)}
Monthly Collections: ${formatCurrency(reportData.monthlyCollections)}
Recovery Rate: ${reportData.recoveryRate.toFixed(1)}%

LOAN STATUS DISTRIBUTION
=======================
${reportData.loanStatusDistribution.map(item => 
  `${item.status}: ${item.count} loans (${item.percentage.toFixed(1)}%)`
).join('\n')}
`;

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `report-${selectedReport}-${new Date().toISOString().split('T')[0]}.txt`;
      link.click();
      
      console.log('PDF export completed (as text file)');
    } catch (error) {
      console.error('PDF export failed:', error);
      alert('Failed to export PDF');
    }
  };

  const exportToExcel = () => {
    if (!reportData) {
      alert('No data available to export');
      return;
    }

    try {
      // Create Excel-like CSV format with multiple sheets simulation
      const overviewData = [
        ['QuickCredit Business Report'],
        ['Generated on:', new Date().toLocaleDateString()],
        ['Report Type:', reportTypes.find(r => r.id === selectedReport)?.name || selectedReport],
        [''],
        ['PORTFOLIO METRICS', ''],
        ['Total Portfolio Value', formatCurrency(reportData.totalPortfolioValue)],
        ['Active Borrowers', reportData.activeBorrowers.toString()],
        ['Collection Rate', `${reportData.collectionRate.toFixed(1)}%`],
        ['Default Rate', `${reportData.defaultRate.toFixed(1)}%`],
        ['Average Loan Size', formatCurrency(reportData.avgLoanSize)],
        ['Average Term', `${Math.round(reportData.avgTerm)} months`],
        [''],
        ['COLLECTIONS SUMMARY', ''],
        ['Today\'s Collections', formatCurrency(reportData.todaysCollections)],
        ['Monthly Collections', formatCurrency(reportData.monthlyCollections)],
        ['Recovery Rate', `${reportData.recoveryRate.toFixed(1)}%`],
        [''],
        ['LOAN STATUS DISTRIBUTION', ''],
        ['Status', 'Count', 'Percentage'],
        ...reportData.loanStatusDistribution.map(item => [
          item.status,
          item.count.toString(),
          `${item.percentage.toFixed(1)}%`
        ])
      ];

      const csvContent = overviewData
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `report-excel-${selectedReport}-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      
      console.log('Excel export completed (as enhanced CSV)');
    } catch (error) {
      console.error('Excel export failed:', error);
      alert('Failed to export Excel file');
    }
  };

  // Refresh data
  const refreshData = async () => {
    setLoading(true);
    setError(null);
    setReportData(null);
    
    try {
      // Force re-load by triggering useEffect
      const currentRange = dateRange;
      setDateRange('refreshing');
      setTimeout(() => {
        setDateRange(currentRange);
      }, 50);
      
    } catch (error) {
      console.error('Failed to refresh data:', error);
      setError('Failed to refresh data');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600 mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">Loading report data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Error Loading Data</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4 text-center">{error}</p>
        <button
          onClick={refreshData}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:outline-none"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-600 dark:text-gray-400">No data available</p>
      </div>
    );
  }

  const quickStats = [
    { 
      label: 'Total Portfolio Value', 
      value: formatCurrency(reportData.totalPortfolioValue),
      change: '+15%', 
      trend: 'up' as const
    },
    { 
      label: 'Active Borrowers', 
      value: reportData.activeBorrowers.toString(),
      change: '+8%', 
      trend: 'up' as const
    },
    { 
      label: 'Collection Rate', 
      value: `${reportData.collectionRate.toFixed(1)}%`,
      change: '+2.1%', 
      trend: 'up' as const
    },
    { 
      label: 'Default Rate', 
      value: `${reportData.defaultRate.toFixed(1)}%`,
      change: '-0.5%', 
      trend: 'down' as const
    }
  ];



  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reports & Analytics</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Generate insights and reports for your business</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={refreshData}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="today">Today</option>
            <option value="thisWeek">This Week</option>
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="thisQuarter">This Quarter</option>
            <option value="thisYear">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
          <button className="bg-primary-600 dark:bg-primary-700 text-white px-4 py-2 rounded-lg hover:bg-primary-700 dark:hover:bg-primary-800 flex items-center">
            <Download className="h-4 w-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {quickStats.map((stat, index) => (
          <div key={index} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{stat.value}</p>
                <div className="flex items-center mt-2">
                  <TrendingUp className={`h-4 w-4 mr-1 ${stat.trend === 'up' ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`} />
                  <span className={`text-sm ${stat.trend === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {stat.change}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">vs last period</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Report Types Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Report Selection */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Available Reports</h3>
            <div className="space-y-3">
              {reportTypes.map((report) => (
                <button
                  key={report.id}
                  onClick={() => setSelectedReport(report.id)}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    selectedReport === report.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-400'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-start">
                    <report.icon className={`h-5 w-5 mt-0.5 mr-3 ${
                      selectedReport === report.id ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'
                    }`} />
                    <div>
                      <h4 className={`font-medium ${
                        selectedReport === report.id ? 'text-primary-900 dark:text-primary-100' : 'text-gray-900 dark:text-gray-100'
                      }`}>
                        {report.name}
                      </h4>
                      <p className={`text-sm mt-1 ${
                        selectedReport === report.id ? 'text-primary-700 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400'
                      }`}>
                        {report.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Report Content */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {reportTypes.find(r => r.id === selectedReport)?.name}
              </h3>
              <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                <Calendar className="h-4 w-4 mr-1" />
                Last updated: {new Date().toLocaleDateString()}
              </div>
            </div>

            {selectedReport === 'overview' && (
              <div className="space-y-6">
                {/* Monthly Disbursements Chart */}
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Monthly Loan Disbursements (Last 6 Months)</h4>
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <div className="grid grid-cols-6 gap-4">
                      {reportData.monthlyDisbursements.map((item, index) => (
                        <div key={index} className="text-center">
                          <div className="mb-2">
                            <div className="h-24 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-end justify-center p-2">
                              <div 
                                className="bg-primary-500 rounded-t w-full" 
                                style={{ 
                                  height: `${Math.max(10, (item.amount / Math.max(...reportData.monthlyDisbursements.map(d => d.amount))) * 80)}%` 
                                }}
                              ></div>
                            </div>
                            <p className="text-xs font-medium text-gray-900 dark:text-gray-100 mt-1">{item.month}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{formatLargeNumber(item.amount)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Loan Status Distribution */}
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Loan Portfolio Status</h4>
                  <div className="space-y-3">
                    {reportData.loanStatusDistribution.map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full mr-3 ${
                            item.status === 'Active' ? 'bg-green-500' :
                            item.status === 'Completed' ? 'bg-primary-500' :
                            item.status === 'Overdue' ? 'bg-yellow-500' :
                            item.status === 'Pending' ? 'bg-gray-500' : 'bg-red-500'
                          }`}></div>
                          <span className="text-sm text-gray-900 dark:text-gray-100">{item.status}</span>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.count}</span>
                          <div className="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div 
                              className="bg-primary-600 h-2 rounded-full" 
                              style={{ width: `${item.percentage}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-8">{item.percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedReport === 'loans' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100">Average Loan Size</h5>
                    <p className="text-2xl font-bold text-primary-600 dark:text-primary-400 mt-2">{formatCurrency(reportData.avgLoanSize)}</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100">Average Term</h5>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">{Math.round(reportData.avgTerm)} months</p>
                  </div>
                </div>
                <div className="h-48 bg-gray-50 dark:bg-gray-900 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                    <p className="text-gray-500 dark:text-gray-400">Loan portfolio analytics chart</p>
                  </div>
                </div>
              </div>
            )}

            {selectedReport === 'collections' && (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100">Today's Collections</h5>
                    <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-2">{formatCurrency(reportData.todaysCollections)}</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100">This Month</h5>
                    <p className="text-xl font-bold text-primary-600 dark:text-primary-400 mt-2">{formatCurrency(reportData.monthlyCollections)}</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100">Recovery Rate</h5>
                    <p className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-2">{reportData.recoveryRate.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="h-48 bg-gray-50 dark:bg-gray-900 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600">
                  <div className="text-center">
                    <DollarSign className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                    <p className="text-gray-500 dark:text-gray-400">Collections trends and analysis</p>
                  </div>
                </div>
              </div>
            )}

            {selectedReport === 'borrowers' && (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100">Total Borrowers</h5>
                    <p className="text-2xl font-bold text-primary-600 dark:text-primary-400 mt-2">{reportData.activeBorrowers}</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100">Average Loan Amount</h5>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">{formatCurrency(reportData.avgLoanSize)}</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100">Avg Loan Term</h5>
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-2">{Math.round(reportData.avgTerm)} months</p>
                  </div>
                </div>
                <div className="h-48 bg-gray-50 dark:bg-gray-900 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600">
                  <div className="text-center">
                    <Users className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                    <p className="text-gray-500 dark:text-gray-400">Borrower demographics and behavior analysis</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Advanced analytics charts would be displayed here</p>
                  </div>
                </div>
              </div>
            )}

            {selectedReport === 'financial' && (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100">Total Disbursed</h5>
                    <p className="text-2xl font-bold text-primary-600 dark:text-primary-400 mt-2">{formatCurrency(reportData.totalPortfolioValue)}</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100">Total Collections</h5>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">{formatCurrency(reportData.monthlyCollections)}</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100">Net Revenue</h5>
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-2">{formatCurrency(reportData.monthlyCollections * 0.15)}</p>
                  </div>
                </div>
                <div className="h-48 bg-gray-50 dark:bg-gray-900 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600">
                  <div className="text-center">
                    <FileText className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                    <p className="text-gray-500 dark:text-gray-400">Income statement and financial performance</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Profit & loss charts would be displayed here</p>
                  </div>
                </div>
              </div>
            )}

            {selectedReport === 'risk' && (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100">Default Rate</h5>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-2">{reportData.defaultRate.toFixed(1)}%</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100">Collection Rate</h5>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">{reportData.collectionRate.toFixed(1)}%</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100">Recovery Rate</h5>
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-2">{reportData.recoveryRate.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="h-48 bg-gray-50 dark:bg-gray-900 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600">
                  <div className="text-center">
                    <PieChart className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                    <p className="text-gray-500 dark:text-gray-400">Risk assessment and portfolio analysis</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Risk metrics and trends would be displayed here</p>
                  </div>
                </div>
              </div>
            )}

            {/* Export Options */}
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Export Options</h4>
              <div className="flex space-x-3">
                <button 
                  onClick={exportToExcel}
                  className="px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-800 flex items-center"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Excel
                </button>
                <button 
                  onClick={exportToPDF}
                  className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 flex items-center"
                >
                  <Download className="h-4 w-4 mr-2" />
                  PDF
                </button>
                <button 
                  onClick={exportToCSV}
                  className="px-4 py-2 bg-primary-600 dark:bg-primary-700 text-white rounded-lg hover:bg-primary-700 dark:hover:bg-primary-800 flex items-center"
                >
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Reports */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Reports</h3>
        <div className="space-y-3">
          {[
            { name: 'Monthly Business Overview - October 2025', date: '2025-10-09', type: 'PDF', size: '2.4 MB' },
            { name: 'Loan Portfolio Analysis - Q3 2025', date: '2025-10-01', type: 'Excel', size: '1.8 MB' },
            { name: 'Collections Report - September 2025', date: '2025-09-30', type: 'PDF', size: '1.2 MB' },
          ].map((report, index) => (
            <div key={index} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
              <div className="flex items-center">
                <FileText className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-3" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{report.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Generated on {new Date(report.date).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-500 dark:text-gray-400">{report.type} • {report.size}</span>
                <button className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">
                  <Download className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Reports;
