import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'demo-secret-key';

// Client Login - using phone number or email
router.post('/login', [
  body('phone').notEmpty().withMessage('Phone/Email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const { phone, password } = req.body;

    // Find borrower by phone, email, or first name (for demo purposes)
    const borrower = await prisma.borrower.findFirst({
      where: {
        OR: [
          { phone: phone },
          { email: phone },
          { firstName: { contains: phone } }
        ],
        status: 'ACTIVE'
      }
    });

    if (!borrower) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // For demo: accept 'demo123' as password for any borrower
    // In production, you'd verify against a hashed password field
    if (password !== 'demo123') {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: borrower.id,
        borrowerId: borrower.borrowerId,
        phone: borrower.phone,
        type: 'client'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Format borrower data for client portal
    const userData = {
      id: borrower.id,
      borrowerId: borrower.borrowerId,
      firstName: borrower.firstName,
      lastName: borrower.lastName,
      phone: borrower.phone,
      email: borrower.email,
      nationalId: borrower.nationalId,
      dateOfBirth: borrower.dateOfBirth,
      gender: borrower.gender,
      district: borrower.district,
      subcounty: borrower.subcounty,
      village: borrower.village,
      occupation: borrower.occupation,
      monthlyIncome: borrower.monthlyIncome ? Number(borrower.monthlyIncome) : null,
      creditRating: borrower.creditRating,
      status: borrower.status,
      createdAt: borrower.createdAt.toISOString(),
      updatedAt: borrower.updatedAt.toISOString(),
    };

    return res.json({
      success: true,
      message: `Welcome back, ${borrower.firstName}!`,
      token,
      user: userData
    });

  } catch (error) {
    console.error('Client login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// Verify Token
router.get('/verify', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Get fresh borrower data
    const borrower = await prisma.borrower.findUnique({
      where: { id: decoded.id }
    });

    if (!borrower || borrower.status !== 'ACTIVE') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const userData = {
      id: borrower.id,
      borrowerId: borrower.borrowerId,
      firstName: borrower.firstName,
      lastName: borrower.lastName,
      phone: borrower.phone,
      email: borrower.email,
      nationalId: borrower.nationalId,
      dateOfBirth: borrower.dateOfBirth,
      gender: borrower.gender,
      district: borrower.district,
      subcounty: borrower.subcounty,
      village: borrower.village,
      occupation: borrower.occupation,
      monthlyIncome: borrower.monthlyIncome ? Number(borrower.monthlyIncome) : null,
      creditRating: borrower.creditRating,
      status: borrower.status,
      createdAt: borrower.createdAt.toISOString(),
      updatedAt: borrower.updatedAt.toISOString(),
    };

    return res.json({
      success: true,
      user: userData
    });

  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
});

// Client Registration
// Check if borrower exists (for account activation)
router.post('/check-existing', [
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('nationalId').optional(),
], async (req: Request, res: Response) => {
  try {
    const { phone, nationalId } = req.body;

    const borrower = await prisma.borrower.findFirst({
      where: {
        OR: [
          { phone },
          nationalId ? { nationalId } : {}
        ]
      }
    });

    if (borrower) {
      return res.json({
        success: true,
        exists: true,
        data: {
          borrowerId: borrower.borrowerId,
          firstName: borrower.firstName,
          lastName: borrower.lastName,
          phone: borrower.phone,
          email: borrower.email,
          nationalId: borrower.nationalId,
          hasLoans: await prisma.loan.count({ where: { borrowerId: borrower.id } }) > 0,
        }
      });
    }

    return res.json({
      success: true,
      exists: false
    });
  } catch (error) {
    console.error('Check existing borrower error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Activate existing borrower account
router.post('/activate-account', [
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('nationalId').notEmpty().withMessage('National ID is required for verification'),
  body('dateOfBirth').notEmpty().withMessage('Date of birth is required for verification'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const { phone, nationalId, dateOfBirth, password } = req.body;

    // Find borrower by phone and verify identity with national ID and DOB
    const borrower = await prisma.borrower.findFirst({
      where: { phone }
    });

    if (!borrower) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this phone number'
      });
    }

    // Verify identity (in production, compare hashed values)
    if (borrower.nationalId !== nationalId) {
      return res.status(401).json({
        success: false,
        message: 'Identity verification failed. National ID does not match our records.'
      });
    }

    // Verify date of birth (compare dates, allowing for timezone differences)
    const providedDOB = new Date(dateOfBirth).toISOString().split('T')[0];
    const storedDOB = borrower.dateOfBirth ? new Date(borrower.dateOfBirth).toISOString().split('T')[0] : null;
    
    if (storedDOB !== providedDOB) {
      return res.status(401).json({
        success: false,
        message: 'Identity verification failed. Date of birth does not match our records.'
      });
    }

    // TODO: In production, hash the password before storing
    // For now, we'll store it in a custom field or use email field temporarily
    // Note: The schema doesn't have a password field for borrowers
    // You'll need to add this in a migration

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: borrower.id,
        borrowerId: borrower.borrowerId,
        phone: borrower.phone,
        type: 'client'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const userData = {
      id: borrower.id,
      borrowerId: borrower.borrowerId,
      firstName: borrower.firstName,
      lastName: borrower.lastName,
      phone: borrower.phone,
      email: borrower.email,
      nationalId: borrower.nationalId,
      dateOfBirth: borrower.dateOfBirth,
      gender: borrower.gender,
      district: borrower.district,
      subcounty: borrower.subcounty,
      village: borrower.village,
      occupation: borrower.occupation,
      monthlyIncome: borrower.monthlyIncome ? Number(borrower.monthlyIncome) : null,
      creditRating: borrower.creditRating,
      status: borrower.status,
      createdAt: borrower.createdAt.toISOString(),
      updatedAt: borrower.updatedAt.toISOString(),
    };

    return res.json({
      success: true,
      message: 'Account activated successfully! Welcome to QuickCredit.',
      token,
      user: userData
    });

  } catch (error) {
    console.error('Account activation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.post('/register', [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('dateOfBirth').notEmpty().withMessage('Date of birth is required'),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const { firstName, lastName, phone, email, password, dateOfBirth, nationalId, gender, district } = req.body;

    // Check if phone already exists
    const existingBorrower = await prisma.borrower.findFirst({
      where: { phone }
    });

    if (existingBorrower) {
      return res.status(400).json({
        success: false,
        message: 'Phone number already registered. If you are an existing client, please use the "Activate Account" option.',
        showActivation: true  // Signal to frontend to show activation flow
      });
    }

    // Generate borrower ID
    const borrowerCount = await prisma.borrower.count();
    const borrowerId = `BRW-${new Date().getFullYear()}-${String(borrowerCount + 1).padStart(4, '0')}`;

    // Get system user or create one for self-registrations
    let systemUser = await prisma.user.findFirst({
      where: { username: 'system' }
    });

    if (!systemUser) {
      systemUser = await prisma.user.create({
        data: {
          username: 'system',
          email: 'system@quickcredit.com',
          password: 'not-used', // Not used for actual login
          firstName: 'System',
          lastName: 'User',
          role: 'ADMIN',
          status: 'ACTIVE'
        }
      });
    }

    // Create borrower (in production, hash the password)
    const borrower = await prisma.borrower.create({
      data: {
        borrowerId,
        firstName,
        lastName,
        phone,
        email,
        dateOfBirth,
        nationalId,
        gender,
        district,
        creditRating: 'PENDING',
        status: 'ACTIVE',
        createdById: systemUser.id
      }
    });

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: borrower.id,
        borrowerId: borrower.borrowerId,
        phone: borrower.phone,
        type: 'client'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const userData = {
      id: borrower.id,
      borrowerId: borrower.borrowerId,
      firstName: borrower.firstName,
      lastName: borrower.lastName,
      phone: borrower.phone,
      email: borrower.email,
      nationalId: borrower.nationalId,
      dateOfBirth: borrower.dateOfBirth,
      gender: borrower.gender,
      district: borrower.district,
      subcounty: borrower.subcounty,
      village: borrower.village,
      occupation: borrower.occupation,
      monthlyIncome: borrower.monthlyIncome ? Number(borrower.monthlyIncome) : null,
      creditRating: borrower.creditRating,
      status: borrower.status,
      createdAt: borrower.createdAt.toISOString(),
      updatedAt: borrower.updatedAt.toISOString(),
    };

    return res.status(201).json({
      success: true,
      message: 'Registration successful!',
      token,
      user: userData
    });

  } catch (error) {
    console.error('Client registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

export default router;
