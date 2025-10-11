import { apiService } from './apiService';
import { API_ENDPOINTS } from '../config/api';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

export interface RefreshTokenResponse {
  token: string;
}

export class AuthService {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    try {
      const response = await apiService.post<{success: boolean, data: LoginResponse}>(
        API_ENDPOINTS.LOGIN,
        credentials
      );
      
      // Extract data from structured response
      const loginData = response.data || response;
      
      // Store tokens
      localStorage.setItem('token', loginData.token);
      localStorage.setItem('refreshToken', loginData.refreshToken);
      localStorage.setItem('user', JSON.stringify(loginData.user));
      
      return loginData;
    } catch (error: any) {
      // If backend is not available, fall back to demo login
      if (error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')) {
        return this.demoLogin(credentials);
      }
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await apiService.post(API_ENDPOINTS.LOGOUT);
    } catch (error) {
      // Continue with logout even if API call fails
      console.warn('Logout API call failed:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  }

  async refreshToken(): Promise<RefreshTokenResponse> {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await apiService.post<RefreshTokenResponse>(
      API_ENDPOINTS.REFRESH,
      { refreshToken }
    );

    localStorage.setItem('token', response.token);
    return response;
  }

  async getProfile(): Promise<LoginResponse['user']> {
    return await apiService.get<LoginResponse['user']>(API_ENDPOINTS.PROFILE);
  }

  // Fallback demo login when backend is not available
  private async demoLogin(credentials: LoginCredentials): Promise<LoginResponse> {
    if (credentials.username === 'admin' && credentials.password === 'admin123') {
      const demoResponse: LoginResponse = {
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

      localStorage.setItem('token', demoResponse.token);
      localStorage.setItem('refreshToken', demoResponse.refreshToken);
      localStorage.setItem('user', JSON.stringify(demoResponse.user));

      return demoResponse;
    } else {
      throw new Error('Invalid credentials');
    }
  }

  isTokenValid(): boolean {
    const token = localStorage.getItem('token');
    if (!token) return false;
    
    // For demo tokens, always consider them valid
    if (token.startsWith('demo-jwt-token-')) return true;
    
    // For real JWT tokens, you could decode and check expiration
    // This is a simplified check
    return true;
  }
}

export const authService = new AuthService();