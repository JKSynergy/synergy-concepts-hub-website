import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Alert {
  id: string;
  alertId?: string;
  type: 'payment' | 'application' | 'overdue' | 'system';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high';
  amount?: number;
  reference?: string;
}

interface AlertContextType {
  alerts: Alert[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (alertId: string) => void;
  markAllAsRead: () => void;
  refreshAlerts: () => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlerts = () => {
  const context = useContext(AlertContext);
  if (context === undefined) {
    throw new Error('useAlerts must be used within an AlertProvider');
  }
  return context;
};

interface AlertProviderProps {
  children: ReactNode;
}

export const AlertProvider: React.FC<AlertProviderProps> = ({ children }) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const API_BASE_URL = 'http://localhost:3002/api';

  const fetchAlerts = async (): Promise<Alert[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/alerts`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      
      // Handle both wrapped and unwrapped response formats
      const data = result.data || result;
      
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error fetching alerts from API:', error);
      // Fallback to local generation if API fails
      return generateLocalAlerts();
    }
  };

  const generateLocalAlerts = async (): Promise<Alert[]> => {
    try {
      // Fallback: generate basic alerts locally if API is unavailable
      const alertsData: Alert[] = [];
      const now = new Date();
      
      // System alert as fallback
      alertsData.push({
        id: 'system-fallback',
        alertId: 'system-fallback',
        type: 'system',
        title: 'System Status',
        message: 'Running in offline mode - some features may be limited',
        timestamp: now.toISOString(),
        isRead: false,
        priority: 'low'
      });
      
      return alertsData;
    } catch (error) {
      console.error('Error generating local alerts:', error);
      return [];
    }
  };

  const refreshAlerts = async () => {
    setLoading(true);
    try {
      const newAlerts = await fetchAlerts();
      
      // Preserve read status from existing alerts
      const existingReadAlerts = alerts.filter(alert => alert.isRead).map(alert => alert.id || alert.alertId);
      const updatedAlerts = newAlerts.map(alert => ({
        ...alert,
        isRead: existingReadAlerts.includes(alert.id || alert.alertId || '') ? true : alert.isRead
      }));
      
      setAlerts(updatedAlerts);
    } catch (error) {
      console.error('Error refreshing alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (alertId: string) => {
    try {
      // Find the alert to get its data
      const alert = alerts.find(a => (a.id === alertId || a.alertId === alertId));
      
      if (alert) {
        const response = await fetch(`${API_BASE_URL}/alerts/${alert.alertId || alertId}/read`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: alert.title,
            message: alert.message,
            type: alert.type,
            timestamp: alert.timestamp,
            priority: alert.priority,
            amount: alert.amount,
            reference: alert.reference
          })
        });
        
        if (response.ok) {
          // Update local state
          setAlerts(prev => prev.map(a => 
            (a.id === alertId || a.alertId === alertId) ? { ...a, isRead: true } : a
          ));
        } else {
          console.error('Failed to mark alert as read on server');
          // Still update locally for better UX
          setAlerts(prev => prev.map(a => 
            (a.id === alertId || a.alertId === alertId) ? { ...a, isRead: true } : a
          ));
        }
      }
    } catch (error) {
      console.error('Error marking alert as read:', error);
      // Update locally even if API call fails
      setAlerts(prev => prev.map(a => 
        (a.id === alertId || a.alertId === alertId) ? { ...a, isRead: true } : a
      ));
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadAlerts = alerts.filter(alert => !alert.isRead);
      
      const response = await fetch(`${API_BASE_URL}/alerts/mark-all-read`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          alertIds: unreadAlerts.map(alert => ({
            alertId: alert.alertId || alert.id,
            title: alert.title,
            message: alert.message,
            type: alert.type,
            timestamp: alert.timestamp,
            priority: alert.priority,
            amount: alert.amount,
            reference: alert.reference
          }))
        })
      });
      
      if (response.ok) {
        // Update local state
        setAlerts(prev => prev.map(alert => ({ ...alert, isRead: true })));
      } else {
        console.error('Failed to mark all alerts as read on server');
        // Still update locally for better UX
        setAlerts(prev => prev.map(alert => ({ ...alert, isRead: true })));
      }
    } catch (error) {
      console.error('Error marking all alerts as read:', error);
      // Update locally even if API call fails
      setAlerts(prev => prev.map(alert => ({ ...alert, isRead: true })));
    }
  };

  useEffect(() => {
    refreshAlerts();
    
    // Refresh alerts every 5 minutes
    const interval = setInterval(refreshAlerts, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const unreadCount = alerts.filter(alert => !alert.isRead).length;

  return (
    <AlertContext.Provider value={{
      alerts,
      unreadCount,
      loading,
      markAsRead,
      markAllAsRead,
      refreshAlerts
    }}>
      {children}
    </AlertContext.Provider>
  );
};