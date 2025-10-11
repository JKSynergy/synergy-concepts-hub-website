
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
// Import routes
import authRoutes from './routes/auth';
import clientAuthRoutes from './routes/clientAuth';
import clientRoutes from './routes/client';
import borrowersRoutes from './routes/borrowers';
import loansRoutes from './routes/loans';
import repaymentsRoutes from './routes/repayments';
import savingsRoutes from './routes/savings';
import expensesRoutes from './routes/expenses';
import applicationsRoutes from './routes/applications';
import reportsRoutes from './routes/reports';
import dashboardRoutes from './routes/dashboard';
import saversRoutes from './routes/savers';
import depositsRoutes from './routes/deposits';
import withdrawalsRoutes from './routes/withdrawals';
import overdueRoutes from './routes/overdue';
import alertsRoutes from './routes/alerts';
// Load environment variables
dotenv.config();
const app = express();
const httpServer = createServer(app);
// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);
// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
// Apply rate limiting to all requests
app.use(limiter);
// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:8080'
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with']
}));
// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Compression middleware
app.use(compression());
// Logging middleware
app.use(morgan('combined'));
// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'QuickCredit API'
  });
});
// Migration status endpoint
app.get('/api/migration/status', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const [borrowers, loans, repayments, savings, expenses, applications] = await Promise.all([
      prisma.borrower.count(),
      prisma.loan.count(),
      prisma.repayment.count(),
      prisma.savings.count(),
      prisma.expense.count(),
      prisma.loanApplication.count(),
    ]);
    await prisma.$disconnect();
    res.json({
      borrowers,
      loans,
      repayments,
      savings,
      expenses,
      applications,
      total: borrowers + loans + repayments + savings + expenses + applications,
    });
  } catch (error) {
    console.error('Migration status error:', error);
    res.status(500).json({ error: 'Failed to get migration status' });
  }
});
// API routes
app.use('/api/auth', authRoutes);
app.use('/api/client/auth', clientAuthRoutes); // Client portal authentication
app.use('/api/client', clientRoutes); // Client portal API
app.use('/api/borrowers', borrowersRoutes);
app.use('/api/loans', loansRoutes);
app.use('/api/repayments', repaymentsRoutes);
app.use('/api/savings', savingsRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/savers', saversRoutes);
app.use('/api/deposits', depositsRoutes);
app.use('/api/withdrawals', withdrawalsRoutes);
app.use('/api/overdue', overdueRoutes);
app.use('/api/alerts', alertsRoutes);

// Borrowers with loans endpoint
app.get('/api/borrowers-with-loans', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const borrowers = await prisma.borrower.findMany({
      include: {
        loans: {
          where: {
            status: {
              in: ['ACTIVE', 'OVERDUE', 'PENDING']
            }
          },
          select: {
            id: true,
            loanId: true,
            principal: true,
            outstandingBalance: true,
            status: true,
          }
        },
        _count: {
          select: {
            loans: true,
            repayments: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Enrich borrowers with loan statistics
    const enrichedBorrowers = borrowers.map(borrower => ({
      ...borrower,
      loanCount: borrower._count.loans,
      activeLoanCount: borrower.loans.filter(l => l.status === 'ACTIVE' || l.status === 'OVERDUE').length,
      totalOutstanding: borrower.loans.reduce((sum, loan) => sum + (loan.outstandingBalance || 0), 0)
    }));

    await prisma.$disconnect();
    
    res.json({
      success: true,
      data: enrichedBorrowers
    });
  } catch (error) {
    console.error('Error fetching borrowers with loans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch borrowers with loans'
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});
// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});
// Start server
const PORT = process.env.PORT || 9999;
httpServer.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Auth endpoint: http://localhost:${PORT}/api/auth/login`);
});