import React, { useState, useEffect } from 'react';
import { Brain, TrendingUp, TrendingDown, Minus, AlertCircle, RefreshCw } from 'lucide-react';
import { aiCreditService, CreditAnalysis } from '../../services/aiCreditService';
import { BorrowerData } from '../../services/databaseService';

interface EnhancedCreditScoreProps {
  borrower: BorrowerData;
  showDetails?: boolean;
  variant?: 'default' | 'compact' | 'minimal';
  onAnalysisComplete?: (analysis: CreditAnalysis) => void;
}

const EnhancedCreditScore: React.FC<EnhancedCreditScoreProps> = ({ 
  borrower, 
  showDetails = false,
  variant = 'default',
  onAnalysisComplete 
}) => {
  const [analysis, setAnalysis] = useState<CreditAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAIDetails, setShowAIDetails] = useState(false);

  useEffect(() => {
    if (borrower && showDetails) {
      performAIAnalysis();
    }
  }, [borrower, showDetails]);

  const performAIAnalysis = async () => {
    setLoading(true);
    try {
      // Simulate AI processing time
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const aiAnalysis = aiCreditService.calculateAICreditScore(borrower);
      setAnalysis(aiAnalysis);
      
      if (onAnalysisComplete) {
        onAnalysisComplete(aiAnalysis);
      }
    } catch (error) {
      console.error('Error performing AI analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCreditScoreColor = (score: number) => {
    // Detect scale and apply appropriate ranges
    if (score <= 100) {
      // 0-100 scale
      if (score >= 85) return 'text-green-600 bg-green-50 border-green-200';
      if (score >= 70) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      if (score >= 55) return 'text-orange-600 bg-orange-50 border-orange-200';
      return 'text-red-600 bg-red-50 border-red-200';
    } else {
      // 300-850 scale
      if (score >= 750) return 'text-green-600 bg-green-50 border-green-200';
      if (score >= 650) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      if (score >= 550) return 'text-orange-600 bg-orange-50 border-orange-200';
      return 'text-red-600 bg-red-50 border-red-200';
    }
  };

  const getCreditScoreLabel = (score: number) => {
    // Detect scale and apply appropriate ranges
    if (score <= 100) {
      // 0-100 scale
      if (score >= 85) return 'Excellent';
      if (score >= 70) return 'Good';
      if (score >= 55) return 'Fair';
      return 'Poor';
    } else {
      // 300-850 scale
      if (score >= 750) return 'Excellent';
      if (score >= 650) return 'Good';
      if (score >= 550) return 'Fair';
      return 'Poor';
    }
  };

  const getScoreTrendIcon = (trend?: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'declining': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const currentScore = analysis?.score || borrower.creditScore;
  const scoreColorClass = getCreditScoreColor(currentScore);

  if (!showDetails) {
    // Compact view for table display
    if (variant === 'compact') {
      return (
        <div className="flex items-center space-x-2">
          {/* Compact circular indicator */}
          <div className={`relative w-10 h-10 rounded-full flex items-center justify-center border-2 ${
            currentScore >= 750 ? 'border-green-400 bg-green-50' :
            currentScore >= 650 ? 'border-yellow-400 bg-yellow-50' :
            currentScore >= 550 ? 'border-orange-400 bg-orange-50' :
            'border-red-400 bg-red-50'
          }`}>
            <div className="text-xs font-bold text-gray-900 dark:text-white">
              {currentScore}
            </div>
          </div>
          <div className="flex flex-col">
            <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${
              currentScore >= 750 ? 'bg-green-100 text-green-800' :
              currentScore >= 650 ? 'bg-yellow-100 text-yellow-800' :
              currentScore >= 550 ? 'bg-orange-100 text-orange-800' :
              'bg-red-100 text-red-800'
            }`}>
              {getCreditScoreLabel(currentScore)}
            </span>
          </div>
        </div>
      );
    }

    // Minimal view for tight spaces
    if (variant === 'minimal') {
      return (
        <div className="flex flex-col items-center space-y-1">
          <div className="text-sm font-bold text-gray-900 dark:text-white">{currentScore}</div>
          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
            currentScore >= 750 ? 'bg-green-100 text-green-800' :
            currentScore >= 650 ? 'bg-yellow-100 text-yellow-800' :
            currentScore >= 550 ? 'bg-orange-100 text-orange-800' :
            'bg-red-100 text-red-800'
          }`}>
            {getCreditScoreLabel(currentScore)}
          </span>
        </div>
      );
    }

    // Enhanced default view with visual indicator
    return (
      <div className="flex items-center space-x-3">
        {/* Credit Score Number with visual indicator */}
        <div className="flex flex-col items-center">
          <div className={`relative w-16 h-16 rounded-full flex items-center justify-center border-4 ${
            currentScore >= 750 ? 'border-green-400 bg-green-50' :
            currentScore >= 650 ? 'border-yellow-400 bg-yellow-50' :
            currentScore >= 550 ? 'border-orange-400 bg-orange-50' :
            'border-red-400 bg-red-50'
          }`}>
            <div className="text-lg font-bold text-gray-900 dark:text-white">
              {currentScore}
            </div>
            {/* Progress ring */}
            <svg className="absolute inset-0 w-16 h-16 transform -rotate-90" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
                className="text-gray-200"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                className={`${
                  currentScore >= 750 ? 'text-green-500' :
                  currentScore >= 650 ? 'text-yellow-500' :
                  currentScore >= 550 ? 'text-orange-500' :
                  'text-red-500'
                }`}
                strokeDasharray={`${((currentScore - 300) / 550) * 175.9}, 175.9`}
              />
            </svg>
          </div>
        </div>

        {/* Score details */}
        <div className="flex flex-col">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium shadow-sm ${
            currentScore >= 750 ? 'bg-green-100 text-green-800 border border-green-200' :
            currentScore >= 650 ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
            currentScore >= 550 ? 'bg-orange-100 text-orange-800 border border-orange-200' :
            'bg-red-100 text-red-800 border border-red-200'
          }`}>
            {getCreditScoreLabel(currentScore)}
          </span>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">
            {currentScore >= 750 ? '750-850' :
             currentScore >= 650 ? '650-749' :
             currentScore >= 550 ? '550-649' :
             '300-549'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Credit Score Display */}
      <div className={`p-6 rounded-lg border-2 ${scoreColorClass} dark:bg-gray-800 dark:border-gray-600`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Brain className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AI Credit Score</h3>
          </div>
          <button
            onClick={performAIAnalysis}
            disabled={loading}
            className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Analyzing...' : 'Refresh'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between space-x-8">
          {/* Enhanced Credit Score Gauge */}
          <div className="flex-1 flex items-center justify-center">
            <div className="relative">
              {/* Large circular gauge */}
              <div className="relative w-32 h-32">
                <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 128 128">
                  {/* Background circle */}
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-gray-200 dark:text-gray-700"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    strokeLinecap="round"
                    className={`${
                      currentScore >= 750 ? 'text-green-500' :
                      currentScore >= 650 ? 'text-yellow-500' :
                      currentScore >= 550 ? 'text-orange-500' :
                      'text-red-500'
                    }`}
                    strokeDasharray={`${((currentScore - 300) / 550) * 351.9}, 351.9`}
                    style={{
                      transition: 'stroke-dasharray 0.5s ease-in-out'
                    }}
                  />
                </svg>
                
                {/* Score display in center */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-4xl font-bold text-gray-900 dark:text-white mb-1">
                    {loading ? '...' : currentScore}
                  </div>
                  <div className={`text-sm font-medium px-3 py-1 rounded-full ${
                    currentScore >= 750 ? 'bg-green-100 text-green-800' :
                    currentScore >= 650 ? 'bg-yellow-100 text-yellow-800' :
                    currentScore >= 550 ? 'bg-orange-100 text-orange-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {loading ? 'Calculating...' : getCreditScoreLabel(currentScore)}
                  </div>
                </div>
              </div>
              
              {/* Score range indicator */}
              <div className="mt-2 text-center">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Range: 300-850
                </div>
              </div>
            </div>
          </div>

          {/* Analysis details */}
          <div className="flex-1 space-y-4">
            {analysis && !loading && (
              <>
                <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  {getScoreTrendIcon(analysis.trend)}
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                      {analysis.trend} Trend
                    </div>
                    {analysis.previousScore && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Previously: {analysis.previousScore}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <AlertCircle className={`h-5 w-5 ${
                    analysis.riskLevel === 'low' ? 'text-green-500' :
                    analysis.riskLevel === 'medium' ? 'text-yellow-500' :
                    'text-red-500'
                  }`} />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {analysis.riskLevel.charAt(0).toUpperCase() + analysis.riskLevel.slice(1)} Risk
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {Math.round(analysis.aiConfidence * 100)}% AI Confidence
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {loading && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                AI is analyzing payment history, credit utilization, and risk factors...
              </span>
            </div>
          </div>
        )}

        {/* Credit Score Scale Indicator */}
        {!loading && (
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 text-center">Credit Score Ranges</div>
            <div className="flex items-center justify-between space-x-1">
              {/* Poor */}
              <div className="flex-1 text-center">
                <div className={`h-2 rounded-l-full ${currentScore < 550 ? 'bg-red-500' : 'bg-red-200'}`}></div>
                <div className="text-xs mt-1 text-red-600 font-medium">Poor</div>
                <div className="text-xs text-gray-400">300-549</div>
              </div>
              
              {/* Fair */}
              <div className="flex-1 text-center">
                <div className={`h-2 ${currentScore >= 550 && currentScore < 650 ? 'bg-orange-500' : 'bg-orange-200'}`}></div>
                <div className="text-xs mt-1 text-orange-600 font-medium">Fair</div>
                <div className="text-xs text-gray-400">550-649</div>
              </div>
              
              {/* Good */}
              <div className="flex-1 text-center">
                <div className={`h-2 ${currentScore >= 650 && currentScore < 750 ? 'bg-yellow-500' : 'bg-yellow-200'}`}></div>
                <div className="text-xs mt-1 text-yellow-600 font-medium">Good</div>
                <div className="text-xs text-gray-400">650-749</div>
              </div>
              
              {/* Excellent */}
              <div className="flex-1 text-center">
                <div className={`h-2 rounded-r-full ${currentScore >= 750 ? 'bg-green-500' : 'bg-green-200'}`}></div>
                <div className="text-xs mt-1 text-green-600 font-medium">Excellent</div>
                <div className="text-xs text-gray-400">750-850</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI Analysis Details */}
      {analysis && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <button
            onClick={() => setShowAIDetails(!showAIDetails)}
            className="flex items-center justify-between w-full text-left"
          >
            <h4 className="text-md font-semibold text-gray-900 dark:text-white">AI Analysis Details</h4>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {showAIDetails ? 'Hide' : 'Show'} details
              </span>
              <div className={`transform transition-transform ${showAIDetails ? 'rotate-180' : ''}`}>
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </button>

          {showAIDetails && (
            <div className="mt-4 space-y-4">
              {/* Credit Factors */}
              <div>
                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Credit Factors</h5>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(analysis.factors).slice(0, 4).map(([factor, score]) => {
                    const percentage = (score / 850) * 100;
                    const factorName = factor.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                    
                    return (
                      <div key={factor} className="bg-gray-50 dark:bg-gray-700 rounded-md p-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                            {factorName}
                          </span>
                          <span className="text-xs text-gray-600 dark:text-gray-400">{score}</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                          <div 
                            className={`h-1.5 rounded-full ${
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

              {/* Top Recommendations */}
              <div>
                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Top Recommendations</h5>
                <div className="space-y-2">
                  {analysis.recommendations.slice(0, 2).map((recommendation, index) => (
                    <div key={index} className="flex items-start space-x-2">
                      <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-gray-600 dark:text-gray-400">{recommendation}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Next Review */}
              <div className="pt-3 border-t border-gray-200 dark:border-gray-600">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Next AI review: {new Date(analysis.nextReviewDate).toLocaleDateString()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EnhancedCreditScore;