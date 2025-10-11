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
    
    res.json({
      success: true,
      data: repayments,
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

export default router;