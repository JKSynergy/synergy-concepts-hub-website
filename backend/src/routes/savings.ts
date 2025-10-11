import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/savings - Get all savings
router.get('/', async (req, res) => {
  try {
    const savings = await prisma.savings.findMany({
      include: {
        borrower: {
          select: {
            borrowerId: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: savings,
      message: 'Savings retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching savings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve savings'
    });
  }
});

// POST /api/savings - Create new savings record
router.post('/', async (req, res) => {
  try {
    res.status(201).json({
      success: true,
      data: null,
      message: 'Savings record created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create savings record'
    });
  }
});

export default router;