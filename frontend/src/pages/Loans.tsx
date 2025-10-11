import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Calendar,
  DollarSign,
  User,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  Edit,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Grid,
  List,
  SortAsc,
  SortDesc,
  MoreVertical
} from 'lucide-react';
import NewApplicationModal from '../components/modals/NewApplicationModal';
import DeleteButton from '../components/DeleteButton';

// Updated interface to match API response
interface Loan {
  id: string;
  loanId: string;
  borrowerId: string;
  principal: number;
  termMonths: number;
  interestRate: number;
  status: string;
  disbursedAt: string | null;
  nextPaymentDate: string | null;
  outstandingBalance: number;
  totalInterest: number;
  totalAmount: number;
  borrower: {
    id?: string;
    borrowerId?: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  };
  // Legacy fields for compatibility
  customerName?: string;
  amount?: number;
  term?: number;
  dueDate?: string;
  projectedProfits?: number;
  realizedProfits?: number;
  profit?: number;
}

const Loans: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isNewApplicationModalOpen, setIsNewApplicationModalOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Edit form states
  const [editStatus, setEditStatus] = useState('');
  const [graceDays, setGraceDays] = useState(0);
  const [overdueEnabled, setOverdueEnabled] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  
  // View and display states
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<'customerName' | 'principal' | 'status' | 'nextPaymentDate' | 'outstandingBalance' | 'originationDate'>('originationDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = viewMode === 'grid' ? 9 : 12;

  // Calculate actual loan status based on logic
  const calculateActualStatus = (loan: Loan): { status: string; isOverdue: boolean; daysOverdue: number } => {
    const today = new Date();
    
    // Parse outstanding balance - handle various formats
    const outstandingBalance = loan.outstandingBalance || 0;
    
    // If no outstanding balance, loan is completed/closed
    if (outstandingBalance <= 0) {
      return { status: 'Closed', isOverdue: false, daysOverdue: 0 };
    }
    
    // Calculate days overdue if there's a due date
    let isOverdue = false;
    let daysOverdue = 0;
    
    // Check both dueDate and nextPaymentDate fields
    const dueDateField = loan.dueDate || loan.nextPaymentDate;
    if (dueDateField) {
      const dueDate = new Date(dueDateField);
      
      // Only calculate overdue if date is valid
      if (!isNaN(dueDate.getTime())) {
        const diffTime = today.getTime() - dueDate.getTime();
        daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        isOverdue = daysOverdue > 0;
      }
    }
    
    // Determine status based on conditions
    if (isOverdue && outstandingBalance > 0) {
      return { status: 'Overdue', isOverdue: true, daysOverdue };
    } else if (outstandingBalance > 0 && !isOverdue) {
      return { status: 'Active', isOverdue: false, daysOverdue: 0 };
    } else {
      return { status: 'Closed', isOverdue: false, daysOverdue: 0 };
    }
  };

  // Calculate overdue interest for overdue loans (compounding monthly)
  const calculateOverdueInterest = (loan: Loan): number => {
    const loanStatus = calculateActualStatus(loan);
    
    if (!loanStatus.isOverdue || loanStatus.daysOverdue <= 0) {
      return 0;
    }
    
    // Get the original outstanding balance at due date
    const principalBalance = loan.outstandingBalance || 0;
    if (principalBalance <= 0) return 0;
    
    // Use the loan's original interest rate for overdue calculations
    const monthlyRate = (loan.interestRate || 15) / 100; // Monthly rate (same as original loan)
    
    // Calculate number of complete months overdue (30 days = 1 month)
    const monthsOverdue = Math.floor(loanStatus.daysOverdue / 30);
    
    if (monthsOverdue <= 0) {
      return 0; // No interest charged until at least 1 month overdue
    }
    
    // Calculate compound interest for overdue months
    // Formula: A = P(1 + r)^t where P = principal, r = monthly rate, t = months
    // Example: 1,000,000 at 15% monthly for 2 months = 1,000,000 * (1.15)^2 = 1,322,500
    //          Overdue interest = 1,322,500 - 1,000,000 = 322,500
    const compoundAmount = principalBalance * Math.pow(1 + monthlyRate, monthsOverdue);
    const overdueInterest = compoundAmount - principalBalance;
    
    return overdueInterest;
  };

  // Helper functions to safely access loan calculation values
  const getOutstandingBalance = (loan: Loan): number => {
    const baseBalance = (typeof loan.outstandingBalance === 'number') 
      ? loan.outstandingBalance 
      : (loan.outstandingBalance || 0);
    
    // Add overdue interest to the base balance
    const overdueInterest = calculateOverdueInterest(loan);
    return baseBalance + overdueInterest;
  };

  // Get just the overdue interest for display purposes
  const getOverdueInterest = (loan: Loan): number => {
    return calculateOverdueInterest(loan);
  };

  // Get the base balance without overdue interest
  const getBaseBalance = (loan: Loan): number => {
    return (typeof loan.outstandingBalance === 'number') 
      ? loan.outstandingBalance 
      : (loan.outstandingBalance || 0);
  };

  // Get months overdue for display
  const getMonthsOverdue = (loan: Loan): number => {
    const loanStatus = calculateActualStatus(loan);
    return Math.floor(loanStatus.daysOverdue / 30);
  };

  const getProjectedProfits = (loan: Loan): number => {
    if (typeof loan.projectedProfits === 'number') return loan.projectedProfits;
    return loan.projectedProfits || 0;
  };

  const getRealizedProfits = (loan: Loan): number => {
    if (typeof loan.realizedProfits === 'number') return loan.realizedProfits;
    return loan.realizedProfits || 0;
  };

  const getTotalProfit = (loan: Loan): number => {
    if (typeof loan.profit === 'number') return loan.profit;
    return loan.profit || 0;
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getStatusBadge = (status: string, isOverdue: boolean = false) => {
    if (isOverdue || status === 'Overdue') {
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    }
    
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'Closed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'Completed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'Defaulted':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'Approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const getStatusIcon = (status: string, isOverdue: boolean = false) => {
    if (isOverdue || status === 'Overdue') {
      return <AlertTriangle className="h-4 w-4" />;
    }
    
    switch (status) {
      case 'Active':
        return <CheckCircle className="h-4 w-4" />;
      case 'Pending':
        return <Clock className="h-4 w-4" />;
      case 'Closed':
        return <CheckCircle className="h-4 w-4" />;
      case 'Completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'Defaulted':
        return <XCircle className="h-4 w-4" />;
      case 'Approved':
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  useEffect(() => {
    loadLoans();
  }, []);

  // Load loans function
  const loadLoans = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3002/api/loans');
      if (!response.ok) {
        throw new Error('Failed to fetch loans');
      }
      const loansData = await response.json();
      
      // Transform API data to include legacy fields for compatibility
      const transformedLoans = loansData.map((loan: any) => ({
        ...loan,
        customerName: `${loan.borrower.firstName} ${loan.borrower.lastName}`,
        amount: loan.principal,
        term: loan.termMonths,
        dueDate: loan.nextPaymentDate,
        projectedProfits: loan.totalInterest,
        realizedProfits: 0, // Will be calculated based on status
        profit: loan.totalInterest
      }));
      
      // Sort loans by most recent first
      const sortedLoans = transformedLoans.sort((a: any, b: any) => {
        const dateA = new Date(a.originationDate || a.createdAt || 0).getTime();
        const dateB = new Date(b.originationDate || b.createdAt || 0).getTime();
        return dateB - dateA; // Descending order (newest first)
      });
      
      setLoans(sortedLoans);
      console.log('Loaded loans:', sortedLoans);
      
      // Validate calculations for first few loans
      console.log('=== Loan Calculation Validation ===');
      transformedLoans.slice(0, 5).forEach((loan: Loan) => {
        console.log(`Validating loan ${loan.id}:`, loan);
        const loanStatus = calculateActualStatus(loan);
        const overdueInterest = calculateOverdueInterest(loan);
        const monthsOverdue = getMonthsOverdue(loan);
        console.log(`  Status: ${loanStatus.status}, Overdue: ${loanStatus.isOverdue}, Days: ${loanStatus.daysOverdue}, Months: ${monthsOverdue}`);
        console.log(`  Base Balance: ${getBaseBalance(loan)}, Overdue Interest: ${overdueInterest}, Total: ${getOutstandingBalance(loan)}`);
      });
      
    } catch (error) {
      console.error('Error loading loans:', error);
    } finally {
      setLoading(false);
    }
  };

  // Delete handlers
  const handleDeleteSuccess = (response: any) => {
    // Refresh the loans list after successful deletion
    loadLoans();
    console.log('Loan deleted successfully:', response.message);
  };

  const handleDeleteError = (error: Error) => {
    // Handle deletion error
    console.error('Failed to delete loan:', error.message);
  };

  // Reset pagination when search, filter, or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, sortBy, sortOrder]);

  // Action handlers
  const handleViewLoan = (loan: Loan) => {
    setSelectedLoan(loan);
    setIsViewModalOpen(true);
  };

  const handleEditLoan = (loan: Loan) => {
    setSelectedLoan(loan);
    // Initialize edit form with current loan data
    setEditStatus(loan.status);
    setGraceDays(0); // Default grace days
    setOverdueEnabled(true); // Default overdue tracking enabled
    setNotes('');
    setIsEditModalOpen(true);
  };

  const handleSaveLoanChanges = async () => {
    if (!selectedLoan) return;
    
    setSaving(true);
    try {
      // TODO: Implement actual API call to update loan
      const updates = {
        status: editStatus,
        graceDays: graceDays,
        overdueEnabled: overdueEnabled,
        notes: notes,
        updatedAt: new Date().toISOString()
      };
      
      console.log('Updating loan:', selectedLoan.loanId, updates);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update local state
      setLoans(prevLoans => 
        prevLoans.map(loan => 
          loan.id === selectedLoan.id 
            ? { ...loan, status: editStatus }
            : loan
        )
      );
      
      alert(`Loan ${selectedLoan.loanId} updated successfully!`);
      setIsEditModalOpen(false);
      
    } catch (error) {
      console.error('Error updating loan:', error);
      alert('Failed to update loan. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Calculate overdue statistics
  const overdueStats = loans.reduce((acc, loan) => {
    const { status, isOverdue, daysOverdue } = calculateActualStatus(loan);
    
    if (isOverdue || status === 'Overdue') {
      console.log(`Overdue loan detected: ${loan.id} - ${loan.customerName}, Days overdue: ${daysOverdue}, Status: ${status}`);
      acc.count += 1;
      acc.totalAmount += getOutstandingBalance(loan);
    }
    
    return acc;
  }, { count: 0, totalAmount: 0 });

  console.log(`Total overdue loans: ${overdueStats.count}, Total amount: ${overdueStats.totalAmount}`);

  // Filter and sort loans based on search term, status, and sorting preferences
  const filteredLoans = loans.filter(loan => {
    const matchesSearch = loan.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (loan.customerName || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    // Calculate the actual status for filtering
    const { status: actualStatus } = calculateActualStatus(loan);
    
    // Map filter values to include both original and calculated statuses
    let matchesStatus = false;
    if (statusFilter === 'All') {
      matchesStatus = true;
    } else if (statusFilter === 'Overdue') {
      matchesStatus = actualStatus === 'Overdue';
    } else {
      matchesStatus = loan.status === statusFilter || actualStatus === statusFilter;
    }
    
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    let aValue: any, bValue: any;
    
    switch (sortBy) {
      case 'customerName':
        aValue = (a.customerName || `${a.borrower.firstName} ${a.borrower.lastName}`).toLowerCase();
        bValue = (b.customerName || `${b.borrower.firstName} ${b.borrower.lastName}`).toLowerCase();
        break;
      case 'principal':
        aValue = a.principal;
        bValue = b.principal;
        break;
      case 'status':
        aValue = calculateActualStatus(a).status;
        bValue = calculateActualStatus(b).status;
        break;
      case 'nextPaymentDate':
        aValue = new Date(a.nextPaymentDate || '1970-01-01');
        bValue = new Date(b.nextPaymentDate || '1970-01-01');
        break;
      case 'outstandingBalance':
        aValue = getOutstandingBalance(a);
        bValue = getOutstandingBalance(b);
        break;
      case 'originationDate':
        aValue = new Date(a.disbursedAt || '1970-01-01');
        bValue = new Date(b.disbursedAt || '1970-01-01');
        break;
      default:
        return 0;
    }
    
    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredLoans.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentLoans = filteredLoans.slice(startIndex, endIndex);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Loans</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage and track all loan accounts
          </p>
        </div>
        <button
          onClick={() => setIsNewApplicationModalOpen(true)}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Loan
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-800">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
              <DollarSign className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Amount</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatAmount(loans.reduce((sum, loan) => sum + (loan.amount || loan.principal), 0))}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-800">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Overdue</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {overdueStats.count}
              </p>
              <p className="text-sm text-red-600 dark:text-red-400">
                {formatAmount(overdueStats.totalAmount)}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-800">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <CheckCircle className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Loans</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {loans.filter(loan => {
                  const status = calculateActualStatus(loan);
                  return status.status === 'Active';
                }).length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-800">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
              <Clock className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Pending</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {loans.filter(loan => loan.status === 'PENDING').length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-800">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
              <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Profit</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatAmount(loans.reduce((sum, loan) => sum + getTotalProfit(loan), 0))}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search, Filter, and Controls */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search by Loan ID or Customer Name..."
                className="pl-10 pr-4 py-2 w-full border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center space-x-2 px-4 py-2 border rounded-lg transition-colors ${
                showFilters 
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' 
                  : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              {statusFilter !== 'All' && (
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">1</span>
              )}
            </button>
            
            <div className="flex items-center border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 transition-colors ${viewMode === 'table' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                title="Table View"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                title="Grid View"
              >
                <Grid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        
        {/* Expandable filters */}
        {showFilters && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 animate-in slide-in-from-top duration-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="All">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="DISBURSED">Active</option>
                  <option value="Overdue">Overdue</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sort By</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                >
                  <option value="customerName">Customer Name</option>
                  <option value="principal">Amount</option>
                  <option value="status">Status</option>
                  <option value="nextPaymentDate">Next Payment</option>
                  <option value="outstandingBalance">Outstanding Balance</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Order</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Loans Content */}
      {viewMode === 'table' ? (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow border border-gray-200 dark:border-gray-800">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Loan Records ({filteredLoans.length} loans)
            </h3>
            
            {filteredLoans.length === 0 ? (
              <div className="text-center py-8">
                <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No loans found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        LOAN DETAILS
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => handleSort('customerName')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>CUSTOMER</span>
                          {sortBy === 'customerName' && (
                            sortOrder === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => handleSort('principal')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>AMOUNT</span>
                          {sortBy === 'principal' && (
                            sortOrder === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => handleSort('nextPaymentDate')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>DATES</span>
                          {sortBy === 'nextPaymentDate' && (
                            sortOrder === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => handleSort('status')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>STATUS</span>
                          {sortBy === 'status' && (
                            sortOrder === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        ACTIONS
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {currentLoans.map((loan) => {
                      const { status: actualStatus, isOverdue } = calculateActualStatus(loan);
                      return (
                        <tr key={loan.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              ID: {loan.loanId}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              Term: {loan.termMonths} months
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {loan.customerName || `${loan.borrower.firstName} ${loan.borrower.lastName}`}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {loan.borrower.phone}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {formatAmount(loan.principal)}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {(() => {
                                const loanStatus = calculateActualStatus(loan);
                                const baseBalance = getBaseBalance(loan);
                                const overdueInterest = getOverdueInterest(loan);
                                const totalBalance = getOutstandingBalance(loan);
                                
                                if (loanStatus.isOverdue && overdueInterest > 0) {
                                  return (
                                    <div>
                                      <div>Balance: {formatAmount(totalBalance)}</div>
                                      <div className="text-red-600 dark:text-red-400 text-xs">
                                        +{formatAmount(overdueInterest)} overdue interest
                                      </div>
                                    </div>
                                  );
                                } else {
                                  return `Balance: ${formatAmount(totalBalance)}`;
                                }
                              })()}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-white">
                              <div className="text-sm">
                                Disbursed: {
                                  loan.disbursedAt 
                                    ? new Date(loan.disbursedAt).toLocaleDateString() 
                                    : (loan.status === 'APPROVED' || loan.status === 'PENDING' 
                                        ? 'Pending' 
                                        : 'N/A')
                                }
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                Next Payment: {
                                  loan.nextPaymentDate 
                                    ? new Date(loan.nextPaymentDate).toLocaleDateString() 
                                    : (actualStatus === 'Closed' || loan.status === 'COMPLETED' 
                                        ? 'Completed' 
                                        : 'N/A')
                                }
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(actualStatus, isOverdue)}`}>
                              {getStatusIcon(actualStatus, isOverdue)}
                              <span className="ml-1">{actualStatus}</span>
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <button 
                                onClick={() => handleViewLoan(loan)}
                                className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                                title="View Loan"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button 
                                onClick={() => handleEditLoan(loan)}
                                className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                                title="Edit Loan"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <DeleteButton
                                entityType="loan"
                                entityId={loan.id}
                                entityData={loan}
                                variant="icon"
                                onSuccess={handleDeleteSuccess}
                                onError={handleDeleteError}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Table Pagination */}
            {filteredLoans.length > 0 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                      <span className="font-medium">{Math.min(endIndex, filteredLoans.length)}</span> of{' '}
                      <span className="font-medium">{filteredLoans.length}</span> results
                    </p>
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                      <button
                        onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">Previous</span>
                        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                      </button>
                      
                      {[...Array(totalPages)].map((_, index) => {
                        const page = index + 1;
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                              page === currentPage
                                ? 'z-10 bg-primary-50 dark:bg-primary-900 border-primary-500 text-primary-600 dark:text-primary-400'
                                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      })}
                      
                      <button
                        onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">Next</span>
                        <ChevronRight className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        // Grid View
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Loan Records ({filteredLoans.length} loans)
            </h3>
          </div>
          
          {filteredLoans.length === 0 ? (
            <div className="text-center py-12">
              <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No loans found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {currentLoans.map((loan) => {
                const { status: actualStatus, isOverdue } = calculateActualStatus(loan);
                return (
                  <div key={loan.id} className="bg-white dark:bg-gray-900 rounded-lg shadow border border-gray-200 dark:border-gray-800 p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                          {loan.customerName || `${loan.borrower.firstName} ${loan.borrower.lastName}`}
                        </h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">ID: {loan.loanId}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button 
                          onClick={() => handleViewLoan(loan)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleEditLoan(loan)}
                          className="text-green-600 hover:text-green-900 dark:text-green-400"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <DeleteButton
                          entityType="loan"
                          entityId={loan.id}
                          entityData={loan}
                          variant="icon"
                          onSuccess={handleDeleteSuccess}
                          onError={handleDeleteError}
                        />
                      </div>
                    </div>
                    
                    <div className="mt-4 space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Amount:</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatAmount(loan.principal)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Balance:</span>
                        <div className="text-right">
                          {(() => {
                            const loanStatus = calculateActualStatus(loan);
                            const baseBalance = getBaseBalance(loan);
                            const overdueInterest = getOverdueInterest(loan);
                            const totalBalance = getOutstandingBalance(loan);
                            
                            if (loanStatus.isOverdue && overdueInterest > 0) {
                              return (
                                <div className="space-y-1">
                                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                                    {formatAmount(totalBalance)}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    Principal: {formatAmount(baseBalance)}
                                  </div>
                                  <div className="text-xs text-red-600 dark:text-red-400">
                                    Overdue Interest: {formatAmount(overdueInterest)}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    ({getMonthsOverdue(loan)} months overdue)
                                  </div>
                                </div>
                              );
                            } else {
                              return (
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                  {formatAmount(totalBalance)}
                                </span>
                              );
                            }
                          })()}
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Next Payment:</span>
                        <span className="text-sm text-gray-900 dark:text-white">
                          {
                            loan.nextPaymentDate 
                              ? new Date(loan.nextPaymentDate).toLocaleDateString() 
                              : (actualStatus === 'Closed' || loan.status === 'COMPLETED' 
                                  ? 'Completed' 
                                  : 'N/A')
                          }
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Status:</span>
                        <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(actualStatus, isOverdue)}`}>
                          {getStatusIcon(actualStatus, isOverdue)}
                          <span className="ml-1">{actualStatus}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Grid Pagination */}
          {filteredLoans.length > 0 && (
            <div className="flex items-center justify-center space-x-2">
              <button
                onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
                disabled={currentPage === 1}
                className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </button>
              
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Page {currentPage} of {totalPages}
              </span>
              
              <button
                onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* View Loan Modal */}
      {isViewModalOpen && selectedLoan && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-5 mx-auto p-6 border w-11/12 max-w-6xl shadow-lg rounded-lg bg-white dark:bg-gray-800 max-h-screen overflow-y-auto">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Loan Details - {selectedLoan.loanId}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Complete loan information and status
                  </p>
                </div>
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              {/* Status Banner */}
              {(() => {
                const { status: actualStatus, isOverdue, daysOverdue } = calculateActualStatus(selectedLoan);
                const isActive = actualStatus === 'Active';
                const isClosed = actualStatus === 'Closed';
                
                return (
                  <div className={`p-4 rounded-lg border-l-4 ${
                    isOverdue 
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-500' 
                      : isActive 
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-500'
                        : isClosed
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400 dark:border-blue-500'
                          : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 dark:border-yellow-500'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        {getStatusIcon(actualStatus, isOverdue)}
                        <div className="ml-3">
                          <h4 className={`text-sm font-medium ${
                            isOverdue 
                              ? 'text-red-800 dark:text-red-200' 
                              : isActive 
                                ? 'text-green-800 dark:text-green-200'
                                : isClosed
                                  ? 'text-blue-800 dark:text-blue-200'
                                  : 'text-yellow-800 dark:text-yellow-200'
                          }`}>
                            {actualStatus} 
                            {isOverdue && ` (${daysOverdue} days overdue)`}
                          </h4>
                          <p className={`text-xs ${
                            isOverdue 
                              ? 'text-red-600 dark:text-red-300' 
                              : isActive 
                                ? 'text-green-600 dark:text-green-300'
                                : isClosed
                                  ? 'text-blue-600 dark:text-blue-300'
                                  : 'text-yellow-600 dark:text-yellow-300'
                          }`}>
                            {isOverdue 
                              ? 'Immediate attention required' 
                              : isActive 
                                ? 'Payments are current'
                                : isClosed
                                  ? 'Loan has been completed'
                                  : 'Awaiting action'
                            }
                          </p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-3 py-1 text-sm font-semibold rounded-full ${getStatusBadge(actualStatus, isOverdue)}`}>
                        {actualStatus}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Column - Core Loan Details */}
                <div className="lg:col-span-2 space-y-6">
                  
                  {/* Loan Information */}
                  <div className="bg-gray-50 dark:bg-gray-700 p-5 rounded-lg">
                    <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                      <DollarSign className="h-5 w-5 mr-2 text-green-600" />
                      Loan Information
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Loan ID</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{selectedLoan.loanId}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Principal Amount</span>
                        <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">{formatAmount(selectedLoan.principal)}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Loan Term</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{selectedLoan.termMonths} months</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Interest Rate</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{(selectedLoan.interestRate * 100).toFixed(1)}% per month</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Interest</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{formatAmount(selectedLoan.totalInterest)}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Amount</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{formatAmount(selectedLoan.totalAmount)}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Monthly Payment</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{formatAmount(selectedLoan.totalAmount / selectedLoan.termMonths)}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Outstanding Balance</span>
                        {(() => {
                          const loanStatus = calculateActualStatus(selectedLoan);
                          const baseBalance = getBaseBalance(selectedLoan);
                          const overdueInterest = getOverdueInterest(selectedLoan);
                          const totalBalance = getOutstandingBalance(selectedLoan);
                          
                          if (loanStatus.isOverdue && overdueInterest > 0) {
                            return (
                              <div className="mt-1">
                                <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatAmount(totalBalance)}</p>
                                <div className="mt-2 space-y-1">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-600 dark:text-gray-300">Principal:</span>
                                    <span className="font-medium">{formatAmount(baseBalance)}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-red-600 dark:text-red-400">Overdue Interest:</span>
                                    <span className="font-medium text-red-600 dark:text-red-400">{formatAmount(overdueInterest)}</span>
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {getMonthsOverdue(selectedLoan)} months overdue ({loanStatus.daysOverdue} days)
                                  </div>
                                </div>
                              </div>
                            );
                          } else {
                            return (
                              <p className="text-lg font-bold text-red-600 dark:text-red-400 mt-1">{formatAmount(totalBalance)}</p>
                            );
                          }
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Payment Information */}
                  <div className="bg-gray-50 dark:bg-gray-700 p-5 rounded-lg">
                    <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                      <Calendar className="h-5 w-5 mr-2 text-blue-600" />
                      Payment Information
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Loan Created</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                          {selectedLoan.disbursedAt ? new Date(selectedLoan.disbursedAt).toLocaleDateString('en-US', { 
                            year: 'numeric', month: 'long', day: 'numeric' 
                          }) : 'Date not available'}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Disbursed Date</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                          {selectedLoan.disbursedAt 
                            ? new Date(selectedLoan.disbursedAt).toLocaleDateString('en-US', { 
                                year: 'numeric', month: 'long', day: 'numeric' 
                              }) 
                            : (selectedLoan.status === 'APPROVED' || selectedLoan.status === 'PENDING'
                                ? 'Pending Disbursement'
                                : 'Not yet disbursed')
                          }
                        </p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Next Payment Date</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                          {selectedLoan.nextPaymentDate 
                            ? new Date(selectedLoan.nextPaymentDate).toLocaleDateString('en-US', { 
                                year: 'numeric', month: 'long', day: 'numeric' 
                              }) 
                            : (calculateActualStatus(selectedLoan).status === 'Closed' || selectedLoan.status === 'COMPLETED'
                                ? 'Loan Completed'
                                : 'No payment scheduled')
                          }
                        </p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Next Payment Amount</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                          {formatAmount(selectedLoan.totalAmount / selectedLoan.termMonths)}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Disbursed Amount</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                          {formatAmount(selectedLoan.principal)}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Last Updated</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                          {selectedLoan.disbursedAt ? new Date(selectedLoan.disbursedAt).toLocaleDateString('en-US', { 
                            year: 'numeric', month: 'long', day: 'numeric' 
                          }) : 'Not updated'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Profit Analysis */}
                  <div className="bg-gray-50 dark:bg-gray-700 p-5 rounded-lg">
                    <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                      <TrendingUp className="h-5 w-5 mr-2 text-green-600" />
                      Profit Analysis
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Projected Profits</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{formatAmount(getProjectedProfits(selectedLoan))}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Realized Profits</span>
                        <p className="text-sm font-semibold text-green-600 dark:text-green-400 mt-1">{formatAmount(getRealizedProfits(selectedLoan))}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Profit</span>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400 mt-1">{formatAmount(getTotalProfit(selectedLoan))}</p>
                      </div>
                    </div>
                    <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-md">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-green-800 dark:text-green-200">Profit Margin</span>
                        <span className="text-sm font-bold text-green-800 dark:text-green-200">
                          {((getTotalProfit(selectedLoan) / selectedLoan.principal) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column - Borrower & Status */}
                <div className="space-y-6">
                  
                  {/* Borrower Information */}
                  <div className="bg-gray-50 dark:bg-gray-700 p-5 rounded-lg">
                    <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                      <User className="h-5 w-5 mr-2 text-purple-600" />
                      Borrower Information
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Full Name</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                          {selectedLoan.customerName || `${selectedLoan.borrower.firstName} ${selectedLoan.borrower.lastName}`}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Phone Number</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                          <a href={`tel:${selectedLoan.borrower.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                            {selectedLoan.borrower.phone}
                          </a>
                        </p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Email Address</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                          {selectedLoan.borrower.email ? (
                            <a href={`mailto:${selectedLoan.borrower.email}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                              {selectedLoan.borrower.email}
                            </a>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400">Not provided</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Borrower ID</span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                          {selectedLoan.borrower?.borrowerId || selectedLoan.borrowerId || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Loan Notes */}
                  <div className="bg-gray-50 dark:bg-gray-700 p-5 rounded-lg">
                    <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Loan Notes</h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {selectedLoan.status === 'Active' ? 'Loan is currently active with regular payment schedule.' :
                       selectedLoan.status === 'Closed' ? 'Loan has been successfully completed.' :
                       'Loan status requires attention.'}
                    </p>
                  </div>

                  {/* Quick Actions */}
                  <div className="bg-gray-50 dark:bg-gray-700 p-5 rounded-lg">
                    <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Quick Actions</h4>
                    <div className="space-y-2">
                      <button className="w-full text-left px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors">
                        📞 Call Borrower
                      </button>
                      <button className="w-full text-left px-3 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors">
                        💰 Record Payment
                      </button>
                      <button className="w-full text-left px-3 py-2 text-sm text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-md transition-colors">
                        📄 Generate Statement
                      </button>
                      <button className="w-full text-left px-3 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md transition-colors">
                        📈 View Payment History
                      </button>
                    </div>
                  </div>

                  {/* Risk Assessment */}
                  <div className="bg-gray-50 dark:bg-gray-700 p-5 rounded-lg">
                    <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Risk Assessment</h4>
                    {(() => {
                      const { status: actualStatus, isOverdue, daysOverdue } = calculateActualStatus(selectedLoan);
                      const outstandingBalance = getOutstandingBalance(selectedLoan);
                      const riskLevel = isOverdue && daysOverdue > 30 ? 'High' : isOverdue ? 'Medium' : outstandingBalance > 0 ? 'Low' : 'None';
                      const riskColor = riskLevel === 'High' ? 'red' : riskLevel === 'Medium' ? 'yellow' : riskLevel === 'Low' ? 'green' : 'blue';
                      
                      return (
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600 dark:text-gray-400">Risk Level</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              riskColor === 'red' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                              riskColor === 'yellow' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                              riskColor === 'green' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                              'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            }`}>
                              {riskLevel}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {riskLevel === 'High' && 'Loan is significantly overdue and requires immediate attention'}
                            {riskLevel === 'Medium' && 'Loan is overdue but within manageable range'}
                            {riskLevel === 'Low' && 'Active loan with regular payment schedule'}
                            {riskLevel === 'None' && 'Loan completed successfully'}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex justify-between pt-6 border-t border-gray-200 dark:border-gray-600">
                <div className="flex space-x-3">
                  <button
                    onClick={() => setIsViewModalOpen(false)}
                    className="px-6 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                  >
                    Close
                  </button>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={() => window.print()}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Print Details
                  </button>
                  <button
                    onClick={() => {
                      setIsViewModalOpen(false);
                      setIsEditModalOpen(true);
                    }}
                    className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                  >
                    Edit Loan
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Loan Modal */}
      {isEditModalOpen && selectedLoan && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-2/3 xl:w-1/2 shadow-lg rounded-md bg-white dark:bg-gray-800 max-h-screen overflow-y-auto">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Edit Loan - {selectedLoan.loanId}
                </h3>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>
              
              {/* Current Loan Summary */}
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mb-6">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Current Loan Details</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Amount:</span>
                    <p className="font-medium text-gray-900 dark:text-white">{formatAmount(selectedLoan.principal)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Term:</span>
                    <p className="font-medium text-gray-900 dark:text-white">{selectedLoan.termMonths} months</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Balance:</span>
                    {(() => {
                      const loanStatus = calculateActualStatus(selectedLoan);
                      const baseBalance = getBaseBalance(selectedLoan);
                      const overdueInterest = getOverdueInterest(selectedLoan);
                      const totalBalance = getOutstandingBalance(selectedLoan);
                      
                      if (loanStatus.isOverdue && overdueInterest > 0) {
                        return (
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{formatAmount(totalBalance)}</p>
                            <p className="text-xs text-red-600 dark:text-red-400">
                              +{formatAmount(overdueInterest)} overdue interest
                            </p>
                          </div>
                        );
                      } else {
                        return (
                          <p className="font-medium text-gray-900 dark:text-white">{formatAmount(totalBalance)}</p>
                        );
                      }
                    })()}
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Customer:</span>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {selectedLoan.customerName || `${selectedLoan.borrower.firstName} ${selectedLoan.borrower.lastName}`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Edit Form */}
              <div className="space-y-6">
                {/* Status Management */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Loan Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  >
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="DISBURSED">Active/Disbursed</option>
                    <option value="CLOSED">Closed/Completed</option>
                    <option value="DEFAULTED">Defaulted</option>
                    <option value="RESTRUCTURED">Restructured</option>
                    <option value="WRITTEN_OFF">Written Off</option>
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Current status: <span className="font-medium">{selectedLoan.status}</span>
                  </p>
                </div>

                {/* Grace Days for Overdue Loans */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Grace Days
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="number"
                      value={graceDays}
                      onChange={(e) => setGraceDays(parseInt(e.target.value) || 0)}
                      min="0"
                      max="90"
                      className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">days</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Additional days before marking as overdue (0-90 days)
                  </p>
                </div>

                {/* Overdue Tracking */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Overdue Tracking
                  </label>
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="overdueEnabled"
                        checked={overdueEnabled}
                        onChange={(e) => setOverdueEnabled(e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="overdueEnabled" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        Enable overdue tracking for this loan
                      </label>
                    </div>
                    
                    {!overdueEnabled && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md p-3">
                        <div className="flex">
                          <AlertTriangle className="h-5 w-5 text-yellow-400 mr-2 flex-shrink-0 mt-0.5" />
                          <div>
                            <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                              Overdue Tracking Disabled
                            </h4>
                            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                              This loan will not appear in overdue reports even if payments are late. 
                              Use this for restructured loans or special arrangements.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status-specific Options */}
                {editStatus === 'RESTRUCTURED' && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-md p-4">
                    <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                      Loan Restructuring
                    </h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                      Restructuring will modify the payment terms. Grace days will be automatically applied.
                    </p>
                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input type="checkbox" className="h-4 w-4 text-blue-600 rounded" defaultChecked />
                        <span className="ml-2 text-sm text-blue-700 dark:text-blue-300">Reset overdue counter</span>
                      </label>
                      <label className="flex items-center">
                        <input type="checkbox" className="h-4 w-4 text-blue-600 rounded" defaultChecked />
                        <span className="ml-2 text-sm text-blue-700 dark:text-blue-300">Apply grace period</span>
                      </label>
                    </div>
                  </div>
                )}

                {editStatus === 'WRITTEN_OFF' && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md p-4">
                    <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                      ⚠️ Write Off Confirmation
                    </h4>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      This action will mark the loan as uncollectible. The outstanding balance will be written off 
                      for accounting purposes. This action should only be taken after all collection efforts have been exhausted.
                    </p>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Add notes about this status change..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Document the reason for this change (recommended)
                  </p>
                </div>

                {/* Current Status Info */}
                {(() => {
                  const { status: actualStatus, isOverdue, daysOverdue } = calculateActualStatus(selectedLoan);
                  return isOverdue ? (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md p-4">
                      <div className="flex items-center">
                        <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
                        <div>
                          <h4 className="text-sm font-medium text-red-800 dark:text-red-200">
                            Currently Overdue
                          </h4>
                          <p className="text-sm text-red-700 dark:text-red-300">
                            This loan is {daysOverdue} days overdue. Adding grace days will extend the payment deadline.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
              
              {/* Action Buttons */}
              <div className="flex justify-end mt-8 pt-6 border-t border-gray-200 dark:border-gray-600 space-x-3">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-400 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveLoanChanges}
                  disabled={saving || !editStatus}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Application Modal */}
      <NewApplicationModal
        isOpen={isNewApplicationModalOpen}
        onClose={() => setIsNewApplicationModalOpen(false)}
      />
    </div>
  );
};

export default Loans;