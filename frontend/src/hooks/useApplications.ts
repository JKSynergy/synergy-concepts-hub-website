import { useState, useEffect, useCallback, useRef } from 'react';
import { applicationsService, Application, ApplicationFilters, PaginationParams } from '../services/applicationsService';

interface UseApplicationsOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
  initialFilters?: ApplicationFilters;
  initialPagination?: PaginationParams;
}

interface UseApplicationsResult {
  applications: Application[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  totalPages: number;
  currentPage: number;
  filters: ApplicationFilters;
  stats: {
    total: number;
    pending: number;
    underReview: number;
    approved: number;
    rejected: number;
    totalAmount: number;
    averageAmount: number;
  };
  
  // Actions
  refreshApplications: () => Promise<void>;
  setFilters: (filters: ApplicationFilters) => void;
  setPage: (page: number) => void;
  createApplication: (application: any) => Promise<Application>;
  updateApplication: (id: string, updates: any) => Promise<Application>;
  deleteApplication: (id: string) => Promise<void>;
  approveApplication: (id: string, notes?: string) => Promise<Application>;
  rejectApplication: (id: string, notes: string) => Promise<Application>;
  bulkDelete: (ids: string[]) => Promise<void>;
  exportApplications: (format?: 'csv' | 'excel') => Promise<void>;
  
  // State management
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

export const useApplications = (options: UseApplicationsOptions = {}): UseApplicationsResult => {
  const {
    autoRefresh = false,
    refreshInterval = 30000, // 30 seconds
    initialFilters = {},
    initialPagination = { page: 1, limit: 12 }
  } = options;

  // State
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPagination.page || 1);
  const [filters, setFiltersState] = useState<ApplicationFilters>(initialFilters);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    underReview: 0,
    approved: 0,
    rejected: 0,
    totalAmount: 0,
    averageAmount: 0,
  });

  // Refs for cleanup and optimization
  const refreshTimeoutRef = useRef<NodeJS.Timeout>();
  const abortControllerRef = useRef<AbortController>();

  // Load applications function
  const loadApplications = useCallback(async (showLoading = true) => {
    try {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      abortControllerRef.current = new AbortController();
      
      if (showLoading) {
        setLoading(true);
      }
      setError(null);

      try {
        const response = await applicationsService.getApplications(
          filters,
          { page: currentPage, limit: initialPagination.limit }
        );

        if (response.success) {
          setApplications(response.data);
          setTotalCount(response.total);
          setTotalPages(response.totalPages);
        } else {
          throw new Error(response.message || 'Failed to load applications');
        }
      } catch (apiError: any) {
        // If API is not available, use empty data
        console.warn('API not available, using empty data:', apiError.message);
        setApplications([]);
        setTotalCount(0);
        setTotalPages(0);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error loading applications:', err);
        setError(err.message || 'Failed to load applications');
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [filters, currentPage, initialPagination.limit]);

  // Load statistics
  const loadStats = useCallback(async () => {
    try {
      const statsData = await applicationsService.getApplicationStats();
      setStats(statsData);
    } catch (err) {
      console.warn('Failed to load application statistics, using defaults:', err);
      // Set default stats if API fails
      setStats({
        total: applications.length,
        pending: applications.filter(app => app.status === 'pending').length,
        underReview: applications.filter(app => app.status === 'under_review').length,
        approved: applications.filter(app => app.status === 'approved').length,
        rejected: applications.filter(app => app.status === 'rejected').length,
        totalAmount: applications.reduce((sum, app) => sum + app.requestedAmount, 0),
        averageAmount: applications.length > 0 ? 
          applications.reduce((sum, app) => sum + app.requestedAmount, 0) / applications.length : 0,
      });
    }
  }, [applications]);

  // Refresh applications (public function)
  const refreshApplications = useCallback(async () => {
    await Promise.all([
      loadApplications(false),
      loadStats()
    ]);
  }, [loadApplications, loadStats]);

  // Set filters with reset to page 1
  const setFilters = useCallback((newFilters: ApplicationFilters) => {
    setFiltersState(newFilters);
    setCurrentPage(1);
  }, []);

  // Set page
  const setPage = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // Create application with optimistic update
  const createApplication = useCallback(async (applicationData: any): Promise<Application> => {
    try {
      setError(null);
      
      const response = await applicationsService.createApplication(applicationData);
      
      if (response.success) {
        // Refresh applications to get updated list
        await refreshApplications();
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to create application');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create application');
      throw err;
    }
  }, [refreshApplications]);

  // Update application with optimistic update
  const updateApplication = useCallback(async (id: string, updates: any): Promise<Application> => {
    try {
      setError(null);
      
      // Optimistic update
      setApplications(prev => 
        prev.map(app => 
          app.id === id ? { ...app, ...updates } : app
        )
      );

      const response = await applicationsService.updateApplication(id, updates);
      
      if (response.success) {
        // Update with server response
        setApplications(prev => 
          prev.map(app => 
            app.id === id ? response.data : app
          )
        );
        return response.data;
      } else {
        // Revert optimistic update
        await loadApplications(false);
        throw new Error(response.message || 'Failed to update application');
      }
    } catch (err: any) {
      // Revert optimistic update
      await loadApplications(false);
      setError(err.message || 'Failed to update application');
      throw err;
    }
  }, [loadApplications]);

  // Delete application with optimistic update
  const deleteApplication = useCallback(async (id: string): Promise<void> => {
    try {
      setError(null);
      
      // Optimistic update
      const originalApplications = applications;
      setApplications(prev => prev.filter(app => app.id !== id));

      const response = await applicationsService.deleteApplication(id);
      
      // Response is { message, applicationId } - if we get here, it succeeded
      if (!response.message) {
        // Revert optimistic update
        setApplications(originalApplications);
        throw new Error('Failed to delete application');
      }
      
      // Update stats and pagination
      await refreshApplications();
    } catch (err: any) {
      // Revert optimistic update
      setApplications(applications);
      setError(err.message || 'Failed to delete application');
      throw err;
    }
  }, [applications, refreshApplications]);

  // Approve application
  const approveApplication = useCallback(async (id: string, notes?: string): Promise<Application> => {
    try {
      setError(null);
      
      const response = await applicationsService.approveApplication(id, notes);
      
      if (response.success) {
        // Update the application in state
        setApplications(prev => 
          prev.map(app => 
            app.id === id ? response.data : app
          )
        );
        
        // Update stats
        await loadStats();
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to approve application');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to approve application');
      throw err;
    }
  }, [loadStats]);

  // Reject application
  const rejectApplication = useCallback(async (id: string, notes: string): Promise<Application> => {
    try {
      setError(null);
      
      const response = await applicationsService.rejectApplication(id, notes);
      
      if (response.success) {
        // Update the application in state
        setApplications(prev => 
          prev.map(app => 
            app.id === id ? response.data : app
          )
        );
        
        // Update stats
        await loadStats();
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to reject application');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to reject application');
      throw err;
    }
  }, [loadStats]);

  // Bulk delete applications
  const bulkDelete = useCallback(async (ids: string[]): Promise<void> => {
    try {
      setError(null);
      
      const response = await applicationsService.bulkDeleteApplications(ids);
      
      if (response.success) {
        // Remove deleted applications from state
        setApplications(prev => prev.filter(app => !ids.includes(app.id!)));
        
        // Update stats and refresh pagination
        await refreshApplications();
      } else {
        throw new Error(response.message || 'Failed to delete applications');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete applications');
      throw err;
    }
  }, [refreshApplications]);

  // Export applications
  const exportApplications = useCallback(async (format: 'csv' | 'excel' = 'csv'): Promise<void> => {
    try {
      setError(null);
      
      const blob = await applicationsService.exportApplications(filters, format);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `applications_${new Date().toISOString().split('T')[0]}.${format === 'csv' ? 'csv' : 'xlsx'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to export applications');
      throw err;
    }
  }, [filters]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Initial load and auto-refresh setup
  useEffect(() => {
    loadApplications();
    loadStats();

    if (autoRefresh) {
      const scheduleRefresh = () => {
        refreshTimeoutRef.current = setTimeout(async () => {
          try {
            await refreshApplications();
          } catch (error) {
            console.warn('Auto-refresh failed:', error);
          }
          scheduleRefresh();
        }, refreshInterval);
      };
      
      scheduleRefresh();
    }

    // Cleanup
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []); // Remove dependencies to prevent infinite loops

  // Reload when filters or page changes
  useEffect(() => {
    if (applications.length > 0 || !loading) { // Don't reload on initial mount
      loadApplications();
    }
  }, [filters, currentPage]);

  return {
    applications,
    loading,
    error,
    totalCount,
    totalPages,
    currentPage,
    filters,
    stats,
    
    // Actions
    refreshApplications,
    setFilters,
    setPage,
    createApplication,
    updateApplication,
    deleteApplication,
    approveApplication,
    rejectApplication,
    bulkDelete,
    exportApplications,
    
    // State management
    clearError,
    setLoading,
  };
};