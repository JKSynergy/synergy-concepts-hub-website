import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Calendar,
  User,
  DollarSign,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Edit,
  Trash2,
  TrendingUp,
  ArrowUpRight,
  AlertCircle,
  Download,
  RefreshCw,
  Loader2,
  Info,
  CheckSquare,
  Square
} from 'lucide-react';
import { useApplications } from '../hooks/useApplications';
import type { Application as ApplicationData } from '../services/applicationsService';
import { formatDate, formatApplicationDate } from '../utils/dateUtils';
// import { useToast } from '../components/Toast';
import NewApplicationModal from '../components/modals/NewApplicationModal';

const Applications: React.FC = () => {
  // Import the toast hook
  // const { addToast } = useToast();
  
  // Create a proper toast implementation
  const addToast = (toast: { type: string; title: string; message?: string; duration?: number }) => {
    console.log(`${toast.type.toUpperCase()}: ${toast.title} - ${toast.message || ''}`);
    
    // Create a visual toast notification
    const toastElement = document.createElement('div');
    const isError = toast.type === 'error';
    const isSuccess = toast.type === 'success';
    const isWarning = toast.type === 'warning';
    
    toastElement.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm ${
      isError ? 'bg-red-500 text-white' : 
      isSuccess ? 'bg-green-500 text-white' : 
      isWarning ? 'bg-yellow-500 text-black' : 
      'bg-blue-500 text-white'
    } transition-all duration-300 transform translate-x-full`;
    
    toastElement.innerHTML = `
      <div class="flex items-start">
        <div class="flex-1">
          <div class="font-semibold">${toast.title}</div>
          ${toast.message ? `<div class="text-sm mt-1">${toast.message}</div>` : ''}
        </div>
        <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-current opacity-70 hover:opacity-100">
          ×
        </button>
      </div>
    `;
    
    document.body.appendChild(toastElement);
    
    // Slide in animation
    setTimeout(() => {
      toastElement.classList.remove('translate-x-full');
    }, 100);
    
    // Auto remove after duration
    setTimeout(() => {
      toastElement.classList.add('translate-x-full');
      setTimeout(() => {
        if (toastElement.parentElement) {
          toastElement.remove();
        }
      }, 300);
    }, toast.duration || 4000);
  };
  
  // Use the custom applications hook for dynamic data management
  const {
    applications,
    loading,
    error,
    totalCount,
    totalPages,
    currentPage,
    filters,
    stats,
    refreshApplications,
    setFilters,
    setPage,
    updateApplication,
    deleteApplication,
    approveApplication,
    rejectApplication,
    bulkDelete,
    exportApplications,
    clearError
  } = useApplications({
    autoRefresh: false, // Disable auto-refresh temporarily to reduce console noise
    refreshInterval: 30000, // 30 seconds when enabled
    initialFilters: {},
    initialPagination: { page: 1, limit: 12 }
  });

  // Local UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isNewApplicationModalOpen, setIsNewApplicationModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [applicationToDelete, setApplicationToDelete] = useState<ApplicationData | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationData | null>(null);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  
  // Edit form state
  const [editFormData, setEditFormData] = useState<ApplicationData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Apply filters when search term or status filter changes
  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      setFilters({
        search: searchTerm,
        status: statusFilter !== 'All' ? statusFilter : undefined
      });
    }, 300); // Debounce search

    return () => clearTimeout(delayedSearch);
  }, [searchTerm, statusFilter, setFilters]);

  // Handle refresh with loading indicator
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshApplications();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Clear error when needed
  useEffect(() => {
    if (error) {
      const clearErrorTimer = setTimeout(() => {
        clearError();
      }, 5000); // Clear error after 5 seconds
      
      return () => clearTimeout(clearErrorTimer);
    }
  }, [error, clearError]);

  const handleViewApplication = (application: ApplicationData) => {
    setSelectedApplication(application);
    setIsViewModalOpen(true);
  };

  const handleEditApplication = (application: ApplicationData) => {
    setSelectedApplication(application);
    // Map the application data to the form structure with proper borrower data mapping
    const mappedData = {
      ...application,
      // Personal Information - prefer borrower data
      fullName: application.fullName || (application.borrower ? `${application.borrower.firstName} ${application.borrower.lastName}` : ''),
      dob: application.dob || (application.borrower?.dateOfBirth ? formatDate(application.borrower.dateOfBirth) : ''),
      nationalId: application.nationalId || application.borrower?.nationalId || '',
      phone: application.phone || application.borrower?.phone || '',
      email: application.email || application.borrower?.email || '',
      address: application.address || application.borrower?.district || '',
      
      // Employment Information - prefer borrower data
      employmentStatus: application.employmentStatus || application.borrower?.occupation || '',
      employer: application.employer || application.borrower?.occupation || '',
      monthlyIncome: application.monthlyIncome || (application.borrower?.monthlyIncome ? application.borrower.monthlyIncome.toString() : ''),
      
      // Loan Information - prefer application data
      requestedAmount: application.requestedAmount || 0,
      loanTerm: application.loanTerm || application.termMonths || 0,
      purpose: application.purpose || '',
      collateral: application.collateral || '',
      
      // Guarantor fields that might be in the form
      guarantorName: application.guarantorName || '',
      guarantorId: application.guarantorId || '',
      guarantorPhone: application.guarantorPhone || '',
      guarantorRelation: application.guarantorRelation || '',
    };
    setEditFormData(mappedData);
    setIsEditModalOpen(true);
  };

  const handleSaveApplication = async () => {
    if (!editFormData || !selectedApplication?.id) return;
    
    setIsSaving(true);
    try {
      await updateApplication(selectedApplication.id, editFormData);
      
      // Close the modal
      setIsEditModalOpen(false);
      setEditFormData(null);
      setSelectedApplication(null);
      
      // Show success toast
      addToast({
        type: 'success',
        title: 'Application Updated',
        message: 'Application has been successfully updated.'
      });
    } catch (err: any) {
      console.error('Error saving application:', err);
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: err.message || 'Failed to update application. Please try again.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditFormChange = (field: keyof ApplicationData, value: string | number) => {
    if (!editFormData) return;
    
    setEditFormData({
      ...editFormData,
      [field]: value
    });
  };

  const handleDeleteApplication = (application: ApplicationData) => {
    setApplicationToDelete(application);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteApplication = async () => {
    if (!applicationToDelete?.id) return;
    
    const applicantName = applicationToDelete.borrower 
      ? `${applicationToDelete.borrower.firstName} ${applicationToDelete.borrower.lastName}` 
      : applicationToDelete.fullName || 'Unknown Applicant';
    
    try {
      await deleteApplication(applicationToDelete.id);
      
      // Close the confirmation modal
      setIsDeleteConfirmOpen(false);
      setApplicationToDelete(null);
      
      // Show success toast with applicant name
      addToast({
        type: 'success',
        title: 'Application Deleted',
        message: `Application for ${applicantName} has been successfully deleted.`,
        duration: 5000
      });
    } catch (err: any) {
      console.error('Error deleting application:', err);
      addToast({
        type: 'error',
        title: 'Delete Failed',
        message: err.message || 'Failed to delete application. Please try again.',
        duration: 5000
      });
    }
  };

  const handleNewApplication = () => {
    setSelectedApplication(null);
    setIsNewApplicationModalOpen(true);
  };

  // Bulk selection handlers
  const toggleApplicationSelection = (applicationId: string) => {
    setSelectedApplicationIds(prev => 
      prev.includes(applicationId)
        ? prev.filter(id => id !== applicationId)
        : [...prev, applicationId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedApplicationIds.length === applications.length) {
      setSelectedApplicationIds([]);
    } else {
      setSelectedApplicationIds(applications.map(app => app.id!).filter(Boolean));
    }
  };

  const handleBulkDelete = async () => {
    try {
      await bulkDelete(selectedApplicationIds);
      setSelectedApplicationIds([]);
      setIsBulkDeleteOpen(false);
      setShowBulkActions(false);
      
      addToast({
        type: 'success',
        title: 'Applications Deleted',
        message: `${selectedApplicationIds.length} applications deleted successfully.`
      });
    } catch (err: any) {
      console.error('Error bulk deleting applications:', err);
      addToast({
        type: 'error',
        title: 'Bulk Delete Failed',
        message: err.message || 'Failed to delete applications. Please try again.'
      });
    }
  };

  // Application approval/rejection handlers
  const handleApproveApplication = async (application: ApplicationData, notes?: string) => {
    if (!application.id) return;
    
    try {
      await approveApplication(application.id, notes);
      
      addToast({
        type: 'success',
        title: 'Application Approved',
        message: `Application for ${application.fullName} has been approved.`
      });
    } catch (err: any) {
      console.error('Error approving application:', err);
      addToast({
        type: 'error',
        title: 'Approval Failed',
        message: err.message || 'Failed to approve application. Please try again.'
      });
    }
  };

  const handleRejectApplication = async (application: ApplicationData, notes: string) => {
    if (!application.id) return;
    
    try {
      await rejectApplication(application.id, notes);
      
      addToast({
        type: 'warning',
        title: 'Application Rejected',
        message: `Application for ${application.fullName} has been rejected.`
      });
    } catch (err: any) {
      console.error('Error rejecting application:', err);
      addToast({
        type: 'error',
        title: 'Rejection Failed',
        message: err.message || 'Failed to reject application. Please try again.'
      });
    }
  };

  // Export handler
  const handleExport = async (format: 'csv' | 'excel' = 'csv') => {
    try {
      await exportApplications(format);
      
      addToast({
        type: 'success',
        title: 'Export Completed',
        message: `Applications exported successfully as ${format.toUpperCase()}.`
      });
    } catch (err: any) {
      console.error('Error exporting applications:', err);
      addToast({
        type: 'error',
        title: 'Export Failed',
        message: err.message || 'Failed to export applications. Please try again.'
      });
    }
  };

  // Pagination calculations
  const startIndex = (currentPage - 1) * 12;
  const endIndex = startIndex + 12;

  const formatCurrency = (amount: number) => {
    return `UGX ${amount.toLocaleString()}`;
  };

  return (
    <div className="space-y-6 dark:bg-black min-h-screen p-6">
      {/* Enhanced Header with breadcrumb and quick actions */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start space-y-4 lg:space-y-0">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
            <span>Dashboard</span>
            <span>/</span>
            <span className="text-primary-600 dark:text-primary-400 font-medium">Loan Applications</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Loan Applications</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Review and process loan applications from potential borrowers
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <div className="relative">
            <button 
              onClick={() => handleExport('csv')}
              className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Export</span>
            </button>
          </div>
          <button 
            onClick={handleNewApplication}
            className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg flex items-center space-x-2 shadow-lg shadow-primary-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-primary-500/30"
          >
            <Plus className="h-4 w-4" />
            <span>New Application</span>
          </button>
        </div>
      </div>

      {/* Error message display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center space-x-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <div className="flex-1">
            <p className="text-red-800 dark:text-red-200 font-medium">Error loading applications</p>
            <p className="text-red-600 dark:text-red-300 text-sm">{error}</p>
          </div>
          <button
            onClick={clearError}
            className="text-red-500 hover:text-red-700 dark:hover:text-red-300"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Enhanced Application Statistics with animations and trends */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-xl shadow-lg">
                <Clock className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Pending Review</h3>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.pending}
                </p>
                <div className="flex items-center mt-1">
                  <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
                  <span className="text-xs text-green-600 dark:text-green-400">+12% from last week</span>
                </div>
              </div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-gray-400 group-hover:text-yellow-500 transition-colors" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Under Review</h3>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.underReview}
                </p>
                <div className="flex items-center mt-1">
                  <AlertCircle className="h-3 w-3 text-gray-400 mr-1" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">Processing time: 2-3 days</span>
                </div>
              </div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg">
                <CheckCircle className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Approved</h3>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.approved}
                </p>
                <div className="flex items-center mt-1">
                  <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
                  <span className="text-xs text-green-600 dark:text-green-400">85% approval rate</span>
                </div>
              </div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-gray-400 group-hover:text-green-500 transition-colors" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg">
                <XCircle className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Rejected</h3>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.rejected}
                </p>
                <div className="flex items-center mt-1">
                  <AlertCircle className="h-3 w-3 text-red-400 mr-1" />
                  <span className="text-xs text-red-500 dark:text-red-400">Avg. processing: 1 day</span>
                </div>
              </div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-gray-400 group-hover:text-red-500 transition-colors" />
          </div>
        </div>
      </div>

      {/* Enhanced Search and Filter Section */}
      <div className="bg-gradient-to-r from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="flex-1 max-w-lg">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 group-focus-within:text-primary-500 transition-colors" />
              <input
                type="text"
                placeholder="Search by name, ID, or purpose..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 pr-4 py-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 transition-all duration-200 hover:border-gray-400 dark:hover:border-gray-500"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center group">
              <Filter className="h-5 w-5 text-gray-400 mr-3 group-focus-within:text-primary-500 transition-colors" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white min-w-[140px] transition-all duration-200 hover:border-gray-400 dark:hover:border-gray-500"
              >
                <option value="All">All Status</option>
                <option value="pending">Pending</option>
                <option value="under_review">Under Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            
            {/* Bulk actions */}
            {selectedApplicationIds.length > 0 && (
              <div className="flex items-center space-x-2 bg-primary-50 dark:bg-primary-900/20 px-3 py-2 rounded-lg">
                <span className="text-sm text-primary-700 dark:text-primary-300">
                  {selectedApplicationIds.length} selected
                </span>
                <button
                  onClick={() => setIsBulkDeleteOpen(true)}
                  className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
            
            <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-lg">
              {totalCount} result{totalCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Applications table with improved styling */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700">
              <tr>
                <th className="px-6 py-4 text-left">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center space-x-2 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider"
                  >
                    {selectedApplicationIds.length === applications.length && applications.length > 0 ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    <span>Application</span>
                  </button>
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  Applicant
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  Amount & Term
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  Submitted
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center space-y-4">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
                      <p className="text-gray-500 dark:text-gray-400 font-medium">Loading applications...</p>
                    </div>
                  </td>
                </tr>
              ) : applications.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center space-y-4">
                      <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full">
                        <FileText className="h-8 w-8 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 font-medium">No applications found</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try adjusting your search criteria</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                applications.map((application, index) => {
                  const applicationId = application.applicationId || application.id || `APP${String(index + 1).padStart(3, '0')}`;
                  const isSelected = selectedApplicationIds.includes(application.id!);
                  
                  return (
                    <tr key={application.id} className="hover:bg-gradient-to-r hover:from-gray-50 hover:to-transparent dark:hover:from-gray-800 dark:hover:to-transparent transition-all duration-200 group">
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => toggleApplicationSelection(application.id!)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          >
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-primary-600" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">{applicationId}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md inline-block">
                              {application.purpose}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            <div className="h-10 w-10 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center">
                              <User className="h-5 w-5 text-white" />
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {application.borrower ? `${application.borrower.firstName} ${application.borrower.lastName}` : 'Unknown'}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {application.borrower?.phone || 'No phone'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(application.requestedAmount)}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {application.termMonths || application.loanTerm} months
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center">
                          {application.status === 'PENDING' && (
                            <>
                              <Clock className="h-4 w-4 text-yellow-500 mr-2" />
                              <span className="inline-flex px-3 py-1 text-xs font-semibold rounded-full bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800 dark:from-yellow-900 dark:to-yellow-800 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700">
                                Pending Review
                              </span>
                            </>
                          )}
                          {application.status === 'UNDER_REVIEW' && (
                            <>
                              <FileText className="h-4 w-4 text-blue-500 mr-2" />
                              <span className="inline-flex px-3 py-1 text-xs font-semibold rounded-full bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 dark:from-blue-900 dark:to-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
                                Under Review
                              </span>
                            </>
                          )}
                          {application.status === 'APPROVED' && (
                            <>
                              <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                              <span className="inline-flex px-3 py-1 text-xs font-semibold rounded-full bg-gradient-to-r from-green-100 to-green-200 text-green-800 dark:from-green-900 dark:to-green-800 dark:text-green-300 border border-green-300 dark:border-green-700">
                                Approved
                              </span>
                            </>
                          )}
                          {application.status === 'REJECTED' && (
                            <>
                              <XCircle className="h-4 w-4 text-red-500 mr-2" />
                              <span className="inline-flex px-3 py-1 text-xs font-semibold rounded-full bg-gradient-to-r from-red-100 to-red-200 text-red-800 dark:from-red-900 dark:to-red-800 dark:text-red-300 border border-red-300 dark:border-red-700">
                                Rejected
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white font-medium">
                          {formatApplicationDate(application.submittedAt || application.submissionDate || '')}
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleViewApplication(application)}
                            className="p-2 text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-all duration-200"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleEditApplication(application)}
                            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-all duration-200"
                            title="Edit Application"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteApplication(application)}
                            className="p-2 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200"
                            title="Delete Application"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Enhanced Pagination */}
        {totalCount > 12 && (
          <div className="bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 px-6 py-4 flex items-center justify-between border-t border-gray-200 dark:border-gray-700">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setPage(Math.max(currentPage - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(currentPage + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Showing <span className="font-semibold text-primary-600 dark:text-primary-400">{startIndex + 1}</span> to{' '}
                  <span className="font-semibold text-primary-600 dark:text-primary-400">{Math.min(endIndex, totalCount)}</span> of{' '}
                  <span className="font-semibold text-primary-600 dark:text-primary-400">{totalCount}</span> applications
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-lg shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setPage(Math.max(currentPage - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-3 py-2 rounded-l-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      if (totalPages <= 7) return true;
                      if (page === 1 || page === totalPages) return true;
                      if (page >= currentPage - 1 && page <= currentPage + 1) return true;
                      return false;
                    })
                    .map((page, index, array) => {
                      const showEllipsis = index > 0 && array[index - 1] !== page - 1;
                      return (
                        <React.Fragment key={page}>
                          {showEllipsis && (
                            <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300">
                              ...
                            </span>
                          )}
                          <button
                            onClick={() => setPage(page)}
                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium transition-all duration-200 ${
                              currentPage === page
                                ? 'z-10 bg-gradient-to-r from-primary-500 to-primary-600 border-primary-500 text-white shadow-lg'
                                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                            }`}
                          >
                            {page}
                          </button>
                        </React.Fragment>
                      );
                    })}
                  <button
                    onClick={() => setPage(Math.min(currentPage + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-3 py-2 rounded-r-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced View Application Modal */}
      {isViewModalOpen && selectedApplication && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-r from-primary-500 to-primary-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold">
                    Application Details
                  </h3>
                  <p className="text-primary-100 mt-1">
                    {selectedApplication.applicationId || selectedApplication.id || 'N/A'} • Submitted {formatDate(selectedApplication.submittedAt || selectedApplication.submissionDate || new Date().toISOString())}
                  </p>
                </div>
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="text-white hover:text-primary-200 p-2 hover:bg-white/10 rounded-lg transition-all duration-200"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-8">
                {/* Personal Information */}
                <div className="space-y-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                      <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Personal Information
                    </h4>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Full Name</label>
                      <p className="text-gray-900 dark:text-white font-medium mt-1">
                        {selectedApplication.borrower 
                          ? `${selectedApplication.borrower.firstName} ${selectedApplication.borrower.lastName}` 
                          : selectedApplication.fullName || 'Not provided'
                        }
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Date of Birth</label>
                      <p className="text-gray-900 dark:text-white font-medium mt-1">
                        {selectedApplication.borrower?.dateOfBirth 
                          ? formatDate(selectedApplication.borrower.dateOfBirth) 
                          : selectedApplication.dob || 'Not provided'
                        }
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">National ID</label>
                      <p className="text-gray-900 dark:text-white font-medium mt-1">
                        {selectedApplication.borrower?.nationalId || selectedApplication.nationalId || 'Not provided'}
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone</label>
                      <p className="text-gray-900 dark:text-white font-medium mt-1">
                        {selectedApplication.borrower?.phone || selectedApplication.phone || 'Not provided'}
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</label>
                      <p className="text-gray-900 dark:text-white font-medium mt-1">
                        {selectedApplication.borrower?.email || selectedApplication.email || 'Not provided'}
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Address</label>
                      <p className="text-gray-900 dark:text-white font-medium mt-1">
                        {selectedApplication.borrower?.district || selectedApplication.address || 'Not provided'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Employment Information */}
                <div className="space-y-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                      <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Employment Information
                    </h4>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Employment Status</label>
                      <p className="text-gray-900 dark:text-white font-medium mt-1">
                        {selectedApplication.borrower?.occupation || selectedApplication.employmentStatus || 'Not provided'}
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Employer</label>
                      <p className="text-gray-900 dark:text-white font-medium mt-1">
                        {selectedApplication.borrower?.occupation || selectedApplication.employer || 'Not provided'}
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Monthly Income</label>
                      <p className="text-gray-900 dark:text-white font-semibold text-green-600 dark:text-green-400 mt-1">
                        {selectedApplication.borrower?.monthlyIncome 
                          ? `UGX ${selectedApplication.borrower.monthlyIncome.toLocaleString()}` 
                          : selectedApplication.monthlyIncome || 'Not provided'
                        }
                      </p>
                    </div>
                  </div>
                </div>

                {/* Loan Information */}
                <div className="space-y-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                      <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Loan Information
                    </h4>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Requested Amount</label>
                      <p className="text-gray-900 dark:text-white font-bold text-lg mt-1">
                        {formatCurrency(selectedApplication.requestedAmount)}
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Loan Term</label>
                      <p className="text-gray-900 dark:text-white font-medium mt-1">
                        {selectedApplication.termMonths || selectedApplication.loanTerm || 'Not provided'} months
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Purpose</label>
                      <p className="text-gray-900 dark:text-white font-medium mt-1">{selectedApplication.purpose}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Collateral</label>
                      <p className="text-gray-900 dark:text-white font-medium mt-1">{selectedApplication.collateral || 'Not provided'}</p>
                    </div>
                  </div>
                </div>

                {/* Guarantor Information */}
                <div className="space-y-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
                      <User className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Guarantor Information
                    </h4>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Guarantor Name</label>
                      <p className="text-gray-900 dark:text-white font-medium mt-1">{selectedApplication.guarantorName || 'Not provided'}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Guarantor ID</label>
                      <p className="text-gray-900 dark:text-white font-medium mt-1">{selectedApplication.guarantorId || 'Not provided'}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Guarantor Phone</label>
                      <p className="text-gray-900 dark:text-white font-medium mt-1">{selectedApplication.guarantorPhone || 'Not provided'}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Relationship</label>
                      <p className="text-gray-900 dark:text-white font-medium mt-1">{selectedApplication.guarantorRelation || 'Not provided'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status and Actions Bar */}
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      {selectedApplication.status === 'PENDING' && <Clock className="h-5 w-5 text-yellow-500" />}
                      {selectedApplication.status === 'APPROVED' && <CheckCircle className="h-5 w-5 text-green-500" />}
                      {selectedApplication.status === 'REJECTED' && <XCircle className="h-5 w-5 text-red-500" />}
                      {selectedApplication.status === 'UNDER_REVIEW' && <RefreshCw className="h-5 w-5 text-blue-500" />}
                      <span className="text-lg font-semibold text-gray-900 dark:text-white">Status:</span>
                      <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full border ${
                        selectedApplication.status === 'PENDING' 
                          ? 'bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800 dark:from-yellow-900 dark:to-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700'
                          : selectedApplication.status === 'APPROVED'
                          ? 'bg-gradient-to-r from-green-100 to-green-200 text-green-800 dark:from-green-900 dark:to-green-800 dark:text-green-300 border-green-300 dark:border-green-700'
                          : selectedApplication.status === 'REJECTED'
                          ? 'bg-gradient-to-r from-red-100 to-red-200 text-red-800 dark:from-red-900 dark:to-red-800 dark:text-red-300 border-red-300 dark:border-red-700'
                          : 'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 dark:from-blue-900 dark:to-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                      }`}>
                        {selectedApplication.status === 'PENDING' && 'Pending Review'}
                        {selectedApplication.status === 'APPROVED' && 'Approved'}
                        {selectedApplication.status === 'REJECTED' && 'Rejected'}
                        {selectedApplication.status === 'UNDER_REVIEW' && 'Under Review'}
                        {!['PENDING', 'APPROVED', 'REJECTED', 'UNDER_REVIEW'].includes(selectedApplication.status) && selectedApplication.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => setIsViewModalOpen(false)}
                      className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Close
                    </button>
                    {selectedApplication.status === 'PENDING' && (
                      <>
                        <button 
                          onClick={() => handleRejectApplication(selectedApplication, 'Application rejected after review')}
                          className="px-6 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 flex items-center shadow-lg transition-all duration-200"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </button>
                        <button 
                          onClick={() => handleApproveApplication(selectedApplication, 'Application approved')}
                          className="px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 flex items-center shadow-lg transition-all duration-200"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Application Modal */}
      {isEditModalOpen && selectedApplication && editFormData && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold">Edit Application</h3>
                  <p className="text-blue-100 mt-1">
                    {selectedApplication.applicationId || selectedApplication.id || 'N/A'} • {selectedApplication.borrower 
                      ? `${selectedApplication.borrower.firstName} ${selectedApplication.borrower.lastName}` 
                      : selectedApplication.fullName || 'N/A'
                    }
                  </p>
                </div>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-white hover:text-blue-200 p-2 hover:bg-white/10 rounded-lg transition-all duration-200"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {/* Personal Information */}
                <div className="space-y-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                      <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Personal Information
                    </h4>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Full Name</label>
                      <input
                        type="text"
                        value={editFormData.fullName}
                        onChange={(e) => handleEditFormChange('fullName', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date of Birth</label>
                      <input
                        type="text"
                        value={editFormData.dob || ''}
                        onChange={(e) => handleEditFormChange('dob', e.target.value)}
                        placeholder="DD/MM/YYYY"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">National ID</label>
                      <input
                        type="text"
                        value={editFormData.nationalId || ''}
                        onChange={(e) => handleEditFormChange('nationalId', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Phone</label>
                      <input
                        type="text"
                        value={editFormData.phone}
                        onChange={(e) => handleEditFormChange('phone', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email</label>
                      <input
                        type="email"
                        value={editFormData.email || ''}
                        onChange={(e) => handleEditFormChange('email', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Address</label>
                      <textarea
                        value={editFormData.address || ''}
                        onChange={(e) => handleEditFormChange('address', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Employment Information */}
                <div className="space-y-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                      <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Employment Information
                    </h4>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Employment Status</label>
                      <select
                        value={editFormData.employmentStatus}
                        onChange={(e) => handleEditFormChange('employmentStatus', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="">Select Status</option>
                        <option value="Employed">Employed</option>
                        <option value="Self-Employed">Self-Employed</option>
                        <option value="Business Owner">Business Owner</option>
                        <option value="Unemployed">Unemployed</option>
                        <option value="Student">Student</option>
                        <option value="Retired">Retired</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Employer</label>
                      <input
                        type="text"
                        value={editFormData.employer}
                        onChange={(e) => handleEditFormChange('employer', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Monthly Income</label>
                      <input
                        type="text"
                        value={editFormData.monthlyIncome}
                        onChange={(e) => handleEditFormChange('monthlyIncome', e.target.value)}
                        placeholder="UGX 500,000"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Loan Information */}
                <div className="space-y-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                      <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Loan Information
                    </h4>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Requested Amount (UGX)</label>
                      <input
                        type="number"
                        value={editFormData.requestedAmount}
                        onChange={(e) => handleEditFormChange('requestedAmount', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Loan Term (months)</label>
                      <input
                        type="number"
                        value={editFormData.loanTerm}
                        onChange={(e) => handleEditFormChange('loanTerm', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Purpose</label>
                      <textarea
                        value={editFormData.purpose}
                        onChange={(e) => handleEditFormChange('purpose', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Collateral</label>
                      <textarea
                        value={editFormData.collateral || ''}
                        onChange={(e) => handleEditFormChange('collateral', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Guarantor Information */}
                <div className="space-y-6 md:col-span-2 lg:col-span-3">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
                      <User className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Guarantor Information
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Guarantor Name</label>
                      <input
                        type="text"
                        value={editFormData.guarantorName || ''}
                        onChange={(e) => handleEditFormChange('guarantorName', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Guarantor ID</label>
                      <input
                        type="text"
                        value={editFormData.guarantorId || ''}
                        onChange={(e) => handleEditFormChange('guarantorId', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Guarantor Phone</label>
                      <input
                        type="text"
                        value={editFormData.guarantorPhone || ''}
                        onChange={(e) => handleEditFormChange('guarantorPhone', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Relationship</label>
                      <select
                        value={editFormData.guarantorRelation || ''}
                        onChange={(e) => handleEditFormChange('guarantorRelation', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="">Select Relationship</option>
                        <option value="Spouse">Spouse</option>
                        <option value="Parent">Parent</option>
                        <option value="Sibling">Sibling</option>
                        <option value="Friend">Friend</option>
                        <option value="Colleague">Colleague</option>
                        <option value="Business Partner">Business Partner</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="bg-gray-50 dark:bg-gray-800 px-6 py-4 flex justify-end space-x-3 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveApplication}
                disabled={isSaving}
                className="px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 flex items-center shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Application Modal */}
      <NewApplicationModal 
        isOpen={isNewApplicationModalOpen} 
        onClose={() => setIsNewApplicationModalOpen(false)} 
      />

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && applicationToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full shadow-2xl">
            <div className="bg-gradient-to-r from-red-500 to-red-600 p-6 text-white rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <AlertCircle className="h-6 w-6" />
                  <h3 className="text-xl font-bold">Confirm Deletion</h3>
                </div>
                <button
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="text-white hover:text-red-200 p-1 hover:bg-white/10 rounded-lg transition-all duration-200"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <div className="text-center mb-6">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900 mb-4">
                  <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Delete Application
                </h4>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Are you sure you want to delete this application? This action cannot be undone.
                </p>
                
                {/* Application Details */}
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-left space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Application ID:</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {applicationToDelete.applicationId || applicationToDelete.id || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Applicant:</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {applicationToDelete.borrower 
                        ? `${applicationToDelete.borrower.firstName} ${applicationToDelete.borrower.lastName}` 
                        : applicationToDelete.fullName || 'Unknown'
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Amount:</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      UGX {applicationToDelete.requestedAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Purpose:</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{applicationToDelete.purpose}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteApplication}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 flex items-center justify-center shadow-lg transition-all duration-200"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {isBulkDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full shadow-2xl">
            <div className="bg-gradient-to-r from-red-500 to-red-600 p-6 text-white rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <AlertCircle className="h-6 w-6" />
                  <h3 className="text-xl font-bold">Bulk Delete Applications</h3>
                </div>
                <button
                  onClick={() => setIsBulkDeleteOpen(false)}
                  className="text-white hover:text-red-200 p-1 hover:bg-white/10 rounded-lg transition-all duration-200"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <div className="text-center mb-6">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900 mb-4">
                  <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Delete {selectedApplicationIds.length} Applications
                </h4>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Are you sure you want to delete {selectedApplicationIds.length} selected applications? This action cannot be undone.
                </p>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => setIsBulkDeleteOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 flex items-center justify-center shadow-lg transition-all duration-200"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Applications;