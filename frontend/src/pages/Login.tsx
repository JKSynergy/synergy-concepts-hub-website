import React, { useState } from 'react';
import { Eye, EyeOff, Briefcase } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/Quick Credit Logo Round.png';
import adminPhoto from '../assets/Admin.jpg';

interface UserCard {
  role: string;
  username: string;
  password: string;
  photo?: string;
  icon?: React.ReactNode;
  bgColor: string;
}

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const userCards: UserCard[] = [
    {
      role: 'Admin',
      username: 'admin',
      password: 'QuickCredit2025!',
      photo: adminPhoto,
      bgColor: 'from-blue-500 to-blue-600'
    },
    {
      role: 'Finance Manager',
      username: 'finance',
      password: 'Finance2025!',
      icon: <Briefcase className="h-12 w-12" />,
      bgColor: 'from-purple-500 to-purple-600'
    }
  ];

  const handleCardClick = (user: UserCard) => {
    setSelectedCard(user.role);
    setUsername(user.username);
    setPassword(user.password);
    // Add a small delay for animation effect
    setTimeout(() => setSelectedCard(null), 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const success = await login(username, password);
      if (success) {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Image with overlay and zoom animation */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-primary-600 overflow-hidden">
        {/* Background image with subtle zoom animation */}
        <div 
          className="absolute inset-0 bg-cover bg-center animate-zoom-slow"
          style={{
            backgroundImage: 'url("/money-bg.jpg")',
            opacity: 0.5,
            animation: 'zoom 20s ease-in-out infinite alternate'
          }}
        />
        
        {/* Greenish gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-600/60 via-primary-500/50 to-primary-700/60" />
        
        {/* Content on image side */}
        <div className="relative z-10 flex flex-col items-center justify-between w-full p-12 h-full">
          <div className="text-white text-center max-w-md flex-1 flex flex-col justify-center">
            <h1 className="text-4xl font-bold mb-4 drop-shadow-lg animate-fade-in">Welcome to QuickCredit</h1>
            <p className="text-lg opacity-90 drop-shadow-md animate-fade-in-delay">
              Empowering financial growth through accessible lending solutions
            </p>
          </div>

          {/* Contact Information - Clean inline style */}
          <div className="text-white text-sm opacity-90 animate-fade-in-delay-2">
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                +256 704 783 724
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                qcredit611@gmail.com
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                www.quickcredit.ug
              </span>
            </div>
          </div>
        </div>

        {/* Add keyframe animation styles */}
        <style>{`
          @keyframes zoom {
            0% {
              transform: scale(1);
            }
            100% {
              transform: scale(1.1);
            }
          }
          @keyframes fade-in {
            from {
              opacity: 0;
              transform: translateY(-10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .animate-fade-in {
            animation: fade-in 1s ease-out;
          }
          .animate-fade-in-delay {
            animation: fade-in 1s ease-out 0.3s both;
          }
          .animate-fade-in-delay-2 {
            animation: fade-in 1s ease-out 0.6s both;
          }
        `}</style>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white overflow-y-auto">
        <div className="w-full max-w-md space-y-8">
          {/* Logo and Header */}
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <img 
                src={logo} 
                alt="QuickCredit Logo" 
                className="h-24 w-24 object-contain"
              />
            </div>
            {/* Divider line under logo - extends almost full width */}
            <div className="w-[90%] h-0.5 bg-primary-500 mx-auto mb-6"></div>
            
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              Admin Portal
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              Select your role or enter credentials manually
            </p>
          </div>

          {/* Beautiful User Cards */}
          <div className="grid grid-cols-2 gap-4">
            {userCards.map((user, index) => (
              <div
                key={user.role}
                onClick={() => handleCardClick(user)}
                className={`
                  relative cursor-pointer group overflow-hidden
                  bg-gradient-to-br ${user.bgColor}
                  shadow-lg
                  transform transition-all duration-300
                  hover:scale-105 hover:shadow-2xl
                  ${selectedCard === user.role ? 'scale-95' : ''}
                `}
                style={{
                  animation: `slideInUp 0.6s ease-out ${index * 0.2}s both`
                }}
              >
                {/* Shine effect on hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 transform -skew-x-12 group-hover:translate-x-full" 
                     style={{ transition: 'transform 0.8s ease-out' }}
                />
                
                {/* Image/Icon Section - Top Half */}
                <div className="relative h-32 flex items-center justify-center bg-white/10">
                  {user.photo ? (
                    <img 
                      src={user.photo} 
                      alt={user.role}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex items-center justify-center text-white">
                      {user.icon}
                    </div>
                  )}
                </div>
                
                {/* Text Section - Bottom Half */}
                <div className="relative z-10 p-4 text-center text-white bg-gradient-to-b from-transparent to-black/20">
                  {/* Role name */}
                  <h3 className="text-lg font-bold mb-1">{user.role}</h3>
                  
                  {/* Credentials hint */}
                  <p className="text-xs opacity-90">
                    Click to auto-fill
                  </p>
                </div>

                {/* Ripple effect on click */}
                {selectedCard === user.role && (
                  <div className="absolute inset-0 bg-white/30 animate-ping" />
                )}
              </div>
            ))}
          </div>

          <style>{`
            @keyframes slideInUp {
              from {
                opacity: 0;
                transform: translateY(30px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}</style>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="w-full px-4 py-3 border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="w-full px-4 py-3 pr-10 border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold py-3 px-6 transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg hover:shadow-xl"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  <span>Signing in...</span>
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="text-center text-xs text-gray-500 pt-4">
            <p>© 2025 QuickCredit. All rights reserved.</p>
            <p className="mt-1">Powered by Modern Loan Management Technology</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
