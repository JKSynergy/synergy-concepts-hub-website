import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';

const prisma = new PrismaClient();

export interface ReportFilter {
  startDate?: Date;
  endDate?: Date;
  borrowerId?: string;
  loanStatus?: string;
  branchId?: string;
  loanOfficerId?: string;
}

export interface FinancialSummary {
  totalDisbursed: number;
  totalRepayments: number;
  outstandingBalance: number;
  totalInterest: number;
  totalFees: number;
  netProfit: number;
  collectionRate: number;
}

export interface LoanPortfolioReport {
  summary: FinancialSummary;
  loansByStatus: Record<string, number>;
  loansByAmount: Record<string, number>;
  monthlyTrends: Array<{
    month: string;
    disbursements: number;
    repayments: number;
    newLoans: number;
  }>;
  topBorrowers: Array<{
    borrower: any;
    totalBorrowed: number;
    totalRepaid: number;
    currentBalance: number;
  }>;
}

export interface RepaymentReport {
  summary: {
    totalRepayments: number;
    totalAmount: number;
    averagePayment: number;
    onTimePayments: number;
    latePayments: number;
  };
  paymentMethods: Record<string, { count: number; amount: number }>;
  monthlyRepayments: Array<{
    month: string;
    count: number;
    amount: number;
    averageAmount: number;
  }>;
  overdueAnalysis: {
    totalOverdue: number;
    overdueAmount: number;
    byAgeGroup: Record<string, { count: number; amount: number }>;
  };
}

export interface BorrowerReport {
  summary: {
    totalBorrowers: number;
    activeBorrowers: number;
    newBorrowers: number;
    averageLoanSize: number;
  };
  demographics: {
    byGender: Record<string, number>;
    byAge: Record<string, number>;
    byLocation: Record<string, number>;
  };
  creditProfile: {
    excellentCredit: number;
    goodCredit: number;
    fairCredit: number;
    poorCredit: number;
  };
}

export class ReportsService {
  // Generate comprehensive loan portfolio report
  async generateLoanPortfolioReport(filter: ReportFilter = {}): Promise<LoanPortfolioReport> {
    try {
      const { startDate, endDate, borrowerId, loanStatus } = filter;
      
      // Base query conditions
      const whereConditions: any = {};
      if (startDate && endDate) {
        whereConditions.createdAt = {
          gte: startDate,
          lte: endDate
        };
      }
      if (borrowerId) whereConditions.borrowerId = borrowerId;
      if (loanStatus) whereConditions.status = loanStatus;

      // Get financial summary
      const [
        totalDisbursedResult,
        totalRepaymentsResult,
        outstandingBalanceResult,
        totalInterestResult,
        totalFeesResult
      ] = await Promise.all([
        prisma.loan.aggregate({
          where: whereConditions,
          _sum: { disbursedAmount: true }
        }),
        prisma.repayment.aggregate({
          where: {
            loan: whereConditions,
            ...(startDate && endDate ? { paidAt: { gte: startDate, lte: endDate } } : {})
          },
          _sum: { amount: true }
        }),
        prisma.loan.aggregate({
          where: { ...whereConditions, status: 'ACTIVE' },
          _sum: { outstandingBalance: true }
        }),
        prisma.loan.aggregate({
          where: whereConditions,
          _sum: { totalInterest: true }
        }),
        prisma.expense.aggregate({
          where: {
            ...(startDate && endDate ? { createdAt: { gte: startDate, lte: endDate } } : {})
          },
          _sum: { amount: true }
        })
      ]);

      const totalDisbursed = totalDisbursedResult._sum.disbursedAmount || 0;
      const totalRepayments = totalRepaymentsResult._sum.amount || 0;
      const outstandingBalance = outstandingBalanceResult._sum.outstandingBalance || 0;
      const totalInterest = totalInterestResult._sum.totalInterest || 0;
      const totalFees = totalFeesResult._sum.amount || 0;

      const summary: FinancialSummary = {
        totalDisbursed: Number(totalDisbursed),
        totalRepayments: Number(totalRepayments),
        outstandingBalance: Number(outstandingBalance),
        totalInterest: Number(totalInterest),
        totalFees: Number(totalFees),
        netProfit: Number(totalRepayments) - Number(totalDisbursed) - Number(totalFees),
        collectionRate: Number(totalDisbursed) > 0 ? (Number(totalRepayments) / Number(totalDisbursed)) * 100 : 0
      };

      // Get loans by status
      const loansByStatusResult = await prisma.loan.groupBy({
        where: whereConditions,
        by: ['status'],
        _count: { status: true }
      });

      const loansByStatus: Record<string, number> = {};
      loansByStatusResult.forEach(item => {
        loansByStatus[item.status] = item._count.status;
      });

      // Get loans by amount ranges
      const loansByAmountResult = await prisma.$queryRaw<Array<{ range: string; count: number }>>`
        SELECT 
          CASE 
            WHEN "principal" < 100000 THEN 'Under 100K'
            WHEN "principal" < 500000 THEN '100K - 500K'
            WHEN "principal" < 1000000 THEN '500K - 1M'
            WHEN "principal" < 5000000 THEN '1M - 5M'
            ELSE 'Over 5M'
          END as range,
          COUNT(*)::integer as count
        FROM "loans"
        ${whereConditions ? 'WHERE ' + this.buildWhereClause(whereConditions) : ''}
        GROUP BY range
        ORDER BY MIN("principal")
      `;

      const loansByAmount: Record<string, number> = {};
      loansByAmountResult.forEach(item => {
        loansByAmount[item.range] = item.count;
      });

      // Get monthly trends (last 12 months)
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const monthlyTrends = await prisma.$queryRaw<Array<{
        month: string;
        disbursements: number;
        repayments: number;
        newLoans: number;
      }>>`
        SELECT 
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
          COALESCE(SUM(CASE WHEN "disbursedAt" IS NOT NULL THEN "disbursedAmount" ELSE 0 END), 0)::float as disbursements,
          0::float as repayments,
          COUNT(*)::integer as newLoans
        FROM "loans"
        WHERE "createdAt" >= ${twelveMonthsAgo}
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month ASC
      `;

      // Get repayments by month
      const monthlyRepaymentsResult = await prisma.$queryRaw<Array<{
        month: string;
        repayments: number;
      }>>`
        SELECT 
          TO_CHAR(DATE_TRUNC('month', "paidAt"), 'YYYY-MM') as month,
          COALESCE(SUM("amount"), 0)::float as repayments
        FROM "repayments"
        WHERE "paidAt" >= ${twelveMonthsAgo}
        GROUP BY DATE_TRUNC('month', "paidAt")
        ORDER BY month ASC
      `;

      // Merge repayments into monthly trends
      monthlyRepaymentsResult.forEach(repayment => {
        const trend = monthlyTrends.find(t => t.month === repayment.month);
        if (trend) {
          trend.repayments = repayment.repayments;
        }
      });

      // Get top borrowers
      const topBorrowersResult = await prisma.$queryRaw<Array<{
        borrowerId: string;
        totalBorrowed: number;
        totalRepaid: number;
        currentBalance: number;
      }>>`
        SELECT 
          l."borrowerId",
          SUM(l."disbursedAmount")::float as "totalBorrowed",
          COALESCE(SUM(r."amount"), 0)::float as "totalRepaid",
          SUM(l."outstandingBalance")::float as "currentBalance"
        FROM "loans" l
        LEFT JOIN "repayments" r ON l."id" = r."loanId"
        GROUP BY l."borrowerId"
        ORDER BY "totalBorrowed" DESC
        LIMIT 10
      `;

      const topBorrowers = await Promise.all(
        topBorrowersResult.map(async (item) => {
          const borrower = await prisma.borrower.findUnique({
            where: { id: item.borrowerId },
            select: {
              borrowerId: true,
              firstName: true,
              lastName: true,
              phone: true
            }
          });
          return {
            borrower,
            totalBorrowed: item.totalBorrowed,
            totalRepaid: item.totalRepaid,
            currentBalance: item.currentBalance
          };
        })
      );

      return {
        summary,
        loansByStatus,
        loansByAmount,
        monthlyTrends,
        topBorrowers
      };

    } catch (error) {
      logger.error('Failed to generate loan portfolio report', { error, filter });
      throw error;
    }
  }

  // Generate repayment analysis report
  async generateRepaymentReport(filter: ReportFilter = {}): Promise<RepaymentReport> {
    try {
      const { startDate, endDate } = filter;
      
      const whereConditions: any = {};
      if (startDate && endDate) {
        whereConditions.paidAt = {
          gte: startDate,
          lte: endDate
        };
      }

      // Get repayment summary
      const [totalRepaymentsResult, onTimePaymentsResult, latePaymentsResult] = await Promise.all([
        prisma.repayment.aggregate({
          where: whereConditions,
          _count: { id: true },
          _sum: { amount: true },
          _avg: { amount: true }
        }),
        prisma.repayment.count({
          where: {
            ...whereConditions,
            status: 'COMPLETED'
          }
        }),
        prisma.repayment.count({
          where: {
            ...whereConditions,
            status: 'LATE'
          }
        })
      ]);

      const summary = {
        totalRepayments: totalRepaymentsResult._count.id,
        totalAmount: Number(totalRepaymentsResult._sum.amount || 0),
        averagePayment: Number(totalRepaymentsResult._avg.amount || 0),
        onTimePayments: onTimePaymentsResult,
        latePayments: latePaymentsResult
      };

      // Get payment methods distribution
      const paymentMethodsResult = await prisma.repayment.groupBy({
        where: whereConditions,
        by: ['paymentMethod'],
        _count: { paymentMethod: true },
        _sum: { amount: true }
      });

      const paymentMethods: Record<string, { count: number; amount: number }> = {};
      paymentMethodsResult.forEach(item => {
        paymentMethods[item.paymentMethod] = {
          count: item._count.paymentMethod,
          amount: Number(item._sum.amount || 0)
        };
      });

      // Get monthly repayments
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const monthlyRepayments = await prisma.$queryRaw<Array<{
        month: string;
        count: number;
        amount: number;
        averageAmount: number;
      }>>`
        SELECT 
          TO_CHAR(DATE_TRUNC('month', "paidAt"), 'YYYY-MM') as month,
          COUNT(*)::integer as count,
          SUM("amount")::float as amount,
          AVG("amount")::float as "averageAmount"
        FROM "repayments"
        WHERE "paidAt" >= ${sixMonthsAgo}
        GROUP BY DATE_TRUNC('month', "paidAt")
        ORDER BY month ASC
      `;

      // Get overdue analysis
      const overdueLoans = await prisma.loan.findMany({
        where: {
          status: 'ACTIVE',
          nextPaymentDate: { lt: new Date() }
        },
        select: {
          id: true,
          outstandingBalance: true,
          nextPaymentDate: true
        }
      });

      const overdueByAgeGroup: Record<string, { count: number; amount: number }> = {
        '1-30 days': { count: 0, amount: 0 },
        '31-60 days': { count: 0, amount: 0 },
        '61-90 days': { count: 0, amount: 0 },
        'Over 90 days': { count: 0, amount: 0 }
      };

      let totalOverdueAmount = 0;

      overdueLoans.forEach(loan => {
        const daysPastDue = Math.floor(
          (new Date().getTime() - new Date(loan.nextPaymentDate!).getTime()) / (1000 * 60 * 60 * 24)
        );
        
        const amount = Number(loan.outstandingBalance);
        totalOverdueAmount += amount;

        if (daysPastDue <= 30) {
          overdueByAgeGroup['1-30 days'].count++;
          overdueByAgeGroup['1-30 days'].amount += amount;
        } else if (daysPastDue <= 60) {
          overdueByAgeGroup['31-60 days'].count++;
          overdueByAgeGroup['31-60 days'].amount += amount;
        } else if (daysPastDue <= 90) {
          overdueByAgeGroup['61-90 days'].count++;
          overdueByAgeGroup['61-90 days'].amount += amount;
        } else {
          overdueByAgeGroup['Over 90 days'].count++;
          overdueByAgeGroup['Over 90 days'].amount += amount;
        }
      });

      const overdueAnalysis = {
        totalOverdue: overdueLoans.length,
        overdueAmount: totalOverdueAmount,
        byAgeGroup: overdueByAgeGroup
      };

      return {
        summary,
        paymentMethods,
        monthlyRepayments,
        overdueAnalysis
      };

    } catch (error) {
      logger.error('Failed to generate repayment report', { error, filter });
      throw error;
    }
  }

  // Generate borrower demographics report
  async generateBorrowerReport(filter: ReportFilter = {}): Promise<BorrowerReport> {
    try {
      const { startDate, endDate } = filter;
      
      const whereConditions: any = {};
      if (startDate && endDate) {
        whereConditions.createdAt = {
          gte: startDate,
          lte: endDate
        };
      }

      // Get borrower summary
      const [totalBorrowers, activeBorrowers, newBorrowers, avgLoanSize] = await Promise.all([
        prisma.borrower.count({ where: whereConditions }),
        prisma.borrower.count({ 
          where: { 
            ...whereConditions, 
            status: 'ACTIVE' 
          } 
        }),
        prisma.borrower.count({
          where: {
            createdAt: {
              gte: new Date(new Date().setMonth(new Date().getMonth() - 1))
            }
          }
        }),
        prisma.loan.aggregate({
          _avg: { principal: true }
        })
      ]);

      const summary = {
        totalBorrowers,
        activeBorrowers,
        newBorrowers,
        averageLoanSize: Number(avgLoanSize._avg.principal || 0)
      };

      // Get demographics by gender
      const genderResult = await prisma.borrower.groupBy({
        where: whereConditions,
        by: ['gender'],
        _count: { gender: true }
      });

      const byGender: Record<string, number> = {};
      genderResult.forEach(item => {
        byGender[item.gender || 'Unknown'] = item._count.gender;
      });

      // Get demographics by age groups
      const ageGroupResult = await prisma.$queryRaw<Array<{ ageGroup: string; count: number }>>`
        SELECT 
          CASE 
            WHEN EXTRACT(YEAR FROM AGE("dateOfBirth")) < 25 THEN 'Under 25'
            WHEN EXTRACT(YEAR FROM AGE("dateOfBirth")) < 35 THEN '25-34'
            WHEN EXTRACT(YEAR FROM AGE("dateOfBirth")) < 45 THEN '35-44'
            WHEN EXTRACT(YEAR FROM AGE("dateOfBirth")) < 55 THEN '45-54'
            ELSE '55+'
          END as "ageGroup",
          COUNT(*)::integer as count
        FROM "borrowers"
        WHERE "dateOfBirth" IS NOT NULL
        GROUP BY "ageGroup"
        ORDER BY MIN(EXTRACT(YEAR FROM AGE("dateOfBirth")))
      `;

      const byAge: Record<string, number> = {};
      ageGroupResult.forEach(item => {
        byAge[item.ageGroup] = item.count;
      });

      // Get demographics by location (district)
      const locationResult = await prisma.borrower.groupBy({
        where: whereConditions,
        by: ['district'],
        _count: { district: true }
      });

      const byLocation: Record<string, number> = {};
      locationResult.forEach(item => {
        byLocation[item.district || 'Unknown'] = item._count.district;
      });

      // Calculate credit profiles based on loan performance
      const creditProfileResult = await prisma.$queryRaw<Array<{ creditProfile: string; count: number }>>`
        SELECT 
          CASE 
            WHEN AVG(CASE WHEN l."status" = 'CLOSED' AND r."paidAt" <= l."nextPaymentDate" THEN 1 ELSE 0 END) >= 0.95 THEN 'Excellent'
            WHEN AVG(CASE WHEN l."status" = 'CLOSED' AND r."paidAt" <= l."nextPaymentDate" THEN 1 ELSE 0 END) >= 0.85 THEN 'Good'
            WHEN AVG(CASE WHEN l."status" = 'CLOSED' AND r."paidAt" <= l."nextPaymentDate" THEN 1 ELSE 0 END) >= 0.70 THEN 'Fair'
            ELSE 'Poor'
          END as "creditProfile",
          COUNT(DISTINCT b."id")::integer as count
        FROM "borrowers" b
        LEFT JOIN "loans" l ON b."id" = l."borrowerId"
        LEFT JOIN "repayments" r ON l."id" = r."loanId"
        WHERE l."id" IS NOT NULL
        GROUP BY b."id"
        HAVING COUNT(l."id") > 0
      `;

      const creditProfile = {
        excellentCredit: 0,
        goodCredit: 0,
        fairCredit: 0,
        poorCredit: 0
      };

      creditProfileResult.forEach(item => {
        switch (item.creditProfile) {
          case 'Excellent':
            creditProfile.excellentCredit = item.count;
            break;
          case 'Good':
            creditProfile.goodCredit = item.count;
            break;
          case 'Fair':
            creditProfile.fairCredit = item.count;
            break;
          case 'Poor':
            creditProfile.poorCredit = item.count;
            break;
        }
      });

      return {
        summary,
        demographics: {
          byGender,
          byAge,
          byLocation
        },
        creditProfile
      };

    } catch (error) {
      logger.error('Failed to generate borrower report', { error, filter });
      throw error;
    }
  }

  // Export report data to CSV format
  async exportToCSV(reportType: 'loans' | 'repayments' | 'borrowers', filter: ReportFilter = {}): Promise<string> {
    try {
      let csvData = '';
      
      switch (reportType) {
        case 'loans':
          const loans = await prisma.loan.findMany({
            where: this.buildLoanWhereClause(filter),
            include: {
              borrower: {
                select: {
                  borrowerId: true,
                  firstName: true,
                  lastName: true,
                  phone: true
                }
              }
            }
          });

          csvData = 'Loan ID,Borrower ID,Borrower Name,Phone,Principal,Interest Rate,Term,Status,Disbursed Amount,Outstanding Balance,Created Date,Disbursed Date\n';
          loans.forEach(loan => {
            csvData += `${loan.loanId},${loan.borrower.borrowerId},"${loan.borrower.firstName} ${loan.borrower.lastName}",${loan.borrower.phone},${loan.principal},${loan.interestRate},${loan.termMonths},${loan.status},${loan.disbursedAmount || 0},${loan.outstandingBalance},${loan.createdAt.toISOString()},${loan.disbursedAt?.toISOString() || ''}\n`;
          });
          break;

        case 'repayments':
          const repayments = await prisma.repayment.findMany({
            where: this.buildRepaymentWhereClause(filter),
            include: {
              borrower: {
                select: {
                  borrowerId: true,
                  firstName: true,
                  lastName: true
                }
              },
              loan: {
                select: {
                  loanId: true
                }
              }
            }
          });

          csvData = 'Receipt No,Loan ID,Borrower ID,Borrower Name,Amount,Payment Method,Status,Paid Date,Transaction ID\n';
          repayments.forEach(repayment => {
            csvData += `${repayment.receiptNumber},${repayment.loan.loanId},${repayment.borrower.borrowerId},"${repayment.borrower.firstName} ${repayment.borrower.lastName}",${repayment.amount},${repayment.paymentMethod},${repayment.status},${repayment.paidAt.toISOString()},${repayment.transactionId || ''}\n`;
          });
          break;

        case 'borrowers':
          const borrowers = await prisma.borrower.findMany({
            where: this.buildBorrowerWhereClause(filter)
          });

          csvData = 'Borrower ID,First Name,Last Name,Phone,Email,Gender,Date of Birth,District,Status,Created Date\n';
          borrowers.forEach(borrower => {
            csvData += `${borrower.borrowerId},"${borrower.firstName}","${borrower.lastName}",${borrower.phone},${borrower.email || ''},${borrower.gender || ''},${borrower.dateOfBirth?.toISOString() || ''},${borrower.district || ''},${borrower.status},${borrower.createdAt.toISOString()}\n`;
          });
          break;
      }

      return csvData;

    } catch (error) {
      logger.error('Failed to export report to CSV', { error, reportType, filter });
      throw error;
    }
  }

  // Helper methods for building where clauses
  private buildWhereClause(conditions: any): string {
    // This is a simplified version - in production, you'd want proper SQL injection protection
    const clauses = [];
    for (const [key, value] of Object.entries(conditions)) {
      if (typeof value === 'string') {
        clauses.push(`"${key}" = '${value}'`);
      } else {
        clauses.push(`"${key}" = ${value}`);
      }
    }
    return clauses.join(' AND ');
  }

  private buildLoanWhereClause(filter: ReportFilter): any {
    const where: any = {};
    if (filter.startDate && filter.endDate) {
      where.createdAt = { gte: filter.startDate, lte: filter.endDate };
    }
    if (filter.borrowerId) where.borrowerId = filter.borrowerId;
    if (filter.loanStatus) where.status = filter.loanStatus;
    return where;
  }

  private buildRepaymentWhereClause(filter: ReportFilter): any {
    const where: any = {};
    if (filter.startDate && filter.endDate) {
      where.paidAt = { gte: filter.startDate, lte: filter.endDate };
    }
    return where;
  }

  private buildBorrowerWhereClause(filter: ReportFilter): any {
    const where: any = {};
    if (filter.startDate && filter.endDate) {
      where.createdAt = { gte: filter.startDate, lte: filter.endDate };
    }
    if (filter.borrowerId) where.id = filter.borrowerId;
    return where;
  }
}