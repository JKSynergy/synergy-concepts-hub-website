import React, { useState, useEffect } from 'react';
import { X, FileText, User, Briefcase, DollarSign, Users, Check, Calendar, Calculator } from 'lucide-react';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';
import '../../styles/flatpickr-custom.css';
import { useToast } from '../Toast';

interface NewApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const NewApplicationModal: React.FC<NewApplicationModalProps> = ({ isOpen, onClose }) => {
  const { addToast } = useToast();
  // Load form data from localStorage on component mount
  const loadFormData = () => {
    try {
      const savedData = localStorage.getItem('loanApplicationFormData');
      if (savedData) {
        return JSON.parse(savedData);
      }
    } catch (error) {
      console.error('Error loading form data:', error);
    }
    return {
      // Personal Information
      fullName: '',
      dateOfBirth: '',
      nationalId: '',
      phoneNumber: '',
      emailAddress: '',
      residentialAddress: '',
      
      // Employment & Income
      employmentStatus: '',
      employerBusinessName: '',
      monthlyIncome: '',
      
      // Loan Details
      requestedLoanAmount: '',
      interestRate: 'SELECT RATE...',
      loanTerm: '',
      purposeOfLoan: '',
      collateral: '',
      
      // Guarantor Information
      guarantorName: '',
      guarantorId: '',
      guarantorPhone: '',
      guarantorRelation: '',
      
      // Consent
      verifyEmployment: false,
      receiveNotifications: false
    };
  };

  const [formData, setFormData] = useState(loadFormData);

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const totalSteps = 5;

  // Save form data to localStorage whenever formData changes
  useEffect(() => {
    localStorage.setItem('loanApplicationFormData', JSON.stringify(formData));
  }, [formData]);

  // Clear localStorage on successful submission
  const clearSavedData = () => {
    localStorage.removeItem('loanApplicationFormData');
  };

  // Function to calculate automatic interest rate based on loan amount
  const calculateInterestRate = (amount: number): string => {
    if (amount < 500000) {
      return '20%'; // Below 500k UGX = 20%
    } else if (amount >= 500000 && amount < 2000000) {
      return '15%'; // 500k-2M UGX = 15%
    } else if (amount >= 2000000 && amount < 5000000) {
      return '12%'; // 2M-5M UGX = 12%
    } else {
      return '10%'; // 5M+ UGX = 10%
    }
  };

  // Function to calculate loan details
  const calculateLoanDetails = () => {
    const loanAmount = parseFloat(formData.requestedLoanAmount) || 0;
    const termMonths = parseInt(formData.loanTerm) || 0;
    const interestRateStr = formData.interestRate;
    
    if (loanAmount <= 0 || termMonths <= 0 || !interestRateStr || interestRateStr === 'SELECT RATE...') {
      return {
        monthlyPayment: 0,
        totalAmount: 0,
        totalInterest: 0,
        isValid: false
      };
    }

    // Extract numeric interest rate from string (e.g., "15%" -> 15)
    const monthlyInterestRate = parseFloat(interestRateStr.replace('%', '')) / 100 || 0;
    
    // For very short terms (1-2 months), use simple interest calculation
    if (termMonths <= 2) {
      const totalInterest = loanAmount * monthlyInterestRate * termMonths;
      const totalAmount = loanAmount + totalInterest;
      const monthlyPayment = totalAmount / termMonths;
      
      return {
        monthlyPayment,
        totalAmount,
        totalInterest,
        isValid: true
      };
    }
    
    // For longer terms, use compound interest formula
    const monthlyPayment = loanAmount * (monthlyInterestRate * Math.pow(1 + monthlyInterestRate, termMonths)) / (Math.pow(1 + monthlyInterestRate, termMonths) - 1);
    const totalAmount = monthlyPayment * termMonths;
    const totalInterest = totalAmount - loanAmount;

    return {
      monthlyPayment: isFinite(monthlyPayment) ? monthlyPayment : 0,
      totalAmount: isFinite(totalAmount) ? totalAmount : 0,
      totalInterest: isFinite(totalInterest) ? totalInterest : 0,
      isValid: true
    };
  };

  // Get current loan calculations
  const loanCalculations = calculateLoanDetails();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checkbox = e.target as HTMLInputElement;
      setFormData((prev: typeof formData) => ({
        ...prev,
        [name]: checkbox.checked
      }));
    } else {
      // Convert to uppercase for all fields except email
      const processedValue = name === 'emailAddress' ? value : value.toUpperCase();
      
      // If the loan amount is being changed, automatically set interest rate
      if (name === 'requestedLoanAmount' && value) {
        const loanAmount = parseFloat(value);
        if (!isNaN(loanAmount) && loanAmount > 0) {
          const autoInterestRate = calculateInterestRate(loanAmount);
          setFormData((prev: typeof formData) => ({
            ...prev,
            [name]: processedValue,
            interestRate: autoInterestRate
          }));
          return;
        }
      }
      
      setFormData((prev: typeof formData) => ({
        ...prev,
        [name]: processedValue
      }));
    }
  };

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);

      // Validate required fields
      const requiredFields = [
        { field: 'fullName', message: 'Full Name is required' },
        { field: 'phoneNumber', message: 'Phone Number is required' },
        { field: 'requestedLoanAmount', message: 'Loan Amount is required' },
        { field: 'loanTerm', message: 'Loan Term is required' },
        { field: 'purposeOfLoan', message: 'Purpose of Loan is required' }
      ];

      for (const { field, message } of requiredFields) {
        if (!formData[field as keyof typeof formData]) {
          setSubmitError(message);
          addToast({
            type: 'error',
            title: 'Validation Error',
            message: message
          });
          setIsSubmitting(false);
          return;
        }
      }

      // Submit to API - backend will generate the application ID
      const submissionData = {
        ...formData
        // Note: no applicationId included - backend will generate it
      };

      const response = await fetch('http://localhost:3002/api/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submissionData),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Backend submission failed:', result);
        setSubmitError(result.message || 'Failed to submit application');
        addToast({
          type: 'error',
          title: 'Submission Failed',
          message: result.message || 'Failed to submit application. Please try again.',
          duration: 5000
        });
        return;
      }

      // Show success message with backend-generated ID
      const applicationId = result.data?.applicationId || 'Unknown';
      addToast({
        type: 'success',
        title: 'Application Submitted Successfully!',
        message: `Your application ${applicationId} has been submitted and is now under review.`,
        duration: 7000
      });

      console.log('Application submitted successfully to backend:', result);
      
      // Clear saved data after successful submission
      clearSavedData();
      
      // Reset form and close modal
      resetForm();
      onClose();

    } catch (error) {
      console.error('Error submitting application:', error);
      
      setSubmitError('Network error occurred. Please check your connection and try again.');
      addToast({
        type: 'error',
        title: 'Network Error',
        message: 'Unable to connect to server. Please check your connection and try again.',
        duration: 7000
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    const initialFormData = {
      fullName: '',
      dateOfBirth: '',
      nationalId: '',
      phoneNumber: '',
      emailAddress: '',
      residentialAddress: '',
      employmentStatus: '',
      employerBusinessName: '',
      monthlyIncome: '',
      requestedLoanAmount: '',
      interestRate: 'SELECT RATE...',
      loanTerm: '',
      purposeOfLoan: '',
      collateral: '',
      guarantorName: '',
      guarantorId: '',
      guarantorPhone: '',
      guarantorRelation: '',
      verifyEmployment: false,
      receiveNotifications: false
    };
    
    setFormData(initialFormData);
    setCurrentStep(1);
    clearSavedData();
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase placeholder:normal-case"
                  placeholder="Enter full name"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date of Birth
                </label>
                <div className="relative">
                  <Flatpickr
                    value={formData.dateOfBirth}
                    onChange={(date) => {
                      setFormData((prev: typeof formData) => ({
                        ...prev,
                        dateOfBirth: date[0] ? date[0].toISOString().split('T')[0] : ''
                      }));
                    }}
                    options={{
                      dateFormat: 'Y-m-d',
                      maxDate: new Date(),
                      allowInput: true,
                      altInput: true,
                      altFormat: 'F j, Y'
                    }}
                    placeholder="Select date of birth"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 h-4 w-4 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  National ID / Passport
                </label>
                <input
                  type="text"
                  name="nationalId"
                  value={formData.nationalId}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase placeholder:normal-case"
                  placeholder="Enter ID number"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase placeholder:normal-case"
                  placeholder="Enter phone number"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  name="emailAddress"
                  value={formData.emailAddress}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Enter email address (optional)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Residential Address
                </label>
                <input
                  type="text"
                  name="residentialAddress"
                  value={formData.residentialAddress}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase placeholder:normal-case"
                  placeholder="Enter residential address"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Employment & Income
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Employment Status
                </label>
                <select
                  name="employmentStatus"
                  value={formData.employmentStatus}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase"
                  style={{ textTransform: 'uppercase' }}
                >
                  <option value="">SELECT STATUS</option>
                  <option value="EMPLOYED">EMPLOYED</option>
                  <option value="SELF-EMPLOYED">SELF-EMPLOYED</option>
                  <option value="BUSINESS-OWNER">BUSINESS OWNER</option>
                  <option value="UNEMPLOYED">UNEMPLOYED</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Employer / Business Name
                </label>
                <input
                  type="text"
                  name="employerBusinessName"
                  value={formData.employerBusinessName}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase placeholder:normal-case"
                  placeholder="Enter employer/business name"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Monthly Income (UGX)
                </label>
                <input
                  type="number"
                  name="monthlyIncome"
                  value={formData.monthlyIncome}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Enter monthly income"
                />
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Loan Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Requested Loan Amount (UGX)
                </label>
                <input
                  type="number"
                  name="requestedLoanAmount"
                  value={formData.requestedLoanAmount}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Enter loan amount"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Interest Rate
                  <span className="text-xs text-blue-600 dark:text-blue-400 ml-2">
                    (Auto-calculated based on loan amount)
                  </span>
                </label>
                <div className="relative">
                  <select
                    name="interestRate"
                    value={formData.interestRate}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase"
                    style={{ textTransform: 'uppercase' }}
                  >
                    <option value="SELECT RATE...">SELECT RATE...</option>
                    <option value="10%">10% MONTHLY (5M+ UGX)</option>
                    <option value="12%">12% MONTHLY (2M-5M UGX)</option>
                    <option value="15%">15% MONTHLY (500K-2M UGX)</option>
                    <option value="20%">20% MONTHLY (Below 500K UGX)</option>
                  </select>
                  {formData.requestedLoanAmount && formData.interestRate !== 'SELECT RATE...' && (
                    <div className="mt-1 text-xs text-green-600 dark:text-green-400">
                      ✓ Automatically set based on loan amount: UGX {parseFloat(formData.requestedLoanAmount).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Loan Term (months)
                </label>
                <input
                  type="number"
                  name="loanTerm"
                  value={formData.loanTerm}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Enter loan term"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Purpose of Loan
                </label>
                <input
                  type="text"
                  name="purposeOfLoan"
                  value={formData.purposeOfLoan}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase placeholder:normal-case"
                  placeholder="Enter purpose of loan"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Collateral
                </label>
                <textarea
                  name="collateral"
                  value={formData.collateral}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase placeholder:normal-case"
                  placeholder="Describe collateral or security"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>

              {/* Loan Calculator */}
              <div className="md:col-span-2">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
                    <Calculator className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    Loan Calculator
                  </h4>
                  
                  {loanCalculations.isValid ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Monthly Payment */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div className="text-center">
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Monthly Payment</p>
                          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                            UGX {loanCalculations.monthlyPayment.toLocaleString('en-US', { 
                              minimumFractionDigits: 0, 
                              maximumFractionDigits: 0 
                            })}
                          </p>
                        </div>
                      </div>

                      {/* Total Amount */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div className="text-center">
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Amount</p>
                          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                            UGX {loanCalculations.totalAmount.toLocaleString('en-US', { 
                              minimumFractionDigits: 0, 
                              maximumFractionDigits: 0 
                            })}
                          </p>
                        </div>
                      </div>

                      {/* Total Interest */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div className="text-center">
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Interest</p>
                          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                            UGX {loanCalculations.totalInterest.toLocaleString('en-US', { 
                              minimumFractionDigits: 0, 
                              maximumFractionDigits: 0 
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Calculator className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
                      <p className="text-gray-600 dark:text-gray-400 font-medium">
                        Enter loan amount, interest rate, and term to see calculations
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                        Complete the loan details above to view payment breakdown
                      </p>
                    </div>
                  )}

                  {/* Calculation Summary */}
                  {loanCalculations.isValid && (
                    <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                        <div className="flex justify-between">
                          <span>Principal Amount:</span>
                          <span className="font-medium">UGX {parseFloat(formData.requestedLoanAmount || '0').toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Interest Rate:</span>
                          <span className="font-medium">{formData.interestRate} monthly</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Loan Term:</span>
                          <span className="font-medium">{formData.loanTerm} months</span>
                        </div>
                        <div className="flex justify-between font-semibold text-gray-800 dark:text-gray-200 pt-2 border-t border-gray-200 dark:border-gray-700">
                          <span>You will pay:</span>
                          <span>UGX {loanCalculations.monthlyPayment.toLocaleString('en-US', { 
                            minimumFractionDigits: 0, 
                            maximumFractionDigits: 0 
                          })} × {formData.loanTerm} months</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Users className="h-5 w-5" />
              Guarantor Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Guarantor Name
                </label>
                <input
                  type="text"
                  name="guarantorName"
                  value={formData.guarantorName}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase placeholder:normal-case"
                  placeholder="Enter guarantor name"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Guarantor ID
                </label>
                <input
                  type="text"
                  name="guarantorId"
                  value={formData.guarantorId}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase placeholder:normal-case"
                  placeholder="Enter guarantor ID"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Guarantor Phone
                </label>
                <input
                  type="tel"
                  name="guarantorPhone"
                  value={formData.guarantorPhone}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase placeholder:normal-case"
                  placeholder="Enter guarantor phone"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Guarantor Relation
                </label>
                <input
                  type="text"
                  name="guarantorRelation"
                  value={formData.guarantorRelation}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase placeholder:normal-case"
                  placeholder="Relationship to guarantor"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Check className="h-5 w-5" />
              Consent
            </h3>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="verifyEmployment"
                  name="verifyEmployment"
                  checked={formData.verifyEmployment}
                  onChange={handleInputChange}
                  className="mt-1 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="verifyEmployment" className="text-sm text-gray-700 dark:text-gray-300">
                  I authorize verification of my employment & credit history
                </label>
              </div>
              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="receiveNotifications"
                  name="receiveNotifications"
                  checked={formData.receiveNotifications}
                  onChange={handleInputChange}
                  className="mt-1 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="receiveNotifications" className="text-sm text-gray-700 dark:text-gray-300">
                  I agree to receive notifications via SMS & email
                </label>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Check if form has data
  const hasFormData = () => {
    return Object.values(formData).some(value => 
      typeof value === 'string' ? value.trim() !== '' && value !== 'SELECT RATE...' : value === true
    );
  };

  // Handle close with confirmation if there's unsaved data
  const handleClose = () => {
    if (hasFormData() && !submitSuccess) {
      const confirmClose = window.confirm(
        'You have unsaved changes. Are you sure you want to close? Your data will be saved locally for when you return.'
      );
      if (confirmClose) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 dark:bg-primary-900 rounded-lg">
              <FileText className="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                New Loan Application
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Step {currentStep} of {totalSteps}
                {hasFormData() && (
                  <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                    • Auto-saved
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
              <React.Fragment key={step}>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step <= currentStep
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {step}
                </div>
                {step < totalSteps && (
                  <div
                    className={`flex-1 h-1 rounded ${
                      step < currentStep
                        ? 'bg-primary-600'
                        : 'bg-gray-200 dark:bg-gray-600'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {renderStepContent()}
        </div>

        {/* Footer */}
        {/* Error/Success Messages */}
        {submitError && (
          <div className="mx-6 mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
          </div>
        )}
        {submitSuccess && (
          <div className="mx-6 mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm text-green-600 dark:text-green-400">Application submitted successfully!</p>
          </div>
        )}

        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 1 || isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <div className="flex gap-2">
            {hasFormData() && (
              <button
                onClick={resetForm}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Clear Form
              </button>
            )}
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            {currentStep === totalSteps ? (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-6 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Submitting...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Submit Application
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewApplicationModal;