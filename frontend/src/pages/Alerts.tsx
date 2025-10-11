import React, { useState } from 'react';
import { Bell, AlertTriangle, Info, CheckCircle, Search, Filter, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAlerts } from '../contexts/AlertContext';

const Alerts: React.FC = () => {
  const { alerts, unreadCount, loading, markAsRead, markAllAsRead, refreshAlerts } = useAlerts();
  const [filterType, setFilterType] = useState<string>('All Alerts');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterDate] = useState<string>('10/09/2025');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const handleAlertClick = (alertId: string) => {
    markAsRead(alertId);
  };

  const filteredAlerts = alerts.filter(alert => {
    const matchesType = filterType === 'All Alerts' || alert.type === filterType.toLowerCase();
    const matchesStatus = filterStatus === 'All' || 
                         (filterStatus === 'Read' && alert.isRead) ||
                         (filterStatus === 'Unread' && !alert.isRead);
    return matchesType && matchesStatus;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredAlerts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAlerts = filteredAlerts.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterType, filterStatus]);

  const handleRefresh = () => {
    refreshAlerts();
  };

  const handleMarkAllRead = () => {
    markAllAsRead();
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'payment': return CheckCircle;
      case 'application': return Info;
      case 'overdue': return AlertTriangle;
      default: return Bell;
    }
  };

  const getAlertBadgeColor = (type: string) => {
    switch (type) {
      case 'payment': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'application': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'overdue': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'system': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const getAlertBadgeText = (type: string) => {
    switch (type) {
      case 'payment': return 'Payment';
      case 'application': return 'Application';
      case 'overdue': return 'Overdue';
      case 'system': return 'System';
      default: return 'Alert';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-l-red-500';
      case 'medium': return 'border-l-yellow-500';
      case 'low': return 'border-l-green-500';
      default: return 'border-l-gray-500';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffHours < 1) {
      return 'Just now';
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-2">
              <Bell className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Alerts</h1>
            </div>
          </div>
          
          <div className="p-6">
            <div className="flex items-center justify-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-500 dark:text-gray-400 ml-3">Loading alerts...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Bell className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Alerts</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {unreadCount > 0 ? `${unreadCount} unread alerts` : 'All alerts read'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={handleRefresh}
                className="flex items-center space-x-2 px-4 py-2 text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Refresh</span>
              </button>
              
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center space-x-2 px-4 py-2 text-sm bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>Mark All Read</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters:</span>
            </div>
            
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="All Alerts">All Types</option>
              <option value="payment">Payments</option>
              <option value="application">Applications</option>
              <option value="overdue">Overdue</option>
              <option value="system">System</option>
            </select>
            
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="All">All Status</option>
              <option value="Unread">Unread</option>
              <option value="Read">Read</option>
            </select>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="p-6 bg-gray-50 dark:bg-gray-800/50">
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900 dark:text-white">{alerts.length}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Total</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-red-600 dark:text-red-400">{unreadCount}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Unread</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-orange-600 dark:text-orange-400">
                {alerts.filter(a => a.priority === 'high').length}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">High Priority</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                {alerts.filter(a => a.type === 'payment').length}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Payments</div>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts List */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg">
        {filteredAlerts.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No alerts found
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              {filterType !== 'All Alerts' || filterStatus !== 'All' 
                ? 'Try adjusting your filters to see more alerts.'
                : 'All caught up! No new alerts at the moment.'}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedAlerts.map((alert) => {
              const IconComponent = getAlertIcon(alert.type);
              return (
                <div
                  key={alert.id}
                  onClick={() => handleAlertClick(alert.id)}
                  className={`p-6 border-l-4 ${getPriorityColor(alert.priority)} ${
                    !alert.isRead 
                      ? 'bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20' 
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  } cursor-pointer transition-colors`}
                >
                  <div className="flex items-start space-x-4">
                    <div className={`p-2 rounded-full ${
                      !alert.isRead 
                        ? 'bg-blue-100 dark:bg-blue-900/30' 
                        : 'bg-gray-100 dark:bg-gray-800'
                    }`}>
                      <IconComponent className={`h-5 w-5 ${
                        !alert.isRead 
                          ? 'text-blue-600 dark:text-blue-400' 
                          : 'text-gray-500 dark:text-gray-400'
                      }`} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className={`text-sm font-medium ${
                          !alert.isRead 
                            ? 'text-gray-900 dark:text-white' 
                            : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {alert.title}
                        </h3>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getAlertBadgeColor(alert.type)}`}>
                            {getAlertBadgeText(alert.type)}
                          </span>
                          {!alert.isRead && (
                            <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
                          )}
                        </div>
                      </div>
                      
                      <p className={`text-sm ${
                        !alert.isRead 
                          ? 'text-gray-700 dark:text-gray-300' 
                          : 'text-gray-500 dark:text-gray-400'
                      } mb-2`}>
                        {alert.message}
                      </p>
                      
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span>{formatTimestamp(alert.timestamp)}</span>
                        {alert.amount && (
                          <span className="font-medium">UGX {alert.amount.toLocaleString()}</span>
                        )}
                        {alert.reference && (
                          <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                            {alert.reference}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                    <span className="font-medium">{Math.min(endIndex, filteredAlerts.length)}</span> of{' '}
                    <span className="font-medium">{filteredAlerts.length}</span> alerts
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </button>

                    <div className="flex items-center space-x-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                        // Show first page, last page, current page, and pages around current
                        if (
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1)
                        ) {
                          return (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                                currentPage === page
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                              }`}
                            >
                              {page}
                            </button>
                          );
                        } else if (
                          page === currentPage - 2 ||
                          page === currentPage + 2
                        ) {
                          return (
                            <span key={page} className="px-2 text-gray-500 dark:text-gray-400">
                              ...
                            </span>
                          );
                        }
                        return null;
                      })}
                    </div>

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Alerts;