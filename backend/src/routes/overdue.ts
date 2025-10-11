import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/overdue - Get all overdue loans with dynamic calculation
router.get('/', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const overdueLoans = await prisma.loan.findMany({
      where: {
        AND: [
          { outstandingBalance: { gt: 0 } },
          { status: { not: 'Closed' } },
          { nextPaymentDate: { lt: today } }  // Only truly overdue loans
        ]
      },
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
        nextPaymentDate: 'asc'  // Oldest overdue first
      }
    });
    
    // Calculate days overdue and categorize
    const loansWithOverdueInfo = overdueLoans.map(loan => {
      const dueDate = new Date(loan.nextPaymentDate!);
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      
      let overdueCategory = '1-7 Days';
      if (daysOverdue > 30) {
        overdueCategory = '30+ Days';
      } else if (daysOverdue > 7) {
        overdueCategory = '8-30 Days';
      }
      
      return {
        id: loan.id,
        loanId: loan.loanId,
        borrowerId: loan.borrowerId,
        principal: loan.principal,
        outstandingBalance: loan.outstandingBalance,
        nextPaymentDate: loan.nextPaymentDate,
        status: loan.status,
        daysOverdue: Math.max(0, daysOverdue),
        overdueCategory,
        customerName: `${loan.borrower.firstName} ${loan.borrower.lastName}`,
        contact: loan.borrower.phone
      };
    });
    
    res.json(loansWithOverdueInfo);
  } catch (error) {
    console.error('Error fetching overdue loans:', error);
    res.status(500).json({ error: 'Failed to fetch overdue loans' });
  }
});

// GET /api/overdue/stats - Get overdue statistics
router.get('/stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const overdueLoans = await prisma.loan.findMany({
      where: {
        AND: [
          { outstandingBalance: { gt: 0 } },
          { nextPaymentDate: { lt: today } },
          { status: { not: 'Closed' } }
        ]
      },
      select: {
        loanId: true,
        outstandingBalance: true,
        nextPaymentDate: true
      }
    });
    
    let count_1_7 = 0;
    let count_8_30 = 0;
    let count_30_plus = 0;
    let totalAmount = 0;
    
    overdueLoans.forEach(loan => {
      const daysOverdue = Math.floor(
        (today.getTime() - new Date(loan.nextPaymentDate!).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      totalAmount += loan.outstandingBalance;
      
      if (daysOverdue <= 7) {
        count_1_7++;
      } else if (daysOverdue <= 30) {
        count_8_30++;
      } else {
        count_30_plus++;
      }
    });
    
    res.json({
      total: overdueLoans.length,
      totalAmount,
      categories: {
        '1-7 Days': count_1_7,
        '8-30 Days': count_8_30,
        '30+ Days': count_30_plus
      }
    });
  } catch (error) {
    console.error('Error fetching overdue stats:', error);
    res.status(500).json({ error: 'Failed to fetch overdue statistics' });
  }
});

export default router;
