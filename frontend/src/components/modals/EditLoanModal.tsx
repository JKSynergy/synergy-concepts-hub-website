import React, { useState, useEffect } from 'react';
import { XCircle, Save, Calculator, AlertTriangle } from 'lucide-react';
import Flatpickr from 'react-flatpickr';
import { LoanData } from '../../services/databaseService';
import { 
  validateInterestRate, 
  getNearestAcceptableRate,
  calculateMonthlyPayment,
  calculateTotalInterest,
  formatCurrency
} from '../../utils/loanCalculations';
import 'flatpickr/dist/themes/light.css';

interface EditLoanModalProps {
  loan: LoanData;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedLoan: LoanData) => void;
}

const EditLoanModal: React.FC<EditLoanModalProps> = ({ loan, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    customerName: loan.borrower ? `${loan.borrower.firstName} ${loan.borrower.lastName}` : '',
    amount: loan.principal,
    term: loan.termMonths,
    interestRate: loan.interestRate,
    originationDate: loan.disbursedAt || new Date().toISOString(),
    dueDate: loan.nextPaymentDate || new Date().toISOString(),
    status: loan.status
  });

  const [calculations, setCalculations] = useState({
    monthlyPayment: 0,
    totalInterest: 0,
    totalPayment: 0
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      setFormData({
        customerName: loan.borrower ? `${loan.borrower.firstName} ${loan.borrower.lastName}` : '',
        amount: loan.principal,
        term: loan.termMonths,
        interestRate: loan.interestRate,
        originationDate: loan.disbursedAt || new Date().toISOString(),
        dueDate: loan.nextPaymentDate || new Date().toISOString(),
        status: loan.status
      });
      updateCalculations();
    }
  }, [isOpen, loan]);

  useEffect(() => {
    updateCalculations();
  }, [formData.amount, formData.interestRate, formData.term]);

  const updateCalculations = () => {
    setIsCalculating(true);
    try {
      const monthlyPayment = calculateMonthlyPayment(
        formData.amount,
        formData.interestRate,
        formData.term
      );
      const totalInterest = calculateTotalInterest(
        formData.amount,
        formData.interestRate,
        formData.term
      );
      const totalPayment = formData.amount + totalInterest;

      setCalculations({
        monthlyPayment,
        totalInterest,
        totalPayment
      });
    } catch (error) {
      console.error('Error calculating loan:', error);
    }
    setIsCalculating(false);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.customerName.trim()) {
      newErrors.customerName = 'Customer name is required';
    }

    if (formData.amount <= 0) {
      newErrors.amount = 'Loan amount must be greater than 0';
    }

    if (formData.amount > 50000000) { // 50M UGX limit
      newErrors.amount = 'Loan amount cannot exceed UGX 50,000,000';
    }

    if (formData.term <= 0 || formData.term > 60) {
      newErrors.term = 'Loan term must be between 1 and 60 months';
    }

    if (!validateInterestRate(formData.interestRate)) {
      newErrors.interestRate = 'Interest rate must be 10%, 12%, 15%, or 20%';
    }

    if (!formData.originationDate) {
      newErrors.originationDate = 'Origination date is required';
    }

    if (!formData.dueDate) {
      newErrors.dueDate = 'Due date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleInterestRateChange = (value: string) => {
    const rate = parseFloat(value) / 100; // Convert percentage to decimal
    const validatedRate = validateInterestRate(rate) ? rate : getNearestAcceptableRate(rate);
    handleInputChange('interestRate', validatedRate);
  };

  const handleSave = () => {
    if (validateForm()) {
      const updatedLoan: LoanData = {
        ...loan,
        principal: formData.amount,
        termMonths: formData.term,
        interestRate: formData.interestRate,
        disbursedAt: formData.originationDate,
        nextPaymentDate: formData.dueDate,
        status: formData.status,
        totalInterest: calculations.totalInterest,
        totalAmount: calculations.totalPayment,
        monthlyPayment: calculations.monthlyPayment
      };
      onSave(updatedLoan);
      onClose();
    }
  };

  const acceptableRates = [10, 12, 15, 20]; // Display as percentages

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Edit Loan - {loan.id}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <XCircle className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column - Form Fields */}
            <div className="space-y-6">
              <h4 className="text-lg font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                Loan Information
              </h4>

              {/* Customer Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={formData.customerName}
                  onChange={(e) => handleInputChange('customerName', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${
                    errors.customerName ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
                {errors.customerName && (
                  <p className="mt-1 text-sm text-red-600">{errors.customerName}</p>
                )}
              </div>

              {/* Loan Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Loan Amount (UGX)
                </label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => handleInputChange('amount', parseFloat(e.target.value) || 0)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${
                    errors.amount ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
                {errors.amount && (
                  <p className="mt-1 text-sm text-red-600">{errors.amount}</p>
                )}
              </div>

              {/* Loan Term */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Loan Term (Months)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={formData.term}
                  onChange={(e) => handleInputChange('term', parseInt(e.target.value) || 0)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${
                    errors.term ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
                {errors.term && (
                  <p className="mt-1 text-sm text-red-600">{errors.term}</p>
                )}
              </div>

              {/* Interest Rate */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Monthly Interest Rate (%)
                </label>
                <select
                  value={(formData.interestRate * 100).toString()}
                  onChange={(e) => handleInterestRateChange(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${
                    errors.interestRate ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {acceptableRates.map(rate => (
                    <option key={rate} value={rate}>
                      {rate}%
                    </option>
                  ))}
                </select>
                {errors.interestRate && (
                  <p className="mt-1 text-sm text-red-600">{errors.interestRate}</p>
                )}
              </div>

              {/* Origination Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Origination Date
                </label>
                <Flatpickr
                  value={formData.originationDate}
                  onChange={(date) => handleInputChange('originationDate', date[0]?.toISOString().split('T')[0] || '')}
                  options={{
                    dateFormat: "Y-m-d",
                    maxDate: "today"
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${
                    errors.originationDate ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
                {errors.originationDate && (
                  <p className="mt-1 text-sm text-red-600">{errors.originationDate}</p>
                )}
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Due Date
                </label>
                <Flatpickr
                  value={formData.dueDate}
                  onChange={(date) => handleInputChange('dueDate', date[0]?.toISOString().split('T')[0] || '')}
                  options={{
                    dateFormat: "Y-m-d",
                    minDate: formData.originationDate
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${
                    errors.dueDate ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
                {errors.dueDate && (
                  <p className="mt-1 text-sm text-red-600">{errors.dueDate}</p>
                )}
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => handleInputChange('status', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="Pending">Pending</option>
                  <option value="Active">Active</option>
                  <option value="Completed">Completed</option>
                  <option value="Defaulted">Defaulted</option>
                </select>
              </div>
            </div>

            {/* Right Column - Calculations */}
            <div className="space-y-6">
              <h4 className="text-lg font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2 flex items-center">
                <Calculator className="h-5 w-5 mr-2" />
                Loan Calculations
              </h4>

              {isCalculating ? (
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  <span className="ml-2">Calculating...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Monthly Payment:</span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(calculations.monthlyPayment)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Total Interest:</span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(calculations.totalInterest)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Payment:</span>
                        <span className="font-bold text-lg text-gray-900 dark:text-white">
                          {formatCurrency(calculations.totalPayment)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Validation Warnings */}
                  {!validateInterestRate(formData.interestRate) && (
                    <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                      <div className="flex">
                        <AlertTriangle className="h-5 w-5 text-yellow-400 mr-2" />
                        <div>
                          <h5 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                            Interest Rate Warning
                          </h5>
                          <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                            The selected rate will be adjusted to the nearest acceptable rate: {(getNearestAcceptableRate(formData.interestRate) * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Additional Info */}
                  <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                    <p><strong>Effective Annual Rate:</strong> {((formData.interestRate * 12) * 100).toFixed(1)}%</p>
                    <p><strong>Interest to Principal Ratio:</strong> {((calculations.totalInterest / formData.amount) * 100).toFixed(1)}%</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditLoanModal;