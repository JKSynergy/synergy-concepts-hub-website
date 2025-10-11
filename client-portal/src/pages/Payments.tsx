import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { paymentsApi, loansApi } from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import toast from 'react-hot-toast';
import {
  DevicePhoneMobileIcon,
  CreditCardIcon,
  BanknotesIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

type PaymentMethod = 'mobile_money' | 'bank_transfer' | 'cash';
type MobileProvider = 'mtn' | 'airtel' | 'africell';

interface PaymentHistory {
  id: string;
  paidAt: string;
  amount: number;
  paymentMethod: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  receiptNumber: string;
  transactionId?: string;
  loan?: {
    loanId: string;
  };
}

const Payments: React.FC = () => {
  const { user } = useAuth();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mobile_money');
  const [mobileProvider, setMobileProvider] = useState<MobileProvider>('mtn');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoadingLoans, setIsLoadingLoans] = useState(true);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistory[]>([]);
  const [activeLoans, setActiveLoans] = useState<any[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [nextPaymentAmount, setNextPaymentAmount] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);

  // Fetch active loans
  useEffect(() => {
    const fetchLoans = async () => {
      try {
        const response = await loansApi.getLoans();
        if (response.success && response.data) {
          const active = response.data.filter((loan: any) => 
            loan.status === 'ACTIVE' && loan.balanceRemaining > 0
          );
          setActiveLoans(active);
          
          // Calculate totals
          const balance = active.reduce((sum: number, loan: any) => sum + (loan.balanceRemaining || 0), 0);
          const nextPayment = active.length > 0 ? (active[0].monthlyPayment || 0) : 0;
          
          setTotalBalance(balance);
          setNextPaymentAmount(nextPayment);
          
          // Pre-select first active loan
          if (active.length > 0) {
            setSelectedLoanId(active[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to fetch loans:', error);
      } finally {
        setIsLoadingLoans(false);
      }
    };

    fetchLoans();
  }, []);

  // Fetch payment history
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await paymentsApi.getPaymentHistory();
        if (response.success && response.data) {
          setPaymentHistory(response.data);
          
          // Calculate total paid
          const paid = response.data.reduce((sum: number, payment: any) => 
            sum + (payment.amount || 0), 0
          );
          setTotalPaid(paid);
        }
      } catch (error) {
        console.error('Failed to fetch payment history:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchHistory();
  }, []);

  // Demo payment history (fallback)
  const demoPaymentHistory: PaymentHistory[] = [
    {
      id: 'PAY001',
      date: '2025-10-01',
      amount: 50000,
      method: 'MTN Mobile Money',
      status: 'completed',
      reference: 'MTN-20251001-001',
    },
    {
      id: 'PAY002',
      date: '2025-09-15',
      amount: 50000,
      method: 'Airtel Money',
      status: 'completed',
      reference: 'AIRTEL-20250915-002',
    },
    {
      id: 'PAY003',
      date: '2025-09-01',
      amount: 50000,
      method: 'Bank Transfer',
      status: 'completed',
      reference: 'BANK-20250901-003',
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedLoanId) {
      toast.error('Please select a loan to pay');
      return;
    }

    if (!amount || parseFloat(amount) < 1000) {
      toast.error('Minimum payment amount is UGX 1,000');
      return;
    }

    if (paymentMethod === 'mobile_money' && !phoneNumber) {
      toast.error('Please enter your phone number');
      return;
    }

    setIsProcessing(true);

    try {
      const paymentData = {
        loanId: selectedLoanId,
        amount: parseFloat(amount),
        paymentMethod: paymentMethod.toUpperCase() as 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH',
        phoneNumber: paymentMethod === 'mobile_money' ? phoneNumber : undefined,
        provider: paymentMethod === 'mobile_money' ? mobileProvider : undefined,
      };

      const response = await paymentsApi.makePayment(paymentData);
      
      if (response.success) {
        toast.success(`Payment of UGX ${parseFloat(amount).toLocaleString()} processed successfully!`);
        
        // Refresh data
        const [loansResponse, historyResponse] = await Promise.all([
          loansApi.getLoans(),
          paymentsApi.getPaymentHistory()
        ]);

        if (loansResponse.success && loansResponse.data) {
          const active = loansResponse.data.filter((loan: any) => 
            loan.status === 'ACTIVE' && loan.balanceRemaining > 0
          );
          setActiveLoans(active);
          const balance = active.reduce((sum: number, loan: any) => sum + (loan.balanceRemaining || 0), 0);
          setTotalBalance(balance);
        }

        if (historyResponse.success && historyResponse.data) {
          setPaymentHistory(historyResponse.data);
          const paid = historyResponse.data.reduce((sum: number, payment: any) => 
            sum + (payment.amount || 0), 0
          );
          setTotalPaid(paid);
        }

        // Reset form
        setAmount('');
        setPhoneNumber('');
      } else {
        toast.error(response.message || 'Payment failed');
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'pending':
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
      case 'failed':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      completed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800',
    };
    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-gray-600 mt-1">Make payments and view transaction history</p>
        </div>
      </div>

      {/* Account Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Outstanding Balance</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">{formatCurrency(totalBalance)}</p>
            </div>
            <div className="p-3 bg-blue-500 rounded-lg">
              <BanknotesIcon className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Next Payment Due</p>
              <p className="text-2xl font-bold text-green-900 mt-1">{formatCurrency(nextPaymentAmount)}</p>
            </div>
            <div className="p-3 bg-green-500 rounded-lg">
              <ClockIcon className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 font-medium">Total Paid</p>
              <p className="text-2xl font-bold text-purple-900 mt-1">{formatCurrency(totalPaid)}</p>
            </div>
            <div className="p-3 bg-purple-500 rounded-lg">
              <CheckCircleIcon className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Payment Form */}
      <div className="card">
        <div className="border-b border-gray-200 pb-4 mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Make a Payment</h2>
          <p className="text-sm text-gray-600 mt-1">Choose your preferred payment method below</p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Payment Method Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Payment Method
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => setPaymentMethod('mobile_money')}
                className={`flex flex-col items-center justify-center p-6 border-2 rounded-xl transition-all ${
                  paymentMethod === 'mobile_money'
                    ? 'border-primary-500 bg-primary-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <DevicePhoneMobileIcon className="h-12 w-12 mb-3 text-primary-600" />
                <span className="text-base font-semibold text-gray-900">Mobile Money</span>
                <span className="text-xs text-gray-500 mt-1">Instant payment</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('bank_transfer')}
                className={`flex flex-col items-center justify-center p-6 border-2 rounded-xl transition-all ${
                  paymentMethod === 'bank_transfer'
                    ? 'border-primary-500 bg-primary-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <CreditCardIcon className="h-12 w-12 mb-3 text-primary-600" />
                <span className="text-base font-semibold text-gray-900">Bank Transfer</span>
                <span className="text-xs text-gray-500 mt-1">1-2 business days</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`flex flex-col items-center justify-center p-6 border-2 rounded-xl transition-all ${
                  paymentMethod === 'cash'
                    ? 'border-primary-500 bg-primary-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <BanknotesIcon className="h-12 w-12 mb-3 text-primary-600" />
                <span className="text-base font-semibold text-gray-900">Cash Payment</span>
                <span className="text-xs text-gray-500 mt-1">Visit our office</span>
              </button>
            </div>
          </div>

          {/* Mobile Money Provider Selection */}
          {paymentMethod === 'mobile_money' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Choose Mobile Money Provider
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setMobileProvider('mtn')}
                  className={`p-6 border-2 rounded-xl transition-all ${
                    mobileProvider === 'mtn'
                      ? 'border-yellow-500 bg-yellow-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-4xl font-bold text-yellow-500 mb-2">MTN</div>
                    <div className="text-sm text-gray-600">Mobile Money</div>
                    <div className="text-xs text-gray-500 mt-1">Dial *165#</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMobileProvider('airtel')}
                  className={`p-6 border-2 rounded-xl transition-all ${
                    mobileProvider === 'airtel'
                      ? 'border-red-500 bg-red-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-4xl font-bold text-red-500 mb-2">Airtel</div>
                    <div className="text-sm text-gray-600">Money</div>
                    <div className="text-xs text-gray-500 mt-1">Dial *185#</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMobileProvider('africell')}
                  className={`p-6 border-2 rounded-xl transition-all ${
                    mobileProvider === 'africell'
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-4xl font-bold text-blue-500 mb-2">Africell</div>
                    <div className="text-sm text-gray-600">Money</div>
                    <div className="text-xs text-gray-500 mt-1">Dial *144#</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Phone Number Input (Mobile Money) */}
          {paymentMethod === 'mobile_money' && (
            <div className="mb-6">
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <DevicePhoneMobileIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="tel"
                  id="phone"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="256 700 000 000"
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Enter your {mobileProvider.toUpperCase()} Mobile Money registered number
              </p>
            </div>
          )}

          {/* Bank Transfer Information */}
          {paymentMethod === 'bank_transfer' && (
            <div className="mb-6 p-6 bg-blue-50 border-2 border-blue-200 rounded-xl">
              <h4 className="text-base font-semibold text-blue-900 mb-4 flex items-center">
                <CreditCardIcon className="h-5 w-5 mr-2" />
                Bank Transfer Details
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-blue-700">Bank Name:</span>
                  <span className="text-sm text-blue-900 font-semibold">Stanbic Bank Uganda</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-blue-700">Account Name:</span>
                  <span className="text-sm text-blue-900 font-semibold">QuickCredit Ltd</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-blue-700">Account Number:</span>
                  <span className="text-sm text-blue-900 font-semibold">9030007654321</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-blue-700">Reference:</span>
                  <span className="text-sm text-blue-900 font-semibold">Your Loan ID / {user?.firstName}</span>
                </div>
                <div className="mt-4 p-3 bg-blue-100 rounded-lg">
                  <p className="text-xs text-blue-800">
                    ⚠️ <strong>Important:</strong> Please include your name or loan ID in the transfer reference for easy identification.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Cash Payment Information */}
          {paymentMethod === 'cash' && (
            <div className="mb-6 p-6 bg-green-50 border-2 border-green-200 rounded-xl">
              <h4 className="text-base font-semibold text-green-900 mb-4 flex items-center">
                <BanknotesIcon className="h-5 w-5 mr-2" />
                Cash Payment Locations
              </h4>
              <div className="space-y-4">
                <div className="p-4 bg-white rounded-lg border border-green-200">
                  <div className="flex items-start">
                    <span className="text-2xl mr-3">📍</span>
                    <div>
                      <p className="font-semibold text-green-900">Main Office</p>
                      <p className="text-sm text-green-700">Plot 123, Kampala Road</p>
                      <p className="text-sm text-green-700">Kampala, Uganda</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-white rounded-lg border border-green-200">
                  <div className="flex items-start">
                    <span className="text-2xl mr-3">📍</span>
                    <div>
                      <p className="font-semibold text-green-900">Branch Office</p>
                      <p className="text-sm text-green-700">Ntinda Shopping Center, Ground Floor</p>
                      <p className="text-sm text-green-700">Kampala, Uganda</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-green-100 rounded-lg">
                  <p className="text-xs text-green-800">
                    🕒 <strong>Business Hours:</strong> Monday - Friday, 8:00 AM - 5:00 PM | Saturday, 9:00 AM - 1:00 PM
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Loan Selection */}
          {activeLoans.length > 0 && (
            <div className="mb-6">
              <label htmlFor="loan" className="block text-sm font-medium text-gray-700 mb-2">
                Select Loan to Pay
              </label>
              <select
                id="loan"
                value={selectedLoanId}
                onChange={(e) => setSelectedLoanId(e.target.value)}
                className="block w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              >
                {activeLoans.map((loan) => (
                  <option key={loan.id} value={loan.id}>
                    Loan #{loan.loanId} - Balance: {formatCurrency(loan.balanceRemaining)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeLoans.length === 0 && !isLoadingLoans && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800">🎉 Great news! You have no outstanding loan balance.</p>
            </div>
          )}

          {/* Amount Input */}
          <div className="mb-6">
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
              Payment Amount (UGX)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 text-lg">UGX</span>
              </div>
              <input
                type="number"
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50,000"
                className="block w-full pl-16 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-lg"
                required
                min="1000"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedLoanId && activeLoans.length > 0 && (() => {
                const selectedLoan = activeLoans.find(l => l.id === selectedLoanId);
                if (!selectedLoan) return null;
                
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setAmount(selectedLoan.monthlyPayment?.toString() || '')}
                      className="px-4 py-2 text-sm bg-primary-100 text-primary-700 rounded-full hover:bg-primary-200 transition-colors font-medium"
                    >
                      Monthly Payment: {formatCurrency(selectedLoan.monthlyPayment || 0)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmount(selectedLoan.balanceRemaining?.toString() || '')}
                      className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors font-medium"
                    >
                      Full Balance: {formatCurrency(selectedLoan.balanceRemaining || 0)}
                    </button>
                    {selectedLoan.balanceRemaining > 2000 && (
                      <button
                        type="button"
                        onClick={() => setAmount((selectedLoan.balanceRemaining / 2).toString())}
                        className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors font-medium"
                      >
                        Half Payment: {formatCurrency((selectedLoan.balanceRemaining || 0) / 2)}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Payment Summary */}
          {amount && parseFloat(amount) >= 1000 && (
            <div className="mb-6 p-6 bg-gray-50 rounded-xl border border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Payment Summary</h4>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Payment Method:</span>
                  <span className="font-medium text-gray-900">
                    {paymentMethod === 'mobile_money' 
                      ? `${mobileProvider.toUpperCase()} Mobile Money`
                      : paymentMethod === 'bank_transfer'
                      ? 'Bank Transfer'
                      : 'Cash Payment'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Amount:</span>
                  <span className="font-medium text-gray-900">{formatCurrency(parseFloat(amount))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Processing Fee:</span>
                  <span className="font-medium text-green-600">FREE</span>
                </div>
                <div className="border-t border-gray-300 pt-3 flex justify-between">
                  <span className="font-semibold text-gray-900">Total Amount:</span>
                  <span className="font-bold text-xl text-primary-600">{formatCurrency(parseFloat(amount))}</span>
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isProcessing || !amount || parseFloat(amount) < 1000}
            className="w-full py-4 px-6 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold text-lg flex items-center justify-center"
          >
            {isProcessing ? (
              <>
                <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />
                Processing Payment...
              </>
            ) : (
              <>
                <CheckCircleIcon className="h-5 w-5 mr-2" />
                Confirm Payment
              </>
            )}
          </button>
        </form>
      </div>

      {/* Payment History */}
      <div className="card">
        <div className="border-b border-gray-200 pb-4 mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Payment History</h2>
          <p className="text-sm text-gray-600 mt-1">Your recent payment transactions</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reference
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Method
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paymentHistory.map((payment) => (
                <tr key={payment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(payment.paidAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                    {payment.receiptNumber}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {payment.paymentMethod}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                    {formatCurrency(payment.amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {getStatusIcon(payment.status.toLowerCase())}
                      <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(payment.status.toLowerCase())}`}>
                        {payment.status.charAt(0).toUpperCase() + payment.status.slice(1).toLowerCase()}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {paymentHistory.length === 0 && (
          <div className="text-center py-12">
            <ClockIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No payment history yet</p>
            <p className="text-sm text-gray-500 mt-1">Your completed payments will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Payments;