import React, { useState } from 'react';
import { X, TrendingUp, Info, BarChart3 } from 'lucide-react';

interface UpdateCreditScoresModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const UpdateCreditScoresModal: React.FC<UpdateCreditScoresModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState({
    updateMethod: 'automatic',
    paymentHistory: true,
    outstandingDebt: true,
    creditHistoryLength: true,
    newCreditInquiries: false
  });

  const [isUpdating, setIsUpdating] = useState(false);

  if (!isOpen) return null;

  const handleUpdate = async () => {
    setIsUpdating(true);
    
    try {
      const response = await fetch('http://localhost:3002/api/borrowers/update-credit-scores', {
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
        alert('Failed to update credit scores');
      }
    } catch (error) {
      console.error('Error updating credit scores:', error);
      alert('Error occurred while updating credit scores');
    }
    
    setIsUpdating(false);
    onClose();
  };

  const scoreFactors = [
    { name: 'Payment History', weight: '35%', enabled: settings.paymentHistory },
    { name: 'Outstanding Debt', weight: '30%', enabled: settings.outstandingDebt },
    { name: 'Credit History Length', weight: '15%', enabled: settings.creditHistoryLength },
    { name: 'New Credit Inquiries', weight: '10%', enabled: settings.newCreditInquiries }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Update Credit Scores</h2>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            disabled={isUpdating}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Info Notice */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <div className="flex items-start space-x-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">Credit Score Update</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  This will recalculate credit scores for all borrowers based on recent payment history and loan performance.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Update Method
            </label>
            <select
              value={settings.updateMethod}
              onChange={(e) => setSettings({...settings, updateMethod: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              disabled={isUpdating}
            >
              <option value="automatic">Automatic Calculation</option>
              <option value="manual_review">Manual Review Required</option>
              <option value="weighted_average">Weighted Average</option>
              <option value="custom_formula">Custom Formula</option>
            </select>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Score Factors</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="paymentHistory"
                  checked={settings.paymentHistory}
                  onChange={(e) => setSettings({...settings, paymentHistory: e.target.checked})}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  disabled={isUpdating}
                />
                <label htmlFor="paymentHistory" className="flex items-center justify-between w-full text-sm text-gray-900 dark:text-white">
                  <span className="flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    <span>Payment History (35%)</span>
                  </span>
                </label>
              </div>

              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="outstandingDebt"
                  checked={settings.outstandingDebt}
                  onChange={(e) => setSettings({...settings, outstandingDebt: e.target.checked})}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  disabled={isUpdating}
                />
                <label htmlFor="outstandingDebt" className="flex items-center justify-between w-full text-sm text-gray-900 dark:text-white">
                  <span className="flex items-center space-x-2">
                    <BarChart3 className="w-4 h-4 text-orange-600" />
                    <span>Outstanding Debt (30%)</span>
                  </span>
                </label>
              </div>

              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="creditHistoryLength"
                  checked={settings.creditHistoryLength}
                  onChange={(e) => setSettings({...settings, creditHistoryLength: e.target.checked})}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  disabled={isUpdating}
                />
                <label htmlFor="creditHistoryLength" className="flex items-center justify-between w-full text-sm text-gray-900 dark:text-white">
                  <span className="flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                    <span>Credit History Length (15%)</span>
                  </span>
                </label>
              </div>

              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="newCreditInquiries"
                  checked={settings.newCreditInquiries}
                  onChange={(e) => setSettings({...settings, newCreditInquiries: e.target.checked})}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  disabled={isUpdating}
                />
                <label htmlFor="newCreditInquiries" className="flex items-center justify-between w-full text-sm text-gray-900 dark:text-white">
                  <span className="flex items-center space-x-2">
                    <Info className="w-4 h-4 text-purple-600" />
                    <span>New Credit Inquiries (10%)</span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          {isUpdating && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Updating Credit Scores</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">Recalculating scores for all borrowers...</p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-3 pt-4">
            <button
              onClick={onClose}
              disabled={isUpdating}
              className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdate}
              disabled={isUpdating || !Object.values(settings).slice(1).some(Boolean)}
              className="flex-1 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {isUpdating ? 'Updating...' : 'Update Scores'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateCreditScoresModal;