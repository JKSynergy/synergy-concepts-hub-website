import { Router } from 'express';
import { prisma } from '../config/database';
import { emailService } from '../services/emailService';
import { generateApplicationId, generateBorrowerId, generateLoanId } from '../utils/idGenerators';
// import { authentication } from '../middleware/auth';

const router = Router();

// Apply authentication middleware to all routes - COMMENTED OUT FOR DEVELOPMENT
// router.use(authentication);

// GET /api/applications - Get all loan applications
router.get('/', async (req, res) => {
  try {
    const { status, search, page = '1', limit = '12' } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {};
    
    if (status && status !== 'All') {
      where.status = (status as string).toUpperCase();
    }
    
    if (search) {
      where.OR = [
        { applicationId: { contains: search as string } },
        { fullName: { contains: search as string } },
        { phone: { contains: search as string } },
      ];
    }

    // Get applications with borrower details
    const applications = await prisma.loanApplication.findMany({
      where,
      include: {
        borrower: true,
      },
      orderBy: { submittedAt: 'desc' },
      skip,
      take: limitNum,
    });

    const total = await prisma.loanApplication.count({ where });

    return res.json({
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
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve applications'
    });
  }
});

// GET /api/applications/pending - Get only pending applications
router.get('/pending', async (req, res) => {
  try {
    const applications = await prisma.loanApplication.findMany({
      where: {
        status: 'PENDING'
      },
      include: {
        borrower: {
          select: {
            id: true,
            borrowerId: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            monthlyIncome: true,
            creditRating: true,
            district: true,
            occupation: true
          }
        }
      },
      orderBy: {
        submittedAt: 'desc'
      }
    });

    return res.json({
      success: true,
      data: applications,
      total: applications.length,
      message: 'Pending applications retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching pending applications:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve pending applications'
    });
  }
});

// GET /api/applications/stats - Get application statistics
router.get('/stats', async (req, res) => {
  try {
    const [total, pending, approved, rejected, underReview] = await Promise.all([
      prisma.loanApplication.count(),
      prisma.loanApplication.count({ where: { status: 'PENDING' } }),
      prisma.loanApplication.count({ where: { status: 'APPROVED' } }),
      prisma.loanApplication.count({ where: { status: 'REJECTED' } }),
      prisma.loanApplication.count({ where: { status: 'UNDER_REVIEW' } }),
    ]);

    // Calculate total requested amount
    const applications = await prisma.loanApplication.findMany({
      select: { requestedAmount: true }
    });
    const totalRequested = applications.reduce((sum, app) => sum + app.requestedAmount, 0);

    return res.json({
      success: true,
      data: {
        total,
        pending,
        approved,
        rejected,
        underReview,
        totalRequested,
        approvalRate: total > 0 ? ((approved / total) * 100).toFixed(2) : '0'
      },
      message: 'Application statistics retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching application stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve application statistics'
    });
  }
});

// POST /api/applications/bulk-approve - Bulk approve applications
router.post('/bulk-approve', async (req, res) => {
  try {
    const { applicationIds, approvedAmount } = req.body;

    if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Application IDs array is required'
      });
    }

    // Get the default admin user as loan officer
    const defaultUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    });

    if (!defaultUser) {
      return res.status(500).json({
        success: false,
        message: 'No admin user found. Please contact system administrator.'
      });
    }

    const results: {
      successful: Array<{ applicationId: string; loanId: string }>;
      failed: Array<{ applicationId: string; error: string }>;
    } = {
      successful: [],
      failed: []
    };

    // Process each application
    for (const applicationId of applicationIds) {
      try {
        // Get the application
        const application = await prisma.loanApplication.findUnique({
          where: { id: applicationId },
          include: { borrower: true }
        });

        if (!application) {
          results.failed.push({
            applicationId,
            error: 'Application not found'
          });
          continue;
        }

        if (application.status !== 'PENDING') {
          results.failed.push({
            applicationId,
            error: 'Application is not pending'
          });
          continue;
        }

        // Calculate automatic interest rate based on loan amount
        const calculateInterestRate = (amount: number): number => {
          if (amount < 500000) {
            return 20; // Below 500k UGX = 20%
          } else if (amount >= 500000 && amount < 2000000) {
            return 15; // 500k-2M UGX = 15%
          } else if (amount >= 2000000 && amount < 5000000) {
            return 12; // 2M-5M UGX = 12%
          } else {
            return 10; // 5M+ UGX = 10%
          }
        };

        // Use provided approved amount or requested amount
        const principal = approvedAmount || application.requestedAmount;
        const interestRate = calculateInterestRate(principal); // Use automatic calculation
        const termMonths = application.termMonths;
        
        // Calculate loan terms
        const monthlyInterestRate = interestRate / 100 / 12;
        const monthlyPayment = principal * (monthlyInterestRate * Math.pow(1 + monthlyInterestRate, termMonths)) / (Math.pow(1 + monthlyInterestRate, termMonths) - 1);
        const totalAmount = monthlyPayment * termMonths;
        const totalInterest = totalAmount - principal;

        // Calculate next payment date (30 days from now)
        const nextPaymentDate = new Date();
        nextPaymentDate.setDate(nextPaymentDate.getDate() + 30);

        // Start transaction for this application
        await prisma.$transaction(async (prisma) => {
          // Update the application
          const updatedApplication = await prisma.loanApplication.update({
            where: { id: applicationId },
            data: {
              status: 'APPROVED',
              reviewedAt: new Date(),
              approvedAmount: principal,
              reviewedById: defaultUser.id
            }
          });

          // Generate loan ID
          const loanId = await generateLoanId();

          // Create the loan record
          await prisma.loan.create({
            data: {
              loanId,
              applicationId: updatedApplication.id,
              borrowerId: updatedApplication.borrowerId,
              loanOfficerId: defaultUser.id,
              principal,
              interestRate,
              termMonths,
              totalInterest,
              totalAmount,
              monthlyPayment,
              status: 'APPROVED',
              purpose: updatedApplication.purpose,
              outstandingBalance: totalAmount,
              nextPaymentDate,
              nextPaymentAmount: monthlyPayment
            }
          });

          // Update borrower's credit rating if this is their first loan
          const borrowerLoanCount = await prisma.loan.count({
            where: { borrowerId: updatedApplication.borrowerId }
          });

          if (borrowerLoanCount === 1) {
            await prisma.borrower.update({
              where: { id: updatedApplication.borrowerId },
              data: { creditRating: 'FAIR' }
            });
          }
        });

        results.successful.push({
          applicationId,
          loanId: await generateLoanId()
        });

      } catch (error) {
        console.error(`Error approving application ${applicationId}:`, error);
        results.failed.push({
          applicationId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return res.json({
      success: true,
      data: results,
      message: `Bulk approval completed. ${results.successful.length} approved, ${results.failed.length} failed.`
    });

  } catch (error) {
    console.error('Error in bulk approval:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process bulk approval'
    });
  }
});

// GET /api/applications/:id - Get application by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const application = await prisma.loanApplication.findUnique({
      where: { id },
      include: {
        borrower: true,
      },
    });
    
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }
    
    return res.json({
      success: true,
      data: application,
      message: 'Application retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching application:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve application'
    });
  }
});

// POST /api/applications - Create new loan application
router.post('/', async (req, res) => {
  try {
    const {
      applicationId: providedApplicationId,
      fullName,
      dateOfBirth,
      nationalId,
      phoneNumber,
      emailAddress,
      residentialAddress,
      employmentStatus,
      employerBusinessName,
      monthlyIncome,
      requestedLoanAmount,
      interestRate,
      loanTerm,
      purposeOfLoan,
      collateral,
      guarantorName,
      guarantorId,
      guarantorPhone,
      guarantorRelation,
      verifyEmployment,
      receiveNotifications
    } = req.body;

    // Validate required fields
    if (!fullName || !phoneNumber || !requestedLoanAmount || !loanTerm || !purposeOfLoan) {
      return res.status(400).json({
        success: false,
        message: 'Required fields are missing: fullName, phoneNumber, requestedLoanAmount, loanTerm, purposeOfLoan'
      });
    }

    // Parse the full name
    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Check if borrower already exists by phone number
    let borrower = await prisma.borrower.findUnique({
      where: { phone: phoneNumber }
    });

    // If borrower doesn't exist, create one
    if (!borrower) {
      const borrowerId = await generateBorrowerId();
      
      // Get the default admin user to set as creator
      const defaultUser = await prisma.user.findFirst({
        where: { role: 'ADMIN' }
      });

      if (!defaultUser) {
        return res.status(500).json({
          success: false,
          message: 'No admin user found. Please contact system administrator.'
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
          district: residentialAddress ? residentialAddress.split(',')[0]?.trim() : null,
          occupation: employerBusinessName || employmentStatus || null,
          monthlyIncome: monthlyIncome ? parseFloat(monthlyIncome) : null,
          creditRating: 'NO_CREDIT',
          status: 'ACTIVE',
          createdById: defaultUser.id
        }
      });
    }

    // Use provided application ID or generate a new one
    const applicationId = providedApplicationId || await generateApplicationId();

    // Calculate automatic interest rate based on loan amount
    const calculateInterestRate = (amount: number): number => {
      if (amount < 500000) {
        return 20; // Below 500k UGX = 20%
      } else if (amount >= 500000 && amount < 2000000) {
        return 15; // 500k-2M UGX = 15%
      } else if (amount >= 2000000 && amount < 5000000) {
        return 12; // 2M-5M UGX = 12%
      } else {
        return 10; // 5M+ UGX = 10%
      }
    };

    // Calculate interest rate automatically based on loan amount
    const loanAmount = parseFloat(requestedLoanAmount);
    let finalInterestRate = calculateInterestRate(loanAmount);
    
    // Allow manual override if provided and valid
    if (interestRate && interestRate !== 'SELECT RATE...' && !isNaN(parseFloat(interestRate))) {
      const manualRate = parseFloat(interestRate);
      // Only allow manual rate if it's one of the valid options
      if ([10, 12, 15, 20].includes(manualRate)) {
        finalInterestRate = manualRate;
      }
    }

    // Create the loan application
    const application = await prisma.loanApplication.create({
      data: {
        applicationId,
        borrowerId: borrower.id,
        requestedAmount: parseFloat(requestedLoanAmount),
        purpose: purposeOfLoan,
        collateral: collateral || null,
        guarantorName: guarantorName || null,
        guarantorId: guarantorId || null,
        guarantorPhone: guarantorPhone || null,
        guarantorRelation: guarantorRelation || null,
        termMonths: parseInt(loanTerm),
        status: 'PENDING',
        submittedAt: new Date()
      },
      include: {
        borrower: true
      }
    });

    // Send email notifications
    try {
      await emailService.sendApplicationSubmittedEmails({
        applicationId: application.applicationId,
        requestedAmount: application.requestedAmount,
        termMonths: application.termMonths,
        purpose: application.purpose,
        submittedAt: application.submittedAt,
        borrower: {
          firstName: borrower.firstName,
          lastName: borrower.lastName,
          email: borrower.email,
          phone: borrower.phone,
          borrowerId: borrower.borrowerId
        }
      });
    } catch (emailError) {
      console.error('Failed to send application confirmation emails:', emailError);
      // Don't fail the application creation if email fails
    }

    return res.status(201).json({
      success: true,
      data: {
        ...application,
        applicationId: application.applicationId,
        collateral: application.collateral,
        guarantorName: application.guarantorName,
        guarantorId: application.guarantorId,
        guarantorPhone: application.guarantorPhone,
        guarantorRelation: application.guarantorRelation,
        borrower: {
          id: borrower.id,
          borrowerId: borrower.borrowerId,
          firstName: borrower.firstName,
          lastName: borrower.lastName,
          phone: borrower.phone,
          email: borrower.email
        }
      },
      message: `Application ${application.applicationId} created successfully`
    });

  } catch (error) {
    console.error('Error creating application:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create application'
    });
  }
});

// PUT /api/applications/:id - Update application
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // TODO: Implement update application logic
    res.json({
      success: true,
      data: null,
      message: 'Application updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update application'
    });
  }
});

// PUT /api/applications/:id/approve - Approve application
router.put('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { approvedAmount, reviewNotes } = req.body;
    
    // Validate approved amount
    if (!approvedAmount || approvedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid approved amount is required'
      });
    }

    // Get the application first
    const existingApplication = await prisma.loanApplication.findUnique({
      where: { id },
      include: { borrower: true }
    });

    if (!existingApplication) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    if (existingApplication.status === 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: 'Application is already approved'
      });
    }

    // Get the default admin user as loan officer
    const defaultUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    });

    if (!defaultUser) {
      return res.status(500).json({
        success: false,
        message: 'No admin user found. Please contact system administrator.'
      });
    }

    // Calculate automatic interest rate based on loan amount
    const calculateInterestRate = (amount: number): number => {
      if (amount < 500000) {
        return 20; // Below 500k UGX = 20%
      } else if (amount >= 500000 && amount < 2000000) {
        return 15; // 500k-2M UGX = 15%
      } else if (amount >= 2000000 && amount < 5000000) {
        return 12; // 2M-5M UGX = 12%
      } else {
        return 10; // 5M+ UGX = 10%
      }
    };

    // Calculate loan terms
    const principal = parseFloat(approvedAmount);
    const interestRate = calculateInterestRate(principal); // Use automatic calculation
    const termMonths = existingApplication.termMonths;
    
    // Calculate total interest and amounts
    const monthlyInterestRate = interestRate / 100 / 12;
    const monthlyPayment = principal * (monthlyInterestRate * Math.pow(1 + monthlyInterestRate, termMonths)) / (Math.pow(1 + monthlyInterestRate, termMonths) - 1);
    const totalAmount = monthlyPayment * termMonths;
    const totalInterest = totalAmount - principal;

    // Calculate next payment date (30 days from now)
    const nextPaymentDate = new Date();
    nextPaymentDate.setDate(nextPaymentDate.getDate() + 30);

    // Start database transaction
    const result = await prisma.$transaction(async (prisma) => {
      // Update the application status
      const updatedApplication = await prisma.loanApplication.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          approvedAmount: principal,
          reviewedById: defaultUser.id
        },
        include: {
          borrower: true,
        },
      });

      // Generate loan ID
      const loanId = await generateLoanId();

      // Create the loan record
      const loan = await prisma.loan.create({
        data: {
          loanId,
          applicationId: updatedApplication.id,
          borrowerId: updatedApplication.borrowerId,
          loanOfficerId: defaultUser.id,
          principal,
          interestRate,
          termMonths,
          totalInterest,
          totalAmount,
          monthlyPayment,
          status: 'APPROVED',
          purpose: updatedApplication.purpose,
          outstandingBalance: totalAmount,
          nextPaymentDate,
          nextPaymentAmount: monthlyPayment
        },
        include: {
          borrower: true,
          loanOfficer: true
        }
      });

      // Update borrower's credit rating if this is their first loan
      const borrowerLoanCount = await prisma.loan.count({
        where: { borrowerId: updatedApplication.borrowerId }
      });

      if (borrowerLoanCount === 1) {
        await prisma.borrower.update({
          where: { id: updatedApplication.borrowerId },
          data: { creditRating: 'FAIR' }
        });
      }

      return { application: updatedApplication, loan };
    });

    // Send email notifications for approval
    try {
      await emailService.sendApplicationApprovedEmails(
        {
          applicationId: result.application.applicationId,
          requestedAmount: result.application.requestedAmount,
          termMonths: result.application.termMonths,
          purpose: result.application.purpose,
          submittedAt: result.application.submittedAt,
          borrower: {
            firstName: result.application.borrower.firstName,
            lastName: result.application.borrower.lastName,
            email: result.application.borrower.email,
            phone: result.application.borrower.phone,
            borrowerId: result.application.borrower.borrowerId
          }
        },
        {
          loanId: result.loan.loanId,
          principal: result.loan.principal,
          interestRate: result.loan.interestRate,
          termMonths: result.loan.termMonths,
          totalAmount: result.loan.totalAmount,
          monthlyPayment: result.loan.monthlyPayment,
          nextPaymentDate: result.loan.nextPaymentDate,
          status: result.loan.status
        }
      );
    } catch (emailError) {
      console.error('Failed to send loan approval emails:', emailError);
      // Don't fail the approval if email fails
    }
    
    return res.json({
      success: true,
      data: {
        application: result.application,
        loan: {
          id: result.loan.id,
          loanId: result.loan.loanId,
          principal: result.loan.principal,
          interestRate: result.loan.interestRate,
          termMonths: result.loan.termMonths,
          monthlyPayment: result.loan.monthlyPayment,
          totalAmount: result.loan.totalAmount,
          status: result.loan.status,
          nextPaymentDate: result.loan.nextPaymentDate,
          nextPaymentAmount: result.loan.nextPaymentAmount
        }
      },
      message: `Application approved successfully. Loan ${result.loan.loanId} has been created.`
    });
    
  } catch (error) {
    console.error('Error approving application:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve application'
    });
  }
});

// PUT /api/applications/:id/reject - Reject application
router.put('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    
    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }
    
    const application = await prisma.loanApplication.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        rejectionReason,
      },
      include: {
        borrower: true,
      },
    });

    // Send email notifications for rejection
    try {
      await emailService.sendApplicationRejectedEmails(
        {
          applicationId: application.applicationId,
          requestedAmount: application.requestedAmount,
          termMonths: application.termMonths,
          purpose: application.purpose,
          submittedAt: application.submittedAt,
          borrower: {
            firstName: application.borrower.firstName,
            lastName: application.borrower.lastName,
            email: application.borrower.email,
            phone: application.borrower.phone,
            borrowerId: application.borrower.borrowerId
          }
        },
        rejectionReason
      );
    } catch (emailError) {
      console.error('Failed to send loan rejection emails:', emailError);
      // Don't fail the rejection if email fails
    }
    
    return res.json({
      success: true,
      data: application,
      message: 'Application rejected successfully'
    });
  } catch (error) {
    console.error('Error rejecting application:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject application'
    });
  }
});

export default router;