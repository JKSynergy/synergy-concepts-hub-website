import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useOverdue } from '../contexts/OverdueContext';
import { useAlerts } from '../contexts/AlertContext';
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Receipt, 
  FileText, 
  BarChart3, 
  Settings,
  Building2,
  DollarSign,
  AlertTriangle,
  Bell,
  PiggyBank,
  TrendingDown,
  Calendar,
  Eye
} from 'lucide-react';
import logo from '../assets/Quick Credit Logo Round.png';

const Sidebar: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { overdueCount, isLoading } = useOverdue();
  const { unreadCount } = useAlerts();

  const navigationItems = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      name: 'Overdue',
      path: '/overdue',
      icon: AlertTriangle,
      badge: overdueCount,
    },
    {
      name: 'Alerts',
      path: '/alerts',
      icon: Bell,
      badge: unreadCount,
      badgeColor: 'bg-yellow-500',
    },
    {
      name: 'Borrowers',
      path: '/borrowers',
      icon: Users,
    },
    {
      name: 'Savings',
      path: '/savings',
      icon: PiggyBank,
    },
    {
      name: 'Expenses',
      path: '/expenses',
      icon: TrendingDown,
    },
    {
      name: 'Loan Applications',
      path: '/applications',
      icon: FileText,
    },
    {
      name: 'Loans',
      path: '/loans',
      icon: CreditCard,
    },
    {
      name: 'Repayments',
      path: '/repayments',
      icon: Receipt,
    },
    {
      name: 'Reports',
      path: '/reports',
      icon: BarChart3,
    },
    {
      name: 'Monthly Overview',
      path: '/monthly-overview',
      icon: Calendar,
    },
    {
      name: 'Settings',
      path: '/settings',
      icon: Settings,
    },
  ];

  return (
    <div className="bg-white dark:bg-black shadow-lg w-64 min-h-screen transition-colors duration-200">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center">
          <img src={logo} alt="QuickCredit Logo" className="h-8 w-8" />
          <span className="ml-2 text-xl font-bold text-gray-800 dark:text-white">QuickCredit</span>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Loan Management System</p>
      </div>

      {/* Navigation */}
      <nav className="mt-6">
        <div className="px-4">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 mb-1 ${
                    isActive
                      ? 'bg-primary-50 dark:bg-primary-800 text-primary-700 dark:text-primary-300 border-r-2 border-primary-700 dark:border-primary-500'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white'
                  }`
                }
              >
                <Icon className="mr-3 h-5 w-5" />
                <span className="flex-1">{item.name}</span>
                {item.badge && item.badge > 0 && (
                  <span className={`inline-flex items-center justify-center w-6 h-6 text-xs font-bold rounded-full ${
                    item.badgeColor || 'bg-yellow-500'
                  } text-white shadow-md`}>
                    {item.name === 'Overdue' && isLoading ? (
                      <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      item.badge > 99 ? '99+' : item.badge
                    )}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Theme Toggle */}
      <div className="absolute bottom-16 w-64 px-4">
        <button 
          onClick={toggleTheme}
          className="flex items-center w-full px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg transition-colors duration-200"
        >
          <span className="text-lg mr-3">{theme === 'dark' ? '☀️' : '🌙'}</span>
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 w-64 p-4 border-t border-gray-200 dark:border-gray-800">
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
          <p>QuickCredit Modern v1.0</p>
          <p className="mt-1">© 2025 All rights reserved</p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;