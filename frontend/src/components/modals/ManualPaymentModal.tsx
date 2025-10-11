import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { databaseService } from '../../services/databaseService';
import type { LoanData, BorrowerData, RepaymentData } from '../../services/databaseService';
import jsPDF from 'jspdf';

interface ManualPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ManualPaymentModal: React.FC<ManualPaymentModalProps> = ({ isOpen, onClose }) => {
  const [loans, setLoans] = useState<LoanData[]>([]);
  const [borrowers, setBorrowers] = useState<BorrowerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [formData, setFormData] = useState({
    customerName: '',
    customerId: '',
    loanId: '',
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'Cash',
    notes: ''
  });

  useEffect(() => {
    const loadData = async () => {
      if (isOpen) {
        try {
          setLoading(true);
          const loansData = await databaseService.getLoans();
          const borrowersData = await databaseService.getBorrowers();
          
          setLoans(loansData);
          setBorrowers(borrowersData);
        } catch (error) {
          console.error('Failed to load data:', error);
          toast.error('Failed to load data. Please try again.');
        } finally {
          setLoading(false);
        }
      }
    };

    loadData();
  }, [isOpen]);

  // Format UGX currency
  const formatUGX = (amount: number) => {
    return `UGX ${amount.toLocaleString()}`;
  };

  const handleCustomerSelect = (customerName: string) => {
    // Find the selected customer to auto-fill customer ID
    const selectedCustomer = borrowers.find(b => `${b.firstName} ${b.lastName}` === customerName);
    setFormData(prev => ({
      ...prev,
      customerName: customerName,
      customerId: selectedCustomer?.borrowerId || '',
      loanId: '' // Reset loan ID when customer changes
    }));
  };

  const handleCancel = () => {
    setFormData({
      customerName: '',
      customerId: '',
      loanId: '',
      amount: '',
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'Cash',
      notes: ''
    });
    onClose();
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission
    if (isProcessing) {
      return;
    }
    
    try {
      // Validate form
      if (!formData.customerName || !formData.amount || !formData.loanId) {
        toast.error('Please fill in all required fields');
        return;
      }

      // Find the selected borrower to get their ID
      const selectedBorrower = borrowers.find(b => 
        `${b.firstName} ${b.lastName}` === formData.customerName
      );

      if (!selectedBorrower) {
        toast.error('Selected customer not found');
        return;
      }

      // Set processing state to prevent form reset
      setIsProcessing(true);

      // Show loading toast
      const loadingToast = toast.loading('Processing payment...');

      // Prepare payment data for the API
      const paymentData = {
        loanId: formData.loanId,
        borrowerId: selectedBorrower.id,
        amount: parseFloat(formData.amount),
        paymentMethod: formData.paymentMethod,
        paidAt: formData.paymentDate
      };

      // Process payment through the API
      const result = await databaseService.processPayment(paymentData);

      // Dismiss loading toast
      toast.dismiss(loadingToast);

      if (result.success) {
        // Generate PDF receipt with the actual receipt number
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
        pdf.text(`Receipt Number: ${result.receiptNumber}`, 25, yPos);
        yPos += lineHeight;
        pdf.text(`Customer Name: ${formData.customerName}`, 25, yPos);
        yPos += lineHeight;
        pdf.text(`Customer ID: ${selectedBorrower.borrowerId}`, 25, yPos);
        yPos += lineHeight;
        pdf.text(`Loan ID: ${formData.loanId}`, 25, yPos);
        yPos += lineHeight * 1.5;
        
        pdf.setFontSize(14);
        pdf.text('FINANCIAL INFORMATION', 20, yPos);
        yPos += lineHeight;
        
        pdf.setFontSize(11);
        pdf.text(`Amount Paid: ${formatUGX(parseFloat(formData.amount))}`, 25, yPos);
        yPos += lineHeight;
        pdf.text(`Payment Date: ${formData.paymentDate}`, 25, yPos);
        yPos += lineHeight;
        pdf.text(`Payment Method: ${formData.paymentMethod}`, 25, yPos);
        yPos += lineHeight;
        pdf.text(`New Outstanding Balance: ${formatUGX(result.updatedLoan.outstandingBalance)}`, 25, yPos);
        yPos += lineHeight * 2;
        
        if (formData.notes) {
          pdf.text(`Notes: ${formData.notes}`, 25, yPos);
          yPos += lineHeight * 2;
        }
        
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
        pdf.save(`QuickCredit-Receipt-${result.receiptNumber}.pdf`);
        
        // Reset form and close modal
        setFormData({
          customerName: '',
          customerId: '',
          loanId: '',
          amount: '',
          paymentDate: new Date().toISOString().split('T')[0],
          paymentMethod: 'Cash',
          notes: ''
        });
        
        // Show success toast
        toast.success(
          `Payment recorded successfully! Receipt ${result.receiptNumber} downloaded.`,
          { duration: 5000 }
        );
        setIsProcessing(false);
        onClose();
      } else {
        toast.error('Failed to process payment. Please try again.');
        setIsProcessing(false);
      }
      
    } catch (error) {
      console.error('Failed to process payment:', error);
      toast.error('Failed to process payment. Please try again.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Record Manual Payment</h2>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Customer Name *
                    </label>
                    <div className="relative">
                      <select
                        value={formData.customerName}
                        onChange={(e) => handleCustomerSelect(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent appearance-none bg-white"
                        required
                      >
                        <option value="">Select a customer...</option>
                        {borrowers
                          .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
                          .map((borrower) => {
                            const fullName = `${borrower.firstName} ${borrower.lastName}`;
                            return (
                              <option key={borrower.id} value={fullName}>
                                {fullName} (ID: {borrower.borrowerId})
                              </option>
                            );
                          })}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                    {formData.customerName && (
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
                      value={formData.customerId}
                      onChange={(e) => setFormData(prev => ({ ...prev, customerId: e.target.value }))}
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
                    {formData.customerName ? (
                      <div className="relative">
                        <select
                          value={formData.loanId}
                          onChange={(e) => setFormData(prev => ({ ...prev, loanId: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent appearance-none bg-white"
                          required
                        >
                          <option value="">Select a loan...</option>
                          {loans
                            .filter(loan => {
                              // Match loan by borrower ID
                              const selectedBorrower = borrowers.find(b => 
                                `${b.firstName} ${b.lastName}` === formData.customerName
                              );
                              return selectedBorrower && loan.borrowerId === selectedBorrower.id;
                            })
                            .map((loan) => (
                              <option key={loan.id} value={loan.loanId}>
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
                          Showing loans for {formData.customerName}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="text"
                          value={formData.loanId}
                          onChange={(e) => setFormData(prev => ({ ...prev, loanId: e.target.value }))}
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
                      value={formData.amount}
                      onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
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
                      value={formData.paymentMethod}
                      onChange={(e) => setFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}
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
                      value={formData.paymentDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, paymentDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notes
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                      placeholder="Enter any additional notes..."
                    />
                  </div>
                  
                  {/* Enhanced Payment Preview */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-green-800 mb-2">Payment Summary</h4>
                    <div className="space-y-1 text-sm text-green-700">
                      <div>Customer: {formData.customerName || 'Not specified'}</div>
                      <div>Customer ID: {formData.customerId || 'Not specified'}</div>
                      <div>Loan: {formData.loanId || 'Not specified'}</div>
                      <div>Amount: {formData.amount ? formatUGX(parseFloat(formData.amount)) : 'UGX 0'}</div>
                      <div>Method: {formData.paymentMethod}</div>
                      {formData.loanId && (
                        <div className="mt-2 pt-2 border-t border-green-200">
                          {(() => {
                            const selectedLoan = loans.find(l => l.loanId === formData.loanId);
                            if (selectedLoan) {
                              return (
                                <div className="space-y-1">
                                  <div className="font-medium">Loan Details:</div>
                                  <div>Total Amount: {formatUGX(selectedLoan.totalAmount)}</div>
                                  <div>Outstanding: {formatUGX(selectedLoan.outstandingBalance)}</div>
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
                  type="button"
                  onClick={handleCancel}
                  className="px-6 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className={`px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-colors font-medium flex items-center gap-2 ${
                    isProcessing ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <Save className="w-4 h-4" />
                  {isProcessing ? 'Processing...' : 'Record Payment'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManualPaymentModal;