import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const router = express.Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'demo-secret-key';

// Middleware to verify client token
const verifyClientToken = (req: Request, res: Response, next: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    if (decoded.type !== 'client') {
      return res.status(403).json({
        success: false,
        message: 'Invalid token type'
      });
    }

    req.body.clientId = decoded.id;
    req.body.borrowerId = decoded.borrowerId;
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// Dashboard Stats
router.get('/dashboard/stats', verifyClientToken, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.body;

    // Get borrower's loans
    const loans = await prisma.loan.findMany({
      where: {
        borrowerId: clientId,
        status: { not: 'CLOSED' }
      }
    });

    // Get active loans
    const activeLoans = loans.filter(loan => loan.status === 'ACTIVE');

    // Calculate totals
    const totalBorrowed = activeLoans.reduce((sum, loan) => sum + Number(loan.principal), 0);
    const totalPaid = await prisma.repayment.aggregate({
      where: {
        loan: {
          borrowerId: clientId
        },
        status: 'COMPLETED'
      },
      _sum: {
        amount: true
      }
    });

    // Get next payment info
    const nextPayment = await prisma.loan.findFirst({
      where: {
        borrowerId: clientId,
        status: 'ACTIVE',
        nextPaymentDate: {
          not: null
        }
      },
      orderBy: {
        nextPaymentDate: 'asc'
      }
    });

    // Get savings
    const savings = await prisma.savings.findFirst({
      where: {
        borrowerId: clientId
      }
    });

    // Calculate total balance (outstanding across all loans)
    const totalBalance = activeLoans.reduce((sum, loan) => sum + Number(loan.outstandingBalance), 0);

    const stats = {
      totalLoans: loans.length,
      activeLoans: activeLoans.length,
      totalBorrowed,
      totalPaid: Number(totalPaid._sum.amount || 0),
      totalBalance,
      nextPaymentAmount: nextPayment ? Number(nextPayment.nextPaymentAmount || 0) : 0,
      nextPaymentDate: nextPayment?.nextPaymentDate || null,
      savingsBalance: savings ? Number(savings.balance) : 0,
      creditScore: 750, // You can implement credit score calculation
    };

    return res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats'
    });
  }
});

// Recent Activity
router.get('/dashboard/activity', verifyClientToken, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.body;

    // Get recent repayments
    const recentPayments = await prisma.repayment.findMany({
      where: {
        loan: {
          borrowerId: clientId
        }
      },
      include: {
        loan: {
          select: {
            loanId: true
          }
        }
      },
      orderBy: {
        paidAt: 'desc'
      },
      take: 10
    });

    const activity = recentPayments.map(payment => ({
      id: payment.id,
      type: payment.status === 'COMPLETED' ? 'payment' : 'payment_due',
      description: `Payment of UGX ${Number(payment.amount).toLocaleString()}`,
      amount: Number(payment.amount),
      date: payment.paidAt,
      loanNumber: payment.loan.loanId,
      status: payment.status
    }));

    return res.json({
      success: true,
      data: activity
    });

  } catch (error) {
    console.error('Recent activity error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activity'
    });
  }
});

// Get Loans List
router.get('/loans', verifyClientToken, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.body;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [loans, total] = await Promise.all([
      prisma.loan.findMany({
        where: {
          borrowerId: clientId
        },
        include: {
          borrower: {
            select: {
              firstName: true,
              lastName: true,
              phone: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limit
      }),
      prisma.loan.count({
        where: {
          borrowerId: clientId
        }
      })
    ]);

    const formattedLoans = loans.map(loan => ({
      ...loan,
      amount: Number(loan.principal),
      interestRate: Number(loan.interestRate),
      balance: Number(loan.outstandingBalance),
      balanceRemaining: Number(loan.outstandingBalance), // Add this field for frontend
      totalPayable: Number(loan.totalAmount),
      monthlyPayment: Number(loan.monthlyPayment)
    }));

    return res.json({
      success: true,
      data: formattedLoans,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get loans error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch loans'
    });
  }
});

// Get Single Loan
router.get('/loans/:loanId', verifyClientToken, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.body;
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        borrowerId: clientId
      },
      include: {
        borrower: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            email: true
          }
        }
      }
    });

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    const formattedLoan = {
      ...loan,
      amount: Number(loan.principal),
      interestRate: Number(loan.interestRate),
      balance: Number(loan.outstandingBalance),
      balanceRemaining: Number(loan.outstandingBalance), // Add this field for frontend
      totalPayable: Number(loan.totalAmount),
      monthlyPayment: Number(loan.monthlyPayment)
    };

    return res.json({
      success: true,
      data: formattedLoan
    });

  } catch (error) {
    console.error('Get loan error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch loan'
    });
  }
});

// Get Loan Repayments
router.get('/loans/:loanId/repayments', verifyClientToken, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.body;
    const { loanId } = req.params;

    // Verify loan belongs to client
    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        borrowerId: clientId
      }
    });

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    const repayments = await prisma.repayment.findMany({
      where: {
        loanId
      },
      orderBy: {
        paidAt: 'asc'
      }
    });

    const formattedRepayments = repayments.map(rep => ({
      ...rep,
      amount: Number(rep.amount)
    }));

    return res.json({
      success: true,
      data: formattedRepayments
    });

  } catch (error) {
    console.error('Get repayments error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch repayments'
    });
  }
});

// Get Applications
router.get('/applications', verifyClientToken, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.body;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [applications, total] = await Promise.all([
      prisma.loanApplication.findMany({
        where: {
          borrowerId: clientId
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limit
      }),
      prisma.loanApplication.count({
        where: {
          borrowerId: clientId
        }
      })
    ]);

    const formattedApps = applications.map(app => ({
      ...app,
      requestedAmount: Number(app.requestedAmount),
      approvedAmount: app.approvedAmount ? Number(app.approvedAmount) : null,
      monthlyIncome: Number(app.monthlyIncome)
    }));

    return res.json({
      success: true,
      data: formattedApps,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get applications error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch applications'
    });
  }
});

// Create Application
router.post('/applications', verifyClientToken, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.body;
    const { requestedAmount, purpose, termMonths } = req.body;

    // Get borrower info
    const borrower = await prisma.borrower.findUnique({
      where: { id: clientId }
    });

    if (!borrower) {
      return res.status(404).json({
        success: false,
        message: 'Borrower not found'
      });
    }

    // Create application
    const application = await prisma.loanApplication.create({
      data: {
        borrowerId: clientId,
        requestedAmount,
        purpose,
        termMonths,
        monthlyIncome: borrower.monthlyIncome || 0,
        status: 'PENDING',
        applicationId: `APP-${Date.now()}`
      }
    });

    return res.json({
      success: true,
      message: 'Application submitted successfully',
      data: {
        ...application,
        requestedAmount: Number(application.requestedAmount),
        monthlyIncome: Number(application.monthlyIncome)
      }
    });

  } catch (error) {
    console.error('Create application error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create application'
    });
  }
});

// Get Profile
router.get('/profile', verifyClientToken, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.body;

    const borrower = await prisma.borrower.findUnique({
      where: { id: clientId }
    });

    if (!borrower) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    const profile = {
      ...borrower,
      monthlyIncome: borrower.monthlyIncome ? Number(borrower.monthlyIncome) : null
    };

    return res.json({
      success: true,
      data: profile
    });

  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

// Update Profile
router.put('/profile', verifyClientToken, async (req: Request, res: Response) => {
  try {
    const { clientId, ...updateData } = req.body;

    const updatedBorrower = await prisma.borrower.update({
      where: { id: clientId },
      data: updateData
    });

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        ...updatedBorrower,
        monthlyIncome: updatedBorrower.monthlyIncome ? Number(updatedBorrower.monthlyIncome) : null
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// Submit Payment
router.post('/payments', verifyClientToken, async (req: Request, res: Response) => {
  try {
    const { clientId, loanId, amount, paymentMethod, phoneNumber, provider, reference } = req.body;

    // Validate required fields
    if (!loanId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Loan ID and amount are required'
      });
    }

    // Verify loan belongs to client
    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        borrowerId: clientId
      }
    });

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    // Create repayment record
    const receiptNumber = `REC-${Date.now()}`;
    const transactionRef = reference || `${provider?.toUpperCase() || 'PAY'}-${Date.now()}`;
    
    const payment = await prisma.repayment.create({
      data: {
        loanId: loan.id,
        borrowerId: clientId,
        amount: Number(amount),
        paidAt: new Date(),
        status: 'COMPLETED',
        paymentMethod: paymentMethod || 'MOBILE_MONEY',
        receiptNumber: receiptNumber,
        transactionId: transactionRef
      }
    });

    // Update loan outstanding balance
    const newBalance = Number(loan.outstandingBalance) - Number(amount);
    await prisma.loan.update({
      where: { id: loan.id },
      data: {
        outstandingBalance: newBalance >= 0 ? newBalance : 0,
        status: newBalance <= 0 ? 'COMPLETED' : loan.status
      }
    });

    return res.json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        transactionId: payment.id,
        receiptNumber: payment.receiptNumber,
        reference: payment.transactionId,
        amount: Number(payment.amount),
        status: payment.status,
        paidAt: payment.paidAt
      }
    });

  } catch (error) {
    console.error('Payment processing error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process payment'
    });
  }
});

// Get Payment History
router.get('/payments/history', verifyClientToken, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.body;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      prisma.repayment.findMany({
        where: {
          loan: {
            borrowerId: clientId
          },
          status: 'COMPLETED'
        },
      include: {
        loan: {
          select: {
            loanId: true
          }
        }
      },
      orderBy: {
        paidAt: 'desc'
      },
      skip,
      take: limit
    }),
    prisma.repayment.count({
      where: {
        loan: {
          borrowerId: clientId
        },
        status: 'COMPLETED'
      }
    })
  ]);

  const formattedPayments = payments.map(payment => ({
    ...payment,
    amount: Number(payment.amount)
  }));    return res.json({
      success: true,
      data: formattedPayments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Payment history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history'
    });
  }
});

// ===== SAVINGS ENDPOINTS =====

// Get savings account
router.get('/savings/account', verifyClientToken, async (req: Request, res: Response) => {
  try {
    const { borrowerId } = req.body;

    const savings = await prisma.savings.findFirst({
      where: { borrowerId },
      include: {
        borrower: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!savings) {
      return res.json({
        success: true,
        data: null,
        message: 'No savings account found'
      });
    }

    return res.json({
      success: true,
      data: {
        ...savings,
        balance: Number(savings.balance),
        interestRate: Number(savings.interestRate)
      }
    });

  } catch (error) {
    console.error('Get savings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch savings account'
    });
  }
});

// Get savings transactions (using repayments as savings deposits/withdrawals)
router.get('/savings/transactions', verifyClientToken, async (req: Request, res: Response) => {
  try {
    const { borrowerId } = req.body;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const savings = await prisma.savings.findFirst({
      where: { borrowerId }
    });

    if (!savings) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0
        }
      });
    }

    // For now, we'll create mock transactions based on savings activity
    // In a real system, you'd have a SavingsTransaction model
    const transactions = [
      {
        id: '1',
        type: 'DEPOSIT',
        amount: 50000,
        balance: savings.balance,
        description: 'Initial Deposit',
        transactionDate: savings.createdAt,
        status: 'COMPLETED'
      }
    ];

    return res.json({
      success: true,
      data: transactions,
      pagination: {
        page,
        limit,
        total: transactions.length,
        totalPages: 1
      }
    });

  } catch (error) {
    console.error('Savings transactions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch savings transactions'
    });
  }
});

// Make savings deposit
router.post('/savings/deposit', verifyClientToken, async (req: Request, res: Response) => {
  try {
    const { borrowerId, amount, description, paymentMethod } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid deposit amount'
      });
    }

    // Find or create savings account
    let savings = await prisma.savings.findFirst({
      where: { borrowerId }
    });

    if (!savings) {
      // Create new savings account
      const borrower = await prisma.borrower.findUnique({
        where: { id: borrowerId }
      });

      if (!borrower) {
        return res.status(404).json({
          success: false,
          message: 'Borrower not found'
        });
      }

      savings = await prisma.savings.create({
        data: {
          savingsId: `SAV-${Date.now()}`,
          borrowerId,
          balance: amount,
          interestRate: 5.0, // 5% default interest rate
          status: 'ACTIVE'
        }
      });

      return res.json({
        success: true,
        message: 'Savings account created and deposit successful',
        data: {
          ...savings,
          balance: Number(savings.balance),
          interestRate: Number(savings.interestRate),
          depositAmount: amount
        }
      });
    }

    // Update existing savings account
    const updatedSavings = await prisma.savings.update({
      where: { id: savings.id },
      data: {
        balance: Number(savings.balance) + Number(amount)
      }
    });

    return res.json({
      success: true,
      message: 'Deposit successful',
      data: {
        ...updatedSavings,
        balance: Number(updatedSavings.balance),
        interestRate: Number(updatedSavings.interestRate),
        depositAmount: amount
      }
    });

  } catch (error) {
    console.error('Savings deposit error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process deposit'
    });
  }
});

// Request withdrawal
router.post('/savings/withdrawal', verifyClientToken, async (req: Request, res: Response) => {
  try {
    const { borrowerId, amount, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid withdrawal amount'
      });
    }

    const savings = await prisma.savings.findFirst({
      where: { borrowerId }
    });

    if (!savings) {
      return res.status(404).json({
        success: false,
        message: 'Savings account not found'
      });
    }

    if (Number(savings.balance) < Number(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Update savings balance
    const updatedSavings = await prisma.savings.update({
      where: { id: savings.id },
      data: {
        balance: Number(savings.balance) - Number(amount)
      }
    });

    return res.json({
      success: true,
      message: 'Withdrawal successful',
      data: {
        ...updatedSavings,
        balance: Number(updatedSavings.balance),
        interestRate: Number(updatedSavings.interestRate),
        withdrawalAmount: amount
      }
    });

  } catch (error) {
    console.error('Savings withdrawal error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process withdrawal'
    });
  }
});

export default router;
