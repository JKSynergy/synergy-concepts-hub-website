const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

// Import email service
// const { emailService } = require('./dist/services/emailService');

const app = express();
const PORT = 3002;
const prisma = new PrismaClient({
  log: ['error', 'warn'],
  errorFormat: 'pretty',
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "file:./prisma/dev.db"
    }
  }
});

// Test database connection on startup
async function testDatabaseConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process - just log the error
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process - just log the error
});

// Keep server alive
setInterval(() => {
  // Ping to keep alive every 30 seconds
}, 30000);

// Middleware
app.use(cors({
  origin: [
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'OK', message: 'Backend server is running', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ status: 'ERROR', message: 'Database connection failed', error: error.message });
  }
});

// Authentication endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Demo authentication - in production, you'd validate against a user database
    if (username === 'admin' && password === 'admin123') {
      const response = {
        token: 'demo-jwt-token-' + Date.now(),
        refreshToken: 'demo-refresh-token-' + Date.now(),
        user: {
          id: '1',
          username: 'admin',
          email: 'admin@quickcredit.com',
          firstName: 'System',
          lastName: 'Administrator',
          role: 'ADMIN'
        }
      };
      res.json(response);
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    // In a real app, you'd invalidate the token here
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    // Demo refresh - in production, you'd validate the refresh token
    if (refreshToken && refreshToken.startsWith('demo-refresh-token-')) {
      const response = {
        token: 'demo-jwt-token-' + Date.now()
      };
      res.json(response);
    } else {
      res.status(401).json({ error: 'Invalid refresh token' });
    }
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

app.get('/api/auth/profile', async (req, res) => {
  try {
    // Demo profile - in production, you'd get this from the token
    const profile = {
      id: '1',
      username: 'admin',
      email: 'admin@quickcredit.com',
      firstName: 'System',
      lastName: 'Administrator',
      role: 'ADMIN'
    };
    res.json(profile);
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Get all borrowers
app.get('/api/borrowers', async (req, res) => {
  try {
    const borrowers = await prisma.borrower.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(borrowers);
  } catch (error) {
    console.error('Error fetching borrowers:', error);
    res.status(500).json({ error: 'Failed to fetch borrowers' });
  }
});

// Get all loans
app.get('/api/loans', async (req, res) => {
  try {
    const loans = await prisma.loan.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        borrower: true
      }
    });
    res.json(loans);
  } catch (error) {
    console.error('Error fetching loans:', error);
    res.status(500).json({ error: 'Failed to fetch loans' });
  }
});

// Get all repayments
app.get('/api/repayments', async (req, res) => {
  try {
    const repayments = await prisma.repayment.findMany({
      orderBy: { paidAt: 'desc' },
      include: {
        loan: true,
        borrower: true
      }
    });
    res.json(repayments);
  } catch (error) {
    console.error('Error fetching repayments:', error);
    res.status(500).json({ error: 'Failed to fetch repayments' });
  }
});

// Get all savings
app.get('/api/savings', async (req, res) => {
  try {
    const savings = await prisma.savings.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        borrower: true
      }
    });
    res.json(savings);
  } catch (error) {
    console.error('Error fetching savings:', error);
    res.status(500).json({ error: 'Failed to fetch savings' });
  }
});

// Get all expenses
app.get('/api/expenses', async (req, res) => {
  try {
    const expenses = await prisma.expense.findMany({
      orderBy: { expenseDate: 'desc' }
    });
    res.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// Get all applications
app.get('/api/applications', async (req, res) => {
  try {
    const { status, search, page = '1', limit = '12' } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {};
    
    if (status && status !== 'All') {
      where.status = status.toUpperCase();
    }
    
    if (search) {
      where.OR = [
        { applicationId: { contains: search } },
        { borrower: { firstName: { contains: search } } },
        { borrower: { lastName: { contains: search } } },
      ];
    }

    const applications = await prisma.loanApplication.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      include: {
        borrower: true
      },
      skip,
      take: limitNum,
    });

    const total = await prisma.loanApplication.count({ where });

    res.json({
      success: true,
      data: applications,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      message: 'Applications retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch applications' });
  }
});

// Create new loan application
app.post('/api/applications', async (req, res) => {
  try {
    const {
      // Personal Information
      fullName,
      dateOfBirth,
      nationalId,
      phoneNumber,
      emailAddress,
      residentialAddress,
      
      // Employment & Income
      employmentStatus,
      employerBusinessName,
      monthlyIncome,
      
      // Loan Details
      requestedLoanAmount,
      interestRate,
      loanTerm,
      purposeOfLoan,
      collateral,
      
      // Guarantor Information
      guarantorName,
      guarantorId,
      guarantorPhone,
      guarantorRelation
    } = req.body;

    // Validate required fields
    if (!fullName || !phoneNumber || !requestedLoanAmount || !loanTerm || !purposeOfLoan) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        required: ['fullName', 'phoneNumber', 'requestedLoanAmount', 'loanTerm', 'purposeOfLoan']
      });
    }

    // Check if borrower already exists by phone number or national ID
    let borrower = await prisma.borrower.findFirst({
      where: {
        OR: [
          { phone: phoneNumber },
          nationalId ? { nationalId: nationalId } : undefined
        ].filter(Boolean)
      }
    });

    // If borrower doesn't exist, create new borrower
    if (!borrower) {
      // Split full name into first and last name
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Generate unique borrower ID
      const borrowerCount = await prisma.borrower.count();
      const borrowerId = `BOR${String(borrowerCount + 1).padStart(4, '0')}`;

      // Create borrower with a default user ID (we'll need to implement proper auth later)
      // For now, let's get the first user from the database or create a default one
      let defaultUser = await prisma.user.findFirst();
      
      if (!defaultUser) {
        // Create a default system user if none exists
        defaultUser = await prisma.user.create({
          data: {
            username: 'system',
            email: 'system@quickcredit.com',
            password: 'hashed_password', // In real implementation, this should be properly hashed
            firstName: 'System',
            lastName: 'User',
            role: 'LOAN_OFFICER',
            status: 'ACTIVE'
          }
        });
      }

      borrower = await prisma.borrower.create({
        data: {
          borrowerId,
          firstName,
          lastName,
          phone: phoneNumber,
          email: emailAddress || null,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          nationalId: nationalId || null,
          village: residentialAddress || null,
          occupation: employmentStatus || null,
          monthlyIncome: monthlyIncome ? parseFloat(monthlyIncome) : null,
          createdById: defaultUser.id
        }
      });
    }

    // Generate unique application ID
    const applicationCount = await prisma.loanApplication.count();
    const applicationId = `APP${String(applicationCount + 1).padStart(4, '0')}`;

    // Parse interest rate
    let interestRateValue = 0.1; // Default 10%
    if (interestRate && interestRate !== 'SELECT RATE...') {
      const rateMatch = interestRate.match(/(\d+)%/);
      if (rateMatch) {
        interestRateValue = parseFloat(rateMatch[1]) / 100;
      }
    }

    // Create loan application
    const application = await prisma.loanApplication.create({
      data: {
        applicationId,
        borrowerId: borrower.id,
        requestedAmount: parseFloat(requestedLoanAmount),
        purpose: purposeOfLoan,
        termMonths: parseInt(loanTerm),
        status: 'PENDING'
      },
      include: {
        borrower: true
      }
    });

    // Send email notifications
    try {
      // Email service temporarily disabled
      console.log('📧 Email notifications temporarily disabled');
      /*
      // Send confirmation email to applicant
      if (borrower.email) {
        const clientEmailData = {
          to: borrower.email,
          subject: 'Loan Application Submitted - QuickCredit Uganda',
          html: emailService.generateApplicationSubmittedClientEmail({
            fullName: borrower.firstName + ' ' + borrower.lastName,
            applicationId: applicationId,
            requestedAmount: parseFloat(requestedLoanAmount),
            loanTerm: parseInt(loanTerm),
            purpose: purposeOfLoan
          })
        };
        
        await emailService.sendEmail(clientEmailData);
        console.log(`✅ Confirmation email sent to ${borrower.email}`);
      }

      // Send notification email to admin
      const adminEmailData = {
        to: 'admin@quickcredit.com',
        subject: `New Loan Application - ${applicationId}`,
        html: emailService.generateApplicationSubmittedAdminEmail({
          fullName: borrower.firstName + ' ' + borrower.lastName,
          applicationId: applicationId,
          requestedAmount: parseFloat(requestedLoanAmount),
          loanTerm: parseInt(loanTerm),
          purpose: purposeOfLoan,
          email: borrower.email,
          phone: borrower.phone
        })
      };
      
      await emailService.sendEmail(adminEmailData);
      console.log(`✅ Admin notification email sent for application ${applicationId}`);
      */
    } catch (emailError) {
      console.error('❌ Error sending emails:', emailError);
      // Don't fail the application creation if email fails
    }

    res.status(201).json({
      message: 'Loan application submitted successfully',
      application,
      borrower: {
        isNew: !borrower.id,
        ...borrower
      }
    });
  } catch (error) {
    console.error('Error creating loan application:', error);
    res.status(500).json({ 
      error: 'Failed to create loan application',
      details: error.message 
    });
  }
});

// Get application statistics
app.get('/api/applications/stats', async (req, res) => {
  try {
    const applications = await prisma.loanApplication.findMany();
    
    const stats = {
      total: applications.length,
      pending: applications.filter(app => app.status === 'PENDING').length,
      underReview: applications.filter(app => app.status === 'UNDER_REVIEW').length,
      approved: applications.filter(app => app.status === 'APPROVED').length,
      rejected: applications.filter(app => app.status === 'REJECTED').length,
      totalAmount: applications.reduce((sum, app) => sum + (app.requestedAmount || 0), 0),
      averageAmount: applications.length > 0 ? 
        applications.reduce((sum, app) => sum + (app.requestedAmount || 0), 0) / applications.length : 0,
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching application stats:', error);
    res.status(500).json({ error: 'Failed to fetch application statistics' });
  }
});

// Get pending applications
app.get('/api/applications/pending', async (req, res) => {
  try {
    const pendingApplications = await prisma.loanApplication.findMany({
      where: {
        status: 'PENDING'
      },
      orderBy: { submittedAt: 'desc' },
      include: {
        borrower: true
      }
    });

    res.json({
      success: true,
      data: pendingApplications,
      total: pendingApplications.length,
      message: 'Pending applications retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching pending applications:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch pending applications' });
  }
});

// Approve loan application and create loan
app.post('/api/applications/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { approvedAmount, interestRate, termMonths } = req.body;

    // Find the application
    const application = await prisma.loanApplication.findUnique({
      where: { id },
      include: { borrower: true }
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (application.status !== 'PENDING') {
      return res.status(400).json({ error: 'Application is not pending' });
    }

    // Calculate loan details
    const principal = approvedAmount || application.requestedAmount;
    const rate = interestRate || 0.1; // Default 10% monthly
    const term = termMonths || application.termMonths;
    const totalInterest = principal * rate * term;
    const totalAmount = principal + totalInterest;
    const monthlyPayment = totalAmount / term;

    // Generate unique loan ID
    const loanCount = await prisma.loan.count();
    const loanId = `LOAN${String(loanCount + 1).padStart(4, '0')}`;

    // Default user ID for loan officer (use the same default user)
    let defaultUser = await prisma.user.findFirst();
    
    if (!defaultUser) {
      // Create a default system user if none exists
      defaultUser = await prisma.user.create({
        data: {
          username: 'system',
          email: 'system@quickcredit.com',
          password: 'hashed_password',
          firstName: 'System',
          lastName: 'User',
          role: 'LOAN_OFFICER',
          status: 'ACTIVE'
        }
      });
    }

    // Create loan
    const loan = await prisma.loan.create({
      data: {
        loanId,
        applicationId: application.id,
        borrowerId: application.borrowerId,
        loanOfficerId: defaultUser.id,
        principal,
        interestRate: rate,
        termMonths: term,
        totalInterest,
        totalAmount,
        monthlyPayment,
        status: 'APPROVED',
        purpose: application.purpose,
        outstandingBalance: totalAmount,
        nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        nextPaymentAmount: monthlyPayment
      }
    });

    // Update application status
    const updatedApplication = await prisma.loanApplication.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        approvedAmount: principal
      },
      include: {
        borrower: true
      }
    });

    // Send approval emails
    try {
      // Email service temporarily disabled
      console.log('📧 Approval emails temporarily disabled');
      // await emailService.sendApplicationApprovedEmails(updatedApplication, loan);
      // console.log('✅ Approval emails sent successfully');
    } catch (emailError) {
      console.error('❌ Failed to send approval emails:', emailError.message);
    }

    res.json({
      message: 'Application approved and loan created successfully',
      loan,
      application: updatedApplication
    });
  } catch (error) {
    console.error('Error approving application:', error);
    res.status(500).json({ 
      error: 'Failed to approve application',
      details: error.message 
    });
  }
});

// Reject loan application
app.post('/api/applications/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    const application = await prisma.loanApplication.findUnique({
      where: { id }
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (application.status !== 'PENDING') {
      return res.status(400).json({ error: 'Application is not pending' });
    }

    // Update application status
    const updatedApplication = await prisma.loanApplication.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        rejectionReason: rejectionReason || 'No reason provided'
      },
      include: {
        borrower: true
      }
    });

    // Send rejection emails
    try {
      // Email service temporarily disabled
      console.log('📧 Rejection emails temporarily disabled');
      // await emailService.sendApplicationRejectedEmails(updatedApplication, rejectionReason || 'No reason provided');
      // console.log('✅ Rejection emails sent successfully');
    } catch (emailError) {
      console.error('❌ Failed to send rejection emails:', emailError.message);
    }

    res.json({
      message: 'Application rejected successfully',
      application: updatedApplication
    });
  } catch (error) {
    console.error('Error rejecting application:', error);
    res.status(500).json({ 
      error: 'Failed to reject application',
      details: error.message 
    });
  }
});

// Get overdue loans based on logic
app.get('/api/overdue', async (req, res) => {
  try {
    const loans = await prisma.loan.findMany({
      include: {
        borrower: true,
        repayments: true
      }
    });

    const today = new Date();
    const overdueLoans = [];

    for (const loan of loans) {
      // Skip if loan is already completed or closed
      if (['COMPLETED', 'CLOSED'].includes(loan.status.toUpperCase())) {
        continue;
      }

      // Check if loan has outstanding balance and next payment date has passed
      if (loan.outstandingBalance > 0 && loan.nextPaymentDate) {
        const nextPaymentDate = new Date(loan.nextPaymentDate);
        const daysOverdue = Math.floor((today.getTime() - nextPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysOverdue > 0) {
          // Calculate total repayments for this loan
          const totalRepayments = loan.repayments.reduce((sum, repayment) => sum + repayment.amount, 0);
          
          // Calculate how many cycles are overdue based on monthly payment schedule
          const monthlyPayment = loan.monthlyPayment || 0;
          const cyclesOverdue = monthlyPayment > 0 ? Math.ceil(loan.outstandingBalance / monthlyPayment) : 1;
          
          // Generate overdue cycle details
          const overdueDetails = [];
          for (let i = 0; i < cyclesOverdue; i++) {
            const cycleDate = new Date(nextPaymentDate);
            cycleDate.setMonth(cycleDate.getMonth() - i);
            const cycleDaysOverdue = Math.floor((today.getTime() - cycleDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (cycleDaysOverdue > 0) {
              overdueDetails.push({
                cycle: i + 1,
                dueDate: cycleDate.toISOString(),
                amount: Math.min(monthlyPayment, loan.outstandingBalance - (i * monthlyPayment)),
                daysOverdue: cycleDaysOverdue
              });
            }
          }
          
          overdueLoans.push({
            loanId: loan.loanId,
            borrowerId: loan.borrowerId,
            customerName: `${loan.borrower.firstName} ${loan.borrower.lastName}`,
            phone: loan.borrower.phone,
            email: loan.borrower.email,
            amount: loan.principal,
            totalAmount: loan.totalAmount,
            outstandingBalance: loan.outstandingBalance,
            nextPaymentDate: loan.nextPaymentDate,
            nextPaymentAmount: loan.nextPaymentAmount,
            daysOverdue: daysOverdue,
            status: 'OVERDUE',
            totalRepayments: totalRepayments,
            interestRate: loan.interestRate,
            termMonths: loan.termMonths,
            monthlyPayment: loan.monthlyPayment,
            createdAt: loan.createdAt,
            disbursedAt: loan.disbursedAt,
            totalOverdueCycles: overdueDetails.length,
            overdueDetails: overdueDetails
          });
        }
      }
    }

    // Sort by days overdue (most overdue first)
    overdueLoans.sort((a, b) => b.daysOverdue - a.daysOverdue);

    res.json(overdueLoans);
  } catch (error) {
    console.error('Error fetching overdue loans:', error);
    res.status(500).json({ error: 'Failed to fetch overdue loans' });
  }
});

// Dashboard stats
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const [
      totalBorrowers,
      totalLoans,
      activeLoans,
      overdueLoans,
      totalRepayments,
      totalApplications
    ] = await Promise.all([
      prisma.borrower.count(),
      prisma.loan.count(),
      prisma.loan.count({ where: { status: 'ACTIVE' } }),
      prisma.loan.count({ where: { status: 'OVERDUE' } }),
      prisma.repayment.aggregate({ _sum: { amount: true } }),
      prisma.loanApplication.count()
    ]);

    const totalPortfolioValue = await prisma.loan.aggregate({
      _sum: { principal: true }
    });

    const totalCollections = totalRepayments._sum.amount || 0;
    const avgLoanSize = totalLoans > 0 ? (totalPortfolioValue._sum.principal || 0) / totalLoans : 0;
    const defaultRate = totalLoans > 0 ? (overdueLoans / totalLoans) * 100 : 0;
    const collectionRate = totalPortfolioValue._sum.principal > 0 ? 
      (totalCollections / totalPortfolioValue._sum.principal) * 100 : 0;

    res.json({
      totalBorrowers,
      totalLoans,
      totalPortfolioValue: totalPortfolioValue._sum.principal || 0,
      totalCollections,
      activeLoans,
      overdueLoans,
      defaultRate,
      collectionRate,
      avgLoanSize,
      monthlyGrowth: 0 // Placeholder for now
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Migration status
app.get('/api/migration/status', async (req, res) => {
  try {
    const [
      borrowerCount,
      loanCount,
      repaymentCount,
      savingsCount,
      expenseCount,
      applicationCount
    ] = await Promise.all([
      prisma.borrower.count(),
      prisma.loan.count(),
      prisma.repayment.count(),
      prisma.savings.count(),
      prisma.expense.count(),
      prisma.loanApplication.count()
    ]);

    res.json({
      status: 'completed',
      records: {
        borrowers: borrowerCount,
        loans: loanCount,
        repayments: repaymentCount,
        savings: savingsCount,
        expenses: expenseCount,
        applications: applicationCount,
        total: borrowerCount + loanCount + repaymentCount + savingsCount + expenseCount + applicationCount
      }
    });
  } catch (error) {
    console.error('Error fetching migration status:', error);
    res.status(500).json({ error: 'Failed to fetch migration status' });
  }
});

// Get all savers
app.get('/api/savers', async (req, res) => {
  try {
    const savers = await prisma.saver.findMany();
    res.json(savers);
  } catch (error) {
    console.error('Error fetching savers:', error);
    res.status(500).json({ error: 'Failed to fetch savers' });
  }
});

// Get saver by ID
app.get('/api/savers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const saver = await prisma.saver.findUnique({
      where: { id }
    });
    
    if (!saver) {
      return res.status(404).json({ error: 'Saver not found' });
    }
    
    res.json(saver);
  } catch (error) {
    console.error('Error fetching saver:', error);
    res.status(500).json({ error: 'Failed to fetch saver' });
  }
});

// Get all deposits
app.get('/api/deposits', async (req, res) => {
  try {
    const deposits = await prisma.deposit.findMany();
    res.json(deposits);
  } catch (error) {
    console.error('Error fetching deposits:', error);
    res.status(500).json({ error: 'Failed to fetch deposits' });
  }
});

// Get deposits by account ID
app.get('/api/deposits/account/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const deposits = await prisma.deposit.findMany({
      where: { accountId: accountId }
    });
    res.json(deposits);
  } catch (error) {
    console.error('Error fetching deposits for account:', error);
    res.status(500).json({ error: 'Failed to fetch deposits for account' });
  }
});

// Get all withdrawals
app.get('/api/withdrawals', async (req, res) => {
  try {
    const withdrawals = await prisma.withdrawal.findMany();
    res.json(withdrawals);
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
});

// Get withdrawals by account ID
app.get('/api/withdrawals/account/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const withdrawals = await prisma.withdrawal.findMany({
      where: { accountId: accountId }
    });
    res.json(withdrawals);
  } catch (error) {
    console.error('Error fetching withdrawals for account:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawals for account' });
  }
});

// ========================= DELETE ENDPOINTS =========================

// Delete borrower
app.delete('/api/borrowers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if borrower exists
    const borrower = await prisma.borrower.findUnique({
      where: { id },
      include: {
        loans: true,
        applications: true,
        repayments: true,
        savings: true
      }
    });

    if (!borrower) {
      return res.status(404).json({ error: 'Borrower not found' });
    }

    // Check for existing loans (prevent deletion if active loans exist)
    const activeLoans = borrower.loans.filter(loan => 
      loan.status === 'ACTIVE' || loan.status === 'PENDING'
    );

    if (activeLoans.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete borrower with active loans',
        details: `Borrower has ${activeLoans.length} active loan(s)`
      });
    }

    // Delete related records first (cascade delete)
    await prisma.$transaction(async (tx) => {
      // Delete repayments
      await tx.repayment.deleteMany({
        where: { borrowerId: id }
      });

      // Delete savings
      await tx.savings.deleteMany({
        where: { borrowerId: id }
      });

      // Delete loan applications
      await tx.loanApplication.deleteMany({
        where: { borrowerId: id }
      });

      // Delete closed loans
      await tx.loan.deleteMany({
        where: { 
          borrowerId: id,
          status: { in: ['CLOSED', 'PAID_OFF', 'REJECTED'] }
        }
      });

      // Finally delete the borrower
      await tx.borrower.delete({
        where: { id }
      });
    });

    res.json({ 
      message: 'Borrower deleted successfully',
      borrowerId: id 
    });

  } catch (error) {
    console.error('Error deleting borrower:', error);
    res.status(500).json({ 
      error: 'Failed to delete borrower',
      details: error.message 
    });
  }
});

// Delete loan
app.delete('/api/loans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if loan exists
    const loan = await prisma.loan.findUnique({
      where: { id },
      include: {
        repayments: true
      }
    });

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    // Only allow deletion of loans that are not active
    if (loan.status === 'ACTIVE') {
      return res.status(400).json({ 
        error: 'Cannot delete active loan',
        details: 'Active loans cannot be deleted. Consider marking as closed instead.'
      });
    }

    // Delete related repayments and then the loan
    await prisma.$transaction(async (tx) => {
      // Delete all repayments for this loan
      await tx.repayment.deleteMany({
        where: { loanId: id }
      });

      // Delete the loan
      await tx.loan.delete({
        where: { id }
      });
    });

    res.json({ 
      message: 'Loan deleted successfully',
      loanId: id 
    });

  } catch (error) {
    console.error('Error deleting loan:', error);
    res.status(500).json({ 
      error: 'Failed to delete loan',
      details: error.message 
    });
  }
});

// Bulk delete applications (must come before the /:id route)
app.delete('/api/applications/bulk', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid request: ids array is required' });
    }

    // Check for applications with associated loans
    const applicationsWithLoans = await prisma.loanApplication.findMany({
      where: { 
        id: { in: ids },
        loan: { isNot: null }
      },
      select: { id: true, applicationId: true }
    });

    if (applicationsWithLoans.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete applications with associated loans',
        details: `${applicationsWithLoans.length} application(s) have associated loans`,
        applicationIds: applicationsWithLoans.map(app => app.applicationId)
      });
    }

    // Delete the applications
    const result = await prisma.loanApplication.deleteMany({
      where: { id: { in: ids } }
    });

    res.json({ 
      success: true,
      message: `${result.count} application(s) deleted successfully`,
      deleted: result.count
    });

  } catch (error) {
    console.error('Error bulk deleting applications:', error);
    res.status(500).json({ 
      error: 'Failed to bulk delete applications',
      details: error.message 
    });
  }
});

// Delete loan application
app.delete('/api/applications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if application exists
    const application = await prisma.loanApplication.findUnique({
      where: { id },
      include: {
        loan: true
      }
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Prevent deletion if a loan has been created from this application
    if (application.loan) {
      return res.status(400).json({ 
        error: 'Cannot delete application with associated loan',
        details: 'This application has an associated loan record'
      });
    }

    // Delete the application
    await prisma.loanApplication.delete({
      where: { id }
    });

    res.json({ 
      message: 'Application deleted successfully',
      applicationId: id 
    });

  } catch (error) {
    console.error('Error deleting application:', error);
    res.status(500).json({ 
      error: 'Failed to delete application',
      details: error.message 
    });
  }
});

// Delete repayment
app.delete('/api/repayments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if repayment exists
    const repayment = await prisma.repayment.findUnique({
      where: { id },
      include: {
        loan: true
      }
    });

    if (!repayment) {
      return res.status(404).json({ error: 'Repayment not found' });
    }

    // When deleting a repayment, we need to update the loan's outstanding balance
    await prisma.$transaction(async (tx) => {
      // Delete the repayment
      await tx.repayment.delete({
        where: { id }
      });

      // Recalculate the loan's outstanding balance
      if (repayment.loan) {
        const remainingRepayments = await tx.repayment.findMany({
          where: { loanId: repayment.loanId }
        });

        const totalPaid = remainingRepayments.reduce((sum, rep) => sum + rep.amount, 0);
        const newOutstandingBalance = repayment.loan.totalAmount - totalPaid;

        await tx.loan.update({
          where: { id: repayment.loanId },
          data: {
            outstandingBalance: Math.max(0, newOutstandingBalance)
          }
        });
      }
    });

    res.json({ 
      message: 'Repayment deleted successfully',
      repaymentId: id 
    });

  } catch (error) {
    console.error('Error deleting repayment:', error);
    res.status(500).json({ 
      error: 'Failed to delete repayment',
      details: error.message 
    });
  }
});

// Delete savings account
app.delete('/api/savings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if savings account exists
    const savings = await prisma.savings.findUnique({
      where: { id }
    });

    if (!savings) {
      return res.status(404).json({ error: 'Savings account not found' });
    }

    // Check if there's a balance
    if (savings.balance > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete savings account with balance',
        details: `Account has a balance of ${savings.balance}. Please withdraw all funds first.`
      });
    }

    // Delete the savings account
    await prisma.savings.delete({
      where: { id }
    });

    res.json({ 
      message: 'Savings account deleted successfully',
      savingsId: id 
    });

  } catch (error) {
    console.error('Error deleting savings account:', error);
    res.status(500).json({ 
      error: 'Failed to delete savings account',
      details: error.message 
    });
  }
});

// Delete expense
app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if expense exists
    const expense = await prisma.expense.findUnique({
      where: { id }
    });

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Delete the expense
    await prisma.expense.delete({
      where: { id }
    });

    res.json({ 
      message: 'Expense deleted successfully',
      expenseId: id 
    });

  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ 
      error: 'Failed to delete expense',
      details: error.message 
    });
  }
});

// Delete saver
app.delete('/api/savers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if saver exists
    const saver = await prisma.saver.findUnique({
      where: { id }
    });

    if (!saver) {
      return res.status(404).json({ error: 'Saver not found' });
    }

    // Delete related deposits and withdrawals, then the saver
    await prisma.$transaction(async (tx) => {
      // Delete deposits for this account
      await tx.deposit.deleteMany({
        where: { accountId: saver.accountId }
      });

      // Delete withdrawals for this account
      await tx.withdrawal.deleteMany({
        where: { accountId: saver.accountId }
      });

      // Delete the saver
      await tx.saver.delete({
        where: { id }
      });
    });

    res.json({ 
      message: 'Saver deleted successfully',
      saverId: id 
    });

  } catch (error) {
    console.error('Error deleting saver:', error);
    res.status(500).json({ 
      error: 'Failed to delete saver',
      details: error.message 
    });
  }
});

// Delete deposit
app.delete('/api/deposits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if deposit exists
    const deposit = await prisma.deposit.findUnique({
      where: { id }
    });

    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    // Delete the deposit
    await prisma.deposit.delete({
      where: { id }
    });

    res.json({ 
      message: 'Deposit deleted successfully',
      depositId: id 
    });

  } catch (error) {
    console.error('Error deleting deposit:', error);
    res.status(500).json({ 
      error: 'Failed to delete deposit',
      details: error.message 
    });
  }
});

// Delete withdrawal
app.delete('/api/withdrawals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if withdrawal exists
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id }
    });

    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    // Delete the withdrawal
    await prisma.withdrawal.delete({
      where: { id }
    });

    res.json({ 
      message: 'Withdrawal deleted successfully',
      withdrawalId: id 
    });

  } catch (error) {
    console.error('Error deleting withdrawal:', error);
    res.status(500).json({ 
      error: 'Failed to delete withdrawal',
      details: error.message 
    });
  }
});

// Delete overdue record
app.delete('/api/overdue/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if overdue record exists
    const overdueRecord = await prisma.overdueRecord.findUnique({
      where: { id }
    });

    if (!overdueRecord) {
      return res.status(404).json({ error: 'Overdue record not found' });
    }

    // Delete the overdue record
    await prisma.overdueRecord.delete({
      where: { id }
    });

    res.json({ 
      message: 'Overdue record deleted successfully',
      recordId: id 
    });

  } catch (error) {
    console.error('Error deleting overdue record:', error);
    res.status(500).json({ 
      error: 'Failed to delete overdue record',
      details: error.message 
    });
  }
});

// Delete declined loan
app.delete('/api/declined-loans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if declined loan exists
    const declinedLoan = await prisma.declinedLoan.findUnique({
      where: { id }
    });

    if (!declinedLoan) {
      return res.status(404).json({ error: 'Declined loan record not found' });
    }

    // Delete the declined loan record
    await prisma.declinedLoan.delete({
      where: { id }
    });

    res.json({ 
      message: 'Declined loan record deleted successfully',
      recordId: id 
    });

  } catch (error) {
    console.error('Error deleting declined loan record:', error);
    res.status(500).json({ 
      error: 'Failed to delete declined loan record',
      details: error.message 
    });
  }
});

// Get all alerts
app.get('/api/alerts', async (req, res) => {
  try {
    // Fetch all alerts, ordered by creation date (newest first)
    const alerts = await prisma.alert.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Transform alerts to match frontend interface
    const formattedAlerts = alerts.map(alert => ({
      id: alert.id,
      alertId: alert.id,
      type: alert.type || 'system',
      title: alert.title || 'Notification',
      message: alert.message || '',
      timestamp: alert.createdAt.toISOString(),
      isRead: alert.isRead || false,
      priority: alert.priority || 'low',
      amount: alert.amount,
      reference: alert.reference
    }));

    res.json(formattedAlerts);

  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ 
      error: 'Failed to fetch alerts',
      details: error.message 
    });
  }
});

// Delete alert
app.delete('/api/alerts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if alert exists
    const alert = await prisma.alert.findUnique({
      where: { id }
    });

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Delete the alert
    await prisma.alert.delete({
      where: { id }
    });

    res.json({ 
      message: 'Alert deleted successfully',
      alertId: id 
    });

  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({ 
      error: 'Failed to delete alert',
      details: error.message 
    });
  }
});

// Bulk delete operations
app.delete('/api/alerts/bulk', async (req, res) => {
  try {
    const { ids, filter } = req.body;

    let deleteCount = 0;

    if (ids && Array.isArray(ids)) {
      // Delete specific alerts by IDs
      const result = await prisma.alert.deleteMany({
        where: {
          id: { in: ids }
        }
      });
      deleteCount = result.count;
    } else if (filter) {
      // Delete alerts by filter (e.g., all read alerts, alerts older than date)
      const whereClause = {};
      
      if (filter.isRead !== undefined) {
        whereClause.isRead = filter.isRead;
      }
      
      if (filter.type) {
        whereClause.type = filter.type;
      }
      
      if (filter.olderThan) {
        whereClause.createdAt = {
          lt: new Date(filter.olderThan)
        };
      }

      const result = await prisma.alert.deleteMany({
        where: whereClause
      });
      deleteCount = result.count;
    } else {
      return res.status(400).json({ 
        error: 'Invalid bulk delete request',
        details: 'Provide either ids array or filter object'
      });
    }

    res.json({ 
      message: `${deleteCount} alert(s) deleted successfully`,
      deletedCount: deleteCount 
    });

  } catch (error) {
    console.error('Error bulk deleting alerts:', error);
    res.status(500).json({ 
      error: 'Failed to bulk delete alerts',
      details: error.message 
    });
  }
});

// Start server
async function startServer() {
  const dbConnected = await testDatabaseConnection();
  if (!dbConnected) {
    console.error('Cannot start server - database connection failed');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`Quick Credit Backend API running on http://localhost:${PORT}`);
    console.log('Available endpoints:');
    console.log('- GET /api/health');
    console.log('- POST /api/auth/login');
    console.log('- POST /api/auth/logout');
    console.log('- POST /api/auth/refresh');
    console.log('- GET /api/auth/profile');
    console.log('- GET /api/borrowers');
    console.log('- DELETE /api/borrowers/:id');
    console.log('- GET /api/loans');
    console.log('- DELETE /api/loans/:id');
    console.log('- GET /api/repayments');
    console.log('- DELETE /api/repayments/:id');
    console.log('- GET /api/savings');
    console.log('- DELETE /api/savings/:id');
    console.log('- GET /api/expenses');
    console.log('- DELETE /api/expenses/:id');
    console.log('- GET /api/applications');
    console.log('- POST /api/applications');
    console.log('- DELETE /api/applications/:id');
    console.log('- GET /api/applications/stats');
    console.log('- GET /api/applications/pending');
    console.log('- POST /api/applications/:id/approve');
    console.log('- POST /api/applications/:id/reject');
    console.log('- GET /api/overdue');
    console.log('- DELETE /api/overdue/:id');
    console.log('- GET /api/savers');
    console.log('- DELETE /api/savers/:id');
    console.log('- GET /api/deposits');
    console.log('- DELETE /api/deposits/:id');
    console.log('- GET /api/withdrawals');
    console.log('- DELETE /api/withdrawals/:id');
    console.log('- DELETE /api/declined-loans/:id');
    console.log('- GET /api/alerts');
    console.log('- DELETE /api/alerts/:id');
    console.log('- DELETE /api/alerts/bulk');
    console.log('- GET /api/dashboard/stats');
    console.log('- GET /api/migration/status');
  });

  // Handle server errors
  server.on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
      console.log(`Port ${PORT} is already in use. Trying to restart...`);
      setTimeout(() => {
        server.close();
        server.listen(PORT);
      }, 1000);
    }
  });

  return server;
}

// Graceful shutdown
let serverInstance = null;

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (serverInstance) {
    serverInstance.close(() => {
      console.log('HTTP server closed.');
    });
  }
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  if (serverInstance) {
    serverInstance.close(() => {
      console.log('HTTP server closed.');
    });
  }
  await prisma.$disconnect();
  process.exit(0);
});

// Start the server
startServer().then(server => {
  serverInstance = server;
}).catch(console.error);