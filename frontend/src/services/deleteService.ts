import { apiService } from './apiService';

export interface DeleteResponse {
  message: string;
  [key: string]: string | number;
}

export interface BulkDeleteResponse {
  message: string;
  deletedCount: number;
}

class DeleteService {
  // Delete borrower
  async deleteBorrower(id: string): Promise<DeleteResponse> {
    try {
      const response = await apiService.delete<DeleteResponse>(`/api/borrowers/${id}`);
      return response;
    } catch (error) {
      console.error('Error deleting borrower:', error);
      throw new Error('Failed to delete borrower');
    }
  }

  // Delete loan
  async deleteLoan(id: string): Promise<DeleteResponse> {
    try {
      const response = await apiService.delete<DeleteResponse>(`/api/loans/${id}`);
      return response;
    } catch (error) {
      console.error('Error deleting loan:', error);
      throw new Error('Failed to delete loan');
    }
  }

  // Delete loan application
  async deleteApplication(id: string): Promise<DeleteResponse> {
    try {
      const response = await apiService.delete<DeleteResponse>(`/api/applications/${id}`);
      return response;
    } catch (error) {
      console.error('Error deleting application:', error);
      throw new Error('Failed to delete application');
    }
  }

  // Delete repayment
  async deleteRepayment(id: string): Promise<DeleteResponse> {
    try {
      const response = await apiService.delete<DeleteResponse>(`/api/repayments/${id}`);
      return response;
    } catch (error) {
      console.error('Error deleting repayment:', error);
      throw new Error('Failed to delete repayment');
    }
  }

  // Delete savings account
  async deleteSavings(id: string): Promise<DeleteResponse> {
    try {
      const response = await apiService.delete<DeleteResponse>(`/api/savings/${id}`);
      return response;
    } catch (error) {
      console.error('Error deleting savings account:', error);
      throw new Error('Failed to delete savings account');
    }
  }

  // Delete expense
  async deleteExpense(id: string): Promise<DeleteResponse> {
    try {
      const response = await apiService.delete<DeleteResponse>(`/api/expenses/${id}`);
      return response;
    } catch (error) {
      console.error('Error deleting expense:', error);
      throw new Error('Failed to delete expense');
    }
  }

  // Delete saver
  async deleteSaver(id: string): Promise<DeleteResponse> {
    try {
      const response = await apiService.delete<DeleteResponse>(`/api/savers/${id}`);
      return response;
    } catch (error) {
      console.error('Error deleting saver:', error);
      throw new Error('Failed to delete saver');
    }
  }

  // Delete deposit
  async deleteDeposit(id: string): Promise<DeleteResponse> {
    try {
      const response = await apiService.delete<DeleteResponse>(`/api/deposits/${id}`);
      return response;
    } catch (error) {
      console.error('Error deleting deposit:', error);
      throw new Error('Failed to delete deposit');
    }
  }

  // Delete withdrawal
  async deleteWithdrawal(id: string): Promise<DeleteResponse> {
    try {
      const response = await apiService.delete<DeleteResponse>(`/api/withdrawals/${id}`);
      return response;
    } catch (error) {
      console.error('Error deleting withdrawal:', error);
      throw new Error('Failed to delete withdrawal');
    }
  }

  // Delete overdue record
  async deleteOverdueRecord(id: string): Promise<DeleteResponse> {
    try {
      const response = await apiService.delete<DeleteResponse>(`/api/overdue/${id}`);
      return response;
    } catch (error) {
      console.error('Error deleting overdue record:', error);
      throw new Error('Failed to delete overdue record');
    }
  }

  // Delete declined loan
  async deleteDeclinedLoan(id: string): Promise<DeleteResponse> {
    try {
      const response = await apiService.delete<DeleteResponse>(`/api/declined-loans/${id}`);
      return response;
    } catch (error) {
      console.error('Error deleting declined loan:', error);
      throw new Error('Failed to delete declined loan');
    }
  }

  // Delete alert
  async deleteAlert(id: string): Promise<DeleteResponse> {
    try {
      const response = await apiService.delete<DeleteResponse>(`/api/alerts/${id}`);
      return response;
    } catch (error) {
      console.error('Error deleting alert:', error);
      throw new Error('Failed to delete alert');
    }
  }

  // Bulk delete alerts
  async bulkDeleteAlerts(
    options: {
      ids?: string[];
      filter?: {
        isRead?: boolean;
        type?: string;
        olderThan?: string;
      };
    }
  ): Promise<BulkDeleteResponse> {
    try {
      const response = await apiService.delete<BulkDeleteResponse>('/api/alerts/bulk', {
        data: options
      });
      return response;
    } catch (error) {
      console.error('Error bulk deleting alerts:', error);
      throw new Error('Failed to bulk delete alerts');
    }
  }

  // Generic delete method for any endpoint
  async deleteGeneric(endpoint: string): Promise<DeleteResponse> {
    try {
      const response = await apiService.delete<DeleteResponse>(endpoint);
      return response;
    } catch (error) {
      console.error(`Error deleting from ${endpoint}:`, error);
      throw new Error(`Failed to delete from ${endpoint}`);
    }
  }

  // Delete with confirmation dialog (for backward compatibility)
  async deleteWithConfirmation(
    entityType: string,
    id: string,
    deleteFunction: () => Promise<DeleteResponse>,
    entityName?: string,
    useNativeConfirm: boolean = false
  ): Promise<DeleteResponse | null> {
    
    if (useNativeConfirm) {
      const confirmed = window.confirm(
        `Are you sure you want to delete this ${entityType}${entityName ? ` (${entityName})` : ''}? This action cannot be undone.`
      );

      if (!confirmed) {
        return null;
      }
    }

    try {
      const result = await deleteFunction();
      // Show success message - could be replaced with a proper toast notification
      console.log(`${entityType} deleted successfully`);
      return result;
    } catch (error) {
      // Show error message
      if (useNativeConfirm) {
        alert(`Failed to delete ${entityType}. Please try again.`);
      }
      throw error;
    }
  }

  // Bulk delete with confirmation
  async bulkDeleteWithConfirmation(
    entityType: string,
    count: number,
    deleteFunction: () => Promise<BulkDeleteResponse | DeleteResponse>
  ): Promise<BulkDeleteResponse | DeleteResponse | null> {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${count} ${entityType}(s)? This action cannot be undone.`
    );

    if (!confirmed) {
      return null;
    }

    try {
      const result = await deleteFunction();
      console.log(`${count} ${entityType}(s) deleted successfully`);
      return result;
    } catch (error) {
      alert(`Failed to delete ${entityType}(s). Please try again.`);
      throw error;
    }
  }
}

export const deleteService = new DeleteService();
export default deleteService;