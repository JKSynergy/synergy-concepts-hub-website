import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { body, query, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler';
import { authentication, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get all borrowers with pagination and filtering
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isLength({ min: 1 }).withMessage('Search term cannot be empty'),
  query('status').optional().isIn(['ACTIVE', 'INACTIVE', 'BLACKLISTED', 'UNDER_REVIEW']),
], asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errors.array()
    });
    return;
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = req.query.search as string;
  const status = req.query.status as string;
  const offset = (page - 1) * limit;

  const whereClause: any = {};

  // Add search filter
  if (search) {
    whereClause.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { borrowerId: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Add status filter
  if (status) {
    whereClause.status = status;
  }

  try {
    const [borrowers, total] = await Promise.all([
      prisma.borrower.findMany({
        where: whereClause,
        include: {
          loans: {
            select: {
              id: true,
              loanId: true,
              principal: true,
              outstandingBalance: true,
              status: true,
            },
          },
          applications: {
            select: {
              id: true,
              applicationId: true,
              requestedAmount: true,
              status: true,
            },
          },
          savings: {
            select: {
              id: true,
              savingsId: true,
              balance: true,
              status: true,
            },
          },
          _count: {
            select: {
              loans: true,
              applications: true,
              repayments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.borrower.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        borrowers,
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
  } catch (error) {
    console.error('Error fetching borrowers:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}));

// Get borrower by ID
router.get('/:id', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const borrower = await prisma.borrower.findUnique({
      where: { id },
      include: {
        loans: {
          include: {
            repayments: {
              select: {
                id: true,
                amount: true,
                paidAt: true,
                status: true,
              },
            },
          },
        },
        applications: true,
        savings: {
          select: {
            id: true,
            savingsId: true,
            balance: true,
            status: true,
          },
        },
        repayments: {
          select: {
            id: true,
            amount: true,
            paidAt: true,
            status: true,
          },
        },
        _count: {
          select: {
            loans: true,
            applications: true,
            repayments: true,
          },
        },
      },
    });

    if (!borrower) {
      res.status(404).json({
        success: false,
        message: 'Borrower not found'
      });
      return;
    }

    res.json({
      success: true,
      data: borrower,
    });
  } catch (error) {
    console.error('Error fetching borrower:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}));

// Create new borrower
router.post('/', [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('phone').notEmpty().withMessage('Phone is required'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('gender').optional().isIn(['MALE', 'FEMALE', 'OTHER']),
  body('dateOfBirth').optional().isISO8601().withMessage('Valid date of birth is required'),
  body('nationalId').optional().isLength({ min: 1 }).withMessage('National ID cannot be empty'),
  body('occupation').optional().isLength({ min: 1 }).withMessage('Occupation cannot be empty'),
  body('monthlyIncome').optional().isNumeric().withMessage('Monthly income must be a number'),
  body('status').optional().isIn(['ACTIVE', 'INACTIVE', 'BLACKLISTED', 'UNDER_REVIEW']),
], asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errors.array()
    });
    return;
  }

  const {
    firstName,
    lastName,
    phone,
    email,
    gender,
    dateOfBirth,
    nationalId,
    occupation,
    monthlyIncome,
    status = 'ACTIVE'
  } = req.body;

  try {
    // Generate unique borrower ID
    const borrowerCount = await prisma.borrower.count();
    const borrowerId = `QC${String(borrowerCount + 1).padStart(6, '0')}`;

    const borrower = await prisma.borrower.create({
      data: {
        borrowerId,
        firstName,
        lastName,
        phone,
        email,
        gender,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        nationalId,
        occupation,
        monthlyIncome: monthlyIncome ? parseFloat(monthlyIncome) : null,
        status,
        // Remove address as it's not in the schema
        createdById: req.user?.id || 'system', // Assuming auth middleware sets req.user
      },
      include: {
        _count: {
          select: {
            loans: true,
            applications: true,
            repayments: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Borrower created successfully',
      data: borrower,
    });
  } catch (error) {
    console.error('Error creating borrower:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}));

// Update borrower
router.put('/:id', [
  body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
  body('phone').optional().notEmpty().withMessage('Phone cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('gender').optional().isIn(['MALE', 'FEMALE', 'OTHER']),
  body('dateOfBirth').optional().isISO8601().withMessage('Valid date of birth is required'),
  body('nationalId').optional().isLength({ min: 1 }).withMessage('National ID cannot be empty'),
  body('occupation').optional().isLength({ min: 1 }).withMessage('Occupation cannot be empty'),
  body('monthlyIncome').optional().isNumeric().withMessage('Monthly income must be a number'),
  body('status').optional().isIn(['ACTIVE', 'INACTIVE', 'BLACKLISTED', 'UNDER_REVIEW']),
], asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errors.array()
    });
    return;
  }

  const { id } = req.params;
  const updateData = { ...req.body };

  // Remove undefined fields
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });

  if (updateData.dateOfBirth) {
    updateData.dateOfBirth = new Date(updateData.dateOfBirth);
  }

  if (updateData.monthlyIncome) {
    updateData.monthlyIncome = parseFloat(updateData.monthlyIncome);
  }

  try {
    const borrower = await prisma.borrower.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: {
            loans: true,
            applications: true,
            repayments: true,
          },
        },
      },
    });

    res.json({
      success: true,
      message: 'Borrower updated successfully',
      data: borrower,
    });
  } catch (error: any) {
    console.error('Error updating borrower:', error);
    if (error.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'Borrower not found'
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}));

// Delete borrower
router.delete('/:id', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    await prisma.borrower.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Borrower deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting borrower:', error);
    if (error.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'Borrower not found'
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}));

// Get borrower statistics
router.get('/:id/statistics', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const borrower = await prisma.borrower.findUnique({
      where: { id },
      include: {
        loans: true,
        repayments: true,
        applications: true,
        savings: true,
      },
    });

    if (!borrower) {
      res.status(404).json({
        success: false,
        message: 'Borrower not found'
      });
      return;
    }

    // Calculate statistics
    const totalLoansIssued = borrower.loans.length;
    const totalAmountBorrowed = borrower.loans.reduce((sum, loan) => sum + loan.principal, 0);
    const totalAmountRepaid = borrower.repayments.reduce((sum, repayment) => sum + repayment.amount, 0);
    const outstandingBalance = borrower.loans.reduce((sum, loan) => sum + loan.outstandingBalance, 0);

    // Remove overdueRecord aggregation as it doesn't exist
    const overdueLoans = borrower.loans.filter(loan => loan.status === 'OVERDUE').length;

    const statistics = {
      borrowerId: borrower.borrowerId,
      firstName: borrower.firstName,
      lastName: borrower.lastName,
      status: borrower.status,
      // Remove creditScore as it doesn't exist in the schema
      totalLoansIssued,
      totalAmountBorrowed,
      totalAmountRepaid,
      outstandingBalance,
      overdueLoans,
      repaymentHistory: borrower.repayments.length,
      lastLoanDate: borrower.loans.length > 0 ? borrower.loans[borrower.loans.length - 1].disbursedAt : null,
      memberSince: borrower.createdAt,
    };

    res.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    console.error('Error fetching borrower statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}));

export default router;