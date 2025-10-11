import nodemailer from 'nodemailer';
import { createLogger } from 'winston';

const logger = createLogger({
  level: 'info',
  defaultMeta: { service: 'email-service' }
});

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface EmailData {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter;
  private fromEmail: string;

  constructor() {
    // For development, use a test email service or Gmail
    // In production, you should use environment variables
    const config: EmailConfig = {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER || 'qcredit611@gmail.com',
        pass: process.env.EMAIL_PASS || 'your-app-password' // Use app password for Gmail
      }
    };

    this.fromEmail = 'qcredit611@gmail.com';
    this.transporter = nodemailer.createTransport(config);
  }

  async sendEmail(emailData: EmailData): Promise<boolean> {
    try {
      // In development, if no email configuration is provided, just log the email
      if (!process.env.EMAIL_PASS || process.env.EMAIL_PASS === 'your-gmail-app-password') {
        logger.info('Email would be sent (development mode)', {
          to: emailData.to,
          cc: emailData.cc,
          subject: emailData.subject,
          bodyPreview: emailData.html.substring(0, 200) + '...'
        });
        return true;
      }

      const mailOptions = {
        from: `"QuickCredit Uganda" <${this.fromEmail}>`,
        to: emailData.to,
        cc: emailData.cc,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text || this.stripHtml(emailData.html)
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info('Email sent successfully', { 
        messageId: result.messageId, 
        to: emailData.to,
        subject: emailData.subject 
      });
      return true;
    } catch (error) {
      logger.error('Failed to send email', { 
        error: error,
        to: emailData.to,
        subject: emailData.subject 
      });
      return false;
    }
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  // Application submitted email templates
  generateApplicationSubmittedClientEmail(applicationData: any): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Loan Application Submitted</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
            .header .logo { font-size: 32px; margin-bottom: 10px; }
            .content { padding: 40px 30px; }
            .success-badge { background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; margin-bottom: 25px; text-align: center; border-left: 4px solid #28a745; }
            .details-box { background: #f8f9fa; padding: 25px; border-radius: 8px; margin: 25px 0; border: 1px solid #e9ecef; }
            .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e9ecef; }
            .detail-label { font-weight: 600; color: #495057; }
            .detail-value { color: #6c757d; text-align: right; }
            .highlight { color: #667eea; font-weight: 600; }
            .next-steps { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 25px 0; }
            .next-steps h3 { color: #856404; margin-top: 0; }
            .footer { background: #343a40; color: white; padding: 30px; text-align: center; }
            .footer p { margin: 5px 0; }
            .btn { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 25px; margin: 15px 0; }
            .contact-info { margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">💳</div>
                <h1>QuickCredit Uganda</h1>
                <p>Your Financial Partner</p>
            </div>
            
            <div class="content">
                <div class="success-badge">
                    <strong>✅ Application Submitted Successfully!</strong>
                </div>
                
                <h2>Dear ${applicationData.borrower.firstName} ${applicationData.borrower.lastName},</h2>
                
                <p>Thank you for choosing QuickCredit Uganda for your financial needs. We have successfully received your loan application and our team is now reviewing it.</p>
                
                <div class="details-box">
                    <h3 style="margin-top: 0; color: #667eea;">📋 Application Details</h3>
                    <div class="detail-row">
                        <span class="detail-label">Application ID:</span>
                        <span class="detail-value highlight">${applicationData.applicationId}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Requested Amount:</span>
                        <span class="detail-value">UGX ${applicationData.requestedAmount.toLocaleString()}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Loan Term:</span>
                        <span class="detail-value">${applicationData.termMonths} months</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Purpose:</span>
                        <span class="detail-value">${applicationData.purpose}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Submitted:</span>
                        <span class="detail-value">${new Date(applicationData.submittedAt).toLocaleDateString('en-UG', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Status:</span>
                        <span class="detail-value" style="color: #ffc107; font-weight: bold;">Under Review</span>
                    </div>
                </div>
                
                <div class="next-steps">
                    <h3>📋 What happens next?</h3>
                    <ul style="margin: 0; padding-left: 20px;">
                        <li><strong>Review Process:</strong> Our team will carefully review your application within 24-48 hours</li>
                        <li><strong>Verification:</strong> We may contact you for additional information or documentation</li>
                        <li><strong>Decision:</strong> You'll receive an email notification with our decision</li>
                        <li><strong>Disbursement:</strong> If approved, funds will be disbursed to your mobile money account</li>
                    </ul>
                </div>
                
                <p><strong>Important Notes:</strong></p>
                <ul>
                    <li>Please keep your phone accessible as we may need to contact you</li>
                    <li>Ensure your mobile money account is active and verified</li>
                    <li>You can check your application status by calling our customer service</li>
                </ul>
                
                <div style="text-align: center; margin: 30px 0;">
                    <p style="color: #667eea; font-weight: 600;">Need assistance? Contact us anytime!</p>
                </div>
            </div>
            
            <div class="footer">
                <h3 style="margin-top: 0;">QuickCredit Uganda</h3>
                <p>📧 Email: qcredit611@gmail.com</p>
                <p>📱 Phone: +256 700 000 000</p>
                <p>💬 WhatsApp: +256 700 000 000</p>
                
                <div class="contact-info">
                    <p style="font-size: 12px; color: #adb5bd; margin-top: 20px;">
                        This is an automated message. Please do not reply to this email.<br>
                        If you need assistance, please contact our customer support.
                    </p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  generateApplicationSubmittedAdminEmail(applicationData: any): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Loan Application Received</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 700px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #dc3545 0%, #fd7e14 100%); color: white; padding: 25px; text-align: center; }
            .header h1 { margin: 0; font-size: 26px; font-weight: 300; }
            .alert-badge { background: #fff3cd; color: #856404; padding: 15px; border-radius: 8px; margin-bottom: 25px; text-align: center; border-left: 4px solid #ffc107; }
            .content { padding: 30px; }
            .details-box { background: #f8f9fa; padding: 25px; border-radius: 8px; margin: 20px 0; border: 1px solid #e9ecef; }
            .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e9ecef; }
            .detail-label { font-weight: 600; color: #495057; }
            .detail-value { color: #6c757d; text-align: right; }
            .highlight { color: #dc3545; font-weight: 600; }
            .action-required { background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px; padding: 20px; margin: 25px 0; }
            .action-required h3 { color: #721c24; margin-top: 0; }
            .btn { display: inline-block; padding: 12px 30px; background: #dc3545; color: white; text-decoration: none; border-radius: 25px; margin: 15px 10px; }
            .btn-secondary { background: #6c757d; }
            .footer { background: #343a40; color: white; padding: 20px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🚨 New Loan Application</h1>
                <p>Requires Review & Processing</p>
            </div>
            
            <div class="content">
                <div class="alert-badge">
                    <strong>⏰ New Application Received - Immediate Review Required</strong>
                </div>
                
                <h2>Application Details</h2>
                
                <div class="details-box">
                    <h3 style="margin-top: 0; color: #dc3545;">📋 Application Information</h3>
                    <div class="detail-row">
                        <span class="detail-label">Application ID:</span>
                        <span class="detail-value highlight">${applicationData.applicationId}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Applicant Name:</span>
                        <span class="detail-value">${applicationData.borrower.firstName} ${applicationData.borrower.lastName}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Phone Number:</span>
                        <span class="detail-value">${applicationData.borrower.phone}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Email:</span>
                        <span class="detail-value">${applicationData.borrower.email || 'Not provided'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Requested Amount:</span>
                        <span class="detail-value highlight">UGX ${applicationData.requestedAmount.toLocaleString()}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Loan Term:</span>
                        <span class="detail-value">${applicationData.termMonths} months</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Purpose:</span>
                        <span class="detail-value">${applicationData.purpose}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Submitted At:</span>
                        <span class="detail-value">${new Date(applicationData.submittedAt).toLocaleString('en-UG')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Borrower ID:</span>
                        <span class="detail-value">${applicationData.borrower.borrowerId}</span>
                    </div>
                </div>
                
                <div class="action-required">
                    <h3>🔍 Action Required</h3>
                    <ul style="margin: 0; padding-left: 20px;">
                        <li><strong>Review application</strong> for completeness and accuracy</li>
                        <li><strong>Verify borrower information</strong> and credit history</li>
                        <li><strong>Assess loan eligibility</strong> based on company policies</li>
                        <li><strong>Make approval/rejection decision</strong> within 24-48 hours</li>
                        <li><strong>Contact borrower</strong> if additional information is needed</li>
                    </ul>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <p><strong>Please review this application promptly to maintain our service standards.</strong></p>
                </div>
                
                <p><strong>Risk Assessment Guidelines:</strong></p>
                <ul>
                    <li>Verify phone number and identity</li>
                    <li>Check existing loan history in the system</li>
                    <li>Assess repayment capacity based on stated income</li>
                    <li>Consider loan amount relative to borrower profile</li>
                </ul>
            </div>
            
            <div class="footer">
                <h3 style="margin-top: 0;">QuickCredit Uganda - Admin Portal</h3>
                <p>This notification was sent to: qcredit611@gmail.com</p>
                <p style="font-size: 12px; color: #adb5bd; margin-top: 15px;">
                    Generated automatically by QuickCredit Loan Management System
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  // Application approved email templates
  generateApplicationApprovedClientEmail(applicationData: any, loanData: any): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Loan Application Approved</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 650px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
            .header .emoji { font-size: 48px; margin-bottom: 15px; }
            .content { padding: 40px 30px; }
            .success-badge { background: #d1ecf1; color: #0c5460; padding: 20px; border-radius: 8px; margin-bottom: 25px; text-align: center; border-left: 4px solid #17a2b8; }
            .loan-details { background: #f8f9fa; padding: 25px; border-radius: 8px; margin: 25px 0; border: 1px solid #e9ecef; }
            .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e9ecef; }
            .detail-label { font-weight: 600; color: #495057; }
            .detail-value { color: #6c757d; text-align: right; }
            .highlight { color: #28a745; font-weight: 600; font-size: 18px; }
            .repayment-schedule { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 25px 0; }
            .repayment-schedule h3 { color: #856404; margin-top: 0; }
            .footer { background: #343a40; color: white; padding: 30px; text-align: center; }
            .important-note { background: #ffeaa7; border: 1px solid #ffc107; border-radius: 8px; padding: 15px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="emoji">🎉</div>
                <h1>Congratulations!</h1>
                <p>Your Loan Has Been Approved</p>
            </div>
            
            <div class="content">
                <div class="success-badge">
                    <strong>✅ Loan Application ${applicationData.applicationId} APPROVED!</strong>
                </div>
                
                <h2>Dear ${applicationData.borrower.firstName} ${applicationData.borrower.lastName},</h2>
                
                <p>We're delighted to inform you that your loan application has been <strong>approved</strong>! After careful review, we're pleased to offer you the financial support you need.</p>
                
                <div class="loan-details">
                    <h3 style="margin-top: 0; color: #28a745;">💰 Approved Loan Details</h3>
                    <div class="detail-row">
                        <span class="detail-label">Loan ID:</span>
                        <span class="detail-value highlight">${loanData.loanId}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Approved Amount:</span>
                        <span class="detail-value highlight">UGX ${loanData.principal.toLocaleString()}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Interest Rate:</span>
                        <span class="detail-value">${loanData.interestRate}% per annum</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Loan Term:</span>
                        <span class="detail-value">${loanData.termMonths} months</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Total Amount to Repay:</span>
                        <span class="detail-value">UGX ${loanData.totalAmount.toLocaleString()}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Monthly Payment:</span>
                        <span class="detail-value highlight">UGX ${loanData.monthlyPayment.toLocaleString()}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">First Payment Due:</span>
                        <span class="detail-value">${new Date(loanData.nextPaymentDate).toLocaleDateString('en-UG', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}</span>
                    </div>
                </div>
                
                <div class="repayment-schedule">
                    <h3>📅 Repayment Information</h3>
                    <ul style="margin: 0; padding-left: 20px;">
                        <li><strong>Payment Frequency:</strong> Monthly</li>
                        <li><strong>Payment Method:</strong> Mobile Money or Bank Transfer</li>
                        <li><strong>Auto-debit:</strong> Available upon request</li>
                        <li><strong>Early Repayment:</strong> Allowed without penalties</li>
                    </ul>
                </div>
                
                <div class="important-note">
                    <h3 style="margin-top: 0; color: #856404;">📋 Next Steps</h3>
                    <ol style="margin: 0; padding-left: 20px;">
                        <li><strong>Disbursement:</strong> Funds will be sent to your mobile money account within 2-4 hours</li>
                        <li><strong>Confirmation:</strong> You'll receive an SMS confirmation once funds are disbursed</li>
                        <li><strong>Repayment Setup:</strong> Set up reminders for your monthly payments</li>
                        <li><strong>Documentation:</strong> Keep this email for your records</li>
                    </ol>
                </div>
                
                <p><strong>Important Reminders:</strong></p>
                <ul>
                    <li>Ensure your mobile money account is active and has sufficient limits</li>
                    <li>Make payments on time to maintain a good credit rating</li>
                    <li>Contact us immediately if you face any payment difficulties</li>
                    <li>Keep your contact information updated with us</li>
                </ul>
                
                <div style="text-align: center; margin: 30px 0; padding: 20px; background: #e8f5e8; border-radius: 8px;">
                    <p style="color: #28a745; font-weight: 600; margin: 0;">Thank you for choosing QuickCredit Uganda!</p>
                    <p style="margin: 5px 0 0 0;">We're committed to your financial success.</p>
                </div>
            </div>
            
            <div class="footer">
                <h3 style="margin-top: 0;">QuickCredit Uganda</h3>
                <p>📧 Email: qcredit611@gmail.com</p>
                <p>📱 Phone: +256 700 000 000</p>
                <p>💬 WhatsApp: +256 700 000 000</p>
                
                <p style="font-size: 12px; color: #adb5bd; margin-top: 20px;">
                    This is an automated message. Please keep this email for your records.<br>
                    If you have any questions, please contact our customer support.
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  generateApplicationApprovedAdminEmail(applicationData: any, loanData: any): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Loan Application Approved - Admin Notification</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 700px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 25px; text-align: center; }
            .content { padding: 30px; }
            .success-badge { background: #d1ecf1; color: #0c5460; padding: 15px; border-radius: 8px; margin-bottom: 25px; text-align: center; border-left: 4px solid #17a2b8; }
            .details-box { background: #f8f9fa; padding: 25px; border-radius: 8px; margin: 20px 0; border: 1px solid #e9ecef; }
            .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e9ecef; }
            .detail-label { font-weight: 600; color: #495057; }
            .detail-value { color: #6c757d; text-align: right; }
            .highlight { color: #28a745; font-weight: 600; }
            .footer { background: #343a40; color: white; padding: 20px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>✅ Loan Application Approved</h1>
                <p>Processing Complete - Customer Notified</p>
            </div>
            
            <div class="content">
                <div class="success-badge">
                    <strong>Application ${applicationData.applicationId} has been approved and loan ${loanData.loanId} created</strong>
                </div>
                
                <div class="details-box">
                    <h3 style="margin-top: 0; color: #28a745;">📋 Approval Summary</h3>
                    <div class="detail-row">
                        <span class="detail-label">Application ID:</span>
                        <span class="detail-value">${applicationData.applicationId}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Loan ID:</span>
                        <span class="detail-value highlight">${loanData.loanId}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Borrower:</span>
                        <span class="detail-value">${applicationData.borrower.firstName} ${applicationData.borrower.lastName}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Approved Amount:</span>
                        <span class="detail-value highlight">UGX ${loanData.principal.toLocaleString()}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Monthly Payment:</span>
                        <span class="detail-value">UGX ${loanData.monthlyPayment.toLocaleString()}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Total Revenue Expected:</span>
                        <span class="detail-value">UGX ${(loanData.totalAmount - loanData.principal).toLocaleString()}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Approved At:</span>
                        <span class="detail-value">${new Date().toLocaleString('en-UG')}</span>
                    </div>
                </div>
                
                <h3>Next Steps:</h3>
                <ul>
                    <li>Customer has been notified via email</li>
                    <li>Funds should be disbursed within 2-4 hours</li>
                    <li>Monitor first payment on ${new Date(loanData.nextPaymentDate).toLocaleDateString('en-UG')}</li>
                    <li>Update borrower's credit rating as appropriate</li>
                </ul>
            </div>
            
            <div class="footer">
                <h3 style="margin-top: 0;">QuickCredit Uganda - Admin Portal</h3>
                <p style="font-size: 12px; color: #adb5bd;">
                    Generated automatically by QuickCredit Loan Management System
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  // Application rejected email templates
  generateApplicationRejectedClientEmail(applicationData: any, rejectionReason: string): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Loan Application Update</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #6c757d 0%, #495057 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 26px; font-weight: 300; }
            .content { padding: 40px 30px; }
            .info-badge { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 8px; margin-bottom: 25px; text-align: center; border-left: 4px solid #dc3545; }
            .details-box { background: #f8f9fa; padding: 25px; border-radius: 8px; margin: 25px 0; border: 1px solid #e9ecef; }
            .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e9ecef; }
            .detail-label { font-weight: 600; color: #495057; }
            .detail-value { color: #6c757d; text-align: right; }
            .next-steps { background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 8px; padding: 20px; margin: 25px 0; }
            .next-steps h3 { color: #0c5460; margin-top: 0; }
            .footer { background: #343a40; color: white; padding: 30px; text-align: center; }
            .reason-box { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📋 Application Update</h1>
                <p>QuickCredit Uganda</p>
            </div>
            
            <div class="content">
                <div class="info-badge">
                    <strong>Application Status Update</strong>
                </div>
                
                <h2>Dear ${applicationData.borrower.firstName} ${applicationData.borrower.lastName},</h2>
                
                <p>Thank you for your interest in QuickCredit Uganda and for taking the time to submit your loan application. After careful review of your application, we regret to inform you that we are unable to approve your loan request at this time.</p>
                
                <div class="details-box">
                    <h3 style="margin-top: 0; color: #6c757d;">📋 Application Details</h3>
                    <div class="detail-row">
                        <span class="detail-label">Application ID:</span>
                        <span class="detail-value">${applicationData.applicationId}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Requested Amount:</span>
                        <span class="detail-value">UGX ${applicationData.requestedAmount.toLocaleString()}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Reviewed Date:</span>
                        <span class="detail-value">${new Date().toLocaleDateString('en-UG')}</span>
                    </div>
                </div>
                
                <div class="reason-box">
                    <h3 style="margin-top: 0; color: #856404;">📝 Reason for Decision</h3>
                    <p style="margin: 0;">${rejectionReason}</p>
                </div>
                
                <div class="next-steps">
                    <h3>🔄 Future Opportunities</h3>
                    <p>This decision doesn't prevent you from applying again in the future. We encourage you to:</p>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li><strong>Improve your credit profile:</strong> Build a positive financial history</li>
                        <li><strong>Increase your income:</strong> Demonstrate improved repayment capacity</li>
                        <li><strong>Reduce existing debts:</strong> Lower your debt-to-income ratio</li>
                        <li><strong>Reapply after 3-6 months:</strong> We welcome future applications</li>
                    </ul>
                </div>
                
                <p><strong>Alternative Options:</strong></p>
                <ul>
                    <li>Consider applying for a smaller loan amount</li>
                    <li>Explore our savings products to build your financial profile</li>
                    <li>Speak with our financial advisors for personalized guidance</li>
                </ul>
                
                <p>We appreciate your understanding and thank you for considering QuickCredit Uganda for your financial needs. If you have any questions about this decision or would like guidance for future applications, please don't hesitate to contact us.</p>
                
                <div style="text-align: center; margin: 30px 0; padding: 20px; background: #e2e6ea; border-radius: 8px;">
                    <p style="color: #6c757d; font-weight: 600; margin: 0;">We're here to support your financial journey</p>
                    <p style="margin: 5px 0 0 0;">Contact us for guidance and future opportunities</p>
                </div>
            </div>
            
            <div class="footer">
                <h3 style="margin-top: 0;">QuickCredit Uganda</h3>
                <p>📧 Email: qcredit611@gmail.com</p>
                <p>📱 Phone: +256 700 000 000</p>
                <p>💬 WhatsApp: +256 700 000 000</p>
                
                <p style="font-size: 12px; color: #adb5bd; margin-top: 20px;">
                    This is an automated message. If you have questions about this decision,<br>
                    please contact our customer support team.
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  generateApplicationRejectedAdminEmail(applicationData: any, rejectionReason: string): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Loan Application Rejected - Admin Notification</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 650px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #6c757d 0%, #495057 100%); color: white; padding: 25px; text-align: center; }
            .content { padding: 30px; }
            .info-badge { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 8px; margin-bottom: 25px; text-align: center; border-left: 4px solid #dc3545; }
            .details-box { background: #f8f9fa; padding: 25px; border-radius: 8px; margin: 20px 0; border: 1px solid #e9ecef; }
            .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e9ecef; }
            .detail-label { font-weight: 600; color: #495057; }
            .detail-value { color: #6c757d; text-align: right; }
            .footer { background: #343a40; color: white; padding: 20px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>❌ Loan Application Rejected</h1>
                <p>Customer Notified - Case Closed</p>
            </div>
            
            <div class="content">
                <div class="info-badge">
                    <strong>Application ${applicationData.applicationId} has been rejected</strong>
                </div>
                
                <div class="details-box">
                    <h3 style="margin-top: 0; color: #6c757d;">📋 Rejection Summary</h3>
                    <div class="detail-row">
                        <span class="detail-label">Application ID:</span>
                        <span class="detail-value">${applicationData.applicationId}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Borrower:</span>
                        <span class="detail-value">${applicationData.borrower.firstName} ${applicationData.borrower.lastName}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Requested Amount:</span>
                        <span class="detail-value">UGX ${applicationData.requestedAmount.toLocaleString()}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Rejection Reason:</span>
                        <span class="detail-value">${rejectionReason}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Rejected At:</span>
                        <span class="detail-value">${new Date().toLocaleString('en-UG')}</span>
                    </div>
                </div>
                
                <h3>Actions Completed:</h3>
                <ul>
                    <li>Customer has been notified via email</li>
                    <li>Application status updated to REJECTED</li>
                    <li>Case documentation completed</li>
                    <li>Future application eligibility maintained</li>
                </ul>
            </div>
            
            <div class="footer">
                <h3 style="margin-top: 0;">QuickCredit Uganda - Admin Portal</h3>
                <p style="font-size: 12px; color: #adb5bd;">
                    Generated automatically by QuickCredit Loan Management System
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  // Send application submitted emails
  async sendApplicationSubmittedEmails(applicationData: any): Promise<void> {
    const adminEmail = 'qcredit611@gmail.com';

    // Send email to client
    if (applicationData.borrower.email) {
      await this.sendEmail({
        to: applicationData.borrower.email,
        subject: `Application Submitted Successfully - ${applicationData.applicationId}`,
        html: this.generateApplicationSubmittedClientEmail(applicationData)
      });
    }

    // Send email to admin
    await this.sendEmail({
      to: adminEmail,
      subject: `New Loan Application Received - ${applicationData.applicationId}`,
      html: this.generateApplicationSubmittedAdminEmail(applicationData)
    });
  }

  // Send application approved emails
  async sendApplicationApprovedEmails(applicationData: any, loanData: any): Promise<void> {
    const adminEmail = 'qcredit611@gmail.com';

    // Send email to client
    if (applicationData.borrower.email) {
      await this.sendEmail({
        to: applicationData.borrower.email,
        subject: `🎉 Loan Approved! - ${applicationData.applicationId}`,
        html: this.generateApplicationApprovedClientEmail(applicationData, loanData)
      });
    }

    // Send email to admin
    await this.sendEmail({
      to: adminEmail,
      subject: `Loan Application Approved - ${applicationData.applicationId}`,
      html: this.generateApplicationApprovedAdminEmail(applicationData, loanData)
    });
  }

  // Send application rejected emails
  async sendApplicationRejectedEmails(applicationData: any, rejectionReason: string): Promise<void> {
    const adminEmail = 'qcredit611@gmail.com';

    // Send email to client
    if (applicationData.borrower.email) {
      await this.sendEmail({
        to: applicationData.borrower.email,
        subject: `Application Update - ${applicationData.applicationId}`,
        html: this.generateApplicationRejectedClientEmail(applicationData, rejectionReason)
      });
    }

    // Send email to admin
    await this.sendEmail({
      to: adminEmail,
      subject: `Loan Application Rejected - ${applicationData.applicationId}`,
      html: this.generateApplicationRejectedAdminEmail(applicationData, rejectionReason)
    });
  }
}

export const emailService = new EmailService();