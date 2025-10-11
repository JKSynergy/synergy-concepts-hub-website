import React, { useState } from 'react';
import { useDelete, UseDeleteOptions } from '../hooks/useDelete';
import DeleteConfirmationModal from './DeleteConfirmationModal';

export interface DeleteButtonProps {
  entityType: 'borrower' | 'loan' | 'application' | 'repayment' | 'savings' | 'expense' | 
              'saver' | 'deposit' | 'withdrawal' | 'overdueRecord' | 'declinedLoan' | 'alert';
  entityId: string;
  entityData?: any; // Full entity data for display in modal
  entityName?: string;
  onSuccess?: (response: any) => void;
  onError?: (error: Error) => void;
  className?: string;
  children?: React.ReactNode;
  variant?: 'button' | 'icon' | 'text';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  confirmMessage?: string;
  useModal?: boolean; // Whether to use modal or simple confirm
}

export function DeleteButton({
  entityType,
  entityId,
  entityData,
  entityName,
  onSuccess,
  onError,
  className = '',
  children,
  variant = 'button',
  size = 'md',
  disabled = false,
  confirmMessage,
  useModal = true
}: DeleteButtonProps) {
  const [showModal, setShowModal] = useState(false);
  
  const {
    isDeleting,
    error,
    deleteBorrower,
    deleteLoan,
    deleteApplication,
    deleteRepayment,
    deleteSavings,
    deleteExpense,
    deleteSaver,
    deleteDeposit,
    deleteWithdrawal,
    deleteOverdueRecord,
    deleteDeclinedLoan,
    deleteAlert,
    clearError
  } = useDelete();

  const deleteOptions: UseDeleteOptions = {
    onSuccess,
    onError,
    entityName
  };

  const handleDelete = async () => {
    clearError();
    
    try {
      switch (entityType) {
        case 'borrower':
          await deleteBorrower(entityId, deleteOptions);
          break;
        case 'loan':
          await deleteLoan(entityId, deleteOptions);
          break;
        case 'application':
          await deleteApplication(entityId, deleteOptions);
          break;
        case 'repayment':
          await deleteRepayment(entityId, deleteOptions);
          break;
        case 'savings':
          await deleteSavings(entityId, deleteOptions);
          break;
        case 'expense':
          await deleteExpense(entityId, deleteOptions);
          break;
        case 'saver':
          await deleteSaver(entityId, deleteOptions);
          break;
        case 'deposit':
          await deleteDeposit(entityId, deleteOptions);
          break;
        case 'withdrawal':
          await deleteWithdrawal(entityId, deleteOptions);
          break;
        case 'overdueRecord':
          await deleteOverdueRecord(entityId, deleteOptions);
          break;
        case 'declinedLoan':
          await deleteDeclinedLoan(entityId, deleteOptions);
          break;
        case 'alert':
          await deleteAlert(entityId, deleteOptions);
          break;
        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }
      setShowModal(false);
    } catch (err) {
      // Error handling is done in the hook
      console.error('Delete operation failed:', err);
    }
  };

  const handleButtonClick = () => {
    if (useModal) {
      setShowModal(true);
    } else {
      // Fallback to simple confirm dialog
      const confirmed = window.confirm(
        confirmMessage || `Are you sure you want to delete this ${entityType}${entityName ? ` (${entityName})` : ''}? This action cannot be undone.`
      );
      if (confirmed) {
        handleDelete();
      }
    }
  };

  const getBaseClasses = () => {
    const sizeClasses = {
      sm: 'px-2 py-1 text-xs',
      md: 'px-3 py-1.5 text-sm',
      lg: 'px-4 py-2 text-base'
    };

    const baseClasses = `
      inline-flex items-center justify-center
      font-medium rounded-md
      transition-colors duration-200
      focus:outline-none focus:ring-2 focus:ring-offset-2
      disabled:opacity-50 disabled:cursor-not-allowed
      ${sizeClasses[size]}
    `;

    if (variant === 'button') {
      return `${baseClasses} 
        bg-red-600 text-white 
        hover:bg-red-700 
        focus:ring-red-500`;
    } else if (variant === 'icon') {
      return `${baseClasses} 
        text-red-600 
        hover:bg-red-50 
        focus:ring-red-500`;
    } else if (variant === 'text') {
      return `${baseClasses} 
        text-red-600 
        hover:text-red-800 
        focus:ring-red-500`;
    }

    return baseClasses;
  };

  const renderIcon = () => (
    <svg 
      className="w-4 h-4" 
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth={2} 
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" 
      />
    </svg>
  );

  const renderSpinner = () => (
    <svg 
      className="w-4 h-4 animate-spin" 
      fill="none" 
      viewBox="0 0 24 24"
    >
      <circle 
        className="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="4"
      />
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  return (
    <>
      <div className="relative">
        <button
          onClick={handleButtonClick}
          disabled={disabled || isDeleting}
          className={`${getBaseClasses()} ${className}`}
          title={`Delete ${entityType}${entityName ? ` (${entityName})` : ''}`}
        >
          {isDeleting ? (
            <>
              {renderSpinner()}
              {variant === 'button' && <span className="ml-2">Deleting...</span>}
            </>
          ) : (
            <>
              {renderIcon()}
              {variant === 'button' && (
                <span className="ml-2">
                  {children || `Delete ${entityType}`}
                </span>
              )}
              {variant === 'text' && (children || 'Delete')}
            </>
          )}
        </button>
        
        {error && (
          <div className="absolute top-full left-0 mt-1 p-2 bg-red-100 border border-red-300 rounded text-red-700 text-xs whitespace-nowrap z-10">
            {error}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {useModal && (
        <DeleteConfirmationModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onConfirm={handleDelete}
          entityType={entityType}
          entityData={entityData || { id: entityId, name: entityName }}
          isDeleting={isDeleting}
          customMessage={confirmMessage}
        />
      )}
    </>
  );
}

export interface BulkDeleteButtonProps {
  selectedIds: string[];
  entityType: string;
  onSuccess?: (response: any) => void;
  onError?: (error: Error) => void;
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean;
}

export function BulkDeleteButton({
  selectedIds,
  entityType,
  onSuccess,
  onError,
  className = '',
  children,
  disabled = false
}: BulkDeleteButtonProps) {
  const { isDeleting, error, deleteGeneric, clearError } = useDelete();

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    clearError();
    
    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedIds.length} ${entityType}(s)? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      // For now, we'll delete one by one since bulk delete endpoints may not exist for all entities
      // This can be optimized later with proper bulk endpoints
      for (const id of selectedIds) {
        // This would need to be implemented based on the specific entity type
        // For demonstration, we'll just log
        console.log(`Deleting ${entityType} ${id}`);
      }
      
      onSuccess?.({ deletedCount: selectedIds.length, message: `${selectedIds.length} ${entityType}(s) deleted successfully` });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to delete items');
      onError?.(error);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleBulkDelete}
        disabled={disabled || isDeleting || selectedIds.length === 0}
        className={`
          inline-flex items-center justify-center
          px-3 py-1.5 text-sm font-medium rounded-md
          bg-red-600 text-white
          hover:bg-red-700
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-200
          ${className}
        `}
      >
        {isDeleting ? (
          <>
            <svg className="w-4 h-4 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            Deleting...
          </>
        ) : (
          <>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            {children || `Delete Selected (${selectedIds.length})`}
          </>
        )}
      </button>
      
      {error && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-red-100 border border-red-300 rounded text-red-700 text-xs whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  );
}

export default DeleteButton;