import React, { useState, useEffect } from 'react';
import { Search, User, DollarSign, CheckCircle, Clock, AlertTriangle, Receipt, CreditCard, Eye, Download, Plus, X, Save } from 'lucide-react';
import { databaseService } from '../services/databaseService';
import type { RepaymentData, LoanData, BorrowerData } from '../services/databaseService';
import { formatDate } from '../utils/dateUtils';
import jsPDF from 'jspdf';

// Enhanced repayment interface for display
interface EnhancedRepaymentData extends RepaymentData {
  loanStatus?: string;
  outstandingBalance?: string;
  customerName: string;
  customerId?: string;
  loanDisplayId?: string;
  hasLoanData?: boolean;
  hasBorrowerData?: boolean;
  dataSource?: string;
  borrowerPhone?: string;
  borrowerEmail?: string;
}

const Repayments = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [repayments, setRepayments] = useState<RepaymentData[]>([]);
  const [loans, setLoans] = useState<LoanData[]>([]);
  const [borrowers, setBorrowers] = useState<BorrowerData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 12;
  
  // Modal states for actions
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedRepayment, setSelectedRepayment] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Manual payment modal states
  const [isAddPaymentModalOpen, setIsAddPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    customerName: '',
    customerId: '',
    loanId: '',
    amount: '',
    paymentMethod: 'Cash',
    paymentDate: new Date().toISOString().split('T')[0],
    notes: ''
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Use direct API calls to get enhanced data
        const [repaymentResponse, loansResponse, borrowersResponse] = await Promise.all([
          fetch('http://localhost:3002/api/repayments'),
          fetch('http://localhost:3002/api/loans'),
          fetch('http://localhost:3002/api/borrowers')
        ]);
        
        const repaymentData = await repaymentResponse.json();
        const loansData = await loansResponse.json();
        const borrowersData = await borrowersResponse.json();
        
        // Extract data from response objects (handle both wrapped and unwrapped responses)
        const repayments = repaymentData?.data || repaymentData || [];
        const loans = loansData?.data || loansData || [];
        const borrowers = borrowersData?.data?.borrowers || borrowersData?.data || borrowersData || [];
        
        setRepayments(Array.isArray(repayments) ? repayments : []);
        setLoans(Array.isArray(loans) ? loans : []);
        setBorrowers(Array.isArray(borrowers) ? borrowers : []);
        
        console.log('📊 Repayments loaded:', repayments.length);
        console.log('💰 Loans loaded:', loans.length);
        console.log('👥 Borrowers loaded:', borrowers.length);
        
        // Debug: Log sample data to verify correlation
        if (repayments.length > 0) {
          console.log('💳 Sample repayment:', {
            id: repayments[0].id,
            receiptNumber: repayments[0].receiptNumber,
            amount: repayments[0].amount,
            customerName: repayments[0].customerName,
            loanReference: repayments[0].loanReference,
            borrowerId: repayments[0].borrowerId,
            date: repayments[0].paidAt
          });
        }
        
        if (borrowers.length > 0) {
          console.log('👤 Sample borrower:', {
            id: borrowers[0].id,
            borrowerId: borrowers[0].borrowerId,
            name: `${borrowers[0].firstName} ${borrowers[0].lastName}`,
            phone: borrowers[0].phone
          });
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Reset pagination when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  // Format UGX currency
  const formatUGX = (amount: number) => {
    return `UGX ${amount.toLocaleString()}`;
  };

  // Enhanced repayment function with loan status
  const getEnhancedRepayments = (): EnhancedRepaymentData[] => {
    // Safety check: ensure repayments is an array
    if (!Array.isArray(repayments)) {
      console.warn('⚠️ Repayments is not an array:', typeof repayments, repayments);
      return [];
    }
    
    return repayments.map(repayment => {
      // Check if the repayment data already has the enhanced fields from the backend
      if (repayment.customerName && repayment.loanReference) {
        // Use the backend-provided enhanced data directly
        return {
          ...repayment,
          loanStatus: repayment.loanStatus || 'Active',
          outstandingBalance: formatUGX(repayment.remainingBalance || 0),
          customerName: repayment.customerName,
          customerId: repayment.borrower?.borrowerId || repayment.borrowerId,
          loanDisplayId: repayment.loanReference,
          hasLoanData: true,
          hasBorrowerData: true,
          dataSource: 'api',
          borrowerPhone: repayment.borrower?.phone || repayment.customerPhone || 'N/A',
          borrowerEmail: repayment.borrower?.email || 'N/A'
        };
      }

      // Fallback to legacy logic for backwards compatibility
      const borrower = borrowers.find(b => 
        b.id === repayment.borrowerId ||
        b.borrowerId === repayment.borrowerId ||
        `${b.firstName} ${b.lastName}`.toLowerCase() === repayment.borrowerId.toLowerCase() ||
        `${b.firstName} ${b.lastName}`.toLowerCase().includes(repayment.borrowerId.toLowerCase()) ||
        repayment.borrowerId.toLowerCase().includes(`${b.firstName} ${b.lastName}`.toLowerCase())
      );
      
      // Then try to find related loan for status and balance
      const relatedLoan = loans.find(loan => 
        loan.loanId === repayment.loanId ||
        loan.borrowerId === repayment.borrowerId ||
        (borrower && loan.borrowerId === borrower.borrowerId)
      );
      
      // Calculate actual loan status based on outstanding balance
      let actualStatus = 'Active';
      let formattedBalance = 'UGX 0';
      
      if (relatedLoan) {
        const outstanding = relatedLoan.outstandingBalance; // already a number
        formattedBalance = formatUGX(outstanding);
        
        if (outstanding <= 0) {
          actualStatus = 'Paid Off';
        } else if (relatedLoan.status === 'Overdue') {
          actualStatus = 'Overdue';
        }
      }

      // Determine the best customer name to display
      let customerName = repayment.borrowerId; // fallback
      let customerId = repayment.borrowerId;
      let loanDisplayId = repayment.loanId;
      let dataSource = 'id'; // track data source for debugging
      
      if (borrower) {
        customerName = `${borrower.firstName} ${borrower.lastName}`;
        customerId = borrower.borrowerId;
        dataSource = 'borrower';
      } else if (relatedLoan?.borrower) {
        customerName = `${relatedLoan.borrower.firstName} ${relatedLoan.borrower.lastName}`;
        customerId = relatedLoan.borrower.borrowerId;
        dataSource = 'loan';
      }
      
      if (relatedLoan) {
        loanDisplayId = relatedLoan.loanId;
      }

      return {
        ...repayment,
        loanStatus: actualStatus,
        outstandingBalance: formattedBalance,
        customerName: customerName,
        customerId: customerId,
        loanDisplayId: loanDisplayId,
        hasLoanData: !!relatedLoan,
        hasBorrowerData: !!borrower,
        dataSource: dataSource,
        borrowerPhone: borrower?.phone || 'N/A',
        borrowerEmail: borrower?.email || 'N/A'
      };
    });
  };

  // Filter and sort repayments
  const filteredRepayments = getEnhancedRepayments()
    .filter(repayment => {
      const loanSearchId = repayment.loanDisplayId || repayment.loanReference || repayment.loanId;
      const customerSearchId = repayment.customerId || repayment.borrower?.borrowerId || repayment.borrowerId;
      
      const matchesSearch = loanSearchId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           repayment.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           repayment.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           customerSearchId.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'All' || repayment.loanStatus === statusFilter;
      
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      // Sort by loan ID (using the display-friendly loan ID)
      const loanIdA = a.loanDisplayId || a.loanReference || a.loanId;
      const loanIdB = b.loanDisplayId || b.loanReference || b.loanId;
      
      // Extract numeric part for proper sorting (e.g., LOAN0001 -> 1)
      const extractNumber = (id: string) => {
        const match = id.match(/(\d+)/);
        return match ? parseInt(match[0]) : 0;
      };
      
      const numA = extractNumber(loanIdA);
      const numB = extractNumber(loanIdB);
      
      // If both have numbers, sort numerically, otherwise sort alphabetically
      if (numA !== 0 && numB !== 0) {
        return numA - numB;
      } else {
        return loanIdA.localeCompare(loanIdB);
      }
    });

  // Pagination calculations
  const totalPages = Math.ceil(filteredRepayments.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentRepayments = filteredRepayments.slice(startIndex, endIndex);

  const StatusBadge = ({ status }: { status: string }) => {
    const config = {
      'Paid Off': { icon: CheckCircle, color: 'bg-green-100 text-green-800', iconColor: 'text-green-600' },
      'Active': { icon: Clock, color: 'bg-blue-100 text-blue-800', iconColor: 'text-blue-600' },
      'Overdue': { icon: AlertTriangle, color: 'bg-red-100 text-red-800', iconColor: 'text-red-600' }
    };
    
    const statusConfig = config[status as keyof typeof config] || config.Active;
    const Icon = statusConfig.icon;
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
        <Icon className={`w-3 h-3 ${statusConfig.iconColor}`} />
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-green-50 to-emerald-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          </div>
        </div>
      </div>
    );
  }

  const totalAmount = filteredRepayments.reduce((sum, rep) => sum + rep.amount, 0);
  const paidOffCount = filteredRepayments.filter(rep => rep.loanStatus === 'Paid Off').length;
  const activeCount = filteredRepayments.filter(rep => rep.loanStatus === 'Active').length;
  const overdueCount = filteredRepayments.filter(rep => rep.loanStatus === 'Overdue').length;

  // Action handlers
  const handleViewRepayment = (repayment: any) => {
    setSelectedRepayment(repayment);
    setIsViewModalOpen(true);
  };

  const handleDownloadReceipt = async (repayment: any) => {
    setIsDownloading(true);
    try {
      // Simulate download delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Create PDF receipt
      const pdf = new jsPDF();
      
      // Set font
      pdf.setFont('helvetica');
      
      // Header
      pdf.setFontSize(20);
      pdf.setTextColor(34, 197, 94); // Green color
      pdf.text('QUICKCREDIT REPAYMENT RECEIPT', 20, 30);
      
      // Divider line
      pdf.setLineWidth(0.5);
      pdf.setDrawColor(34, 197, 94);
      pdf.line(20, 35, 190, 35);
      
      // Receipt details
      pdf.setFontSize(12);
      pdf.setTextColor(0, 0, 0);
      
      let yPos = 50;
      const lineHeight = 8;
      
      pdf.text(`Receipt Date: ${new Date().toLocaleDateString()}`, 20, yPos);
      yPos += lineHeight * 2;
      
      pdf.setFontSize(14);
      pdf.text('PAYMENT DETAILS', 20, yPos);
      yPos += lineHeight;
      
      pdf.setFontSize(11);
      pdf.text(`Repayment ID: ${repayment.repaymentId}`, 25, yPos);
      yPos += lineHeight;
      pdf.text(`Customer Name: ${repayment.customerName}`, 25, yPos);
      yPos += lineHeight;
      pdf.text(`Customer ID: ${repayment.customerId}`, 25, yPos);
      yPos += lineHeight;
      pdf.text(`Loan ID: ${repayment.loanId}`, 25, yPos);
      yPos += lineHeight * 1.5;
      
      pdf.setFontSize(14);
      pdf.text('FINANCIAL INFORMATION', 20, yPos);
      yPos += lineHeight;
      
      pdf.setFontSize(11);
      pdf.text(`Amount Paid: ${formatUGX(repayment.amount)}`, 25, yPos);
      yPos += lineHeight;
      pdf.text(`Payment Date: ${repayment.paymentDate}`, 25, yPos);
      yPos += lineHeight;
      pdf.text(`Payment Method: ${repayment.paymentMethod}`, 25, yPos);
      yPos += lineHeight;
      pdf.text(`Loan Status: ${repayment.loanStatus}`, 25, yPos);
      yPos += lineHeight;
      pdf.text(`Remaining Balance: ${repayment.outstandingBalance}`, 25, yPos);
      yPos += lineHeight * 2;
      
      // Contact information
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text('QuickCredit Loan Management System', 20, yPos);
      yPos += lineHeight * 0.7;
      pdf.text('Thank you for your payment!', 20, yPos);
      
      // Footer
      pdf.setFontSize(8);
      pdf.text(`Generated on ${new Date().toLocaleString()}`, 20, 280);
      
      // Download the PDF
      pdf.save(`QuickCredit-Receipt-${repayment.repaymentId}.pdf`);
      
      console.log('PDF receipt downloaded for repayment:', repayment.repaymentId);
    } catch (error) {
      console.error('PDF download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  // Manual payment handlers
  const handleAddPayment = () => {
    setIsAddPaymentModalOpen(true);
  };

  const handleCustomerSelect = (customerName: string) => {
    // Find the selected customer to auto-fill customer ID
    const selectedCustomer = borrowers.find(b => `${b.firstName} ${b.lastName}` === customerName);
    setPaymentForm(prev => ({
      ...prev,
      customerName: customerName,
      customerId: selectedCustomer?.id || '',
      loanId: '' // Reset loan ID when customer changes
    }));
  };

  const handleSavePayment = async () => {
    try {
      // Validate form
      if (!paymentForm.customerName || !paymentForm.amount || !paymentForm.loanId) {
        alert('Please fill in all required fields');
        return;
      }

      // Generate a new repayment ID
      const newRepaymentId = `RP${Date.now()}`;
      
      // Create new repayment object
      const newRepayment: RepaymentData = {
        id: `${Date.now()}`,
        receiptNumber: newRepaymentId,
        borrowerId: paymentForm.customerId || paymentForm.customerName,
        loanId: paymentForm.loanId,
        amount: parseFloat(paymentForm.amount),
        paidAt: paymentForm.paymentDate,
        paymentMethod: paymentForm.paymentMethod,
        status: 'Completed'
      };

      // Add to repayments (in a real app, this would be an API call)
      setRepayments(prev => [...prev, newRepayment]);
      
      // Reset form
      setPaymentForm({
        customerName: '',
        customerId: '',
        loanId: '',
        amount: '',
        paymentMethod: 'Cash',
        paymentDate: new Date().toISOString().split('T')[0],
        notes: ''
      });
      
      // Close modal
      setIsAddPaymentModalOpen(false);
      
      // Show success message
      alert('Payment recorded successfully!');
      
    } catch (error) {
      console.error('Failed to save payment:', error);
      alert('Failed to save payment. Please try again.');
    }
  };

  const handleCancelPayment = () => {
    setIsAddPaymentModalOpen(false);
    setPaymentForm({
      customerName: '',
      customerId: '',
      loanId: '',
      amount: '',
      paymentMethod: 'Cash',
      paymentDate: new Date().toISOString().split('T')[0],
      notes: ''
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-green-50 to-emerald-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/20 shadow-xl p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-green-800 to-emerald-700 bg-clip-text text-transparent">
                Repayment Management
              </h1>
              <p className="text-gray-600 mt-1">Enhanced with real loan status and remaining balances</p>
            </div>
            <button 
              onClick={handleAddPayment}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Record Payment
            </button>
          </div>
        </div>

        {/* Enhanced Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium">Total Repayments</p>
                <p className="text-3xl font-bold mt-2">{filteredRepayments.length}</p>
                <p className="text-green-200 text-xs mt-1">All transactions</p>
              </div>
              <Receipt className="w-10 h-10 text-green-200" />
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-sm font-medium">Total Amount</p>
                <p className="text-3xl font-bold mt-2">{formatUGX(totalAmount)}</p>
                <p className="text-emerald-200 text-xs mt-1">Collected payments</p>
              </div>
              <DollarSign className="w-10 h-10 text-emerald-200" />
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-teal-100 text-sm font-medium">Paid Off Loans</p>
                <p className="text-3xl font-bold mt-2">{paidOffCount}</p>
                <p className="text-teal-200 text-xs mt-1">Completed loans</p>
              </div>
              <CheckCircle className="w-10 h-10 text-teal-200" />
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-sm font-medium">Active/Overdue</p>
                <p className="text-3xl font-bold mt-2">{activeCount + overdueCount}</p>
                <p className="text-orange-200 text-xs mt-1">{overdueCount} overdue</p>
              </div>
              <AlertTriangle className="w-10 h-10 text-orange-200" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/20 shadow-xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search repayments..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
              />
            </div>
            
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
            >
              <option value="All">All Status</option>
              <option value="Paid Off">Paid Off</option>
              <option value="Active">Active</option>
              <option value="Overdue">Overdue</option>
            </select>
            
            <div className="flex gap-2">
              <button className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white px-4 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 flex-1">
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
            
            <div className="text-sm text-gray-600 flex items-center">
              Showing {currentRepayments.length} of {filteredRepayments.length} repayments
              {totalPages > 1 && (
                <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                  Page {currentPage} of {totalPages}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Enhanced Table */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/20 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-green-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Repayment Details</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Loan Status</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Remaining Balance</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {currentRepayments.map((repayment) => (
                  <tr key={repayment.receiptNumber} className="hover:bg-blue-50/50 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">#{repayment.receiptNumber}</div>
                        <div className="text-sm text-gray-500">{formatDate(repayment.paidAt)}</div>
                        <div className="text-xs text-gray-400">Loan: {repayment.loanDisplayId || repayment.loanReference || repayment.loanId}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className={`h-10 w-10 rounded-full bg-gradient-to-r flex items-center justify-center ${
                            repayment.hasBorrowerData 
                              ? 'from-green-400 to-emerald-500' 
                              : repayment.hasLoanData 
                              ? 'from-blue-400 to-blue-500' 
                              : 'from-gray-400 to-gray-500'
                          }`}>
                            <User className="w-5 h-5 text-white" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{repayment.customerName}</div>
                          <div className="text-sm text-gray-500">ID: {repayment.customerId || repayment.borrower?.borrowerId || repayment.borrowerId}</div>
                          <div className="flex items-center gap-1 mt-1">
                            {repayment.hasBorrowerData && (
                              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                                ✓ Borrower
                              </span>
                            )}
                            {repayment.hasLoanData && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                                ✓ Loan
                              </span>
                            )}
                            {!repayment.hasBorrowerData && !repayment.hasLoanData && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                                ⚠ ID Only
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{formatUGX(repayment.amount)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${
                        repayment.paymentMethod.toLowerCase().includes('mobile') || repayment.paymentMethod.toLowerCase().includes('momo')
                          ? 'bg-purple-100 text-purple-800 border-purple-200'
                          : repayment.paymentMethod.toLowerCase().includes('bank')
                          ? 'bg-blue-100 text-blue-800 border-blue-200'
                          : repayment.paymentMethod.toLowerCase().includes('cash')
                          ? 'bg-green-100 text-green-800 border-green-200'
                          : 'bg-gray-100 text-gray-800 border-gray-200'
                      }`}>
                        <CreditCard className="w-3 h-3" />
                        {repayment.paymentMethod}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={repayment.loanStatus || 'Active'} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{repayment.outstandingBalance}</div>
                      {repayment.loanStatus === 'Paid Off' && (
                        <div className="text-xs text-green-600 font-medium">✓ Fully Paid</div>
                      )}
                      {!repayment.hasLoanData && (
                        <div className="text-xs text-gray-400">No loan data</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleViewRepayment(repayment)}
                          className="text-green-600 hover:text-green-900 p-1 rounded hover:bg-green-50 transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDownloadReceipt(repayment)}
                          disabled={isDownloading}
                          className="text-gray-600 hover:text-gray-900 p-1 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
                          title="Download Receipt"
                        >
                          <Download className={`w-4 h-4 ${isDownloading ? 'animate-pulse' : ''}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-white px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing {startIndex + 1} to {Math.min(endIndex, filteredRepayments.length)} of {filteredRepayments.length} results
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                        currentPage === pageNum
                          ? 'bg-green-600 text-white border-green-600'
                          : 'text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          
          {filteredRepayments.length === 0 && (
            <div className="text-center py-12">
              <Receipt className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No repayments found</p>
              <p className="text-gray-400 text-sm">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </div>

      {/* View Repayment Modal */}
      {isViewModalOpen && selectedRepayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Repayment Details</h2>
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Repayment ID</label>
                    <p className="text-lg font-semibold text-gray-900">{selectedRepayment.repaymentId}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Customer Name</label>
                    <p className="text-lg font-semibold text-gray-900">{selectedRepayment.customerName}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {selectedRepayment.hasBorrowerData && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                          ✓ From Borrower Data
                        </span>
                      )}
                      {selectedRepayment.hasLoanData && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                          ✓ Loan Data Available
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Customer ID</label>
                    <p className="text-lg font-semibold text-gray-900">{selectedRepayment.customerId}</p>
                  </div>
                  
                  {selectedRepayment.hasBorrowerData && (
                    <>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Phone Number</label>
                        <p className="text-lg font-semibold text-gray-900">{selectedRepayment.borrowerPhone}</p>
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium text-gray-500">Email</label>
                        <p className="text-lg font-semibold text-gray-900">{selectedRepayment.borrowerEmail}</p>
                      </div>
                    </>
                  )}
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Amount Paid</label>
                    <p className="text-2xl font-bold text-green-600">{formatUGX(selectedRepayment.amount)}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Payment Date</label>
                    <p className="text-lg font-semibold text-gray-900">{formatDate(selectedRepayment.paymentDate)}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Payment Method</label>
                    <p className="text-lg font-semibold text-gray-900">{selectedRepayment.paymentMethod}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Loan ID</label>
                    <p className="text-lg font-semibold text-gray-900">{selectedRepayment.loanId}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Loan Status</label>
                    <div className="mt-1">
                      <StatusBadge status={selectedRepayment.loanStatus} />
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Remaining Balance</label>
                    <p className="text-lg font-semibold text-gray-900">{selectedRepayment.outstandingBalance}</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => handleDownloadReceipt(selectedRepayment)}
                  disabled={isDownloading}
                  className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Download className={`w-4 h-4 ${isDownloading ? 'animate-pulse' : ''}`} />
                  {isDownloading ? 'Downloading...' : 'Download Receipt'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Payment Modal */}
      {isAddPaymentModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Record Manual Payment</h2>
                <button
                  onClick={handleCancelPayment}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Customer Name *
                    </label>
                    <div className="relative">
                      <select
                        value={paymentForm.customerName}
                        onChange={(e) => handleCustomerSelect(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent appearance-none bg-white"
                        required
                      >
                        <option value="">Select a customer...</option>
                        {borrowers
                          .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
                          .map((borrower) => (
                            <option key={borrower.borrowerId} value={`${borrower.firstName} ${borrower.lastName}`}>
                              {borrower.firstName} {borrower.lastName} (ID: {borrower.borrowerId})
                            </option>
                          ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                    {paymentForm.customerName && (
                      <p className="text-xs text-green-600 mt-1">
                        ✓ Customer selected
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Customer ID
                    </label>
                    <input
                      type="text"
                      value={paymentForm.customerId}
                      onChange={(e) => setPaymentForm(prev => ({ ...prev, customerId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50"
                      placeholder="Auto-filled from selection"
                      readOnly
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Automatically filled when customer is selected
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Loan ID *
                    </label>
                    {paymentForm.customerName ? (
                      <div className="relative">
                        <select
                          value={paymentForm.loanId}
                          onChange={(e) => setPaymentForm(prev => ({ ...prev, loanId: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent appearance-none bg-white"
                          required
                        >
                          <option value="">Select a loan...</option>
                          {loans
                            .filter(loan => {
                              const selectedBorrower = borrowers.find(b => `${b.firstName} ${b.lastName}` === paymentForm.customerName);
                              return selectedBorrower && loan.borrowerId === selectedBorrower.borrowerId;
                            })
                            .map((loan) => (
                              <option key={loan.loanId} value={loan.loanId}>
                                {loan.loanId} - {formatUGX(loan.totalAmount)} ({loan.status})
                              </option>
                            ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                        <p className="text-xs text-blue-600 mt-1">
                          Showing loans for {paymentForm.customerName}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="text"
                          value={paymentForm.loanId}
                          onChange={(e) => setPaymentForm(prev => ({ ...prev, loanId: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-100"
                          placeholder="Select customer first to see their loans"
                          required
                          disabled
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Please select a customer first to see available loans
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Payment Amount (UGX) *
                    </label>
                    <input
                      type="number"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Enter amount"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Payment Method
                    </label>
                    <select
                      value={paymentForm.paymentMethod}
                      onChange={(e) => setPaymentForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Mobile Money">Mobile Money</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Check">Check</option>
                      <option value="Online Payment">Online Payment</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Payment Date
                    </label>
                    <input
                      type="date"
                      value={paymentForm.paymentDate}
                      onChange={(e) => setPaymentForm(prev => ({ ...prev, paymentDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notes
                    </label>
                    <textarea
                      value={paymentForm.notes}
                      onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                      placeholder="Enter any additional notes..."
                    />
                  </div>
                  
                  {/* Enhanced Payment Preview */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-green-800 mb-2">Payment Summary</h4>
                    <div className="space-y-1 text-sm text-green-700">
                      <div>Customer: {paymentForm.customerName || 'Not specified'}</div>
                      <div>Customer ID: {paymentForm.customerId || 'Not specified'}</div>
                      <div>Loan: {paymentForm.loanId || 'Not specified'}</div>
                      <div>Amount: {paymentForm.amount ? formatUGX(parseFloat(paymentForm.amount)) : 'UGX 0'}</div>
                      <div>Method: {paymentForm.paymentMethod}</div>
                      {paymentForm.loanId && (
                        <div className="mt-2 pt-2 border-t border-green-200">
                          {(() => {
                            const selectedLoan = loans.find(l => l.id === paymentForm.loanId);
                            if (selectedLoan) {
                              return (
                                <div className="space-y-1">
                                  <div className="font-medium">Loan Details:</div>
                                  <div>Total Amount: {formatUGX(selectedLoan.totalAmount)}</div>
                                  <div>Outstanding: {selectedLoan.outstandingBalance}</div>
                                  <div>Status: {selectedLoan.status}</div>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={handleCancelPayment}
                  className="px-6 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePayment}
                  className="px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-colors font-medium flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Record Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Repayments;
