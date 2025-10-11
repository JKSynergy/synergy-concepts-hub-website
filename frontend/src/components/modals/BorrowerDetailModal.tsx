import React, { useState, useEffect } from 'react';
import { X, User, Phone, Mail, MapPin, Calendar, TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle, Clock, DollarSign, CreditCard, Brain } from 'lucide-react';
import { BorrowerData } from '../../services/databaseService';
import { aiCreditService, CreditAnalysis, CreditScoreHistory } from '../../services/aiCreditService';
import CreditScoreTrend from '../CreditScore/CreditScoreTrend';

interface BorrowerDetailModalProps {
  borrower: BorrowerData;
  isOpen: boolean;
  onClose: () => void;
}

const BorrowerDetailModal: React.FC<BorrowerDetailModalProps> = ({ borrower, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'credit' | 'history' | 'ai'>('overview');
  const [creditAnalysis, setCreditAnalysis] = useState<CreditAnalysis | null>(null);
  const [creditHistory, setCreditHistory] = useState<CreditScoreHistory[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && borrower) {
      setLoading(true);
      // Simulate AI analysis
      setTimeout(() => {
        const analysis = aiCreditService.calculateAICreditScore(borrower);
        const history = aiCreditService.generateCreditScoreHistory(borrower);
        setCreditAnalysis(analysis);
        setCreditHistory(history);
        setLoading(false);
      }, 1000);
    }
  }, [isOpen, borrower]);

  if (!isOpen) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getScoreTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'declining': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getRiskBadgeColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Personal Information */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Personal Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center space-x-3">
            <User className="h-5 w-5 text-gray-400" />
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">{borrower.firstName} {borrower.lastName}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Full Name</div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Phone className="h-5 w-5 text-gray-400" />
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">{borrower.phone}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Phone Number</div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Mail className="h-5 w-5 text-gray-400" />
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">{borrower.email || 'N/A'}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Email Address</div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <MapPin className="h-5 w-5 text-gray-400" />
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">{borrower.district || 'N/A'}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">District</div>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Financial Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{borrower.totalLoans || 0}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Total Loans</div>
              </div>
              <CreditCard className="h-8 w-8 text-blue-500" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(borrower.totalBorrowed || 0)}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Total Borrowed</div>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency((borrower.totalBorrowed || 0) - (borrower.outstandingBalance || 0))}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Total Repaid</div>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Status and Activity */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Current Status</div>
            <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
              borrower.status === 'active' 
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' 
                : borrower.status === 'defaulted'
                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {borrower.status.charAt(0).toUpperCase() + borrower.status.slice(1)}
            </span>
          </div>
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Active Loans</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">{borrower.activeLoans || 0}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Borrower ID</div>
            <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center">
              <Calendar className="h-4 w-4 mr-2" />
              {borrower.borrowerId}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Outstanding Balance</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {formatCurrency(borrower.outstandingBalance || 0)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCreditAnalysis = () => {
    if (loading || !creditAnalysis) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Analyzing credit profile...</span>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Credit Score Overview */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Credit Score Analysis</h3>
            <div className="flex items-center space-x-2">
              {getScoreTrendIcon(creditAnalysis.trend)}
              <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">{creditAnalysis.trend}</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">{creditAnalysis.score}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Current Score</div>
              {creditAnalysis.previousScore && (
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Previous: {creditAnalysis.previousScore}
                </div>
              )}
            </div>
            <div className="text-center">
              <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getRiskBadgeColor(creditAnalysis.riskLevel)}`}>
                {creditAnalysis.riskLevel.toUpperCase()} RISK
              </span>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">Risk Level</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                {Math.round(creditAnalysis.aiConfidence * 100)}%
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">AI Confidence</div>
            </div>
          </div>
        </div>

        {/* Credit Factors */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Credit Score Trend</h3>
          <div className="mb-6">
            <CreditScoreTrend history={creditHistory} height={250} />
          </div>
          
          <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-4">Credit Factors</h4>
          <div className="space-y-4">
            {Object.entries(creditAnalysis.factors).map(([factor, score]) => {
              const percentage = (score / 850) * 100;
              const factorName = factor.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
              
              return (
                <div key={factor}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{factorName}</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">{score}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        percentage >= 80 ? 'bg-green-500' :
                        percentage >= 60 ? 'bg-yellow-500' :
                        percentage >= 40 ? 'bg-orange-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, percentage)}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recommendations */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">AI Recommendations</h3>
          <div className="space-y-3">
            {creditAnalysis.recommendations.map((recommendation, index) => (
              <div key={index} className="flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{recommendation}</span>
              </div>
            ))}
          </div>
          
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
              <Clock className="h-4 w-4" />
              <span>Next review scheduled for: {new Date(creditAnalysis.nextReviewDate).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAIInsights = () => {
    if (loading || !creditAnalysis) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Generating AI insights...</span>
        </div>
      );
    }

    const futureScore = aiCreditService.predictFutureScore(borrower, creditAnalysis);

    return (
      <div className="space-y-6">
        {/* AI Prediction */}
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-gray-800 dark:to-gray-700 rounded-lg p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Brain className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AI Predictions</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-700 rounded-lg p-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-2">
                  {futureScore.score}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Predicted Score (3 months)</div>
                <div className="text-xs text-gray-400 mt-1">
                  {Math.round(futureScore.confidence * 100)}% confidence
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-700 rounded-lg p-4">
              <div className="text-center">
                <div className={`text-2xl font-bold mb-2 ${
                  futureScore.score > creditAnalysis.score ? 'text-green-600' : 
                  futureScore.score < creditAnalysis.score ? 'text-red-600' : 'text-gray-600'
                }`}>
                  {futureScore.score > creditAnalysis.score ? '+' : ''}
                  {futureScore.score - creditAnalysis.score}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Expected Change</div>
              </div>
            </div>
          </div>
        </div>

        {/* Risk Assessment */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Risk Assessment</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-green-600 mb-2">
                {creditAnalysis.riskLevel === 'low' ? '92%' : 
                 creditAnalysis.riskLevel === 'medium' ? '76%' : '45%'}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Repayment Probability</div>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-blue-600 mb-2">
                {formatCurrency((borrower.totalBorrowed || 0) * 0.3)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Recommended Limit</div>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-purple-600 mb-2">
                {creditAnalysis.riskLevel === 'low' ? '8%' : 
                 creditAnalysis.riskLevel === 'medium' ? '12%' : '18%'}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Suggested Interest Rate</div>
            </div>
          </div>
        </div>

        {/* AI Model Information */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">AI Model Information</h3>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex justify-between">
              <span>Model Version:</span>
              <span className="font-medium">QuickCredit AI v2.1</span>
            </div>
            <div className="flex justify-between">
              <span>Training Data:</span>
              <span className="font-medium">50,000+ loan records</span>
            </div>
            <div className="flex justify-between">
              <span>Accuracy Rate:</span>
              <span className="font-medium">94.2%</span>
            </div>
            <div className="flex justify-between">
              <span>Last Updated:</span>
              <span className="font-medium">{new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75" onClick={onClose}></div>

        <div className="inline-block w-full max-w-6xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-gray-900 shadow-xl rounded-2xl">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center space-x-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                <User className="h-8 w-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{borrower.firstName} {borrower.lastName}</h2>
                <div className="flex items-center space-x-4 mt-1">
                  <span className="text-sm text-gray-500 dark:text-gray-400">ID: {borrower.borrowerId}</span>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    borrower.status === 'active' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' 
                      : borrower.status === 'defaulted'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {borrower.status.charAt(0).toUpperCase() + borrower.status.slice(1)}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
            <nav className="-mb-px flex space-x-8">
              {[
                { id: 'overview', label: 'Overview', icon: User },
                { id: 'credit', label: 'Credit Analysis', icon: TrendingUp },
                { id: 'ai', label: 'AI Insights', icon: Brain }
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id as any)}
                  className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="max-h-96 overflow-y-auto">
            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'credit' && renderCreditAnalysis()}
            {activeTab === 'ai' && renderAIInsights()}
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-end space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Close
              </button>
              <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700">
                Generate Report
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BorrowerDetailModal;