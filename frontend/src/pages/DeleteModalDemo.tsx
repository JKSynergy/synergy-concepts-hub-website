import React, { useState } from 'react';
import DeleteButton from '../components/DeleteButton';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';

// Example data for different entity types
const sampleData = {
  application: {
    id: 'app001',
    applicationId: 'APP0064',
    fullName: 'Jane Smith',
    requestedAmount: 100000,
    purpose: 'Business expansion',
    status: 'PENDING'
  },
  borrower: {
    id: 'bor001',
    borrowerId: 'BOR123',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+256701234567',
    email: 'john.doe@example.com',
    status: 'ACTIVE',
    creditScore: 720,
    creditRating: 'GOOD'
  },
  loan: {
    id: 'loan001',
    loanId: 'LN001',
    borrowerName: 'Alice Johnson',
    principal: 500000,
    status: 'CLOSED',
    interestRate: 12.5
  },
  expense: {
    id: 'exp001',
    expenseId: 'EXP001',
    description: 'Office rent payment',
    amount: 250000,
    category: 'Office expenses'
  }
};

export function DeleteModalDemo() {
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsDeleting(false);
    setShowApplicationModal(false);
    alert('Application deleted successfully!');
  };

  const handleSuccess = (response: any) => {
    console.log('Delete successful:', response);
    alert('Entity deleted successfully!');
  };

  const handleError = (error: Error) => {
    console.error('Delete failed:', error);
    alert('Failed to delete: ' + error.message);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
        Delete Modal Examples
      </h1>

      <div className="space-y-8">
        {/* Manual Modal Example */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-4">Manual Modal Control</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Manually control the delete confirmation modal
          </p>
          
          <button
            onClick={() => setShowApplicationModal(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            Delete Application (Manual Modal)
          </button>

          <DeleteConfirmationModal
            isOpen={showApplicationModal}
            onClose={() => setShowApplicationModal(false)}
            onConfirm={handleDelete}
            entityType="application"
            entityData={sampleData.application}
            isDeleting={isDeleting}
          />
        </div>

        {/* Integrated Delete Buttons */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-4">Integrated Delete Buttons</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Delete buttons with built-in modal confirmations
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Application Card */}
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Loan Application
              </h3>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
                <p><strong>ID:</strong> {sampleData.application.applicationId}</p>
                <p><strong>Applicant:</strong> {sampleData.application.fullName}</p>
                <p><strong>Amount:</strong> UGX {sampleData.application.requestedAmount.toLocaleString()}</p>
              </div>
              <div className="flex space-x-2">
                <DeleteButton
                  entityType="application"
                  entityId={sampleData.application.id}
                  entityData={sampleData.application}
                  variant="button"
                  size="sm"
                  onSuccess={handleSuccess}
                  onError={handleError}
                />
                <DeleteButton
                  entityType="application"
                  entityId={sampleData.application.id}
                  entityData={sampleData.application}
                  variant="icon"
                  size="sm"
                  onSuccess={handleSuccess}
                  onError={handleError}
                />
              </div>
            </div>

            {/* Borrower Card */}
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Borrower Profile
              </h3>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
                <p><strong>ID:</strong> {sampleData.borrower.borrowerId}</p>
                <p><strong>Name:</strong> {sampleData.borrower.firstName} {sampleData.borrower.lastName}</p>
                <p><strong>Phone:</strong> {sampleData.borrower.phone}</p>
              </div>
              <div className="flex space-x-2">
                <DeleteButton
                  entityType="borrower"
                  entityId={sampleData.borrower.id}
                  entityData={sampleData.borrower}
                  variant="button"
                  size="sm"
                  onSuccess={handleSuccess}
                  onError={handleError}
                />
                <DeleteButton
                  entityType="borrower"
                  entityId={sampleData.borrower.id}
                  entityData={sampleData.borrower}
                  variant="text"
                  size="sm"
                  onSuccess={handleSuccess}
                  onError={handleError}
                />
              </div>
            </div>

            {/* Loan Card */}
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Loan Record
              </h3>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
                <p><strong>ID:</strong> {sampleData.loan.loanId}</p>
                <p><strong>Borrower:</strong> {sampleData.loan.borrowerName}</p>
                <p><strong>Amount:</strong> UGX {sampleData.loan.principal.toLocaleString()}</p>
              </div>
              <DeleteButton
                entityType="loan"
                entityId={sampleData.loan.id}
                entityData={sampleData.loan}
                variant="button"
                size="sm"
                onSuccess={handleSuccess}
                onError={handleError}
              >
                Remove Loan
              </DeleteButton>
            </div>

            {/* Expense Card */}
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Expense Record
              </h3>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
                <p><strong>ID:</strong> {sampleData.expense.expenseId}</p>
                <p><strong>Description:</strong> {sampleData.expense.description}</p>
                <p><strong>Amount:</strong> UGX {sampleData.expense.amount.toLocaleString()}</p>
              </div>
              <DeleteButton
                entityType="expense"
                entityId={sampleData.expense.id}
                entityData={sampleData.expense}
                variant="button"
                size="sm"
                onSuccess={handleSuccess}
                onError={handleError}
                confirmMessage="Are you sure you want to delete this expense? This will remove it from your financial records."
              >
                Delete Expense
              </DeleteButton>
            </div>
          </div>
        </div>

        {/* Fallback to Simple Confirm */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-4">Fallback to Simple Confirmation</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Option to use simple browser confirm dialog instead of modal
          </p>
          
          <DeleteButton
            entityType="expense"
            entityId="simple-confirm-example"
            entityName="Simple Confirmation Example"
            variant="button"
            size="md"
            useModal={false}
            onSuccess={handleSuccess}
            onError={handleError}
          >
            Delete with Simple Confirm
          </DeleteButton>
        </div>

        {/* Usage Instructions */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
          <h2 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-4">
            Usage Instructions
          </h2>
          <div className="text-blue-800 dark:text-blue-200 space-y-2">
            <p><strong>Basic Usage:</strong></p>
            <pre className="bg-blue-100 dark:bg-blue-900/40 p-3 rounded text-sm overflow-x-auto">
{`<DeleteButton
  entityType="application"
  entityId="app-123"
  entityData={applicationData}
  onSuccess={() => refreshData()}
  onError={(error) => showError(error.message)}
/>`}
            </pre>
            
            <p className="mt-4"><strong>Available Props:</strong></p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li><code>entityType</code> - Type of entity being deleted</li>
              <li><code>entityId</code> - Unique identifier</li>
              <li><code>entityData</code> - Full entity object for modal display</li>
              <li><code>variant</code> - 'button', 'icon', or 'text'</li>
              <li><code>useModal</code> - Use modal (true) or simple confirm (false)</li>
              <li><code>onSuccess/onError</code> - Callback functions</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DeleteModalDemo;