import { Router } from 'express';
import { prisma } from '../config/database';

const router = Router();

// POST /api/payments - Process a manual payment
router.post('/', async (req, res) => {
  try {
    const {
      loanId,
      borrowerId,
      amount,
      paymentDate,
      paidAt,  // Accept both field names
      paymentMethod,
      notes
    } = req.body;

    // Validate required fields
    if (!loanId || !borrowerId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Required fields are missing: loanId, borrowerId, amount'
      });
    }

    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment amount'
      });
    }

    // Use paidAt if provided, otherwise paymentDate
    const paymentDateValue = paidAt || paymentDate;

    // Find the loan
    const loan = await prisma.loan.findFirst({
      where: {
        OR: [
          { id: loanId },
          { loanId: loanId }
        ]
      },
      include: {
        borrower: true
      }
    });

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    // Verify borrower matches
    if (loan.borrowerId !== borrowerId && loan.borrower?.borrowerId !== borrowerId) {
      return res.status(400).json({
        success: false,
        message: 'Borrower does not match the loan'
      });
    }

    // Check if loan is active
    if (loan.status !== 'ACTIVE' && loan.status !== 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot make payment on inactive loan'
      });
    }

    // Generate receipt number
    const generateReceiptNumber = async (): Promise<string> => {
      try {
        const lastRepayment = await prisma.repayment.findFirst({
          where: {
            receiptNumber: {
              startsWith: 'REC'
            }
          },
          orderBy: {
            receiptNumber: 'desc'
          }
        });

        if (lastRepayment?.receiptNumber) {
          const lastNumber = parseInt(lastRepayment.receiptNumber.substring(3));
          return `REC${String(lastNumber + 1).padStart(3, '0')}`;
        }
        return 'REC001';
      } catch (error) {
        console.error('Error generating receipt number:', error);
        return `REC${Date.now().toString().slice(-6)}`;
      }
    };

    // Start database transaction
    const result = await prisma.$transaction(async (prisma) => {
      // Generate receipt number
      const receiptNumber = await generateReceiptNumber();

      // Create repayment record
      const repayment = await prisma.repayment.create({
        data: {
          receiptNumber,
          loanId: loan.id,
          borrowerId: loan.borrowerId,
          amount: paymentAmount,
          principalAmount: paymentAmount, // For now, treat all as principal
          paymentMethod: paymentMethod || 'Cash',
          status: 'COMPLETED',
          paidAt: paymentDateValue ? new Date(paymentDateValue) : new Date()
        }
      });

      // Calculate new outstanding balance
      const currentBalance = loan.outstandingBalance || loan.totalAmount || 0;
      const newBalance = Math.max(0, currentBalance - paymentAmount);

      // Update loan balance and payment tracking
      const updatedLoan = await prisma.loan.update({
        where: { id: loan.id },
        data: {
          outstandingBalance: newBalance,
          // Update next payment date if this was a regular payment
          nextPaymentDate: newBalance > 0 ? (() => {
            const nextDate = new Date();
            nextDate.setMonth(nextDate.getMonth() + 1);
            return nextDate;
          })() : null,
          // Update loan status if fully paid
          status: newBalance <= 0 ? 'CLOSED' : loan.status
        }
      });

      // Update borrower's credit rating if loan is fully paid
      if (newBalance <= 0) {
        await prisma.borrower.update({
          where: { id: loan.borrowerId },
          data: {
            creditRating: loan.borrower?.creditRating === 'POOR' ? 'FAIR' : 
                         loan.borrower?.creditRating === 'FAIR' ? 'GOOD' : 
                         loan.borrower?.creditRating === 'GOOD' ? 'EXCELLENT' : 
                         loan.borrower?.creditRating || 'FAIR'
          }
        });
      }

      return { repayment, updatedLoan };
    });

    return res.status(201).json({
      success: true,
      receiptNumber: result.repayment.receiptNumber,
      repayment: {
        id: result.repayment.id,
        receiptNumber: result.repayment.receiptNumber,
        amount: result.repayment.amount,
        paidAt: result.repayment.paidAt,
        paymentMethod: result.repayment.paymentMethod,
        status: result.repayment.status
      },
      updatedLoan: {
        id: result.updatedLoan.id,
        loanId: result.updatedLoan.loanId,
        outstandingBalance: result.updatedLoan.outstandingBalance,
        status: result.updatedLoan.status
      },
      message: `Payment of UGX ${paymentAmount.toLocaleString()} processed successfully. Receipt: ${result.repayment.receiptNumber}`
    });

  } catch (error) {
    console.error('Error processing payment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process payment'
    });
  }
});

// GET /api/payments - Get payment history
router.get('/', async (req, res) => {
  try {
    const { loanId, borrowerId, limit = '50' } = req.query;
    
    const where: any = {};
    
    if (loanId) {
      const loan = await prisma.loan.findFirst({
        where: {
          OR: [
            { id: loanId as string },
            { loanId: loanId as string }
          ]
        }
      });
      if (loan) {
        where.loanId = loan.id;
      }
    }

    if (borrowerId) {
      const borrower = await prisma.borrower.findFirst({
        where: {
          OR: [
            { id: borrowerId as string },
            { borrowerId: borrowerId as string }
          ]
        }
      });
      if (borrower) {
        const loans = await prisma.loan.findMany({
          where: { borrowerId: borrower.id }
        });
        where.loanId = { in: loans.map(l => l.id) };
      }
    }

    const payments = await prisma.repayment.findMany({
      where,
      include: {
        loan: {
          include: {
            borrower: true
          }
        }
      },
      orderBy: { paidAt: 'desc' },
      take: parseInt(limit as string)
    });

    return res.json({
      success: true,
      data: payments.map(payment => ({
        id: payment.id,
        receiptNumber: payment.receiptNumber,
        amount: payment.amount,
        paidAt: payment.paidAt,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
        loan: {
          id: payment.loan?.id,
          loanId: payment.loan?.loanId,
          borrower: payment.loan?.borrower ? {
            id: payment.loan.borrower.id,
            borrowerId: payment.loan.borrower.borrowerId,
            firstName: payment.loan.borrower.firstName,
            lastName: payment.loan.borrower.lastName
          } : null
        }
      })),
      total: payments.length,
      message: 'Payment history retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching payments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve payment history'
    });
  }
});

export default router;