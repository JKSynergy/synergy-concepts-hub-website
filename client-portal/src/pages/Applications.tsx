import React, { useState, useEffect } from 'react';
import { applicationsApi } from '../services/api';
import { LoanApplication } from '../types';
import { formatDate } from '../utils/dateFormatter';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import {
  PlusIcon,
  DocumentTextIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronRightIcon,
  CurrencyDollarIcon,
  CalendarIcon,
  BriefcaseIcon,
  UserIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const Applications: React.FC = () => {
  const { user } = useAuth();
  const [applications, setApplications] = useState<LoanApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Comprehensive form data matching admin form
  const [formData, setFormData] = useState({
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
    interestRate: '15%',
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
  });

  useEffect(() => {
    fetchApplications();
  }, []);

  useEffect(() => {
    // Pre-fill user data when form is opened
    if (user && showForm) {
      setFormData(prev => ({
        ...prev,
        fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        phoneNumber: user.phone || '',
        emailAddress: user.email || '',
        nationalId: user.nationalId || '',
        dateOfBirth: user.dateOfBirth ? user.dateOfBirth.split('T')[0] : '',
        residentialAddress: [user.village, user.subcounty, user.district].filter(Boolean).join(', '),
        monthlyIncome: user.monthlyIncome?.toString() || '',
      }));
    }
  }, [user, showForm]);

  const fetchApplications = async () => {
    try {
      setIsLoading(true);
      const response = await applicationsApi.getApplications();
      if (response.success && response.data) {
        setApplications(response.data);
      }
    } catch (error) {
      console.error('Fetch applications error:', error);
      toast.error('Failed to load applications');
    } finally {
      setIsLoading(false);
    }
  };

  // Function to calculate automatic interest rate based on loan amount
  const calculateInterestRate = (amount: number): string => {
    if (amount < 500000) {
      return '20%';
    } else if (amount >= 500000 && amount < 2000000) {
      return '15%';
    } else if (amount >= 2000000 && amount < 5000000) {
      return '12%';
    } else {
      return '10%';
    }
  };

  // Function to calculate loan details
  const calculateLoanDetails = () => {
    const loanAmount = parseFloat(formData.requestedLoanAmount) || 0;
    const termMonths = parseInt(formData.loanTerm) || 0;
    const interestRateStr = formData.interestRate;
    
    if (loanAmount <= 0 || termMonths <= 0 || !interestRateStr) {
      return {
        monthlyPayment: 0,
        totalAmount: 0,
        totalInterest: 0,
        isValid: false
      };
    }

    const monthlyInterestRate = parseFloat(interestRateStr.replace('%', '')) / 100 || 0;
    const totalInterest = loanAmount * monthlyInterestRate * termMonths;
    const totalAmount = loanAmount + totalInterest;
    const monthlyPayment = totalAmount / termMonths;

    return {
      monthlyPayment: isFinite(monthlyPayment) ? monthlyPayment : 0,
      totalAmount: isFinite(totalAmount) ? totalAmount : 0,
      totalInterest: isFinite(totalInterest) ? totalInterest : 0,
      isValid: true
    };
  };

  const loanCalculations = calculateLoanDetails();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checkbox = e.target as HTMLInputElement;
      setFormData(prev => ({
        ...prev,
        [name]: checkbox.checked
      }));
    } else {
      const processedValue = name === 'emailAddress' ? value : value.toUpperCase();
      
      if (name === 'requestedLoanAmount' && value) {
        const loanAmount = parseFloat(value);
        if (!isNaN(loanAmount) && loanAmount > 0) {
          const autoInterestRate = calculateInterestRate(loanAmount);
          setFormData(prev => ({
            ...prev,
            [name]: value,
            interestRate: autoInterestRate
          }));
          return;
        }
      }
      
      setFormData(prev => ({
        ...prev,
        [name]: name === 'requestedLoanAmount' || name === 'loanTerm' || name === 'monthlyIncome' ? value : processedValue
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (!formData.fullName || !formData.phoneNumber || !formData.requestedLoanAmount || 
          !formData.loanTerm || !formData.purposeOfLoan) {
        toast.error('Please fill in all required fields');
        setIsSubmitting(false);
        return;
      }

      const data = {
        requestedAmount: parseFloat(formData.requestedLoanAmount),
        purpose: formData.purposeOfLoan,
        termMonths: parseInt(formData.loanTerm),
      };

      const response = await applicationsApi.createApplication(data);

      if (response.success) {
        toast.success('Application submitted successfully!');
        setShowForm(false);
        setFormData({
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
          interestRate: '15%',
          loanTerm: '',
          purposeOfLoan: '',
          collateral: '',
          guarantorName: '',
          guarantorId: '',
          guarantorPhone: '',
          guarantorRelation: '',
          verifyEmployment: false,
          receiveNotifications: false
        });
        fetchApplications();
      } else {
        toast.error(response.message || 'Failed to submit application');
      }
    } catch (error) {
      console.error('Submit application error:', error);
      toast.error('Failed to submit application');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'APPROVED':
        return 'bg-green-100 text-green-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      case 'UNDER_REVIEW':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return <ClockIcon className="h-5 w-5" />;
      case 'APPROVED':
        return <CheckCircleIcon className="h-5 w-5" />;
      case 'REJECTED':
        return <XCircleIcon className="h-5 w-5" />;
      default:
        return <DocumentTextIcon className="h-5 w-5" />;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Loan Applications</h1>
          <p className="text-gray-600 mt-1">Track your loan application status</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <PlusIcon className="h-5 w-5" />
            New Application
          </button>
        )}
      </div>

      {/* Application Form */}
      {showForm && (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">New Loan Application</h2>
            <button
              onClick={() => setShowForm(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Personal Information Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2 pb-2 border-b">
                <UserIcon className="h-5 w-5 text-primary-600" />
                Personal Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    className="input-field uppercase"
                    placeholder="ENTER FULL NAME"
                    required
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    name="dateOfBirth"
                    value={formData.dateOfBirth}
                    onChange={handleChange}
                    className="input-field"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    National ID / Passport
                  </label>
                  <input
                    type="text"
                    name="nationalId"
                    value={formData.nationalId}
                    onChange={handleChange}
                    className="input-field uppercase"
                    placeholder="ENTER ID NUMBER"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="ENTER PHONE NUMBER"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    name="emailAddress"
                    value={formData.emailAddress}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="Enter email address"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Residential Address
                  </label>
                  <input
                    type="text"
                    name="residentialAddress"
                    value={formData.residentialAddress}
                    onChange={handleChange}
                    className="input-field uppercase"
                    placeholder="ENTER RESIDENTIAL ADDRESS"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
              </div>
            </div>

            {/* Employment & Income Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2 pb-2 border-b">
                <BriefcaseIcon className="h-5 w-5 text-primary-600" />
                Employment & Income
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Employment Status
                  </label>
                  <select
                    name="employmentStatus"
                    value={formData.employmentStatus}
                    onChange={handleChange}
                    className="input-field uppercase"
                  >
                    <option value="">SELECT STATUS</option>
                    <option value="EMPLOYED">EMPLOYED</option>
                    <option value="SELF-EMPLOYED">SELF-EMPLOYED</option>
                    <option value="BUSINESS-OWNER">BUSINESS OWNER</option>
                    <option value="UNEMPLOYED">UNEMPLOYED</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Employer / Business Name
                  </label>
                  <input
                    type="text"
                    name="employerBusinessName"
                    value={formData.employerBusinessName}
                    onChange={handleChange}
                    className="input-field uppercase"
                    placeholder="ENTER EMPLOYER/BUSINESS NAME"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Monthly Income (UGX)
                  </label>
                  <input
                    type="number"
                    name="monthlyIncome"
                    value={formData.monthlyIncome}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="Enter monthly income"
                  />
                </div>
              </div>
            </div>

            {/* Loan Details Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2 pb-2 border-b">
                <CurrencyDollarIcon className="h-5 w-5 text-primary-600" />
                Loan Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Requested Loan Amount (UGX) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="requestedLoanAmount"
                    value={formData.requestedLoanAmount}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="Enter loan amount"
                    required
                    min="100000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Interest Rate
                    <span className="text-xs text-blue-600 ml-2">
                      (Auto-calculated)
                    </span>
                  </label>
                  <select
                    name="interestRate"
                    value={formData.interestRate}
                    onChange={handleChange}
                    className="input-field uppercase"
                  >
                    <option value="10%">10% MONTHLY (5M+ UGX)</option>
                    <option value="12%">12% MONTHLY (2M-5M UGX)</option>
                    <option value="15%">15% MONTHLY (500K-2M UGX)</option>
                    <option value="20%">20% MONTHLY (Below 500K UGX)</option>
                  </select>
                  {formData.requestedLoanAmount && (
                    <div className="mt-1 text-xs text-green-600">
                      ✓ Set based on amount: UGX {parseFloat(formData.requestedLoanAmount).toLocaleString()}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Loan Term (months) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="loanTerm"
                    value={formData.loanTerm}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="Enter loan term"
                    required
                    min="1"
                    max="36"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Purpose of Loan <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="purposeOfLoan"
                    value={formData.purposeOfLoan}
                    onChange={handleChange}
                    className="input-field uppercase"
                    placeholder="ENTER PURPOSE OF LOAN"
                    required
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Collateral
                  </label>
                  <textarea
                    name="collateral"
                    value={formData.collateral}
                    onChange={handleChange}
                    rows={3}
                    className="input-field uppercase"
                    placeholder="DESCRIBE COLLATERAL OR SECURITY"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
              </div>

              {/* Loan Calculator */}
              {loanCalculations.isValid && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Loan Calculator</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                      <p className="text-sm font-medium text-gray-600 mb-2 text-center">Monthly Payment</p>
                      <p className="text-2xl font-bold text-blue-600 text-center">
                        {formatCurrency(loanCalculations.monthlyPayment)}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                      <p className="text-sm font-medium text-gray-600 mb-2 text-center">Total Amount</p>
                      <p className="text-2xl font-bold text-green-600 text-center">
                        {formatCurrency(loanCalculations.totalAmount)}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                      <p className="text-sm font-medium text-gray-600 mb-2 text-center">Total Interest</p>
                      <p className="text-2xl font-bold text-orange-600 text-center">
                        {formatCurrency(loanCalculations.totalInterest)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Guarantor Information Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2 pb-2 border-b">
                <UsersIcon className="h-5 w-5 text-primary-600" />
                Guarantor Information (Optional)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Guarantor Name
                  </label>
                  <input
                    type="text"
                    name="guarantorName"
                    value={formData.guarantorName}
                    onChange={handleChange}
                    className="input-field uppercase"
                    placeholder="ENTER GUARANTOR NAME"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Guarantor ID
                  </label>
                  <input
                    type="text"
                    name="guarantorId"
                    value={formData.guarantorId}
                    onChange={handleChange}
                    className="input-field uppercase"
                    placeholder="ENTER GUARANTOR ID"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Guarantor Phone
                  </label>
                  <input
                    type="tel"
                    name="guarantorPhone"
                    value={formData.guarantorPhone}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="ENTER GUARANTOR PHONE"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Relationship to Guarantor
                  </label>
                  <input
                    type="text"
                    name="guarantorRelation"
                    value={formData.guarantorRelation}
                    onChange={handleChange}
                    className="input-field uppercase"
                    placeholder="ENTER RELATIONSHIP"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
              </div>
            </div>

            {/* Consent Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2 pb-2 border-b">
                <DocumentTextIcon className="h-5 w-5 text-primary-600" />
                Consent & Authorization
              </h3>
              <div className="space-y-3">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    name="verifyEmployment"
                    checked={formData.verifyEmployment}
                    onChange={handleChange}
                    className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label className="ml-3 text-sm text-gray-700">
                    I authorize the verification of my employment and income details
                  </label>
                </div>
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    name="receiveNotifications"
                    checked={formData.receiveNotifications}
                    onChange={handleChange}
                    className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label className="ml-3 text-sm text-gray-700">
                    I agree to receive notifications about my loan application via SMS and email
                  </label>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-4 pt-4 border-t">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={isSubmitting}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-primary flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <LoadingSpinner />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="h-5 w-5" />
                    Submit Application
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Applications List */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Applications</h2>

        {applications.length === 0 ? (
          <div className="text-center py-12">
            <DocumentTextIcon className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg mb-2">No applications yet</p>
            <p className="text-gray-400 text-sm mb-6">
              Start by submitting your first loan application
            </p>
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="btn btn-primary inline-flex items-center gap-2"
              >
                <PlusIcon className="h-5 w-5" />
                Apply for a Loan
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {applications.map((app) => (
              <div
                key={app.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 hover:shadow-md transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg ${getStatusColor(app.status)}`}>
                        {getStatusIcon(app.status)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {app.applicationId || `APP-${app.id.slice(0, 8)}`}
                        </h3>
                        <p className="text-sm text-gray-500">
                          Submitted on {formatDate(app.submittedAt)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Requested Amount</p>
                        <p className="font-semibold text-gray-900">
                          {formatCurrency(app.requestedAmount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Loan Term</p>
                        <p className="font-semibold text-gray-900">
                          {app.termMonths} months
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Status</p>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                            app.status
                          )}`}
                        >
                          {app.status}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-xs text-gray-500 mb-1">Purpose</p>
                      <p className="text-sm text-gray-700 line-clamp-2">{app.purpose}</p>
                    </div>

                    {app.approvedAmount && (
                      <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-green-700 mb-1">Approved Amount</p>
                            <p className="text-lg font-bold text-green-900">
                              {formatCurrency(app.approvedAmount)}
                            </p>
                          </div>
                          <CheckCircleIcon className="h-8 w-8 text-green-600" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="ml-4">
                    <ChevronRightIcon className="h-6 w-6 text-gray-400" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Application Tips */}
      {!showForm && applications.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-100">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <DocumentTextIcon className="h-5 w-5 text-blue-600" />
            Application Tips
          </h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <span>Applications are typically reviewed within 24-48 hours</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <span>
                Make sure your contact information is up to date in your profile
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <span>You'll receive notifications about your application status</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default Applications;