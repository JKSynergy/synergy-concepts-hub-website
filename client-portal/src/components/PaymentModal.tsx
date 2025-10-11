import React, { useState } from 'react';
import { XMarkIcon, CreditCardIcon, DevicePhoneMobileIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  loanAmount?: number;
  nextPaymentAmount?: number;
}

type PaymentMethod = 'mobile_money' | 'bank_transfer' | 'cash';
type MobileProvider = 'mtn' | 'airtel' | 'africell';

const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  loanAmount = 0,
  nextPaymentAmount = 0,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mobile_money');
  const [mobileProvider, setMobileProvider] = useState<MobileProvider>('mtn');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [amount, setAmount] = useState(nextPaymentAmount.toString());
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast.success(`Payment of UGX ${parseFloat(amount).toLocaleString()} initiated successfully!`);
      onClose();
    } catch (error) {
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        ></div>

        {/* Center modal */}
        <span className="hidden sm:inline-block sm:h-screen sm:align-middle">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Make a Payment</h3>
              <button
                onClick={onClose}
                className="text-white hover:text-gray-200 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="px-6 py-6">
            {/* Payment Method Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Select Payment Method
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('mobile_money')}
                  className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg transition-all ${
                    paymentMethod === 'mobile_money'
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <DevicePhoneMobileIcon className="h-8 w-8 mb-2 text-primary-600" />
                  <span className="text-xs font-medium text-gray-700">Mobile Money</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank_transfer')}
                  className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg transition-all ${
                    paymentMethod === 'bank_transfer'
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <CreditCardIcon className="h-8 w-8 mb-2 text-primary-600" />
                  <span className="text-xs font-medium text-gray-700">Bank Transfer</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg transition-all ${
                    paymentMethod === 'cash'
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <BanknotesIcon className="h-8 w-8 mb-2 text-primary-600" />
                  <span className="text-xs font-medium text-gray-700">Cash Payment</span>
                </button>
              </div>
            </div>

            {/* Mobile Money Provider (shown only for mobile money) */}
            {paymentMethod === 'mobile_money' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Mobile Money Provider
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileProvider('mtn')}
                    className={`p-3 border-2 rounded-lg transition-all ${
                      mobileProvider === 'mtn'
                        ? 'border-yellow-500 bg-yellow-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-500">MTN</div>
                      <div className="text-xs text-gray-600 mt-1">Mobile Money</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMobileProvider('airtel')}
                    className={`p-3 border-2 rounded-lg transition-all ${
                      mobileProvider === 'airtel'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-500">Airtel</div>
                      <div className="text-xs text-gray-600 mt-1">Money</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMobileProvider('africell')}
                    className={`p-3 border-2 rounded-lg transition-all ${
                      mobileProvider === 'africell'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-500">Africell</div>
                      <div className="text-xs text-gray-600 mt-1">Money</div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Phone Number (for mobile money) */}
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
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Enter your {mobileProvider.toUpperCase()} Mobile Money number
                </p>
              </div>
            )}

            {/* Bank Details (for bank transfer) */}
            {paymentMethod === 'bank_transfer' && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="text-sm font-medium text-blue-900 mb-2">Bank Transfer Details</h4>
                <div className="space-y-1 text-sm text-blue-800">
                  <p><span className="font-medium">Bank:</span> Stanbic Bank Uganda</p>
                  <p><span className="font-medium">Account Name:</span> QuickCredit Ltd</p>
                  <p><span className="font-medium">Account Number:</span> 9030007654321</p>
                  <p><span className="font-medium">Reference:</span> Your Loan ID</p>
                </div>
              </div>
            )}

            {/* Cash Payment Info */}
            {paymentMethod === 'cash' && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="text-sm font-medium text-green-900 mb-2">Cash Payment Locations</h4>
                <div className="space-y-1 text-sm text-green-800">
                  <p>📍 Main Office: Plot 123, Kampala Road</p>
                  <p>📍 Branch Office: Ntinda Shopping Center</p>
                  <p className="mt-2 text-xs text-green-700">
                    Visit any of our locations during business hours (Mon-Fri, 8AM-5PM)
                  </p>
                </div>
              </div>
            )}

            {/* Amount */}
            <div className="mb-6">
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
                Payment Amount (UGX)
              </label>
              <input
                type="number"
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                required
                min="1000"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAmount(nextPaymentAmount.toString())}
                  className="text-xs px-3 py-1 bg-primary-100 text-primary-700 rounded-full hover:bg-primary-200"
                >
                  Next Payment: {formatCurrency(nextPaymentAmount)}
                </button>
                <button
                  type="button"
                  onClick={() => setAmount(loanAmount.toString())}
                  className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200"
                >
                  Full Amount: {formatCurrency(loanAmount)}
                </button>
              </div>
            </div>

            {/* Summary */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Payment Summary</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Amount:</span>
                  <span className="font-medium">{formatCurrency(parseFloat(amount) || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Processing Fee:</span>
                  <span className="font-medium">Free</span>
                </div>
                <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between">
                  <span className="font-medium text-gray-900">Total:</span>
                  <span className="font-bold text-primary-600">{formatCurrency(parseFloat(amount) || 0)}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isProcessing}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:bg-gray-400"
              >
                {isProcessing ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
