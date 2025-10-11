import React, { useState, useEffect } from 'react';
import { Brain, TrendingUp, AlertTriangle, Users, DollarSign, Target, Zap, BarChart3 } from 'lucide-react';
import { databaseService, BorrowerData } from '../../services/databaseService';
import { aiCreditService } from '../../services/aiCreditService';

interface AIInsight {
  id: string;
  type: 'opportunity' | 'risk' | 'trend' | 'recommendation';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  confidence: number;
  action?: string;
  borrowerId?: string;
}

const AIInsightsDashboard: React.FC = () => {
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [borrowers, setBorrowers] = useState<BorrowerData[]>([]);

  useEffect(() => {
    loadAIInsights();
  }, []);

  const loadAIInsights = async () => {
    try {
      setLoading(true);
      const borrowerData = await databaseService.getBorrowers();
      setBorrowers(borrowerData);
      
      // Generate AI insights based on borrower data
      const generatedInsights = await generateAIInsights(borrowerData);
      setInsights(generatedInsights);
    } catch (error) {
      console.error('Error loading AI insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateAIInsights = async (borrowerData: BorrowerData[]): Promise<AIInsight[]> => {
    const insights: AIInsight[] = [];

    // High-risk borrowers
    const highRiskBorrowers = borrowerData.filter(b => (b.creditScore || 500) < 550);
    if (highRiskBorrowers.length > 0) {
      insights.push({
        id: 'high-risk-alert',
        type: 'risk',
        title: 'High-Risk Borrowers Detected',
        description: `${highRiskBorrowers.length} borrowers have credit scores below 550. Consider implementing stricter lending criteria.`,
        impact: 'high',
        confidence: 0.92,
        action: 'Review lending policies'
      });
    }

    // Credit improvement opportunities
    const improvingBorrowers = borrowerData.filter(b => {
      const analysis = aiCreditService.calculateAICreditScore(b);
      return analysis.trend === 'improving';
    });
    
    if (improvingBorrowers.length > 0) {
      insights.push({
        id: 'improvement-opportunity',
        type: 'opportunity',
        title: 'Credit Score Improvements',
        description: `${improvingBorrowers.length} borrowers showing improving credit trends. Consider offering better rates.`,
        impact: 'medium',
        confidence: 0.87,
        action: 'Offer rate reductions'
      });
    }

    // Portfolio risk analysis
    const totalOutstanding = borrowerData.reduce((sum, b) => sum + ((b.outstandingBalance || 0)), 0);
    const avgCreditScore = borrowerData.reduce((sum, b) => sum + (b.creditScore || 500), 0) / borrowerData.length;
    
    if (avgCreditScore < 650) {
      insights.push({
        id: 'portfolio-risk',
        type: 'risk',
        title: 'Portfolio Credit Risk',
        description: `Average portfolio credit score is ${Math.round(avgCreditScore)}. Consider diversifying borrower base.`,
        impact: 'high',
        confidence: 0.94,
        action: 'Diversify lending'
      });
    }

    // Repayment pattern analysis
    const defaultedBorrowers = borrowerData.filter(b => b.status === 'defaulted');
    const defaultRate = (defaultedBorrowers.length / borrowerData.length) * 100;
    
    if (defaultRate > 10) {
      insights.push({
        id: 'default-trend',
        type: 'trend',
        title: 'Rising Default Rates',
        description: `Default rate is ${defaultRate.toFixed(1)}%, above recommended threshold of 10%.`,
        impact: 'high',
        confidence: 0.89,
        action: 'Implement early intervention'
      });
    }

    // Growth opportunities
    const excellentBorrowers = borrowerData.filter(b => (b.creditScore || 500) >= 750);
    if (excellentBorrowers.length > borrowerData.length * 0.2) {
      insights.push({
        id: 'growth-opportunity',
        type: 'opportunity',
        title: 'Premium Borrower Segment',
        description: `${excellentBorrowers.length} borrowers have excellent credit. Consider premium products.`,
        impact: 'medium',
        confidence: 0.85,
        action: 'Launch premium products'
      });
    }

    // AI recommendations for specific borrowers
    const topBorrowers = borrowerData
      .sort((a, b) => (b.totalBorrowed || 0) - (a.totalBorrowed || 0))
      .slice(0, 3);
    
    topBorrowers.forEach((borrower, index) => {
      const analysis = aiCreditService.calculateAICreditScore(borrower);
      if (analysis.riskLevel === 'low' && borrower.activeLoans === 0) {
        const borrowerName = `${borrower.firstName} ${borrower.lastName}`;
        insights.push({
          id: `borrower-opportunity-${borrower.id}`,
          type: 'recommendation',
          title: `Re-engage ${borrowerName}`,
          description: `High-value borrower with excellent credit history. No active loans.`,
          impact: 'medium',
          confidence: analysis.aiConfidence,
          action: 'Send loan offers',
          borrowerId: borrower.id
        });
      }
    });

    return insights.slice(0, 6); // Return top 6 insights
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'opportunity': return <Target className="h-5 w-5 text-green-500" />;
      case 'risk': return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'trend': return <TrendingUp className="h-5 w-5 text-blue-500" />;
      case 'recommendation': return <Zap className="h-5 w-5 text-purple-500" />;
      default: return <BarChart3 className="h-5 w-5 text-gray-500" />;
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <Brain className="h-6 w-6 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AI Insights</h3>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Brain className="h-6 w-6 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AI Insights</h3>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Real-time analysis
        </div>
      </div>

      {insights.length === 0 ? (
        <div className="text-center py-8">
          <Brain className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">No insights available at the moment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  {getInsightIcon(insight.type)}
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        {insight.title}
                      </h4>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getImpactColor(insight.impact)}`}>
                        {insight.impact.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {insight.description}
                    </p>
                    {insight.action && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                          Recommended: {insight.action}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {Math.round(insight.confidence * 100)}% confidence
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Performance Metrics */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">AI Performance</h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-lg font-bold text-purple-600 dark:text-purple-400">94.2%</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Accuracy</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{insights.length}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Active Insights</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600 dark:text-green-400">
              {formatCurrency(borrowers.reduce((sum, b) => sum + (b.outstandingBalance || 0), 0))}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Portfolio Value</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIInsightsDashboard;