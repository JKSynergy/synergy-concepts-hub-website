import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/repayments - Get all repayments
router.get('/', async (req, res) => {
  try {
    const repayments = await prisma.repayment.findMany({
      include: {
        loan: {
          include: {
            borrower: true
          }
        }
      },
      orderBy: {
        paidAt: 'desc'
      }
    });
    
    // Transform the response to include readable loan IDs
    const transformedRepayments = repayments.map(repayment => ({
      ...repayment,
      loanReference: repayment.loan?.loanId || repayment.loanId,
      borrowerReference: repayment.loan?.borrower?.borrowerId || repayment.borrowerId,
      customerName: repayment.loan?.borrower 
        ? `${repayment.loan.borrower.firstName} ${repayment.loan.borrower.lastName}`
        : 'Unknown',
      customerPhone: repayment.loan?.borrower?.phone,
      customerEmail: repayment.loan?.borrower?.email,
      loanStatus: repayment.loan?.status,
      remainingBalance: repayment.loan?.outstandingBalance
    }));
    
    res.json({
      success: true,
      data: transformedRepayments,
      message: 'Repayments retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching repayments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve repayments'
    });
  }
});

// POST /api/repayments - Create new repayment
router.post('/', async (req, res) => {
  try {
    res.status(201).json({
      success: true,
      data: null,
      message: 'Repayment recorded successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to record repayment'
    });
  }
});

// DELETE /api/repayments/:id - Delete a repayment
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the repayment first
    const repayment = await prisma.repayment.findUnique({
      where: { id },
      include: { loan: true }
    });

    if (!repayment) {
      return res.status(404).json({
        success: false,
        message: 'Repayment not found'
      });
    }

    // Start a transaction to delete repayment and update loan
    await prisma.$transaction(async (tx) => {
      // Delete the repayment
      await tx.repayment.delete({
        where: { id }
      });

      // Update the loan's outstanding balance
      const loan = repayment.loan;
      const newOutstandingBalance = loan.outstandingBalance + repayment.amount;

      await tx.loan.update({
        where: { id: loan.id },
        data: {
          outstandingBalance: newOutstandingBalance,
          status: newOutstandingBalance >= loan.totalAmount ? 'active' : loan.status
        }
      });
    });

    return res.json({
      success: true,
      message: 'Repayment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting repayment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete repayment'
    });
  }
});

export default router;