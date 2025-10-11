import { BorrowerData } from './borrowerService';

export interface CreditScoreFactors {
  paymentHistory: number;
  creditUtilization: number;
  lengthOfCreditHistory: number;
  creditMix: number;
  newCredit: number;
  totalDebt: number;
  income: number;
  employment: number;
}

export interface CreditAnalysis {
  score: number;
  previousScore?: number;
  trend: 'improving' | 'declining' | 'stable';
  factors: CreditScoreFactors;
  recommendations: string[];
  riskLevel: 'low' | 'medium' | 'high';
  nextReviewDate: string;
  aiConfidence: number;
}

export interface CreditScoreHistory {
  date: string;
  score: number;
  factors: Partial<CreditScoreFactors>;
  event?: string;
}

class AICreditService {
  private static instance: AICreditService;

  static getInstance(): AICreditService {
    if (!AICreditService.instance) {
      AICreditService.instance = new AICreditService();
    }
    return AICreditService.instance;
  }

  /**
   * AI-powered credit score calculation using multiple factors
   */
  calculateAICreditScore(borrower: BorrowerData, loanHistory?: any[]): CreditAnalysis {
    const factors = this.analyzeFactors(borrower, loanHistory);
    
    // Weighted scoring algorithm
    const weights = {
      paymentHistory: 0.35,
      creditUtilization: 0.30,
      lengthOfCreditHistory: 0.15,
      creditMix: 0.10,
      newCredit: 0.10
    };

    let baseScore = 
      factors.paymentHistory * weights.paymentHistory +
      factors.creditUtilization * weights.creditUtilization +
      factors.lengthOfCreditHistory * weights.lengthOfCreditHistory +
      factors.creditMix * weights.creditMix +
      factors.newCredit * weights.newCredit;

    // Apply additional AI adjustments
    const aiAdjustments = this.applyAIAdjustments(borrower, factors);
    const finalScore = Math.max(300, Math.min(850, baseScore + aiAdjustments));

    const recommendations = this.generateRecommendations(factors, finalScore);
    const riskLevel = this.calculateRiskLevel(finalScore, factors);
    const trend = this.calculateTrend(borrower.creditScore, finalScore);

    return {
      score: Math.round(finalScore),
      previousScore: borrower.creditScore,
      trend,
      factors,
      recommendations,
      riskLevel,
      nextReviewDate: this.calculateNextReviewDate(),
      aiConfidence: this.calculateConfidence(factors)
    };
  }

  private analyzeFactors(borrower: BorrowerData, loanHistory?: any[]): CreditScoreFactors {
    // Payment History Analysis (35% weight)
    const paymentHistory = this.analyzePaymentHistory(borrower);
    
    // Credit Utilization Analysis (30% weight)
    const creditUtilization = this.analyzeCreditUtilization(borrower);
    
    // Length of Credit History (15% weight)
    const lengthOfCreditHistory = this.analyzeCreditHistory(borrower);
    
    // Credit Mix Analysis (10% weight)
    const creditMix = this.analyzeCreditMix(borrower);
    
    // New Credit Analysis (10% weight)
    const newCredit = this.analyzeNewCredit(borrower);

    // Additional factors for comprehensive analysis
    const totalDebt = this.analyzeTotalDebt(borrower);
    const income = this.estimateIncomeScore(borrower);
    const employment = this.analyzeEmploymentStability(borrower);

    return {
      paymentHistory,
      creditUtilization,
      lengthOfCreditHistory,
      creditMix,
      newCredit,
      totalDebt,
      income,
      employment
    };
  }

  private analyzePaymentHistory(borrower: BorrowerData): number {
    if (borrower.totalLoans === 0) return 600; // No history
    
    const repaymentRate = borrower.totalRepaid / borrower.totalBorrowed;
    
    if (repaymentRate >= 0.95) return 800;
    if (repaymentRate >= 0.85) return 750;
    if (repaymentRate >= 0.70) return 650;
    if (repaymentRate >= 0.50) return 550;
    return 400;
  }

  private analyzeCreditUtilization(borrower: BorrowerData): number {
    if (borrower.totalBorrowed === 0) return 750;
    
    const outstanding = borrower.totalBorrowed - borrower.totalRepaid;
    const utilizationRate = outstanding / borrower.totalBorrowed;
    
    if (utilizationRate <= 0.10) return 800;
    if (utilizationRate <= 0.30) return 750;
    if (utilizationRate <= 0.50) return 650;
    if (utilizationRate <= 0.70) return 550;
    return 400;
  }

  private analyzeCreditHistory(borrower: BorrowerData): number {
    const joinDate = new Date(borrower.joinDate);
    const monthsOfHistory = Math.floor((Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
    
    if (monthsOfHistory >= 60) return 800; // 5+ years
    if (monthsOfHistory >= 36) return 750; // 3+ years
    if (monthsOfHistory >= 24) return 700; // 2+ years
    if (monthsOfHistory >= 12) return 650; // 1+ year
    if (monthsOfHistory >= 6) return 600;  // 6+ months
    return 550; // Less than 6 months
  }

  private analyzeCreditMix(borrower: BorrowerData): number {
    // Assume variety based on loan count and patterns
    if (borrower.totalLoans >= 5) return 750;
    if (borrower.totalLoans >= 3) return 700;
    if (borrower.totalLoans >= 2) return 650;
    if (borrower.totalLoans >= 1) return 600;
    return 550;
  }

  private analyzeNewCredit(borrower: BorrowerData): number {
    // Penalize too much new credit activity
    if (borrower.activeLoans === 0) return 750;
    if (borrower.activeLoans <= 2) return 700;
    if (borrower.activeLoans <= 4) return 650;
    return 600;
  }

  private analyzeTotalDebt(borrower: BorrowerData): number {
    const outstanding = borrower.totalBorrowed - borrower.totalRepaid;
    
    if (outstanding <= 500000) return 750;   // Low debt
    if (outstanding <= 1500000) return 700;  // Moderate debt
    if (outstanding <= 3000000) return 650;  // High debt
    return 600; // Very high debt
  }

  private estimateIncomeScore(borrower: BorrowerData): number {
    // Estimate based on borrowing capacity
    const avgLoanSize = borrower.totalLoans > 0 ? borrower.totalBorrowed / borrower.totalLoans : 0;
    
    if (avgLoanSize >= 2000000) return 800; // High income
    if (avgLoanSize >= 1000000) return 750; // Good income
    if (avgLoanSize >= 500000) return 700;  // Moderate income
    return 650; // Lower income
  }

  private analyzeEmploymentStability(borrower: BorrowerData): number {
    // Based on consistent borrowing and repayment patterns
    const repaymentConsistency = borrower.totalRepaid / borrower.totalBorrowed;
    
    if (repaymentConsistency >= 0.90) return 800; // Very stable
    if (repaymentConsistency >= 0.75) return 750; // Stable
    if (repaymentConsistency >= 0.60) return 700; // Moderately stable
    return 650; // Less stable
  }

  private applyAIAdjustments(borrower: BorrowerData, factors: CreditScoreFactors): number {
    let adjustment = 0;

    // Positive adjustments
    if (borrower.status === 'active' && factors.paymentHistory > 750) {
      adjustment += 20; // Reward active good payers
    }

    if (factors.creditUtilization > 750 && factors.lengthOfCreditHistory > 700) {
      adjustment += 15; // Reward experienced responsible borrowers
    }

    // Negative adjustments
    if (borrower.status === 'defaulted') {
      adjustment -= 50; // Penalize defaults heavily
    }

    if (factors.paymentHistory < 500) {
      adjustment -= 30; // Penalize poor payment history
    }

    return adjustment;
  }

  private generateRecommendations(factors: CreditScoreFactors, score: number): string[] {
    const recommendations: string[] = [];

    if (factors.paymentHistory < 650) {
      recommendations.push("Focus on making all payments on time to improve payment history");
    }

    if (factors.creditUtilization < 650) {
      recommendations.push("Reduce outstanding debt to lower credit utilization ratio");
    }

    if (factors.lengthOfCreditHistory < 650) {
      recommendations.push("Continue building credit history with consistent borrowing patterns");
    }

    if (score < 650) {
      recommendations.push("Consider debt consolidation to simplify repayments");
      recommendations.push("Set up automatic payments to avoid missed payments");
    }

    if (score >= 750) {
      recommendations.push("Excellent credit! Consider opportunities for larger loans or better rates");
    }

    if (recommendations.length === 0) {
      recommendations.push("Maintain current good credit practices");
    }

    return recommendations;
  }

  private calculateRiskLevel(score: number, factors: CreditScoreFactors): 'low' | 'medium' | 'high' {
    if (score >= 750 && factors.paymentHistory >= 700) return 'low';
    if (score >= 650 && factors.paymentHistory >= 600) return 'medium';
    return 'high';
  }

  private calculateTrend(previousScore: number, newScore: number): 'improving' | 'declining' | 'stable' {
    const difference = newScore - previousScore;
    if (difference > 10) return 'improving';
    if (difference < -10) return 'declining';
    return 'stable';
  }

  private calculateNextReviewDate(): string {
    const nextReview = new Date();
    nextReview.setMonth(nextReview.getMonth() + 3); // 3 months from now
    return nextReview.toISOString().split('T')[0];
  }

  private calculateConfidence(factors: CreditScoreFactors): number {
    // Base confidence on available data quality
    let confidence = 0.7; // Base confidence

    if (factors.paymentHistory > 0) confidence += 0.1;
    if (factors.creditUtilization > 0) confidence += 0.1;
    if (factors.lengthOfCreditHistory > 600) confidence += 0.05;
    if (factors.creditMix > 600) confidence += 0.05;

    return Math.min(0.95, confidence);
  }

  /**
   * Generate credit score history for visualization
   */
  generateCreditScoreHistory(borrower: BorrowerData): CreditScoreHistory[] {
    const history: CreditScoreHistory[] = [];
    const currentDate = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() - i);
      
      // Simulate historical scores with some variation
      const variation = (Math.random() - 0.5) * 40;
      const score = Math.max(300, Math.min(850, borrower.creditScore + variation));
      
      history.push({
        date: date.toISOString().split('T')[0],
        score: Math.round(score),
        factors: {
          paymentHistory: Math.round(score * 0.9 + Math.random() * 20),
          creditUtilization: Math.round(score * 0.85 + Math.random() * 30)
        },
        event: i === 0 ? 'Current Score' : undefined
      });
    }
    
    return history;
  }

  /**
   * Predict future credit score based on trends
   */
  predictFutureScore(borrower: BorrowerData, analysis: CreditAnalysis): { score: number; confidence: number } {
    let futureScore = analysis.score;
    
    if (analysis.trend === 'improving') {
      futureScore += 20 + Math.random() * 20;
    } else if (analysis.trend === 'declining') {
      futureScore -= 15 + Math.random() * 15;
    } else {
      futureScore += (Math.random() - 0.5) * 10;
    }
    
    futureScore = Math.max(300, Math.min(850, futureScore));
    
    return {
      score: Math.round(futureScore),
      confidence: analysis.aiConfidence * 0.8 // Lower confidence for predictions
    };
  }
}

export const aiCreditService = AICreditService.getInstance();