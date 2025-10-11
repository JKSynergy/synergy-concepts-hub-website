import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface OverdueContextType {
  overdueCount: number;
  refreshOverdueCount: () => Promise<void>;
  isLoading: boolean;
}

const OverdueContext = createContext<OverdueContextType | undefined>(undefined);

export const useOverdue = () => {
  const context = useContext(OverdueContext);
  if (context === undefined) {
    throw new Error('useOverdue must be used within an OverdueProvider');
  }
  return context;
};

interface OverdueProviderProps {
  children: ReactNode;
}

// Helper function to calculate actual loan status
const calculateActualStatus = (loan: any, currentDate: Date = new Date()): string => {
  // If loan has no outstanding balance, it should be closed
  if (loan.outstandingBalance <= 0) {
    return 'CLOSED';
  }

  // If loan has outstanding balance and is past due date, it's overdue
  const dueDate = loan.nextPaymentDate ? new Date(loan.nextPaymentDate) : (loan.dueDate ? new Date(loan.dueDate) : null);
  if (dueDate && currentDate > dueDate) {
    return 'OVERDUE';
  }

  // Return the existing status if not overdue or closed
  return loan.status || 'ACTIVE';
};

export const OverdueProvider: React.FC<OverdueProviderProps> = ({ children }) => {
  const [overdueCount, setOverdueCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const calculateOverdueCount = async (): Promise<number> => {
    try {
      // Fetch all loans from the API
      const response = await fetch('http://localhost:3002/api/loans');
      if (!response.ok) {
        throw new Error('Failed to fetch loans data');
      }
      const responseData = await response.json();
      const allLoans = responseData.data || responseData || [];
      
      // Calculate actual status and count overdue loans
      const currentDate = new Date();
      const overdueLoans = allLoans.filter((loan: any) => {
        const actualStatus = calculateActualStatus(loan, currentDate);
        return actualStatus === 'OVERDUE';
      });

      console.log(`Found ${overdueLoans.length} overdue loans out of ${allLoans.length} total loans`);
      return overdueLoans.length;
    } catch (error) {
      console.error('Failed to calculate overdue count:', error);
      return 0;
    }
  };

  const refreshOverdueCount = async () => {
    setIsLoading(true);
    try {
      const count = await calculateOverdueCount();
      setOverdueCount(count);
    } catch (error) {
      console.error('Error refreshing overdue count:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshOverdueCount();
  }, []);

  const value = {
    overdueCount,
    refreshOverdueCount,
    isLoading
  };

  return (
    <OverdueContext.Provider value={value}>
      {children}
    </OverdueContext.Provider>
  );
};