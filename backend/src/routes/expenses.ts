import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/expenses - Get all expenses
router.get('/', async (req, res) => {
  try {
    const expenses = await prisma.expense.findMany({
      orderBy: {
        expenseDate: 'desc'
      }
    });
    
    res.json({
      success: true,
      data: expenses,
      message: 'Expenses retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve expenses'
    });
  }
});

// POST /api/expenses - Create new expense
router.post('/', async (req, res) => {
  try {
    res.status(201).json({
      success: true,
      data: null,
      message: 'Expense created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create expense'
    });
  }
});

export default router;