import React from 'react';
import { X, Trash2 } from 'lucide-react';

export interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  entityType: string;
  entityData: {
    id: string;
    name?: string;
    [key: string]: any;
  };
  isDeleting?: boolean;
  customMessage?: string;
}

export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  entityType,
  entityData,
  isDeleting = false,
  customMessage
}: DeleteConfirmationModalProps) {
  if (!isOpen) return null;

  const getEntityDisplayFields = () => {
    switch (entityType) {
      case 'application':
        return [
          { label: 'Application ID', value: entityData.applicationId || entityData.id },
          { label: 'Applicant', value: entityData.fullName || entityData.name },
          { label: 'Amount', value: entityData.requestedAmount ? `UGX ${entityData.requestedAmount?.toLocaleString()}` : 'N/A' },
          { label: 'Purpose', value: entityData.purpose || 'N/A' }
        ];
      case 'borrower':
        return [
          { label: 'Borrower ID', value: entityData.borrowerId || entityData.id },
          { label: 'Name', value: `${entityData.firstName || ''} ${entityData.lastName || ''}`.trim() || entityData.name },
          { label: 'Phone', value: entityData.phone || 'N/A' },
          { label: 'Status', value: entityData.status || 'N/A' }
        ];
      case 'loan':
        return [
          { label: 'Loan ID', value: entityData.loanId || entityData.id },
          { label: 'Borrower', value: entityData.borrowerName || entityData.name },
          { label: 'Amount', value: entityData.principal ? `UGX ${entityData.principal?.toLocaleString()}` : 'N/A' },
          { label: 'Status', value: entityData.status || 'N/A' }
        ];
      case 'repayment':
        return [
          { label: 'Receipt Number', value: entityData.receiptNumber || entityData.id },
          { label: 'Amount', value: entityData.amount ? `UGX ${entityData.amount?.toLocaleString()}` : 'N/A' },
          { label: 'Payment Method', value: entityData.paymentMethod || 'N/A' },
          { label: 'Date', value: entityData.paidAt ? new Date(entityData.paidAt).toLocaleDateString() : 'N/A' }
        ];
      case 'expense':
        return [
          { label: 'Expense ID', value: entityData.expenseId || entityData.id },
          { label: 'Description', value: entityData.description || entityData.name },
          { label: 'Amount', value: entityData.amount ? `UGX ${entityData.amount?.toLocaleString()}` : 'N/A' },
          { label: 'Category', value: entityData.category || 'N/A' }
        ];
      case 'savings':
        return [
          { label: 'Savings ID', value: entityData.savingsId || entityData.id },
          { label: 'Account Holder', value: entityData.accountHolder || entityData.name },
          { label: 'Balance', value: entityData.balance ? `UGX ${entityData.balance?.toLocaleString()}` : 'N/A' },
          { label: 'Status', value: entityData.status || 'N/A' }
        ];
      case 'saver':
        return [
          { label: 'Account ID', value: entityData.accountId || entityData.id },
          { label: 'Customer Name', value: entityData.customerName || entityData.name },
          { label: 'Phone', value: entityData.phone || 'N/A' },
          { label: 'Opening Date', value: entityData.openingDate ? new Date(entityData.openingDate).toLocaleDateString() : 'N/A' }
        ];
      case 'alert':
        return [
          { label: 'Alert ID', value: entityData.alertId || entityData.id },
          { label: 'Type', value: entityData.type || 'N/A' },
          { label: 'Message', value: entityData.message || entityData.name || 'N/A' },
          { label: 'Date', value: entityData.timestamp ? new Date(entityData.timestamp).toLocaleDateString() : 'N/A' }
        ];
      default:
        return [
          { label: 'ID', value: entityData.id },
          { label: 'Name', value: entityData.name || 'N/A' }
        ];
    }
  };

  const displayFields = getEntityDisplayFields();
  const entityTitle = entityType.charAt(0).toUpperCase() + entityType.slice(1);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full shadow-2xl">
        <div className="bg-gradient-to-r from-red-500 to-red-600 p-6 text-white rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Trash2 className="h-6 w-6" />
              <h3 className="text-xl font-bold">Confirm Deletion</h3>
            </div>
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="text-white hover:text-red-200 p-1 hover:bg-white/10 rounded-lg transition-all duration-200 disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="text-center mb-6">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900 mb-4">
              <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Delete {entityTitle}
            </h4>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {customMessage || `Are you sure you want to delete this ${entityType}?`}
            </p>
            
            {/* Entity Details */}
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-left space-y-2">
              {displayFields.map((field, index) => (
                <div key={index} className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {field.label}:
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {field.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Warning Message */}
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-6">
            <div className="flex items-start space-x-2">
              <div className="flex-shrink-0">
                <svg className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-red-800 dark:text-red-200">
                  <strong>Warning:</strong> This action is permanent.
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 flex items-center justify-center shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmationModal;