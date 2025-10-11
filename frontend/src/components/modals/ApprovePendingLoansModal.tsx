import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Clock, AlertCircle, Loader2, Calendar } from 'lucide-react';
import { applicationService, LoanApplication as ApiLoanApplication } from '../../services/applicationService';
import { useNotification } from '../../contexts/NotificationContext';

interface LoanApplication extends ApiLoanApplication {
  eligibilityStatus: 'auto-eligible' | 'review-required' | 'high-risk';
}

interface ApprovePendingLoansModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void; // Callback to refresh dashboard
}

const ApprovePendingLoansModal: React.FC<ApprovePendingLoansModalProps> = ({ isOpen, onClose, onRefresh }) => {
  const [selectedApplications, setSelectedApplications] = useState<string[]>([]);
  const [applications, setApplications] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [applicationToReject, setApplicationToReject] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const { showNotification } = useNotification();

  // Load pending applications when modal opens
  useEffect(() => {
    if (isOpen) {
      loadPendingApplications();
    }
  }, [isOpen]);

  const loadPendingApplications = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await applicationService.getPendingApplications();
      
      if (result.error) {
        setError(result.error);
        setApplications([]);
      } else {
        // Add eligibility status to each application
        const appsWithStatus = (result.data || []).map(app => ({
          ...app,
          eligibilityStatus: applicationService.getApplicationStatus(app)
        }));
        console.log('Pending applications data:', appsWithStatus);
        setApplications(appsWithStatus);
      }
    } catch (err) {
      setError('Failed to load applications');
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    pending: applications.length,
    totalValue: applications.reduce((sum, app) => sum + app.requestedAmount, 0),
    autoEligible: applications.filter(app => app.eligibilityStatus === 'auto-eligible').length,
    reviewRequired: applications.filter(app => app.eligibilityStatus === 'review-required').length + 
                    applications.filter(app => app.eligibilityStatus === 'high-risk').length
  };

  if (!isOpen) return null;

  const handleSelectApplication = (appId: string) => {
    setSelectedApplications(prev => 
      prev.includes(appId) 
        ? prev.filter(id => id !== appId)
        : [...prev, appId]
    );
  };

  const handleSelectAllEligible = () => {
    const eligibleIds = applications
      .filter(app => app.eligibilityStatus === 'auto-eligible')
      .map(app => app.id);
    setSelectedApplications(eligibleIds);
  };

  const handleApproveSelected = async () => {
    if (selectedApplications.length === 0) return;

    setApproving(true);
    setError(null);

    try {
      const result = await applicationService.bulkApproveApplications(selectedApplications);
      
      if (result.data) {
        const { successful, failed } = result.data;
        
        if (failed.length > 0) {
          setError(`Some applications failed to approve: ${failed.map(f => f.error).join(', ')}`);
        }
        
        // Refresh the list
        await loadPendingApplications();
        setSelectedApplications([]);
        
        // Trigger dashboard refresh
        if (onRefresh) {
          onRefresh();
        }
        
        // Show success message
        if (successful.length > 0) {
          showNotification({
            type: 'success',
            title: 'Applications Approved',
            message: `Successfully approved ${successful.length} application(s). ${successful.length} loans have been created.`,
          });
        }
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to approve applications');
    } finally {
      setApproving(false);
    }
  };

  const handleRejectApplication = async () => {
    if (!applicationToReject || !rejectionReason.trim()) return;

    try {
      const result = await applicationService.rejectApplication(applicationToReject, {
        rejectionReason: rejectionReason.trim()
      });

      if (result.error) {
        setError(result.error);
      } else {
        // Refresh the list
        await loadPendingApplications();
        setShowRejectModal(false);
        setApplicationToReject(null);
        setRejectionReason('');
        
        // Trigger dashboard refresh
        if (onRefresh) {
          onRefresh();
        }
        
        showNotification({
          type: 'success',
          title: 'Application Rejected',
          message: 'Application has been successfully rejected',
        });
      }
    } catch (err) {
      setError('Failed to reject application');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'auto-eligible':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Auto-Eligible</span>;
      case 'review-required':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Review Required</span>;
      case 'high-risk':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">High Risk</span>;
      default:
        return null;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'auto-eligible':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'review-required':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'high-risk':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return null;
    }
  };

  const formatApplicationId = (id: string) => {
    // Extract the first part before the first dash and first 4 characters after the last dash
    const parts = id.split('-');
    if (parts.length >= 5) {
      return `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}-${parts[4].substring(0, 4)}`;
    }
    // Fallback: show first 8 and last 4 characters
    return id.length > 12 ? `${id.substring(0, 8)}...${id.substring(id.length - 4)}` : id;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Approve Pending Loans</h2>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-500 hover:text-red-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">Loading applications...</span>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-5 h-5 text-yellow-600" />
                    <div>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">Pending Applications</p>
                      <div className="flex items-baseline space-x-2">
                        <span className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">{stats.pending}</span>
                        <span className="text-sm text-yellow-600">Total value: UGX {stats.totalValue.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="text-sm text-green-700 dark:text-green-300">Auto-Eligible</p>
                      <div className="flex items-baseline space-x-2">
                        <span className="text-2xl font-bold text-green-900 dark:text-green-100">{stats.autoEligible}</span>
                        <span className="text-sm text-green-600">Ready for approval</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <div>
                      <p className="text-sm text-red-700 dark:text-red-300">Requires Review</p>
                      <div className="flex items-baseline space-x-2">
                        <span className="text-2xl font-bold text-red-900 dark:text-red-100">{stats.reviewRequired}</span>
                        <span className="text-sm text-red-600">Manual review needed</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Applications List */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Pending Applications</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={loadPendingApplications}
                    disabled={loading}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
                  </button>
                  <button
                    onClick={handleSelectAllEligible}
                    disabled={stats.autoEligible === 0}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    Select All Eligible
                  </button>
                  <button
                    onClick={() => setSelectedApplications([])}
                    className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>

              {applications.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="text-gray-600 dark:text-gray-400">No pending applications found</p>
                  <p className="text-sm text-gray-500 dark:text-gray-500">All applications have been processed</p>
                </div>
              ) : (
                <>
                  <div className="overflow-auto max-h-64 border rounded-lg">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            <input 
                              type="checkbox" 
                              className="rounded"
                              checked={selectedApplications.length === applications.length && applications.length > 0}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedApplications(applications.map(app => app.id));
                                } else {
                                  setSelectedApplications([]);
                                }
                              }}
                            />
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-36">Application ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Borrower</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Contact</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Term</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Purpose</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {applications.map((app) => (
                          <tr key={app.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selectedApplications.includes(app.id)}
                                onChange={() => handleSelectApplication(app.id)}
                                className="rounded"
                              />
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-green-600">
                              <div 
                                className="cursor-help font-mono truncate max-w-32" 
                                title={`Full ID: ${app.applicationId || app.id}`}
                              >
                                {app.applicationId || formatApplicationId(app.id)}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {app.borrower ? `${app.borrower.firstName} ${app.borrower.lastName}` : app.fullName || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                              <div className="space-y-1">
                                <div>{app.borrower?.email || app.email || 'N/A'}</div>
                                <div>{app.borrower?.phone || app.phone || 'N/A'}</div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
                              <div className="flex items-center">
                                <span className="text-green-500 mr-1 font-semibold">UGX</span>
                                {app.requestedAmount.toLocaleString()}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              <div className="flex items-center">
                                <Calendar className="w-4 h-4 text-blue-500 mr-1" />
                                {app.termMonths} months
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 truncate max-w-32" title={app.purpose}>
                              {app.purpose}
                            </td>
                            <td className="px-4 py-3">{getStatusBadge(app.eligibilityStatus)}</td>
                            <td className="px-4 py-3">
                              <div className="flex space-x-2">
                                <button
                                  onClick={async () => {
                                    setApproving(true);
                                    const result = await applicationService.approveApplication(app.id);
                                    if (result.error) {
                                      setError(result.error);
                                    } else {
                                      await loadPendingApplications();
                                      showNotification({
                                        type: 'success',
                                        title: 'Application Approved',
                                        message: 'Application has been successfully approved',
                                      });
                                    }
                                    setApproving(false);
                                  }}
                                  disabled={approving}
                                  className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => {
                                    setApplicationToReject(app.id);
                                    setShowRejectModal(true);
                                  }}
                                  className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                >
                                  Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedApplications.length} of {applications.length} applications selected
                    </p>
                    <div className="flex space-x-3">
                      <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleApproveSelected}
                        disabled={selectedApplications.length === 0 || approving}
                        className="px-4 py-2 text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center space-x-2"
                      >
                        {approving ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Approving...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            <span>Approve Selected ({selectedApplications.length})</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-60">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Reject Application</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Please provide a reason for rejecting this application:
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
              rows={4}
            />
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setApplicationToReject(null);
                  setRejectionReason('');
                }}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectApplication}
                disabled={!rejectionReason.trim()}
                className="flex-1 px-4 py-2 text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Reject Application
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovePendingLoansModal;