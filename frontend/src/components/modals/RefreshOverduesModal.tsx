import React, { useState } from 'react';
import { X, AlertTriangle, Send, CreditCard } from 'lucide-react';

interface RefreshOverduesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RefreshOverduesModal: React.FC<RefreshOverduesModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState({
    gracePeriod: 5,
    lateFeeCalculation: 'fixed_25',
    sendNotifications: true,
    updateCreditScores: true,
    generateReports: false
  });

  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleRefresh = async () => {
    setIsProcessing(true);
    
    try {
      const response = await fetch('http://localhost:3002/api/overdue/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings })
      });

      const result = await response.json();

      if (result.success) {
        alert(`Success! ${result.message}`);
      } else {
        alert('Failed to refresh overdue calculations');
      }
    } catch (error) {
      console.error('Error refreshing overdues:', error);
      alert('Error occurred while refreshing overdue calculations');
    }
    
    setIsProcessing(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Refresh Overdue Calculations</h2>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            disabled={isProcessing}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Warning Notice */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Overdue Refresh</h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  This will recalculate all overdue amounts, late fees, and update borrower statuses.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Grace Period (Days)
            </label>
            <input
              type="number"
              value={settings.gracePeriod}
              onChange={(e) => setSettings({...settings, gracePeriod: parseInt(e.target.value)})}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              min="0"
              max="30"
              disabled={isProcessing}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Late Fee Calculation
            </label>
            <select
              value={settings.lateFeeCalculation}
              onChange={(e) => setSettings({...settings, lateFeeCalculation: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              disabled={isProcessing}
            >
              <option value="fixed_25">Fixed Amount (UGX 25,000)</option>
              <option value="percentage_5">5% of Outstanding</option>
              <option value="percentage_10">10% of Outstanding</option>
              <option value="daily_rate">Daily Rate (2%)</option>
            </select>
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="sendNotifications"
                checked={settings.sendNotifications}
                onChange={(e) => setSettings({...settings, sendNotifications: e.target.checked})}
                className="w-4 h-4 text-yellow-600 bg-gray-100 border-gray-300 rounded focus:ring-yellow-500"
                disabled={isProcessing}
              />
              <label htmlFor="sendNotifications" className="flex items-center space-x-2 text-sm text-gray-900 dark:text-white">
                <Send className="w-4 h-4 text-blue-600" />
                <span>Send overdue notifications</span>
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="updateCreditScores"
                checked={settings.updateCreditScores}
                onChange={(e) => setSettings({...settings, updateCreditScores: e.target.checked})}
                className="w-4 h-4 text-yellow-600 bg-gray-100 border-gray-300 rounded focus:ring-yellow-500"
                disabled={isProcessing}
              />
              <label htmlFor="updateCreditScores" className="flex items-center space-x-2 text-sm text-gray-900 dark:text-white">
                <CreditCard className="w-4 h-4 text-purple-600" />
                <span>Update credit scores</span>
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="generateReports"
                checked={settings.generateReports}
                onChange={(e) => setSettings({...settings, generateReports: e.target.checked})}
                className="w-4 h-4 text-yellow-600 bg-gray-100 border-gray-300 rounded focus:ring-yellow-500"
                disabled={isProcessing}
              />
              <label htmlFor="generateReports" className="flex items-center space-x-2 text-sm text-gray-900 dark:text-white">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
                <span>Generate collection reports</span>
              </label>
            </div>
          </div>

          {isProcessing && (
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-600"></div>
                <div>
                  <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">Processing Overdue Calculations</p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">This may take a few moments...</p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-3 pt-4">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRefresh}
              disabled={isProcessing}
              className="flex-1 px-4 py-2 text-white bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {isProcessing ? 'Processing...' : 'Refresh Overdues'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RefreshOverduesModal;