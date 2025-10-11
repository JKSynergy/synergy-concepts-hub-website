import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { loansApi } from '../services/api';
import { Loan } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';
import {
  BanknotesIcon,
  CalendarIcon,
  CreditCardIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';

const Loans: React.FC = () => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchLoans();
  }, [currentPage]);

  const fetchLoans = async () => {
    try {
      const response = await loansApi.getLoans(currentPage, 10);
      if (response.success) {
        setLoans(response.data);
        setTotalPages(response.pagination.totalPages);
      } else {
        toast.error('Failed to load loans');
      }
    } catch (error) {
      console.error('Failed to fetch loans:', error);
      toast.error('Failed to load loans');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-UG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      ACTIVE: { color: 'bg-green-100 text-green-800', label: 'Active' },
      PENDING: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
      COMPLETED: { color: 'bg-blue-100 text-blue-800', label: 'Completed' },
      OVERDUE: { color: 'bg-red-100 text-red-800', label: 'Overdue' },
      DEFAULTED: { color: 'bg-red-100 text-red-800', label: 'Defaulted' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || 
      { color: 'bg-gray-100 text-gray-800', label: status };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Loans</h1>
          <p className="text-gray-600">Manage and track your loan accounts</p>
        </div>
        <Link
          to="/applications/new"
          className="btn btn-primary"
        >
          Apply for New Loan
        </Link>
      </div>

      {/* Loans Grid */}
      {loans.length > 0 ? (
        <div className="grid gap-6">
          {loans.map((loan) => (
            <div key={loan.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <BanknotesIcon className="h-8 w-8 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-medium text-gray-900">
                      Loan #{loan.loanId}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {loan.termMonths} months • {loan.interestRate}% interest
                    </p>
                    <div className="mt-2">
                      {getStatusBadge(loan.status)}
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <Link
                    to={`/loans/${loan.id}`}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <EyeIcon className="h-4 w-4 mr-2" />
                    View Details
                  </Link>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Principal Amount</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatCurrency(loan.principal)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Balance Remaining</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatCurrency(loan.balanceRemaining)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Monthly Payment</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatCurrency(loan.monthlyPayment)}
                  </p>
                </div>
              </div>

              {loan.nextPaymentDate && (
                <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <div className="flex items-center">
                    <CalendarIcon className="h-5 w-5 text-yellow-600" />
                    <span className="ml-2 text-sm text-yellow-800">
                      Next payment due: <strong>{formatDate(loan.nextPaymentDate)}</strong>
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-4 flex space-x-3">
                <Link
                  to={`/payments?loanId=${loan.id}`}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                >
                  <CreditCardIcon className="h-4 w-4 mr-2" />
                  Make Payment
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <BanknotesIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No loans found</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by applying for your first loan.
          </p>
          <div className="mt-6">
            <Link
              to="/applications/new"
              className="btn btn-primary"
            >
              Apply for Loan
            </Link>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-3 py-2 text-sm text-gray-700">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default Loans;