import { useState, useCallback } from 'react';
import { deleteService, DeleteResponse, BulkDeleteResponse } from '../services/deleteService';

export interface UseDeleteOptions {
  onSuccess?: (response: DeleteResponse | BulkDeleteResponse) => void;
  onError?: (error: Error) => void;
  confirmationMessage?: string;
  entityName?: string;
}

export function useDelete() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeDelete = useCallback(async (
    deleteFunction: () => Promise<DeleteResponse | BulkDeleteResponse>,
    options?: UseDeleteOptions
  ) => {
    setIsDeleting(true);
    setError(null);

    try {
      const result = await deleteFunction();
      options?.onSuccess?.(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred while deleting';
      setError(errorMessage);
      options?.onError?.(err instanceof Error ? err : new Error(errorMessage));
      throw err;
    } finally {
      setIsDeleting(false);
    }
  }, []);

  // Specific delete methods (without built-in confirmation for modal usage)
  const deleteBorrower = useCallback(async (id: string, options?: UseDeleteOptions) => {
    return executeDelete(() => deleteService.deleteBorrower(id), options);
  }, [executeDelete]);

  const deleteLoan = useCallback(async (id: string, options?: UseDeleteOptions) => {
    return executeDelete(() => deleteService.deleteLoan(id), options);
  }, [executeDelete]);

  const deleteApplication = useCallback(async (id: string, options?: UseDeleteOptions) => {
    return executeDelete(() => deleteService.deleteApplication(id), options);
  }, [executeDelete]);

  const deleteRepayment = useCallback(async (id: string, options?: UseDeleteOptions) => {
    return executeDelete(() => deleteService.deleteRepayment(id), options);
  }, [executeDelete]);

  const deleteSavings = useCallback(async (id: string, options?: UseDeleteOptions) => {
    return executeDelete(() => deleteService.deleteSavings(id), options);
  }, [executeDelete]);

  const deleteExpense = useCallback(async (id: string, options?: UseDeleteOptions) => {
    return executeDelete(() => deleteService.deleteExpense(id), options);
  }, [executeDelete]);

  const deleteSaver = useCallback(async (id: string, options?: UseDeleteOptions) => {
    return executeDelete(() => deleteService.deleteSaver(id), options);
  }, [executeDelete]);

  const deleteDeposit = useCallback(async (id: string, options?: UseDeleteOptions) => {
    return executeDelete(() => deleteService.deleteDeposit(id), options);
  }, [executeDelete]);

  const deleteWithdrawal = useCallback(async (id: string, options?: UseDeleteOptions) => {
    return executeDelete(() => deleteService.deleteWithdrawal(id), options);
  }, [executeDelete]);

  const deleteOverdueRecord = useCallback(async (id: string, options?: UseDeleteOptions) => {
    return executeDelete(() => deleteService.deleteOverdueRecord(id), options);
  }, [executeDelete]);

  const deleteDeclinedLoan = useCallback(async (id: string, options?: UseDeleteOptions) => {
    return executeDelete(() => deleteService.deleteDeclinedLoan(id), options);
  }, [executeDelete]);

  const deleteAlert = useCallback(async (id: string, options?: UseDeleteOptions) => {
    return executeDelete(() => deleteService.deleteAlert(id), options);
  }, [executeDelete]);

  const bulkDeleteAlerts = useCallback(async (
    deleteOptions: {
      ids?: string[];
      filter?: {
        isRead?: boolean;
        type?: string;
        olderThan?: string;
      };
    },
    options?: UseDeleteOptions
  ) => {
    const count = deleteOptions.ids?.length || 'selected';
    return executeDelete(
      () => deleteService.bulkDeleteWithConfirmation(
        'alert',
        typeof count === 'number' ? count : 0,
        () => deleteService.bulkDeleteAlerts(deleteOptions)
      ).then(result => result || Promise.reject(new Error('Delete cancelled'))),
      options
    );
  }, [executeDelete]);

  // Generic delete method
  const deleteGeneric = useCallback(async (
    entityType: string,
    deleteFunction: () => Promise<DeleteResponse | BulkDeleteResponse>,
    options?: UseDeleteOptions
  ) => {
    return executeDelete(deleteFunction, options);
  }, [executeDelete]);

  return {
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
    bulkDeleteAlerts,
    deleteGeneric,
    clearError: () => setError(null)
  };
}

export default useDelete;