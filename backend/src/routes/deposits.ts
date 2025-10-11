import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/deposits - Get all deposits
router.get('/', async (req, res) => {
  try {
    const deposits = await prisma.deposit.findMany({
      orderBy: {
        depositDate: 'desc'
      }
    });
    
    res.json({
      success: true,
      data: deposits,
      message: 'Deposits retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching deposits:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve deposits'
    });
  }
});

// GET /api/deposits/account/:accountId - Get deposits for a specific account
router.get('/account/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    const deposits = await prisma.deposit.findMany({
      where: { accountId },
      orderBy: {
        depositDate: 'desc'
      }
    });
    
    res.json({
      success: true,
      data: deposits,
      message: 'Deposits retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching deposits:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve deposits'
    });
  }
});

// POST /api/deposits - Create new deposit
router.post('/', async (req, res) => {
  try {
    const { depositId, accountId, amount, depositDate, method } = req.body;
    
    const deposit = await prisma.deposit.create({
      data: {
        depositId,
        accountId,
        amount: parseFloat(amount),
        depositDate: new Date(depositDate),
        method: method || 'CASH'
      }
    });
    
    res.status(201).json({
      success: true,
      data: deposit,
      message: 'Deposit recorded successfully'
    });
  } catch (error) {
    console.error('Error creating deposit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record deposit'
    });
  }
});

export default router;
