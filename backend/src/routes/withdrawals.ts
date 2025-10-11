import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/withdrawals - Get all withdrawals
router.get('/', async (req, res) => {
  try {
    const withdrawals = await prisma.withdrawal.findMany({
      orderBy: {
        withdrawalDate: 'desc'
      }
    });
    
    res.json({
      success: true,
      data: withdrawals,
      message: 'Withdrawals retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve withdrawals'
    });
  }
});

// GET /api/withdrawals/account/:accountId - Get withdrawals for a specific account
router.get('/account/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    const withdrawals = await prisma.withdrawal.findMany({
      where: { accountId },
      orderBy: {
        withdrawalDate: 'desc'
      }
    });
    
    res.json({
      success: true,
      data: withdrawals,
      message: 'Withdrawals retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve withdrawals'
    });
  }
});

// POST /api/withdrawals - Create new withdrawal
router.post('/', async (req, res) => {
  try {
    const { withdrawalId, accountId, amount, withdrawalDate, method } = req.body;
    
    const withdrawal = await prisma.withdrawal.create({
      data: {
        withdrawalId,
        accountId,
        amount: parseFloat(amount),
        withdrawalDate: new Date(withdrawalDate),
        method: method || 'CASH'
      }
    });
    
    res.status(201).json({
      success: true,
      data: withdrawal,
      message: 'Withdrawal recorded successfully'
    });
  } catch (error) {
    console.error('Error creating withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record withdrawal'
    });
  }
});

export default router;
