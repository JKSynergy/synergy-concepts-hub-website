import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger';

export interface MoMoPaymentRequest {
  amount: number;
  currency: string;
  phoneNumber: string;
  externalId: string;
  payerMessage?: string;
  payeeNote?: string;
}

export interface MoMoPaymentResponse {
  referenceId: string;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
  financialTransactionId?: string;
  reason?: string;
}

export interface MoMoPaymentStatus {
  amount: number;
  currency: string;
  financialTransactionId: string;
  externalId: string;
  payer: {
    partyIdType: string;
    partyId: string;
  };
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
  reason?: string;
}

class MTNMoMoService {
  private apiClient: AxiosInstance;
  private baseURL: string;
  private subscriptionKey: string;
  private userId: string;
  private apiKey: string;
  private environment: string;

  constructor() {
    this.baseURL = process.env.MTN_MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
    this.subscriptionKey = process.env.MTN_MOMO_SUBSCRIPTION_KEY!;
    this.userId = process.env.MTN_MOMO_USER_ID!;
    this.apiKey = process.env.MTN_MOMO_API_KEY!;
    this.environment = process.env.MTN_MOMO_ENVIRONMENT || 'sandbox';

    this.apiClient = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': this.subscriptionKey,
        'X-Target-Environment': this.environment,
      },
      timeout: 30000,
    });

    // Request interceptor to add auth token
    this.apiClient.interceptors.request.use(async (config) => {
      const token = await this.getAccessToken();
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    });

    // Response interceptor for error handling
    this.apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('MTN MoMo API Error:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          data: error.response?.data,
        });
        throw error;
      }
    );
  }

  private async getAccessToken(): Promise<string | null> {
    try {
      // In a real implementation, you would cache this token
      // and only refresh when it expires
      const response = await axios.post(
        `${this.baseURL}/collection/token/`,
        {},
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'X-Target-Environment': this.environment,
            'Authorization': `Basic ${Buffer.from(`${this.userId}:${this.apiKey}`).toString('base64')}`,
          },
        }
      );

      return response.data.access_token;
    } catch (error) {
      logger.error('Failed to get MTN MoMo access token:', error);
      return null;
    }
  }

  async requestToPay(paymentRequest: MoMoPaymentRequest): Promise<MoMoPaymentResponse> {
    try {
      const referenceId = uuidv4();
      
      const payload = {
        amount: paymentRequest.amount.toString(),
        currency: paymentRequest.currency,
        externalId: paymentRequest.externalId,
        payer: {
          partyIdType: 'MSISDN',
          partyId: paymentRequest.phoneNumber.replace(/^\+/, ''), // Remove + prefix
        },
        payerMessage: paymentRequest.payerMessage || 'Payment for QuickCredit services',
        payeeNote: paymentRequest.payeeNote || 'QuickCredit payment',
      };

      await this.apiClient.post(`/collection/v1_0/requesttopay`, payload, {
        headers: {
          'X-Reference-Id': referenceId,
        },
      });

      logger.info('MTN MoMo payment request initiated:', {
        referenceId,
        amount: paymentRequest.amount,
        phoneNumber: paymentRequest.phoneNumber,
      });

      return {
        referenceId,
        status: 'PENDING',
      };
    } catch (error: any) {
      logger.error('MTN MoMo payment request failed:', error);
      
      return {
        referenceId: '',
        status: 'FAILED',
        reason: error.response?.data?.message || 'Payment request failed',
      };
    }
  }

  async getPaymentStatus(referenceId: string): Promise<MoMoPaymentStatus | null> {
    try {
      const response = await this.apiClient.get(`/collection/v1_0/requesttopay/${referenceId}`);
      
      logger.info('MTN MoMo payment status retrieved:', {
        referenceId,
        status: response.data.status,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get MTN MoMo payment status:', { referenceId, error });
      return null;
    }
  }

  async getAccountBalance(): Promise<{ availableBalance: number; currency: string } | null> {
    try {
      const response = await this.apiClient.get('/collection/v1_0/account/balance');
      
      return {
        availableBalance: parseFloat(response.data.availableBalance),
        currency: response.data.currency,
      };
    } catch (error) {
      logger.error('Failed to get MTN MoMo account balance:', error);
      return null;
    }
  }

  async validateAccountHolderStatus(phoneNumber: string): Promise<boolean> {
    try {
      const response = await this.apiClient.get(`/collection/v1_0/accountholder/msisdn/${phoneNumber}/active`);
      return response.data.result === true;
    } catch (error) {
      logger.error('Failed to validate MTN MoMo account holder:', { phoneNumber, error });
      return false;
    }
  }
}

class AirtelMoneyService {
  private apiClient: AxiosInstance;
  private baseURL: string;
  private clientId: string;
  private clientSecret: string;
  private environment: string;

  constructor() {
    this.baseURL = process.env.AIRTEL_BASE_URL || 'https://openapiuat.airtel.africa';
    this.clientId = process.env.AIRTEL_CLIENT_ID!;
    this.clientSecret = process.env.AIRTEL_CLIENT_SECRET!;
    this.environment = process.env.AIRTEL_ENVIRONMENT || 'sandbox';

    this.apiClient = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Request interceptor to add auth token
    this.apiClient.interceptors.request.use(async (config) => {
      const token = await this.getAccessToken();
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    });
  }

  private async getAccessToken(): Promise<string | null> {
    try {
      const response = await axios.post(
        `${this.baseURL}/auth/oauth2/token`,
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials',
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.access_token;
    } catch (error) {
      logger.error('Failed to get Airtel Money access token:', error);
      return null;
    }
  }

  async requestToPay(paymentRequest: MoMoPaymentRequest): Promise<MoMoPaymentResponse> {
    try {
      const transactionId = uuidv4();
      
      const payload = {
        reference: paymentRequest.externalId,
        subscriber: {
          country: 'UG',
          currency: paymentRequest.currency,
          msisdn: paymentRequest.phoneNumber.replace(/^\+256/, ''), // Remove country code
        },
        transaction: {
          amount: paymentRequest.amount,
          country: 'UG',
          currency: paymentRequest.currency,
          id: transactionId,
        },
      };

      const response = await this.apiClient.post('/merchant/v1/payments/', payload, {
        headers: {
          'X-Country': 'UG',
          'X-Currency': paymentRequest.currency,
        },
      });

      logger.info('Airtel Money payment request initiated:', {
        transactionId,
        amount: paymentRequest.amount,
        phoneNumber: paymentRequest.phoneNumber,
      });

      return {
        referenceId: transactionId,
        status: response.data.status?.toLowerCase() === 'success' ? 'SUCCESSFUL' : 'PENDING',
      };
    } catch (error: any) {
      logger.error('Airtel Money payment request failed:', error);
      
      return {
        referenceId: '',
        status: 'FAILED',
        reason: error.response?.data?.message || 'Payment request failed',
      };
    }
  }

  async getPaymentStatus(transactionId: string): Promise<MoMoPaymentStatus | null> {
    try {
      const response = await this.apiClient.get(`/standard/v1/payments/${transactionId}`, {
        headers: {
          'X-Country': 'UG',
          'X-Currency': 'UGX',
        },
      });
      
      return {
        amount: parseFloat(response.data.transaction.amount),
        currency: response.data.transaction.currency,
        financialTransactionId: response.data.transaction.airtel_money_id,
        externalId: response.data.transaction.id,
        payer: {
          partyIdType: 'MSISDN',
          partyId: response.data.transaction.msisdn,
        },
        status: response.data.transaction.status?.toLowerCase() === 'success' ? 'SUCCESSFUL' : 
                response.data.transaction.status?.toLowerCase() === 'failed' ? 'FAILED' : 'PENDING',
      };
    } catch (error) {
      logger.error('Failed to get Airtel Money payment status:', { transactionId, error });
      return null;
    }
  }
}

export class MobileMoneyService {
  private mtnMomo: MTNMoMoService;
  private airtelMoney: AirtelMoneyService;

  constructor() {
    this.mtnMomo = new MTNMoMoService();
    this.airtelMoney = new AirtelMoneyService();
  }

  async processPayment(
    provider: 'MTN' | 'AIRTEL',
    paymentRequest: MoMoPaymentRequest
  ): Promise<MoMoPaymentResponse> {
    switch (provider) {
      case 'MTN':
        return this.mtnMomo.requestToPay(paymentRequest);
      case 'AIRTEL':
        return this.airtelMoney.requestToPay(paymentRequest);
      default:
        throw new Error(`Unsupported mobile money provider: ${provider}`);
    }
  }

  async getPaymentStatus(
    provider: 'MTN' | 'AIRTEL',
    referenceId: string
  ): Promise<MoMoPaymentStatus | null> {
    switch (provider) {
      case 'MTN':
        return this.mtnMomo.getPaymentStatus(referenceId);
      case 'AIRTEL':
        return this.airtelMoney.getPaymentStatus(referenceId);
      default:
        throw new Error(`Unsupported mobile money provider: ${provider}`);
    }
  }

  async validateAccountHolder(
    provider: 'MTN' | 'AIRTEL',
    phoneNumber: string
  ): Promise<boolean> {
    switch (provider) {
      case 'MTN':
        return this.mtnMomo.validateAccountHolderStatus(phoneNumber);
      case 'AIRTEL':
        // Airtel doesn't have a direct validation endpoint in sandbox
        return true;
      default:
        throw new Error(`Unsupported mobile money provider: ${provider}`);
    }
  }

  detectProvider(phoneNumber: string): 'MTN' | 'AIRTEL' | 'UNKNOWN' {
    // Remove any formatting
    const cleanNumber = phoneNumber.replace(/[\s\-\+\(\)]/g, '');
    
    // MTN Uganda prefixes
    const mtnPrefixes = ['256771', '256772', '256773', '256774', '256775', '256776', '256777', '256778'];
    
    // Airtel Uganda prefixes  
    const airtelPrefixes = ['256700', '256701', '256702', '256703', '256704', '256705', '256706', '256707', '256708', '256709'];

    for (const prefix of mtnPrefixes) {
      if (cleanNumber.startsWith(prefix)) {
        return 'MTN';
      }
    }

    for (const prefix of airtelPrefixes) {
      if (cleanNumber.startsWith(prefix)) {
        return 'AIRTEL';
      }
    }

    return 'UNKNOWN';
  }
}

export const mobileMoneyService = new MobileMoneyService();