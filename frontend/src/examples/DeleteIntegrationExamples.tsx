// Example Integration: Delete Functionality Usage Examples
// This file demonstrates how to integrate the delete functionality in various scenarios

import React from 'react';
import DeleteButton, { BulkDeleteButton } from '../components/DeleteButton';
import { useDelete } from '../hooks/useDelete';

// Example 1: Simple Delete Button in a List
export function ExampleBorrowersList({ borrowers, onRefresh }) {
  const handleDeleteSuccess = (response) => {
    console.log('Borrower deleted:', response.message);
    onRefresh(); // Refresh the list
  };

  return (
    <div className="space-y-4">
      {borrowers.map(borrower => (
        <div key={borrower.id} className="flex items-center justify-between p-4 border rounded">
          <div>
            <h3>{borrower.firstName} {borrower.lastName}</h3>
            <p>{borrower.phone}</p>
          </div>
          <div className="flex space-x-2">
            <button className="px-3 py-1 bg-blue-500 text-white rounded">Edit</button>
            <DeleteButton
              entityType="borrower"
              entityId={borrower.id}
              entityName={`${borrower.firstName} ${borrower.lastName}`}
              variant="button"
              size="sm"
              onSuccess={handleDeleteSuccess}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Example 2: Using the useDelete hook directly
export function ExampleCustomDeleteComponent({ loanId, onDeleteSuccess }) {
  const { isDeleting, deleteLoan, error } = useDelete();

  const handleDelete = async () => {
    try {
      await deleteLoan(loanId, {
        entityName: 'Business Loan',
        onSuccess: (response) => {
          console.log('Loan deleted successfully:', response);
          onDeleteSuccess();
        },
        onError: (error) => {
          console.error('Failed to delete loan:', error);
          alert('Failed to delete loan: ' + error.message);
        }
      });
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  return (
    <div>
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
      >
        {isDeleting ? 'Deleting...' : 'Delete Loan'}
      </button>
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  );
}

// Example 3: Bulk Delete with Selection
export function ExampleBulkDeleteTable({ items, itemType, onRefresh }) {
  const [selectedItems, setSelectedItems] = React.useState([]);

  const handleSelectItem = (itemId) => {
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleSelectAll = () => {
    setSelectedItems(prev => 
      prev.length === items.length ? [] : items.map(item => item.id)
    );
  };

  const handleBulkDeleteSuccess = (response) => {
    console.log('Bulk delete completed:', response);
    setSelectedItems([]);
    onRefresh();
  };

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={selectedItems.length === items.length}
            onChange={handleSelectAll}
            className="rounded"
          />
          <span>Select All</span>
        </div>
        
        {selectedItems.length > 0 && (
          <BulkDeleteButton
            selectedIds={selectedItems}
            entityType={itemType}
            onSuccess={handleBulkDeleteSuccess}
          />
        )}
      </div>

      <table className="w-full border">
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-b">
              <td className="p-2">
                <input
                  type="checkbox"
                  checked={selectedItems.includes(item.id)}
                  onChange={() => handleSelectItem(item.id)}
                  className="rounded"
                />
              </td>
              <td className="p-2">{item.name}</td>
              <td className="p-2">
                <DeleteButton
                  entityType={itemType}
                  entityId={item.id}
                  entityName={item.name}
                  variant="icon"
                  size="sm"
                  onSuccess={onRefresh}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Example 4: Modal with Delete Confirmation
export function ExampleDeleteModal({ isOpen, onClose, borrower, onDeleteSuccess }) {
  if (!isOpen) return null;

  const handleDeleteSuccess = (response) => {
    console.log('Borrower deleted from modal:', response);
    onDeleteSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Borrower Details</h2>
        
        <div className="space-y-2 mb-6">
          <p><strong>Name:</strong> {borrower.firstName} {borrower.lastName}</p>
          <p><strong>Phone:</strong> {borrower.phone}</p>
          <p><strong>Status:</strong> {borrower.status}</p>
        </div>

        <div className="flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
          >
            Close
          </button>
          
          <DeleteButton
            entityType="borrower"
            entityId={borrower.id}
            entityName={`${borrower.firstName} ${borrower.lastName}`}
            variant="button"
            size="md"
            onSuccess={handleDeleteSuccess}
          >
            Delete Borrower
          </DeleteButton>
        </div>
      </div>
    </div>
  );
}

// Example 5: Advanced Delete with Business Logic
export function ExampleAdvancedDelete({ loan, onDeleteSuccess }) {
  const { isDeleting, deleteLoan } = useDelete();

  const canDelete = loan.status !== 'ACTIVE' && loan.outstandingBalance === 0;

  const handleDelete = async () => {
    if (!canDelete) {
      alert('Cannot delete active loans or loans with outstanding balance');
      return;
    }

    try {
      await deleteLoan(loan.id, {
        entityName: `Loan ${loan.loanId}`,
        onSuccess: (response) => {
          // Custom business logic after deletion
          console.log('Loan deleted:', response);
          
          // Update analytics
          // analytics.track('loan_deleted', { loanId: loan.id });
          
          // Show success notification
          // showNotification('Loan deleted successfully');
          
          onDeleteSuccess();
        },
        onError: (error) => {
          console.error('Delete failed:', error);
          // Show error notification
          // showNotification('Failed to delete loan: ' + error.message, 'error');
        }
      });
    } catch (error) {
      console.error('Unexpected error:', error);
    }
  };

  return (
    <div className="p-4 border rounded">
      <h3 className="font-bold">Loan {loan.loanId}</h3>
      <p>Status: {loan.status}</p>
      <p>Outstanding: ${loan.outstandingBalance}</p>
      
      <div className="mt-4">
        {!canDelete && (
          <p className="text-red-500 text-sm mb-2">
            Cannot delete: {loan.status === 'ACTIVE' ? 'Loan is active' : 'Outstanding balance exists'}
          </p>
        )}
        
        <button
          onClick={handleDelete}
          disabled={isDeleting || !canDelete}
          className={`px-4 py-2 rounded ${
            canDelete 
              ? 'bg-red-600 text-white hover:bg-red-700' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isDeleting ? 'Deleting...' : 'Delete Loan'}
        </button>
      </div>
    </div>
  );
}

// Example 6: Delete with Undo Functionality (Basic Implementation)
export function ExampleDeleteWithUndo({ expense, onDeleteSuccess }) {
  const [showUndo, setShowUndo] = React.useState(false);
  const [undoTimeLeft, setUndoTimeLeft] = React.useState(5);
  const undoTimerRef = React.useRef(null);

  const handleDeleteSuccess = (response) => {
    console.log('Expense deleted with undo option:', response);
    
    // Show undo option for 5 seconds
    setShowUndo(true);
    setUndoTimeLeft(5);
    
    undoTimerRef.current = setInterval(() => {
      setUndoTimeLeft(prev => {
        if (prev <= 1) {
          setShowUndo(false);
          onDeleteSuccess();
          clearInterval(undoTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleUndo = () => {
    // In a real implementation, you would restore the deleted item
    console.log('Undo delete operation');
    setShowUndo(false);
    clearInterval(undoTimerRef.current);
    
    // Restore the item (this would need backend support)
    // restoreExpense(expense.id);
  };

  React.useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearInterval(undoTimerRef.current);
      }
    };
  }, []);

  if (showUndo) {
    return (
      <div className="p-4 bg-yellow-100 border border-yellow-400 rounded">
        <p>Expense deleted. Undo in {undoTimeLeft} seconds...</p>
        <button
          onClick={handleUndo}
          className="px-3 py-1 bg-blue-600 text-white rounded mt-2"
        >
          Undo Delete
        </button>
      </div>
    );
  }

  return (
    <DeleteButton
      entityType="expense"
      entityId={expense.id}
      entityName={expense.description}
      variant="button"
      size="sm"
      onSuccess={handleDeleteSuccess}
    >
      Delete Expense
    </DeleteButton>
  );
}

export default {
  ExampleBorrowersList,
  ExampleCustomDeleteComponent,
  ExampleBulkDeleteTable,
  ExampleDeleteModal,
  ExampleAdvancedDelete,
  ExampleDeleteWithUndo
};