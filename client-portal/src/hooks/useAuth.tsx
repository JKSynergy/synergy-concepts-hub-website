import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Borrower, AuthResponse, LoginCredentials, RegisterData } from '../types';
import { authApi } from '../services/api';

interface AuthContextType {
  user: Borrower | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<AuthResponse>;
  register: (data: RegisterData) => Promise<AuthResponse>;
  logout: () => void;
  updateUser: (user: Borrower) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<Borrower | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const token = localStorage.getItem('client_auth_token');
        if (token) {
          // Verify token and get user info
          const userData = await authApi.verifyToken();
          if (userData.success && userData.user) {
            setUser(userData.user);
          } else {
            localStorage.removeItem('client_auth_token');
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        localStorage.removeItem('client_auth_token');
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (credentials: LoginCredentials): Promise<AuthResponse> => {
    try {
      setIsLoading(true);
      
      // Call the real backend API for authentication
      const response = await authApi.login(credentials);
      
      if (response.success && response.token && response.user) {
        localStorage.setItem('client_auth_token', response.token);
        setUser(response.user);
      }
      
      return response;
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: 'Login failed. Please try again.',
      };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: RegisterData): Promise<AuthResponse> => {
    try {
      setIsLoading(true);
      const response = await authApi.register(data);
      
      if (response.success && response.token && response.user) {
        localStorage.setItem('client_auth_token', response.token);
        setUser(response.user);
      }
      
      return response;
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        message: 'Registration failed. Please try again.',
      };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('client_auth_token');
    setUser(null);
  };

  const updateUser = (updatedUser: Borrower) => {
    setUser(updatedUser);
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};