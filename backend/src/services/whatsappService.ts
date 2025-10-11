import twilio from 'twilio';
import { logger } from '../config/logger';

export interface WhatsAppMessage {
  to: string;
  message: string;
  mediaUrl?: string;
  template?: {
    name: string;
    parameters?: string[];
  };
}

export interface WhatsAppMessageResponse {
  sid: string;
  status: string;
  errorMessage?: string;
}

export class WhatsAppService {
  private client: twilio.Twilio;
  private fromNumber: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not provided');
    }

    this.client = twilio(accountSid, authToken);
  }

  async sendMessage(messageData: WhatsAppMessage): Promise<WhatsAppMessageResponse> {
    try {
      // Ensure phone number has proper WhatsApp format
      const toNumber = messageData.to.startsWith('whatsapp:') 
        ? messageData.to 
        : `whatsapp:${messageData.to}`;

      const messageOptions: any = {
        from: this.fromNumber,
        to: toNumber,
        body: messageData.message,
      };

      // Add media if provided
      if (messageData.mediaUrl) {
        messageOptions.mediaUrl = [messageData.mediaUrl];
      }

      const message = await this.client.messages.create(messageOptions);

      logger.info('WhatsApp message sent successfully:', {
        sid: message.sid,
        to: messageData.to,
        status: message.status,
      });

      return {
        sid: message.sid,
        status: message.status,
      };
    } catch (error: any) {
      logger.error('Failed to send WhatsApp message:', {
        to: messageData.to,
        error: error.message,
      });

      return {
        sid: '',
        status: 'failed',
        errorMessage: error.message,
      };
    }
  }

  async sendTemplateMessage(
    to: string,
    templateName: string,
    parameters?: string[]
  ): Promise<WhatsAppMessageResponse> {
    try {
      const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

      // For template messages, you need to use Twilio's Content API
      // This is a simplified version - in production you'd register templates with Twilio
      let messageBody = '';

      switch (templateName) {
        case 'payment_reminder':
          messageBody = `Hello! This is a reminder that your loan payment of UGX ${parameters?.[0]} is due on ${parameters?.[1]}. Please make your payment to avoid late fees. Thank you for choosing QuickCredit Uganda.`;
          break;
        case 'payment_confirmation':
          messageBody = `Payment Confirmed! We have received your payment of UGX ${parameters?.[0]} on ${parameters?.[1]}. Reference: ${parameters?.[2]}. Thank you for your payment!`;
          break;
        case 'loan_approved':
          messageBody = `Congratulations! Your loan application for UGX ${parameters?.[0]} has been approved. The funds will be disbursed to your account shortly. Thank you for choosing QuickCredit Uganda.`;
          break;
        case 'loan_rejected':
          messageBody = `We regret to inform you that your loan application has not been approved at this time. ${parameters?.[0] || 'Please contact our office for more information.'}`;
          break;
        case 'account_statement':
          messageBody = `Your QuickCredit account statement is ready. Outstanding Balance: UGX ${parameters?.[0]}, Next Payment Due: ${parameters?.[1]}. Visit our portal for detailed information.`;
          break;
        default:
          messageBody = parameters?.[0] || 'Hello from QuickCredit Uganda!';
      }

      return this.sendMessage({
        to,
        message: messageBody,
      });
    } catch (error: any) {
      logger.error('Failed to send WhatsApp template message:', {
        to,
        templateName,
        error: error.message,
      });

      return {
        sid: '',
        status: 'failed',
        errorMessage: error.message,
      };
    }
  }

  async getMessageStatus(messageSid: string): Promise<string> {
    try {
      const message = await this.client.messages(messageSid).fetch();
      return message.status;
    } catch (error: any) {
      logger.error('Failed to get WhatsApp message status:', {
        messageSid,
        error: error.message,
      });
      return 'unknown';
    }
  }

  // Send payment reminder
  async sendPaymentReminder(
    phoneNumber: string,
    borrowerName: string,
    amount: number,
    dueDate: string
  ): Promise<WhatsAppMessageResponse> {
    const message = `Hi ${borrowerName}! 👋

This is a friendly reminder from QuickCredit Uganda 🏦

💰 Payment Due: UGX ${amount.toLocaleString()}
📅 Due Date: ${dueDate}

Please make your payment to avoid late fees. You can pay via:
• Mobile Money (MTN/Airtel)
• Bank Transfer
• Visit our office

Thank you for choosing QuickCredit! 🙏`;

    return this.sendMessage({
      to: phoneNumber,
      message,
    });
  }

  // Send payment confirmation
  async sendPaymentConfirmation(
    phoneNumber: string,
    borrowerName: string,
    amount: number,
    reference: string,
    date: string
  ): Promise<WhatsAppMessageResponse> {
    const message = `Hi ${borrowerName}! ✅

Payment Confirmed! 🎉

💰 Amount: UGX ${amount.toLocaleString()}
📅 Date: ${date}
🔢 Reference: ${reference}

Thank you for your payment! Your account has been updated.

QuickCredit Uganda 🏦`;

    return this.sendMessage({
      to: phoneNumber,
      message,
    });
  }

  // Send loan approval notification
  async sendLoanApproval(
    phoneNumber: string,
    borrowerName: string,
    amount: number,
    term: number,
    interestRate: number
  ): Promise<WhatsAppMessageResponse> {
    const message = `Congratulations ${borrowerName}! 🎉

Your loan has been APPROVED! ✅

💰 Amount: UGX ${amount.toLocaleString()}
📅 Term: ${term} months
📈 Interest Rate: ${(interestRate * 100).toFixed(1)}%

Funds will be disbursed to your account within 24 hours.

Welcome to QuickCredit Uganda! 🏦`;

    return this.sendMessage({
      to: phoneNumber,
      message,
    });
  }

  // Send overdue notification
  async sendOverdueNotification(
    phoneNumber: string,
    borrowerName: string,
    amount: number,
    daysPastDue: number,
    penaltyAmount: number
  ): Promise<WhatsAppMessageResponse> {
    const message = `Hi ${borrowerName}! ⚠️

URGENT: Your loan payment is overdue!

💰 Outstanding Amount: UGX ${amount.toLocaleString()}
📅 Days Past Due: ${daysPastDue}
💸 Penalty: UGX ${penaltyAmount.toLocaleString()}

Please make your payment immediately to avoid additional charges and protect your credit rating.

Contact us: +256-XXX-XXXXXX

QuickCredit Uganda 🏦`;

    return this.sendMessage({
      to: phoneNumber,
      message,
    });
  }

  // Send loan application status
  async sendApplicationStatus(
    phoneNumber: string,
    borrowerName: string,
    applicationId: string,
    status: 'under_review' | 'approved' | 'rejected',
    reason?: string
  ): Promise<WhatsAppMessageResponse> {
    let message = `Hi ${borrowerName}! 📋

Loan Application Update 📄
Application ID: ${applicationId}

`;

    switch (status) {
      case 'under_review':
        message += `Status: Under Review 🔍

Your application is being processed. We'll notify you within 24-48 hours.`;
        break;
      case 'approved':
        message += `Status: APPROVED ✅

Congratulations! Your loan has been approved. Disbursement details will be sent separately.`;
        break;
      case 'rejected':
        message += `Status: Not Approved ❌

${reason || 'Unfortunately, we cannot approve your application at this time. Please contact our office for more information.'}`;
        break;
    }

    message += `\n\nQuickCredit Uganda 🏦`;

    return this.sendMessage({
      to: phoneNumber,
      message,
    });
  }

  // Validate WhatsApp number format
  isValidWhatsAppNumber(phoneNumber: string): boolean {
    // Basic validation - in production you might want more sophisticated validation
    const cleanNumber = phoneNumber.replace(/[\s\-\+\(\)]/g, '');
    return /^256[0-9]{9}$/.test(cleanNumber) || /^[0-9]{10,15}$/.test(cleanNumber);
  }

  // Format phone number for WhatsApp
  formatWhatsAppNumber(phoneNumber: string): string {
    let cleanNumber = phoneNumber.replace(/[\s\-\+\(\)]/g, '');
    
    // Add Uganda country code if not present
    if (cleanNumber.startsWith('0')) {
      cleanNumber = '256' + cleanNumber.substring(1);
    } else if (!cleanNumber.startsWith('256')) {
      cleanNumber = '256' + cleanNumber;
    }
    
    return `+${cleanNumber}`;
  }
}

export const whatsappService = new WhatsAppService();