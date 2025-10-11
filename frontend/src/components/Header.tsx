import React, { useState, useRef, useEffect } from 'react';
import { Bell, User, LogOut, ChevronDown, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAlerts } from '../contexts/AlertContext';
import logo from '../assets/Quick Credit Logo Round.png';

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const { alerts, unreadCount, markAsRead } = useAlerts();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleNotificationClick = () => {
    setIsNotificationOpen(!isNotificationOpen);
  };

  const handleAlertClick = (alertId: string) => {
    markAsRead(alertId);
    setIsNotificationOpen(false);
    navigate('/alerts');
  };

  const handleViewAllAlerts = () => {
    setIsNotificationOpen(false);
    navigate('/alerts');
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'payment': return CheckCircle;
      case 'application': return Info;
      case 'overdue': return AlertTriangle;
      default: return Bell;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    
    if (diffHours < 1) {
      return 'Just now';
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  // Get the 5 most recent unread alerts for the dropdown
  const recentAlerts = alerts.filter(alert => !alert.isRead).slice(0, 5);

  return (
    <header className="bg-white dark:bg-black shadow-sm border-b border-gray-200 dark:border-gray-800 transition-colors duration-200">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Left section */}
        <div className="flex items-center">
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
            Welcome back, {user?.firstName}!
          </h1>
        </div>

        {/* Right section */}
        <div className="flex items-center space-x-4">
          {/* Company Logo */}
          <div className="flex items-center space-x-2">
            <img src={logo} alt="QuickCredit" className="h-8 w-8" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">QuickCredit</span>
          </div>

          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button 
              onClick={handleNotificationClick}
              className="relative p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-colors"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 bg-yellow-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {isNotificationOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-900 rounded-lg shadow-lg ring-1 ring-gray-200 dark:ring-gray-700 z-50">
                <div className="py-2">
                  <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">Notifications</h3>
                      {unreadCount > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {unreadCount} unread
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="max-h-80 overflow-y-auto">
                    {recentAlerts.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <Bell className="mx-auto h-8 w-8 text-gray-400 dark:text-gray-500 mb-2" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">No new notifications</p>
                      </div>
                    ) : (
                      recentAlerts.map((alert) => {
                        const IconComponent = getAlertIcon(alert.type);
                        return (
                          <div
                            key={alert.id}
                            onClick={() => handleAlertClick(alert.id)}
                            className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer border-b border-gray-100 dark:border-gray-800 last:border-0"
                          >
                            <div className="flex items-start space-x-3">
                              <div className="flex-shrink-0">
                                <div className={`p-1.5 rounded-full ${
                                  alert.type === 'payment' ? 'bg-green-100 dark:bg-green-900/30' :
                                  alert.type === 'application' ? 'bg-blue-100 dark:bg-blue-900/30' :
                                  alert.type === 'overdue' ? 'bg-red-100 dark:bg-red-900/30' :
                                  'bg-gray-100 dark:bg-gray-800'
                                }`}>
                                  <IconComponent className={`h-3 w-3 ${
                                    alert.type === 'payment' ? 'text-green-600 dark:text-green-400' :
                                    alert.type === 'application' ? 'text-blue-600 dark:text-blue-400' :
                                    alert.type === 'overdue' ? 'text-red-600 dark:text-red-400' :
                                    'text-gray-600 dark:text-gray-400'
                                  }`} />
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {alert.title}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
                                  {alert.message}
                                </p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                  {formatTimestamp(alert.timestamp)}
                                </p>
                              </div>
                              <div className="flex-shrink-0">
                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  
                  {recentAlerts.length > 0 && (
                    <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={handleViewAllAlerts}
                        className="w-full text-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                      >
                        View all notifications
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center space-x-2 p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-colors"
            >
              <div className="h-8 w-8 bg-primary-100 dark:bg-primary-800 rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-primary-600 dark:text-primary-300" />
              </div>
              <span className="text-sm font-medium">{user?.firstName}</span>
              <ChevronDown className="h-4 w-4" />
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-black rounded-lg shadow-lg ring-1 ring-gray-200 dark:ring-gray-800 z-50">
                <div className="py-1">
                  <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.firstName} {user?.lastName}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
                  </div>
                  <button className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900">
                    <User className="mr-3 h-4 w-4" />
                    Profile
                  </button>
                  <button 
                    onClick={logout}
                    className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-900"
                  >
                    <LogOut className="mr-3 h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;