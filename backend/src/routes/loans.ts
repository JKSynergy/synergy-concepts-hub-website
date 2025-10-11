import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
// import { authentication } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Apply authentication middleware to all routes - COMMENTED OUT FOR DEVELOPMENT
// router.use(authentication);

// GET /api/loans - Get all loans
router.get('/', async (req, res) => {
  try {
    const loans = await prisma.loan.findMany({
      include: {
        borrower: true,
        repayments: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Process loans to calculate missing dates
    const processedLoans = loans.map(loan => {
      let disbursedAt = loan.disbursedAt;
      let nextPaymentDate = loan.nextPaymentDate;
      
      // If loan is active or completed but missing disbursedAt, use createdAt or updatedAt
      if (!disbursedAt && (loan.status === 'ACTIVE' || loan.status === 'COMPLETED' || loan.status === 'CLOSED')) {
        disbursedAt = loan.createdAt;
      }
      
      // Calculate nextPaymentDate if missing and loan is active
      if (!nextPaymentDate && (loan.status === 'ACTIVE' || loan.status === 'DISBURSED')) {
        const baseDate = disbursedAt || loan.createdAt;
        const nextDate = new Date(baseDate);
        nextDate.setMonth(nextDate.getMonth() + 1);
        nextPaymentDate = nextDate;
      }
      
      return {
        ...loan,
        disbursedAt: disbursedAt?.toISOString() || null,
        nextPaymentDate: nextPaymentDate?.toISOString() || null
      };
    });
    
    // Return the loans array directly (not wrapped in a data object)
    res.json(processedLoans);
  } catch (error) {
    console.error('Error fetching loans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve loans'
    });
  }
});

// GET /api/loans/:id - Get loan by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // TODO: Implement get loan by ID logic
    res.json({
      success: true,
      data: null,
      message: 'Loan retrieved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve loan'
    });
  }
});

// POST /api/loans - Create new loan
router.post('/', async (req, res) => {
  try {
    // TODO: Implement create loan logic
    res.status(201).json({
      success: true,
      data: null,
      message: 'Loan created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create loan'
    });
  }
});

// PUT /api/loans/:id - Update loan
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // TODO: Implement update loan logic
    res.json({
      success: true,
      data: null,
      message: 'Loan updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update loan'
    });
  }
});

// DELETE /api/loans/:id - Delete loan
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // TODO: Implement delete loan logic
    res.json({
      success: true,
      message: 'Loan deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete loan'
    });
  }
});

export default router;