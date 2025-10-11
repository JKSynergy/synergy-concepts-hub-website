import React, { useState, useEffect } from 'react';
import { X, Banknote, Clock, AlertTriangle, Search, Download, Mail, MessageCircle, User, Filter, Calendar } from 'lucide-react';
import { databaseService } from '../../services/databaseService';

interface PaymentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PaymentRecord {
  id: string;
  date: string;
  borrower: string;
  borrowerId: string;
  loanId: string;
  amount: number;
  method: string;
  status: 'completed' | 'pending' | 'failed';
  email?: string;
  phone?: string;
}

interface BorrowerOption {
  id: string;
  name: string;
  borrowerId: string;
}

const PaymentDetailsModal: React.FC<PaymentDetailsModalProps> = ({ isOpen, onClose }) => {
  const [paymentData, setPaymentData] = useState({
    todaysCollections: { amount: 0, count: 0 },
    pendingPayments: { amount: 0, count: 0 },
    overduePayments: { amount: 0, count: 0 }
  });

  const [recentPayments, setRecentPayments] = useState<PaymentRecord[]>([]);
  const [borrowers, setBorrowers] = useState<BorrowerOption[]>([]);
  const [selectedBorrower, setSelectedBorrower] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadPaymentData();
      loadBorrowers();
    }
  }, [isOpen]);

  // Filter payments when borrower or search changes
  useEffect(() => {
    if (isOpen) {
      loadPaymentData();
    }
  }, [selectedBorrower, searchTerm]);

  const loadPaymentData = async () => {
    try {
      setIsLoading(true);
      
      // Load all payments/repayments data
      const [payments, loans, borrowersData] = await Promise.all([
        databaseService.getRepayments(),
        databaseService.getLoans(),
        databaseService.getBorrowers()
      ]);

      // Calculate summary metrics
      const today = new Date().toDateString();
      const todaysPayments = payments.filter(p => new Date(p.paidAt).toDateString() === today);
      
      const pendingLoans = loans.filter(l => l.status === 'ACTIVE' && l.outstandingBalance > 0);
      const overdueLoans = loans.filter(l => {
        if (!l.nextPaymentDate) return false;
        return new Date(l.nextPaymentDate) < new Date() && l.outstandingBalance > 0;
      });

      // Calculate amounts - Updated to match Outstanding calculation method
      const todaysAmount = todaysPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const pendingAmount = pendingLoans.reduce((sum, l) => sum + (l.outstandingBalance || 0), 0);
      const overdueAmount = overdueLoans.reduce((sum, l) => sum + (l.outstandingBalance || 0), 0);

      setPaymentData({
        todaysCollections: { amount: todaysAmount, count: todaysPayments.length },
        pendingPayments: { amount: pendingAmount, count: pendingLoans.length },
        overduePayments: { amount: overdueAmount, count: overdueLoans.length }
      });

      // Prepare recent payments data
      let filteredPayments = payments
        .map(payment => {
          const loan = loans.find(l => l.id === payment.loanId);
          const borrower = borrowersData.find(b => b.id === loan?.borrowerId);
          
          return {
            id: payment.id,
            date: payment.paidAt,
            borrower: borrower ? `${borrower.firstName} ${borrower.lastName}` : 'Unknown',
            borrowerId: borrower?.borrowerId || '',
            loanId: loan?.loanId || '#Unknown',
            amount: payment.amount || 0,
            method: payment.paymentMethod || 'Unknown',
            status: 'completed' as const,
            email: borrower?.email,
            phone: borrower?.phone
          };
        })
        .filter(p => p.borrower !== 'Unknown');

      // Apply borrower filter
      if (selectedBorrower !== 'all') {
        filteredPayments = filteredPayments.filter(p => p.borrowerId === selectedBorrower);
      }

      // Apply search filter
      if (searchTerm) {
        filteredPayments = filteredPayments.filter(p => 
          p.borrower.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.loanId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.method.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      // Sort by date (most recent first) and limit to last 20
      filteredPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecentPayments(filteredPayments.slice(0, 20));

    } catch (error) {
      console.error('Error loading payment data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBorrowers = async () => {
    try {
      const borrowersData = await databaseService.getBorrowers();
      const borrowerOptions: BorrowerOption[] = borrowersData.map(b => ({
        id: b.borrowerId,
        name: `${b.firstName} ${b.lastName}`,
        borrowerId: b.borrowerId
      }));
      setBorrowers(borrowerOptions);
    } catch (error) {
      console.error('Error loading borrowers:', error);
    }
  };

  const downloadPaymentDetails = () => {
    generatePDF();
  };

  const generatePDF = () => {
    try {
      // Dynamic import for better compatibility
      import('jspdf').then(({ default: jsPDF }) => {
        import('jspdf-autotable').then(() => {
          const doc = new jsPDF();
          
          // Add header
          doc.setFontSize(18);
          doc.setTextColor(40, 44, 52);
          doc.text('QuickCredit Payment Details Report', 20, 25);
          
          // Add date
          doc.setFontSize(12);
          doc.setTextColor(100, 100, 100);
          doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 35);
          
          // Add summary
          doc.setFontSize(14);
          doc.setTextColor(40, 44, 52);
          doc.text('Summary', 20, 50);
          
          doc.setFontSize(10);
          const summaryData = [
            ['Today\'s Collections', `UGX ${paymentData.todaysCollections.amount.toLocaleString()}`, `${paymentData.todaysCollections.count} payments`],
            ['Outstanding Balance', `UGX ${paymentData.pendingPayments.amount.toLocaleString()}`, `${paymentData.pendingPayments.count} active loans`],
            ['Overdue Payments', `UGX ${paymentData.overduePayments.amount.toLocaleString()}`, `${paymentData.overduePayments.count} overdue`]
          ];
          
          (doc as any).autoTable({
            startY: 55,
            head: [['Category', 'Amount', 'Count']],
            body: summaryData,
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246] },
            styles: { fontSize: 9 }
          });
          
          // Add recent payments table
          const finalY = (doc as any).lastAutoTable.finalY + 15;
          doc.setFontSize(14);
          doc.text('Recent Payments', 20, finalY);
          
          const tableData = recentPayments.slice(0, 20).map(payment => [
            payment.date,
            payment.borrower,
            payment.loanId,
            `UGX ${payment.amount.toLocaleString()}`,
            payment.method,
            payment.status
          ]);
          
          (doc as any).autoTable({
            startY: finalY + 5,
            head: [['Date', 'Borrower', 'Loan ID', 'Amount', 'Method', 'Status']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [59, 130, 246] },
            styles: { fontSize: 8 },
            columnStyles: {
              3: { halign: 'right' } // Right align amount column
            }
          });
          
          // Save the PDF
          doc.save(`payment-details-${new Date().toISOString().split('T')[0]}.pdf`);
        });
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  };

  const generateCSV = () => {
    const headers = ['Date', 'Borrower', 'Loan ID', 'Amount (UGX)', 'Method', 'Status'];
    const rows = recentPayments.map(payment => [
      payment.date,
      payment.borrower,
      payment.loanId,
      payment.amount.toLocaleString(),
      payment.method,
      payment.status
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  };

  const sendViaEmail = async () => {
    try {
      // Get customer emails from recent payments
      const customerEmails = await getCustomerEmails();
      
      if (customerEmails.length > 0) {
        // Send to customer emails directly
        const subject = `Payment Details Report - ${new Date().toLocaleDateString()}`;
        const body = generateEmailBody();
        const emailList = customerEmails.join(',');
        const mailtoLink = `mailto:${emailList}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoLink);
      } else {
        // Show modal for email input
        setShowEmailModal(true);
      }
    } catch (error) {
      console.error('Error getting customer emails:', error);
      // Show modal for email input
      setShowEmailModal(true);
    }
  };

  const handleEmailSubmit = () => {
    if (emailAddress && emailAddress.includes('@')) {
      const subject = `Payment Details Report - ${new Date().toLocaleDateString()}`;
      const body = generateEmailBody();
      const mailtoLink = `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(mailtoLink);
      setShowEmailModal(false);
      setEmailAddress('');
    }
  };

  const getCustomerEmails = async () => {
    try {
      // Get unique borrower IDs from recent payments
      const borrowerIds = [...new Set(recentPayments.map(p => p.borrowerId).filter(Boolean))];
      
      if (borrowerIds.length === 0) return [];
      
      // Fetch borrower details with emails
      const response = await fetch('/api/borrowers/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ borrowerIds })
      });
      
      if (!response.ok) return [];
      
      const borrowers = await response.json();
      return borrowers
        .filter((b: any) => b.email && b.email.includes('@'))
        .map((b: any) => b.email)
        .slice(0, 10); // Limit to first 10 emails to avoid mailto URL length issues
    } catch (error) {
      console.error('Error fetching customer emails:', error);
      return [];
    }
  };

  const sendViaWhatsApp = async () => {
    try {
      // Get customer phone numbers from recent payments
      const customerPhones = await getCustomerPhones();
      
      if (customerPhones.length > 0) {
        // If only one customer, send directly
        if (customerPhones.length === 1) {
          const message = generateWhatsAppMessage();
          const formattedPhone = customerPhones[0].replace(/[^0-9]/g, '');
          const whatsappLink = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
          window.open(whatsappLink, '_blank');
        } else {
          // If multiple customers, show modal with phone selection
          setWhatsappNumber(customerPhones[0]); // Set default to first number
          setShowWhatsAppModal(true);
        }
      } else {
        // Show modal for phone number input
        setShowWhatsAppModal(true);
      }
    } catch (error) {
      console.error('Error getting customer phones:', error);
      // Show modal for phone number input
      setShowWhatsAppModal(true);
    }
  };

  const handleWhatsAppSubmit = () => {
    if (whatsappNumber && whatsappNumber.length >= 10) {
      const message = generateWhatsAppMessage();
      const formattedPhone = whatsappNumber.replace(/[^0-9]/g, '');
      const whatsappLink = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
      window.open(whatsappLink, '_blank');
      setShowWhatsAppModal(false);
      setWhatsappNumber('');
    }
  };

  const getCustomerPhones = async () => {
    try {
      // Get unique borrower IDs from recent payments
      const borrowerIds = [...new Set(recentPayments.map(p => p.borrowerId).filter(Boolean))];
      
      if (borrowerIds.length === 0) return [];
      
      // Fetch borrower details with phone numbers
      const response = await fetch('/api/borrowers/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ borrowerIds })
      });
      
      if (!response.ok) return [];
      
      const borrowers = await response.json();
      return borrowers
        .filter((b: any) => b.phone && b.phone.length >= 10)
        .map((b: any) => b.phone)
        .slice(0, 5); // Limit to first 5 numbers for practical selection
    } catch (error) {
      console.error('Error fetching customer phones:', error);
      return [];
    }
  };

  const generateEmailBody = () => {
    const summary = `
Payment Details Summary - ${new Date().toLocaleDateString()}

Today's Collections: UGX ${paymentData.todaysCollections.amount.toLocaleString()} (${paymentData.todaysCollections.count} payments)
Pending Payments: UGX ${paymentData.pendingPayments.amount.toLocaleString()} (${paymentData.pendingPayments.count} payments)
Overdue Payments: UGX ${paymentData.overduePayments.amount.toLocaleString()} (${paymentData.overduePayments.count} payments)

Recent Payments:
${recentPayments.slice(0, 10).map(p => 
  `${p.date} - ${p.borrower} - ${p.loanId} - UGX ${p.amount.toLocaleString()} - ${p.method}`
).join('\n')}

Generated by QuickCredit System
    `;
    return summary;
  };

  const generateWhatsAppMessage = () => {
    return `*QuickCredit Payment Report* 📊
Date: ${new Date().toLocaleDateString()}

*Summary:*
✅ Today's Collections: UGX ${paymentData.todaysCollections.amount.toLocaleString()}
⏳ Pending: UGX ${paymentData.pendingPayments.amount.toLocaleString()}
⚠️ Overdue: UGX ${paymentData.overduePayments.amount.toLocaleString()}

*Recent Payments (Top 5):*
${recentPayments.slice(0, 5).map((p, i) => 
  `${i+1}. ${p.borrower} - UGX ${p.amount.toLocaleString()}`
).join('\n')}

_Generated by QuickCredit System_`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Completed</span>;
      case 'pending':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Pending</span>;
      case 'failed':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">Failed</span>;
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Payment Details Overview</h2>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <div className="flex items-center space-x-2">
                <Banknote className="w-5 h-5 text-green-600" />
                <div>
                  <p className="text-sm text-green-700 dark:text-green-300">Today's Collections</p>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-2xl font-bold text-green-900 dark:text-green-100">
                      UGX {paymentData.todaysCollections.amount.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-green-600">{paymentData.todaysCollections.count} payments received</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-sm text-blue-700 dark:text-blue-300">Outstanding Balance</p>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                      UGX {paymentData.pendingPayments.amount.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-blue-600">{paymentData.pendingPayments.count} active loans</p>
                </div>
              </div>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <div>
                  <p className="text-sm text-red-700 dark:text-red-300">Overdue Payments</p>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-2xl font-bold text-red-900 dark:text-red-100">
                      UGX {paymentData.overduePayments.amount.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-red-600">{paymentData.overduePayments.count} payments overdue</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Actions */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              {/* Borrower Filter */}
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-gray-500" />
                <select
                  value={selectedBorrower}
                  onChange={(e) => setSelectedBorrower(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="all">All Customers</option>
                  {borrowers.map(borrower => (
                    <option key={borrower.id} value={borrower.borrowerId}>
                      {borrower.name} ({borrower.borrowerId})
                    </option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search payments..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={downloadPaymentDetails}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </button>
              
              <button
                onClick={sendViaEmail}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                <Mail className="w-4 h-4" />
                <span>Email</span>
              </button>
              
              <button
                onClick={sendViaWhatsApp}
                className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </button>
            </div>
          </div>
        </div>

        {/* Recent Payments Table */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Recent Payments {selectedBorrower !== 'all' && `for ${borrowers.find(b => b.borrowerId === selectedBorrower)?.name}`}
            </h3>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {recentPayments.length} payment{recentPayments.length !== 1 ? 's' : ''} found
            </span>
          </div>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600 dark:text-gray-400">Loading...</span>
            </div>
          ) : (
            <div className="overflow-auto max-h-64">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Borrower</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Loan ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {recentPayments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                        No payments found for the selected criteria
                      </td>
                    </tr>
                  ) : (
                    recentPayments.map((payment, index) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm text-blue-600 dark:text-blue-400">
                          {new Date(payment.date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{payment.borrower}</td>
                        <td className="px-4 py-3 text-sm font-medium text-green-600">{payment.loanId}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                          UGX {payment.amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{payment.method}</td>
                        <td className="px-4 py-3">{getStatusBadge(payment.status)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Send via Email</h3>
              <button 
                onClick={() => setShowEmailModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                No customer emails found. Please enter the email address where you'd like to send the payment details report.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder="example@email.com"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowEmailModal(false)}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEmailSubmit}
                    disabled={!emailAddress || !emailAddress.includes('@')}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Send Email</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Modal */}
      {showWhatsAppModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Send via WhatsApp</h3>
              <button 
                onClick={() => setShowWhatsAppModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Enter the WhatsApp number where you'd like to send the payment details report.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="whatsapp" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    WhatsApp Number
                  </label>
                  <input
                    type="tel"
                    id="whatsapp"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="+256700000000"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Include country code (e.g., +256 for Uganda)
                  </p>
                </div>
                
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowWhatsAppModal(false)}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleWhatsAppSubmit}
                    disabled={!whatsappNumber || whatsappNumber.length < 10}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Send WhatsApp</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentDetailsModal;