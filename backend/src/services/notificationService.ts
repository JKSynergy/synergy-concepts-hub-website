import { PrismaClient } from '@prisma/client';
import { WhatsAppService } from './whatsappService';
import { logger } from '../config/logger';

const prisma = new PrismaClient();

export interface NotificationData {
  type: 'PAYMENT_REMINDER' | 'PAYMENT_RECEIVED' | 'LOAN_APPROVED' | 'LOAN_DISBURSED' | 'SYSTEM_ALERT' | 'OVERDUE_NOTICE';
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  channels: ('sms' | 'whatsapp' | 'email' | 'in_app')[];
  borrowerId?: string;
  loanId?: string;
  metadata?: Record<string, any>;
}

export interface NotificationTemplate {
  type: string;
  whatsappTemplate?: string;
  smsTemplate?: string;
  emailTemplate?: string;
}

export class NotificationService {
  private whatsAppService: WhatsAppService;

  constructor() {
    this.whatsAppService = new WhatsAppService();
  }

  // Send notification through multiple channels
  async sendNotification(data: NotificationData): Promise<void> {
    try {
      const { borrowerId, channels, type, title, message, priority, loanId, metadata } = data;

      // Save notification to database
      const notification = await prisma.notification.create({
        data: {
          type,
          title,
          message,
          priority,
          borrowerId,
          loanId,
          metadata: metadata || {},
          status: 'PENDING'
        }
      });

      // If borrower-specific notification, get borrower details
      let borrower = null;
      if (borrowerId) {
        borrower = await prisma.borrower.findUnique({
          where: { id: borrowerId }
        });
      }

      // Send through requested channels
      const sendPromises = channels.map(channel => {
        switch (channel) {
          case 'whatsapp':
            return this.sendWhatsApp(borrower, type, message, metadata);
          case 'sms':
            return this.sendSMS(borrower, type, message, metadata);
          case 'email':
            return this.sendEmail(borrower, type, message, metadata);
          case 'in_app':
            return Promise.resolve(); // Already saved to database
          default:
            return Promise.resolve();
        }
      });

      await Promise.allSettled(sendPromises);

      // Update notification status
      await prisma.notification.update({
        where: { id: notification.id },
        data: { 
          status: 'SENT',
          sentAt: new Date()
        }
      });

      logger.info(`Notification sent successfully`, { 
        notificationId: notification.id, 
        type, 
        channels,
        borrowerId 
      });

    } catch (error) {
      logger.error('Failed to send notification', { error, data });
      throw error;
    }
  }

  // Send WhatsApp notification
  private async sendWhatsApp(borrower: any, type: string, message: string, metadata?: any): Promise<void> {
    if (!borrower?.phone) return;

    try {
      switch (type) {
        case 'PAYMENT_REMINDER':
          await this.whatsAppService.sendPaymentReminder(
            borrower.phone,
            borrower.firstName,
            metadata?.amount || 0,
            metadata?.dueDate || new Date(),
            metadata?.loanId || ''
          );
          break;

        case 'PAYMENT_RECEIVED':
          await this.whatsAppService.sendPaymentConfirmation(
            borrower.phone,
            borrower.firstName,
            metadata?.amount || 0,
            metadata?.loanBalance || 0,
            metadata?.transactionId || ''
          );
          break;

        case 'LOAN_APPROVED':
          await this.whatsAppService.sendMessage(
            borrower.phone,
            `🎉 Congratulations ${borrower.firstName}! Your loan application has been approved for UGX ${(metadata?.amount || 0).toLocaleString()}. Please visit our office to complete the disbursement process.`
          );
          break;

        case 'LOAN_DISBURSED':
          await this.whatsAppService.sendMessage(
            borrower.phone,
            `💰 Your loan of UGX ${(metadata?.amount || 0).toLocaleString()} has been disbursed successfully. Your first payment of UGX ${(metadata?.firstPayment || 0).toLocaleString()} is due on ${new Date(metadata?.dueDate).toDateString()}.`
          );
          break;

        case 'OVERDUE_NOTICE':
          const daysPastDue = metadata?.daysPastDue || 0;
          await this.whatsAppService.sendMessage(
            borrower.phone,
            `⚠️ OVERDUE NOTICE: ${borrower.firstName}, your loan payment of UGX ${(metadata?.amount || 0).toLocaleString()} is ${daysPastDue} days overdue. Please make payment immediately to avoid penalties. Call us: ${process.env.COMPANY_PHONE || '0700000000'}`
          );
          break;

        default:
          await this.whatsAppService.sendMessage(borrower.phone, message);
      }
    } catch (error) {
      logger.error('WhatsApp notification failed', { error, borrower: borrower.borrowerId, type });
    }
  }

  // Send SMS notification
  private async sendSMS(borrower: any, type: string, message: string, metadata?: any): Promise<void> {
    if (!borrower?.phone) return;

    try {
      // SMS templates for different notification types
      let smsMessage = message;

      switch (type) {
        case 'PAYMENT_REMINDER':
          smsMessage = `QuickCredit: Hi ${borrower.firstName}, your loan payment of UGX ${(metadata?.amount || 0).toLocaleString()} is due on ${new Date(metadata?.dueDate).toDateString()}. Pay via Mobile Money or visit our office.`;
          break;

        case 'PAYMENT_RECEIVED':
          smsMessage = `QuickCredit: Payment received! UGX ${(metadata?.amount || 0).toLocaleString()} paid. Loan balance: UGX ${(metadata?.loanBalance || 0).toLocaleString()}. Ref: ${metadata?.transactionId || 'N/A'}`;
          break;

        case 'LOAN_APPROVED':
          smsMessage = `QuickCredit: Congratulations ${borrower.firstName}! Your loan of UGX ${(metadata?.amount || 0).toLocaleString()} has been approved. Visit us to complete disbursement.`;
          break;

        case 'OVERDUE_NOTICE':
          const daysPastDue = metadata?.daysPastDue || 0;
          smsMessage = `QuickCredit: OVERDUE! ${borrower.firstName}, your payment of UGX ${(metadata?.amount || 0).toLocaleString()} is ${daysPastDue} days late. Pay now to avoid penalties.`;
          break;
      }

      // Here you would integrate with your SMS provider (e.g., Twilio, Africa's Talking)
      // For now, we'll just log it
      logger.info('SMS would be sent', { 
        phone: borrower.phone, 
        message: smsMessage,
        type 
      });

      // TODO: Implement actual SMS sending
      // await smsProvider.send(borrower.phone, smsMessage);

    } catch (error) {
      logger.error('SMS notification failed', { error, borrower: borrower.borrowerId, type });
    }
  }

  // Send email notification
  private async sendEmail(borrower: any, type: string, message: string, metadata?: any): Promise<void> {
    if (!borrower?.email) return;

    try {
      // Email templates would be more detailed than SMS/WhatsApp
      let subject = '';
      let emailBody = message;

      switch (type) {
        case 'PAYMENT_REMINDER':
          subject = 'Loan Payment Reminder - QuickCredit';
          emailBody = `
            Dear ${borrower.firstName} ${borrower.lastName},
            
            This is a friendly reminder that your loan payment is due.
            
            Payment Details:
            - Amount Due: UGX ${(metadata?.amount || 0).toLocaleString()}
            - Due Date: ${new Date(metadata?.dueDate).toDateString()}
            - Loan ID: ${metadata?.loanId || ''}
            
            You can make payment via:
            - Mobile Money (MTN or Airtel)
            - Visit our office
            - Bank transfer
            
            Thank you for choosing QuickCredit.
            
            Best regards,
            QuickCredit Team
          `;
          break;

        case 'LOAN_APPROVED':
          subject = 'Loan Application Approved - QuickCredit';
          emailBody = `
            Dear ${borrower.firstName} ${borrower.lastName},
            
            Congratulations! Your loan application has been approved.
            
            Loan Details:
            - Approved Amount: UGX ${(metadata?.amount || 0).toLocaleString()}
            - Interest Rate: ${metadata?.interestRate || 0}%
            - Term: ${metadata?.termMonths || 0} months
            
            Please visit our office with the required documents to complete the disbursement process.
            
            Thank you for choosing QuickCredit.
            
            Best regards,
            QuickCredit Team
          `;
          break;

        default:
          subject = 'Notification from QuickCredit';
      }

      // Here you would integrate with your email provider (e.g., SendGrid, AWS SES)
      logger.info('Email would be sent', { 
        email: borrower.email, 
        subject,
        type 
      });

      // TODO: Implement actual email sending
      // await emailProvider.send(borrower.email, subject, emailBody);

    } catch (error) {
      logger.error('Email notification failed', { error, borrower: borrower.borrowerId, type });
    }
  }

  // Send payment reminder to all borrowers with upcoming due dates
  async sendPaymentReminders(): Promise<void> {
    try {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      const upcomingPayments = await prisma.loan.findMany({
        where: {
          status: 'ACTIVE',
          nextPaymentDate: {
            gte: new Date(),
            lte: threeDaysFromNow
          }
        },
        include: {
          borrower: true
        }
      });

      const reminderPromises = upcomingPayments.map(loan => {
        return this.sendNotification({
          type: 'PAYMENT_REMINDER',
          title: 'Payment Reminder',
          message: `Your loan payment is due soon`,
          priority: 'medium',
          channels: ['whatsapp', 'sms'],
          borrowerId: loan.borrowerId,
          loanId: loan.id,
          metadata: {
            amount: loan.nextPaymentAmount,
            dueDate: loan.nextPaymentDate,
            loanId: loan.loanId
          }
        });
      });

      await Promise.allSettled(reminderPromises);

      logger.info(`Payment reminders sent to ${upcomingPayments.length} borrowers`);

    } catch (error) {
      logger.error('Failed to send payment reminders', { error });
    }
  }

  // Send overdue notices to borrowers with overdue payments
  async sendOverdueNotices(): Promise<void> {
    try {
      const overdueLoans = await prisma.loan.findMany({
        where: {
          status: 'ACTIVE',
          nextPaymentDate: {
            lt: new Date()
          }
        },
        include: {
          borrower: true
        }
      });

      const overduePromises = overdueLoans.map(loan => {
        const daysPastDue = Math.floor(
          (new Date().getTime() - new Date(loan.nextPaymentDate!).getTime()) / (1000 * 60 * 60 * 24)
        );

        return this.sendNotification({
          type: 'OVERDUE_NOTICE',
          title: 'Overdue Payment Notice',
          message: `Your loan payment is overdue`,
          priority: 'high',
          channels: ['whatsapp', 'sms'],
          borrowerId: loan.borrowerId,
          loanId: loan.id,
          metadata: {
            amount: loan.nextPaymentAmount,
            daysPastDue,
            loanId: loan.loanId
          }
        });
      });

      await Promise.allSettled(overduePromises);

      logger.info(`Overdue notices sent to ${overdueLoans.length} borrowers`);

    } catch (error) {
      logger.error('Failed to send overdue notices', { error });
    }
  }

  // Get notifications for a user
  async getUserNotifications(userId: string, limit: number = 20): Promise<any[]> {
    try {
      return await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit
      });
    } catch (error) {
      logger.error('Failed to get user notifications', { error, userId });
      return [];
    }
  }

  // Mark notification as read
  async markAsRead(notificationId: string): Promise<void> {
    try {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { 
          isRead: true,
          readAt: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to mark notification as read', { error, notificationId });
    }
  }
}