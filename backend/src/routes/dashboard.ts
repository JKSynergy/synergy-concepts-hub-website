import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Get dashboard statistics
router.get('/stats', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const [
      totalBorrowers,
      totalLoans,
      totalRepayments,
      totalSavings,
      totalExpenses,
      totalApplications
    ] = await Promise.all([
      prisma.borrower.count(),
      prisma.loan.count(),
      prisma.repayment.count(),
      prisma.savings.count(),
      prisma.expense.count(),
      prisma.loanApplication.count()
    ]);

    // Calculate financial totals
    const [
      loanTotals,
      repaymentTotals,
      savingsTotals,
      expenseTotals
    ] = await Promise.all([
      prisma.loan.aggregate({
        _sum: {
          principal: true,
          totalAmount: true,
          outstandingBalance: true
        }
      }),
      prisma.repayment.aggregate({
        _sum: {
          amount: true
        }
      }),
      prisma.savings.aggregate({
        _sum: {
          balance: true
        }
      }),
      prisma.expense.aggregate({
        _sum: {
          amount: true
        }
      })
    ]);

    const stats = {
      borrowers: {
        total: totalBorrowers,
        active: totalBorrowers // For now, assume all are active
      },
      loans: {
        total: totalLoans,
        totalAmount: loanTotals._sum.totalAmount || 0,
        outstanding: loanTotals._sum.outstandingBalance || 0,
        disbursed: loanTotals._sum.principal || 0
      },
      repayments: {
        total: totalRepayments,
        totalAmount: repaymentTotals._sum.amount || 0
      },
      savings: {
        total: totalSavings,
        totalBalance: savingsTotals._sum.balance || 0
      },
      expenses: {
        total: totalExpenses,
        totalAmount: expenseTotals._sum.amount || 0
      },
      applications: {
        total: totalApplications
      },
      overview: {
        totalRepayments: repaymentTotals._sum.amount || 0,
        outstanding: loanTotals._sum.outstandingBalance || 0,
        interestAmount: 0, // Calculate if needed
        monthlyReceipts: repaymentTotals._sum.amount || 0,
        realizedPayments: repaymentTotals._sum.amount || 0,
        projectedProfit: 0, // Calculate if needed
        realizedProfit: 0, // Calculate if needed
        totalSavings: savingsTotals._sum.balance || 0,
        activeBorrowers: totalBorrowers
      }
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
}));

// Get recent activities (placeholder)
router.get('/activities', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    // For now, return empty activities since we don't have an activity log
    const activities: any[] = [];

    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    console.error('Dashboard activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activities'
    });
  }
}));

// Get loan charts data
router.get('/charts/loans', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    // Simple loan data for charts
    const loans = await prisma.loan.findMany({
      select: {
        principal: true,
        status: true,
        createdAt: true
      }
    });

    const chartData = loans.map(loan => ({
      date: loan.createdAt.toISOString().split('T')[0],
      amount: loan.principal,
      status: loan.status
    }));

    res.json({
      success: true,
      data: chartData
    });
  } catch (error) {
    console.error('Dashboard loan charts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch loan chart data'
    });
  }
}));

// Get repayment charts data
router.get('/charts/repayments', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const repayments = await prisma.repayment.findMany({
      select: {
        amount: true,
        paidAt: true,
        status: true
      }
    });

    const chartData = repayments.map(repayment => ({
      date: repayment.paidAt.toISOString().split('T')[0],
      amount: repayment.amount,
      status: repayment.status
    }));

    res.json({
      success: true,
      data: chartData
    });
  } catch (error) {
    console.error('Dashboard repayment charts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch repayment chart data'
    });
  }
}));

// Get overdue summary
router.get('/overdue-summary', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    // For now, return basic overdue info
    const overdueLoans = await prisma.loan.count({
      where: {
        status: 'OVERDUE'
      }
    });

    const overdueAmount = await prisma.loan.aggregate({
      where: {
        status: 'OVERDUE'
      },
      _sum: {
        outstandingBalance: true
      }
    });

    res.json({
      success: true,
      data: {
        count: overdueLoans,
        amount: overdueAmount._sum.outstandingBalance || 0
      }
    });
  } catch (error) {
    console.error('Dashboard overdue summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch overdue summary'
    });
  }
}));

export default router;