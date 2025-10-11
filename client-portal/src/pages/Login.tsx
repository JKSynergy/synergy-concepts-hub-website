import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LoginCredentials } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<LoginCredentials>({
    phone: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await login(formData);
      
      if (response.success) {
        toast.success('Welcome back!');
        navigate('/dashboard');
      } else {
        toast.error(response.message || 'Login failed');
      }
    } catch (error) {
      toast.error('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Image with overlay */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-primary-600">
        {/* Background image overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: 'url("/money-bg.jpg")',
            opacity: 0.5
          }}
        />
        
        {/* Greenish gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-600/60 via-primary-500/50 to-primary-700/60" />
        
        {/* Content on image side */}
        <div className="relative z-10 flex items-center justify-center w-full p-12">
          <div className="text-white text-center max-w-md">
            <h1 className="text-4xl font-bold mb-4 drop-shadow-lg">Welcome to QuickCredit</h1>
            <p className="text-lg opacity-90 drop-shadow-md">
              Empowering financial growth through accessible lending solutions
            </p>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md space-y-8">
          {/* Logo and Header */}
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <img 
                src="/logo.png" 
                alt="QuickCredit Logo" 
                className="h-24 w-24 object-contain"
              />
            </div>
            {/* Divider line under logo - extends well beyond the logo */}
            <div className="w-72 h-0.5 bg-primary-500 mx-auto mb-6"></div>
            
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              Self-Service Portal
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              Review your portfolio. Manage your loans. Apply for new loans.<br />
              Make Payment. Update your profile
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6 mt-8">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address or Member Number:
              </label>
              <input
                id="phone"
                name="phone"
                type="text"
                required
                className="w-full px-4 py-3 border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                placeholder="Enter your email or member number"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="w-full px-4 py-3 border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary-500 hover:bg-primary-600 text-white font-semibold py-3 px-6 transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <LoadingSpinner size="small" />
                  <span className="ml-2">Signing in...</span>
                </span>
              ) : (
                'Login As Customer'
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate('/register')}
              className="w-full bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 px-6 border-2 border-gray-300 transition-all transform hover:scale-[1.02]"
            >
              Create Account
            </button>

            <div className="flex items-center justify-between text-sm pt-4">
              <Link
                to="/forgot-password"
                className="text-primary-500 hover:text-primary-600 font-medium"
              >
                Forgot Your Password?
              </Link>
              <Link
                to="/agent-login"
                className="text-primary-500 hover:text-primary-600 font-medium"
              >
                Login as Agent
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;