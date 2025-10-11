# Delete Model Implementation Guide

## Overview
This document describes the comprehensive delete functionality that has been added to the QuickCredit system. The delete functionality includes both backend API endpoints and frontend components for safely removing data from the system.

## Backend Delete Endpoints

### Added Delete Endpoints

The following DELETE endpoints have been added to the API:

#### Core Entity Deletions
- `DELETE /api/borrowers/:id` - Delete a borrower
- `DELETE /api/loans/:id` - Delete a loan
- `DELETE /api/applications/:id` - Delete a loan application
- `DELETE /api/repayments/:id` - Delete a repayment record
- `DELETE /api/savings/:id` - Delete a savings account
- `DELETE /api/expenses/:id` - Delete an expense record

#### Financial Data Deletions
- `DELETE /api/savers/:id` - Delete a saver record
- `DELETE /api/deposits/:id` - Delete a deposit record
- `DELETE /api/withdrawals/:id` - Delete a withdrawal record

#### Administrative Deletions
- `DELETE /api/overdue/:id` - Delete an overdue record
- `DELETE /api/declined-loans/:id` - Delete a declined loan record
- `DELETE /api/alerts/:id` - Delete an alert
- `DELETE /api/alerts/bulk` - Bulk delete alerts

### Delete Response Format

All delete endpoints return a consistent response format:

```json
{
  "message": "Entity deleted successfully",
  "entityId": "deleted-entity-id"
}
```

For bulk operations:
```json
{
  "message": "X entity(s) deleted successfully",
  "deletedCount": 5
}
```

### Safety Features

#### Cascade Deletion
When deleting entities with relationships, the system performs cascade deletion:
- **Borrower deletion**: Removes associated repayments, savings, applications, and closed loans
- **Loan deletion**: Removes associated repayments
- **Saver deletion**: Removes associated deposits and withdrawals

#### Protection Against Data Loss
- **Active loans**: Cannot delete borrowers with active loans
- **Loan with balance**: Cannot delete loans that are still active
- **Applications with loans**: Cannot delete applications that have associated loans
- **Savings with balance**: Cannot delete savings accounts with remaining balance

#### Transaction Safety
All deletion operations use database transactions to ensure data consistency.

## Frontend Implementation

### Delete Service

A comprehensive `DeleteService` has been created at `src/services/deleteService.ts` that provides:

#### Methods for Each Entity Type
```typescript
// Individual delete methods
deleteService.deleteBorrower(id)
deleteService.deleteLoan(id)
deleteService.deleteApplication(id)
deleteService.deleteRepayment(id)
deleteService.deleteSavings(id)
deleteService.deleteExpense(id)
deleteService.deleteSaver(id)
deleteService.deleteDeposit(id)
deleteService.deleteWithdrawal(id)
deleteService.deleteOverdueRecord(id)
deleteService.deleteDeclinedLoan(id)
deleteService.deleteAlert(id)

// Bulk operations
deleteService.bulkDeleteAlerts(options)

// Generic delete
deleteService.deleteGeneric(endpoint)
```

#### Confirmation Dialogs
```typescript
// Delete with confirmation
deleteService.deleteWithConfirmation(
  entityType, 
  id, 
  deleteFunction, 
  entityName
)

// Bulk delete with confirmation
deleteService.bulkDeleteWithConfirmation(
  entityType, 
  count, 
  deleteFunction
)
```

### React Hook

A `useDelete` hook has been created at `src/hooks/useDelete.ts` that provides:

```typescript
const {
  isDeleting,
  error,
  deleteBorrower,
  deleteLoan,
  deleteApplication,
  // ... other delete methods
  clearError
} = useDelete();

// Usage with options
await deleteBorrower(id, {
  onSuccess: (response) => console.log('Deleted:', response),
  onError: (error) => console.error('Error:', error),
  entityName: 'John Doe'
});
```

### Delete Button Component

A reusable `DeleteButton` component has been created at `src/components/DeleteButton.tsx`:

#### Basic Usage
```jsx
<DeleteButton
  entityType="borrower"
  entityId="borrower-123"
  entityData={borrowerObject}
  entityName="John Doe"
  onSuccess={() => refreshData()}
  onError={(error) => showError(error.message)}
/>
```

#### Variants
```jsx
// Icon button
<DeleteButton 
  entityType="loan" 
  entityId="loan-456" 
  entityData={loanObject}
  variant="icon" 
  size="sm" 
/>

// Text link
<DeleteButton 
  entityType="expense" 
  entityId="expense-789" 
  entityData={expenseObject}
  variant="text" 
/>

// Custom styling
<DeleteButton 
  entityType="application" 
  entityId="app-123" 
  entityData={applicationObject}
  className="custom-delete-btn"
>
  Remove Application
</DeleteButton>

// Use simple confirm instead of modal
<DeleteButton 
  entityType="saver" 
  entityId="saver-456" 
  useModal={false}
  onSuccess={() => refreshData()}
/>
```

### Delete Confirmation Modal

A sophisticated modal component has been created at `src/components/DeleteConfirmationModal.tsx` that provides:

#### Features
- **Rich entity information display** - Shows relevant details for each entity type
- **Warning messages** - Context-specific warnings about cascade deletions
- **Loading states** - Visual feedback during deletion process
- **Responsive design** - Works on all screen sizes
- **Dark mode support** - Consistent with the application theme

#### Entity-Specific Information Display
The modal automatically displays relevant information based on entity type:
- **Applications**: ID, Applicant name, Amount, Purpose
- **Borrowers**: ID, Name, Phone, Status
- **Loans**: ID, Borrower name, Amount, Status
- **Expenses**: ID, Description, Amount, Category
- **And more...**

#### Manual Usage
```jsx
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';

<DeleteConfirmationModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onConfirm={handleDelete}
  entityType="application"
  entityData={applicationData}
  isDeleting={isDeleting}
  customMessage="This will permanently remove the application."
/>
```

#### Bulk Delete Button
```jsx
<BulkDeleteButton
  selectedIds={selectedItemIds}
  entityType="alert"
  onSuccess={() => refreshAlerts()}
  onError={(error) => showError(error.message)}
>
  Delete Selected Alerts
</BulkDeleteButton>
```

## Integration Examples

### In a Data Table
```jsx
function BorrowersTable({ borrowers }) {
  const handleDeleteSuccess = (response) => {
    // Refresh the table data
    refetchBorrowers();
    showSuccessMessage(response.message);
  };

  return (
    <table>
      <tbody>
        {borrowers.map(borrower => (
          <tr key={borrower.id}>
            <td>{borrower.name}</td>
            <td>
              <DeleteButton
                entityType="borrower"
                entityId={borrower.id}
                entityName={`${borrower.firstName} ${borrower.lastName}`}
                variant="icon"
                size="sm"
                onSuccess={handleDeleteSuccess}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### In a Detail View
```jsx
function LoanDetails({ loan }) {
  const navigate = useNavigate();
  
  const handleDeleteSuccess = () => {
    navigate('/loans');
    showSuccessMessage('Loan deleted successfully');
  };

  return (
    <div>
      <h1>Loan Details</h1>
      {/* Loan details */}
      
      <div className="actions">
        <DeleteButton
          entityType="loan"
          entityId={loan.id}
          entityName={loan.loanId}
          onSuccess={handleDeleteSuccess}
          disabled={loan.status === 'ACTIVE'}
        >
          Delete Loan
        </DeleteButton>
      </div>
    </div>
  );
}
```

### Custom Delete Implementation
```jsx
function CustomDeleteHandler() {
  const { isDeleting, deleteApplication, error } = useDelete();

  const handleCustomDelete = async () => {
    try {
      await deleteApplication('app-123', {
        entityName: 'Emergency Loan Application',
        onSuccess: (response) => {
          // Custom success handling
          analytics.track('application_deleted', { id: 'app-123' });
          showNotification('Application removed successfully');
        }
      });
    } catch (error) {
      // Error is already handled by the hook
      console.log('Delete operation failed');
    }
  };

  return (
    <button 
      onClick={handleCustomDelete} 
      disabled={isDeleting}
    >
      {isDeleting ? 'Deleting...' : 'Delete Application'}
    </button>
  );
}
```

## Error Handling

### Backend Error Responses
```json
{
  "error": "Cannot delete borrower with active loans",
  "details": "Borrower has 2 active loan(s)"
}
```

### Frontend Error Handling
The system provides multiple levels of error handling:

1. **Service Level**: Catches and formats API errors
2. **Hook Level**: Manages error state and provides error callbacks
3. **Component Level**: Displays error messages to users

## Security Considerations

1. **Validation**: All delete operations validate entity existence before deletion
2. **Constraints**: Business logic prevents deletion of critical data
3. **Audit Trail**: Consider implementing audit logs for delete operations
4. **Permissions**: Implement role-based access control for delete operations

## Testing the Delete Functionality

### Backend Testing
```bash
# Test delete endpoints using curl or Postman

# Delete a borrower (should fail if has active loans)
curl -X DELETE http://localhost:3002/api/borrowers/{id}

# Delete an expense (should succeed)
curl -X DELETE http://localhost:3002/api/expenses/{id}

# Bulk delete alerts
curl -X DELETE http://localhost:3002/api/alerts/bulk \
  -H "Content-Type: application/json" \
  -d '{"filter": {"isRead": true}}'
```

### Frontend Testing
1. Use the DeleteButton component in various contexts
2. Test confirmation dialogs
3. Test error handling with invalid IDs
4. Test bulk operations
5. Verify UI updates after successful deletions

## Best Practices

1. **Always provide confirmation**: Use the built-in confirmation dialogs
2. **Handle errors gracefully**: Provide meaningful error messages to users
3. **Update UI immediately**: Refresh data after successful deletions
4. **Use optimistic updates**: Consider optimistic UI updates for better UX
5. **Implement undo functionality**: For critical deletions, consider implementing undo
6. **Log important deletions**: Implement audit logging for compliance

## Future Enhancements

1. **Soft Delete**: Implement soft delete functionality for important entities
2. **Batch Operations**: Add more bulk delete operations
3. **Recovery**: Implement data recovery mechanisms
4. **Advanced Permissions**: Add granular permission controls
5. **Audit Logging**: Full audit trail implementation
6. **Undo Functionality**: Implement undo for accidental deletions

## Conclusion

The delete functionality has been comprehensively implemented with safety features, error handling, and user-friendly interfaces. The modular design allows for easy extension and customization while maintaining data integrity and user experience.