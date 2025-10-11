import React, { useState } from 'react';
import { X, BarChart3, DollarSign, CreditCard, RefreshCw } from 'lucide-react';

interface RefreshDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RefreshDashboardModal: React.FC<RefreshDashboardModalProps> = ({ isOpen, onClose }) => {
  const [refreshOptions, setRefreshOptions] = useState({
    kpiMetrics: true,
    paymentData: true,
    loanInformation: true,
    generateNewReports: false
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!isOpen) return null;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    // Simulate API calls
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsRefreshing(false);
    onClose();
  };

  const handleOptionChange = (option: keyof typeof refreshOptions) => {
    setRefreshOptions(prev => ({
      ...prev,
      [option]: !prev[option]
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Refresh Dashboard</h2>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            disabled={isRefreshing}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Select which data to refresh:
          </p>

          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="kpiMetrics"
                checked={refreshOptions.kpiMetrics}
                onChange={() => handleOptionChange('kpiMetrics')}
                className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 dark:focus:ring-green-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                disabled={isRefreshing}
              />
              <label htmlFor="kpiMetrics" className="flex items-center space-x-2 text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                <span>KPI Metrics</span>
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="paymentData"
                checked={refreshOptions.paymentData}
                onChange={() => handleOptionChange('paymentData')}
                className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 dark:focus:ring-green-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                disabled={isRefreshing}
              />
              <label htmlFor="paymentData" className="flex items-center space-x-2 text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span>Payment Data</span>
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="loanInformation"
                checked={refreshOptions.loanInformation}
                onChange={() => handleOptionChange('loanInformation')}
                className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 dark:focus:ring-green-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                disabled={isRefreshing}
              />
              <label htmlFor="loanInformation" className="flex items-center space-x-2 text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
                <CreditCard className="w-4 h-4 text-purple-600" />
                <span>Loan Information</span>
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="generateNewReports"
                checked={refreshOptions.generateNewReports}
                onChange={() => handleOptionChange('generateNewReports')}
                className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 dark:focus:ring-green-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                disabled={isRefreshing}
              />
              <label htmlFor="generateNewReports" className="flex items-center space-x-2 text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
                <RefreshCw className="w-4 h-4 text-orange-600" />
                <span>Generate New Reports</span>
              </label>
            </div>
          </div>

          {isRefreshing && (
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center space-x-3">
                <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Refreshing Dashboard</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">Please wait while we update your data...</p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-3 pt-6">
            <button
              onClick={onClose}
              disabled={isRefreshing}
              className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || !Object.values(refreshOptions).some(Boolean)}
              className="flex-1 px-4 py-2 text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              {isRefreshing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Refreshing...</span>
                </>
              ) : (
                <span>Refresh Now</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RefreshDashboardModal;