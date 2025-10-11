import express from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { authorize } from '../middleware/auth';
import { mobileMoneyService } from '../services/mobileMoneyService';

const router = express.Router();

// Process mobile money payment
router.post('/payment', [
  authorize('ADMIN', 'MANAGER', 'LOAN_OFFICER', 'ACCOUNTANT'),
  body('loanId').notEmpty().withMessage('Loan ID is required'),
  body('amount').isFloat({ min: 1000 }).withMessage('Amount must be at least 1000'),
  body('phoneNumber').isMobilePhone('any').withMessage('Valid phone number is required'),
  body('currency').optional().isIn(['UGX', 'USD']).withMessage('Currency must be UGX or USD'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errors.array()
    });
  }

  const { loanId, amount, phoneNumber, currency = 'UGX', payerMessage } = req.body;

  // Verify loan exists and get loan details
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: {
      borrower: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
    },
  });

  if (!loan) {
    return res.status(404).json({
      success: false,
      message: 'Loan not found',
    });
  }

  if (loan.status !== 'ACTIVE') {
    return res.status(400).json({
      success: false,
      message: 'Loan is not active for payments',
    });
  }

  // Detect mobile money provider
  const provider = mobileMoneyService.detectProvider(phoneNumber);
  
  if (provider === 'UNKNOWN') {
    return res.status(400).json({
      success: false,
      message: 'Unsupported mobile money provider',
    });
  }

  // Validate account holder
  const isValidAccount = await mobileMoneyService.validateAccountHolder(provider, phoneNumber);
  if (!isValidAccount) {
    return res.status(400).json({
      success: false,
      message: 'Invalid mobile money account',
    });
  }

  // Generate external reference ID
  const externalId = `QC_${loan.loanId}_${Date.now()}`;

  try {
    // Process payment request
    const paymentResponse = await mobileMoneyService.processPayment(provider, {
      amount: parseFloat(amount),
      currency,
      phoneNumber,
      externalId,
      payerMessage: payerMessage || `Loan payment for ${loan.loanId}`,
      payeeNote: `Payment from ${loan.borrower.firstName} ${loan.borrower.lastName}`,
    });

    if (paymentResponse.status === 'FAILED') {
      return res.status(400).json({
        success: false,
        message: paymentResponse.reason || 'Payment failed',
      });
    }

    // Create pending repayment record
    const repaymentCount = await prisma.repayment.count();
    const repaymentId = `REP${String(repaymentCount + 1).padStart(6, '0')}`;

    const repayment = await prisma.repayment.create({
      data: {
        repaymentId,
        loanId: loan.id,
        borrowerId: loan.borrowerId,
        amount: parseFloat(amount),
        principal: 0, // Will be calculated when payment is confirmed
        interest: 0,  // Will be calculated when payment is confirmed
        paymentMethod: 'MOBILE_MONEY',
        paymentReference: paymentResponse.referenceId,
        processedBy: req.user!.id,
        status: 'PENDING',
        notes: `${provider} Mobile Money payment - ${paymentResponse.referenceId}`,
      },
      include: {
        loan: {
          select: {
            loanId: true,
            outstandingBalance: true,
          },
        },
        borrower: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    logger.info('Mobile money payment initiated:', {
      loanId: loan.loanId,
      amount,
      provider,
      referenceId: paymentResponse.referenceId,
      processedBy: req.user!.username,
    });

    res.status(201).json({
      success: true,
      message: 'Payment request initiated successfully',
      data: {
        repayment,
        paymentReference: paymentResponse.referenceId,
        provider,
        status: paymentResponse.status,
      },
    });
  } catch (error: any) {
    logger.error('Mobile money payment processing failed:', {
      loanId: loan.loanId,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      message: 'Payment processing failed',
      error: error.message,
    });
  }
}));

// Check payment status
router.get('/status/:referenceId', [
  authorize('ADMIN', 'MANAGER', 'LOAN_OFFICER', 'ACCOUNTANT'),
], asyncHandler(async (req, res) => {
  const { referenceId } = req.params;

  // Find the repayment record
  const repayment = await prisma.repayment.findFirst({
    where: { paymentReference: referenceId },
    include: {
      loan: {
        select: {
          loanId: true,
          interestRate: true,
          outstandingBalance: true,
        },
      },
      borrower: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
    },
  });

  if (!repayment) {
    return res.status(404).json({
      success: false,
      message: 'Payment reference not found',
    });
  }

  // Detect provider from payment notes
  const provider = repayment.notes?.includes('MTN') ? 'MTN' : 'AIRTEL';

  try {
    // Check status with mobile money provider
    const paymentStatus = await mobileMoneyService.getPaymentStatus(provider, referenceId);

    if (!paymentStatus) {
      return res.status(404).json({
        success: false,
        message: 'Payment status not found',
      });
    }

    // Update repayment status if it has changed
    if (paymentStatus.status !== repayment.status) {
      let updateData: any = {
        status: paymentStatus.status === 'SUCCESSFUL' ? 'COMPLETED' : 
                paymentStatus.status === 'FAILED' ? 'FAILED' : 'PENDING',
      };

      // If payment is successful, calculate principal and interest breakdown
      if (paymentStatus.status === 'SUCCESSFUL' && repayment.status === 'PENDING') {
        const outstandingBalance = parseFloat(repayment.loan.outstandingBalance.toString());
        const paymentAmount = parseFloat(repayment.amount.toString());
        const interestRate = parseFloat(repayment.loan.interestRate.toString());

        // Simple calculation - in production, you'd want more sophisticated logic
        const interestPortion = Math.min(paymentAmount * 0.1, outstandingBalance * (interestRate / 12));
        const principalPortion = paymentAmount - interestPortion;

        updateData = {
          ...updateData,
          principal: principalPortion,
          interest: interestPortion,
          paidAt: new Date(),
        };

        // Update loan outstanding balance
        await prisma.loan.update({
          where: { id: repayment.loanId },
          data: {
            outstandingBalance: Math.max(0, outstandingBalance - paymentAmount),
            nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Next month
          },
        });

        logger.info('Mobile money payment confirmed:', {
          loanId: repayment.loan.loanId,
          amount: paymentAmount,
          referenceId,
        });
      }

      const updatedRepayment = await prisma.repayment.update({
        where: { id: repayment.id },
        data: updateData,
        include: {
          loan: {
            select: {
              loanId: true,
              outstandingBalance: true,
            },
          },
          borrower: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: {
          repayment: updatedRepayment,
          providerStatus: paymentStatus,
        },
      });
    }

    res.json({
      success: true,
      data: {
        repayment,
        providerStatus: paymentStatus,
      },
    });
  } catch (error: any) {
    logger.error('Failed to check payment status:', {
      referenceId,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to check payment status',
      error: error.message,
    });
  }
}));

// Get supported mobile money providers
router.get('/providers', (req, res) => {
  res.json({
    success: true,
    data: {
      providers: [
        {
          id: 'MTN',
          name: 'MTN Mobile Money',
          prefixes: ['256771', '256772', '256773', '256774', '256775', '256776', '256777', '256778'],
          currency: 'UGX',
          minAmount: 1000,
          maxAmount: 5000000,
        },
        {
          id: 'AIRTEL',
          name: 'Airtel Money',
          prefixes: ['256700', '256701', '256702', '256703', '256704', '256705', '256706', '256707', '256708', '256709'],
          currency: 'UGX',
          minAmount: 1000,
          maxAmount: 5000000,
        },
      ],
    },
  });
});

// Validate mobile money account
router.post('/validate', [
  body('phoneNumber').isMobilePhone('any').withMessage('Valid phone number is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errors.array()
    });
  }

  const { phoneNumber } = req.body;

  // Detect provider
  const provider = mobileMoneyService.detectProvider(phoneNumber);

  if (provider === 'UNKNOWN') {
    return res.status(400).json({
      success: false,
      message: 'Unsupported mobile money provider',
      data: {
        phoneNumber,
        provider: 'UNKNOWN',
        isValid: false,
      },
    });
  }

  try {
    // Validate account
    const isValid = await mobileMoneyService.validateAccountHolder(provider, phoneNumber);

    res.json({
      success: true,
      data: {
        phoneNumber,
        provider,
        isValid,
      },
    });
  } catch (error: any) {
    logger.error('Account validation failed:', {
      phoneNumber,
      provider,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      message: 'Account validation failed',
      error: error.message,
    });
  }
}));

// Get payment history for a loan
router.get('/payments/:loanId', [
  authorize('ADMIN', 'MANAGER', 'LOAN_OFFICER', 'ACCOUNTANT'),
], asyncHandler(async (req, res) => {
  const { loanId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  const [payments, total] = await Promise.all([
    prisma.repayment.findMany({
      where: {
        loanId,
        paymentMethod: 'MOBILE_MONEY',
      },
      include: {
        loan: {
          select: {
            loanId: true,
          },
        },
        borrower: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.repayment.count({
      where: {
        loanId,
        paymentMethod: 'MOBILE_MONEY',
      },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  res.json({
    success: true,
    data: {
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    },
  });
}));

export default router;