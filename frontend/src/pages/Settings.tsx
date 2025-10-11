import React, { useState, useEffect } from 'react';
import { 
  Save, 
  User, 
  Lock,
  Bell,
  CreditCard,
  Mail,
  Shield,
  Database,
  Smartphone,
  Globe,
  Eye,
  EyeOff,
  Check,
  DollarSign,
  RefreshCw,
  TrendingUp
} from 'lucide-react';
import toast from 'react-hot-toast';

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState('general');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // General Settings State
  const [generalSettings, setGeneralSettings] = useState({
    companyName: 'QuickCredit Microfinance',
    registrationNumber: 'REG123456789',
    currency: 'UGX',
    timezone: 'Africa/Kampala',
    address: 'KK Building\nKalerwe - Gayaza RD\nKampala Uganda',
    phone: '+256 704 783 724',
    alternatePhone1: '+256 763 875 564',
    alternatePhone2: '+256 752 796 523',
    email: 'qcredit611@gmail.com'
  });

  // Security Settings State
  const [securitySettings, setSecuritySettings] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: true,
    sessionTimeout: '30'
  });

  // Notification Settings State
  const [notifications, setNotifications] = useState({
    email: true,
    sms: true,
    push: false,
    overdueReminders: true,
    paymentConfirmations: true,
    systemAlerts: true
  });

  // Payment Settings State
  const [paymentSettings, setPaymentSettings] = useState({
    mtnApiKey: '****************************',
    mtnAccount: '256704783724',
    airtelApiKey: '',
    airtelAccount: '',
    bankName: 'Stanbic Bank Uganda',
    accountNumber: '9030012345678'
  });

  // System Settings State
  const [systemSettings, setSystemSettings] = useState({
    minLoanAmount: 100000,
    maxLoanAmount: 10000000,
    defaultInterestRate: 15.0,
    processingFee: 2.5,
    autoBackup: true,
    backupRetention: '30'
  });

  // Currency Settings State
  const [currencySettings, setCurrencySettings] = useState({
    baseCurrency: 'UGX',
    enableMultiCurrency: true,
    autoUpdateRates: true,
    rateUpdateFrequency: 'daily', // daily, weekly, manual
    exchangeRates: {
      UGX: { rate: 1, name: 'Ugandan Shilling', symbol: 'UGX' },
      USD: { rate: 0.00027, name: 'US Dollar', symbol: '$' },
      EUR: { rate: 0.00025, name: 'Euro', symbol: '€' },
      GBP: { rate: 0.00021, name: 'British Pound', symbol: '£' },
      KES: { rate: 0.035, name: 'Kenyan Shilling', symbol: 'KSh' },
      TZS: { rate: 0.63, name: 'Tanzanian Shilling', symbol: 'TSh' }
    }
  });

  const [updatingRates, setUpdatingRates] = useState(false);
  const [lastRateUpdate, setLastRateUpdate] = useState(new Date().toISOString());

  // Currency conversion function
  const convertCurrency = (amount: number, fromCurrency: string, toCurrency: string): number => {
    if (fromCurrency === toCurrency) return amount;
    
    const fromRate = currencySettings.exchangeRates[fromCurrency as keyof typeof currencySettings.exchangeRates]?.rate || 1;
    const toRate = currencySettings.exchangeRates[toCurrency as keyof typeof currencySettings.exchangeRates]?.rate || 1;
    
    // Convert to base currency (UGX) first, then to target currency
    const baseAmount = amount / fromRate;
    return baseAmount * toRate;
  };

  // Format currency with proper symbol
  const formatCurrency = (amount: number, currency: string): string => {
    const currencyData = currencySettings.exchangeRates[currency as keyof typeof currencySettings.exchangeRates];
    if (!currencyData) return `${amount.toLocaleString()}`;
    
    const symbol = currencyData.symbol;
    const formattedAmount = amount.toLocaleString(undefined, {
      minimumFractionDigits: currency === 'UGX' ? 0 : 2,
      maximumFractionDigits: currency === 'UGX' ? 0 : 2
    });
    
    return `${symbol} ${formattedAmount}`;
  };

  // Update exchange rates (simulated - in production, fetch from API)
  const handleUpdateRates = async () => {
    setUpdatingRates(true);
    try {
      // Simulate API call to fetch latest rates
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // In production, fetch from a currency API like:
      // const response = await fetch('https://api.exchangerate-api.com/v4/latest/UGX');
      // const data = await response.json();
      
      // Simulated rate update with slight variations
      const updatedRates = { ...currencySettings.exchangeRates };
      Object.keys(updatedRates).forEach(key => {
        if (key !== 'UGX') {
          const current = updatedRates[key as keyof typeof updatedRates].rate;
          const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
          updatedRates[key as keyof typeof updatedRates].rate = current * (1 + variation);
        }
      });
      
      setCurrencySettings(prev => ({
        ...prev,
        exchangeRates: updatedRates
      }));
      
      setLastRateUpdate(new Date().toISOString());
      toast.success('Exchange rates updated successfully!');
    } catch (error) {
      toast.error('Failed to update exchange rates');
      console.error('Error updating rates:', error);
    } finally {
      setUpdatingRates(false);
    }
  };

  // Auto-update rates based on frequency
  useEffect(() => {
    if (!currencySettings.autoUpdateRates) return;
    
    const updateInterval = currencySettings.rateUpdateFrequency === 'daily' 
      ? 24 * 60 * 60 * 1000 // 24 hours
      : 7 * 24 * 60 * 60 * 1000; // 7 days
    
    const timer = setInterval(() => {
      handleUpdateRates();
    }, updateInterval);
    
    return () => clearInterval(timer);
  }, [currencySettings.autoUpdateRates, currencySettings.rateUpdateFrequency]);

  const tabs = [
    { id: 'general', name: 'General', icon: User },
    { id: 'security', name: 'Security', icon: Lock },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'payment', name: 'Payment Methods', icon: CreditCard },
    { id: 'currency', name: 'Currency & Rates', icon: DollarSign },
    { id: 'system', name: 'System', icon: Database }
  ];

  const handleNotificationChange = (key: string, value: boolean) => {
    setNotifications(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // In a real application, you would make an API call here
      // await fetch('/api/settings', {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     general: generalSettings,
      //     security: securitySettings,
      //     notifications,
      //     payment: paymentSettings,
      //     system: systemSettings
      //   })
      // });
      
      toast.success('Settings saved successfully!');
    } catch (error) {
      toast.error('Failed to save settings. Please try again.');
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!securitySettings.currentPassword) {
      toast.error('Please enter your current password');
      return;
    }
    
    if (!securitySettings.newPassword) {
      toast.error('Please enter a new password');
      return;
    }
    
    if (securitySettings.newPassword !== securitySettings.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    if (securitySettings.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }
    
    setSaving(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast.success('Password changed successfully!');
      setSecuritySettings(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));
    } catch (error) {
      toast.error('Failed to change password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Manage your account and system preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Settings Navigation */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <nav className="space-y-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center px-3 py-2 text-left rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-700'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <tab.icon className={`h-5 w-5 mr-3 ${
                    activeTab === tab.id ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'
                  }`} />
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Settings Content */}
        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            {/* General Settings */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">General Settings</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={generalSettings.companyName}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, companyName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Business Registration Number
                    </label>
                    <input
                      type="text"
                      value={generalSettings.registrationNumber}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, registrationNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Default Currency
                    </label>
                    <select 
                      value={generalSettings.currency}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, currency: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="UGX">UGX - Ugandan Shilling</option>
                      <option value="USD">USD - US Dollar</option>
                      <option value="EUR">EUR - Euro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Timezone
                    </label>
                    <select 
                      value={generalSettings.timezone}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, timezone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="Africa/Kampala">Africa/Kampala (EAT)</option>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Business Address
                  </label>
                  <textarea
                    rows={3}
                    value={generalSettings.address}
                    onChange={(e) => setGeneralSettings({ ...generalSettings, address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Primary Phone Number
                    </label>
                    <input
                      type="tel"
                      value={generalSettings.phone}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={generalSettings.email}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Alternate Phone 1
                    </label>
                    <input
                      type="tel"
                      value={generalSettings.alternatePhone1}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, alternatePhone1: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Alternate Phone 2
                    </label>
                    <input
                      type="tel"
                      value={generalSettings.alternatePhone2}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, alternatePhone2: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Security Settings */}
            {activeTab === 'security' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Security Settings</h3>
                </div>

                <div className="space-y-6">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Change Password</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Current Password
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={securitySettings.currentPassword}
                            onChange={(e) => setSecuritySettings({ ...securitySettings, currentPassword: e.target.value })}
                            className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          New Password
                        </label>
                        <input
                          type="password"
                          value={securitySettings.newPassword}
                          onChange={(e) => setSecuritySettings({ ...securitySettings, newPassword: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Confirm New Password
                        </label>
                        <input
                          type="password"
                          value={securitySettings.confirmPassword}
                          onChange={(e) => setSecuritySettings({ ...securitySettings, confirmPassword: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>

                      <button
                        onClick={handlePasswordChange}
                        disabled={saving}
                        className="bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg flex items-center"
                      >
                        {saving ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Updating...
                          </>
                        ) : (
                          <>
                            <Lock className="h-4 w-4 mr-2" />
                            Update Password
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-600 pt-6">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Two-Factor Authentication</h4>
                    <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                      <div className="flex items-center">
                        <Shield className="h-5 w-5 text-green-500 dark:text-green-400 mr-3" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">SMS Authentication</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Receive codes via SMS to your phone</p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={securitySettings.twoFactorEnabled}
                          onChange={(e) => setSecuritySettings({ ...securitySettings, twoFactorEnabled: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                      </label>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-600 pt-6">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Session Management</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700 dark:text-gray-300">Automatic logout after inactivity</span>
                        <select 
                          value={securitySettings.sessionTimeout}
                          onChange={(e) => setSecuritySettings({ ...securitySettings, sessionTimeout: e.target.value })}
                          className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        >
                          <option value="30">30 minutes</option>
                          <option value="60">1 hour</option>
                          <option value="120">2 hours</option>
                          <option value="240">4 hours</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Notifications */}
            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Notification Preferences</h3>
                </div>

                <div className="space-y-6">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Notification Channels</h4>
                    <div className="space-y-4">
                      {[
                        { key: 'email', label: 'Email Notifications', icon: Mail, description: 'Receive notifications via email' },
                        { key: 'sms', label: 'SMS Notifications', icon: Smartphone, description: 'Receive notifications via text message' },
                        { key: 'push', label: 'Push Notifications', icon: Bell, description: 'Receive browser push notifications' }
                      ].map(({ key, label, icon: Icon, description }) => (
                        <div key={key} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                          <div className="flex items-center">
                            <Icon className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-3" />
                            <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">{label}</p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
                            </div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="sr-only peer" 
                              checked={notifications[key as keyof typeof notifications]}
                              onChange={(e) => handleNotificationChange(key, e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-600 pt-6">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Notification Types</h4>
                    <div className="space-y-4">
                      {[
                        { key: 'overdueReminders', label: 'Overdue Payment Reminders', description: 'Notify when payments are overdue' },
                        { key: 'paymentConfirmations', label: 'Payment Confirmations', description: 'Notify when payments are received' },
                        { key: 'systemAlerts', label: 'System Alerts', description: 'Important system notifications and updates' }
                      ].map(({ key, label, description }) => (
                        <div key={key} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{label}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="sr-only peer" 
                              checked={notifications[key as keyof typeof notifications]}
                              onChange={(e) => handleNotificationChange(key, e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Methods */}
            {activeTab === 'payment' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Payment Method Configuration</h3>
                </div>

                <div className="space-y-6">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Mobile Money Integration</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-medium text-gray-900 dark:text-gray-100">MTN Mobile Money</h5>
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                            Active
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-sm text-gray-600 dark:text-gray-400">API Key</label>
                            <input
                              type="password"
                              value={paymentSettings.mtnApiKey}
                              onChange={(e) => setPaymentSettings({ ...paymentSettings, mtnApiKey: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 dark:text-gray-400">Collection Account</label>
                            <input
                              type="text"
                              value={paymentSettings.mtnAccount}
                              onChange={(e) => setPaymentSettings({ ...paymentSettings, mtnAccount: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-medium text-gray-900 dark:text-gray-100">Airtel Money</h5>
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200">
                            Inactive
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-sm text-gray-600 dark:text-gray-400">API Key</label>
                            <input
                              type="password"
                              placeholder="Enter API key"
                              value={paymentSettings.airtelApiKey}
                              onChange={(e) => setPaymentSettings({ ...paymentSettings, airtelApiKey: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 dark:text-gray-400">Collection Account</label>
                            <input
                              type="text"
                              placeholder="Enter account number"
                              value={paymentSettings.airtelAccount}
                              onChange={(e) => setPaymentSettings({ ...paymentSettings, airtelAccount: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-600 pt-6">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Bank Integration</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Primary Bank Account
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <input
                            type="text"
                            placeholder="Bank Name"
                            value={paymentSettings.bankName}
                            onChange={(e) => setPaymentSettings({ ...paymentSettings, bankName: e.target.value })}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          />
                          <input
                            type="text"
                            placeholder="Account Number"
                            value={paymentSettings.accountNumber}
                            onChange={(e) => setPaymentSettings({ ...paymentSettings, accountNumber: e.target.value })}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Currency & Rates */}
            {activeTab === 'currency' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Currency & Exchange Rates</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Last updated: {new Date(lastRateUpdate).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={handleUpdateRates}
                    disabled={updatingRates}
                    className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${updatingRates ? 'animate-spin' : ''}`} />
                    {updatingRates ? 'Updating...' : 'Update Rates'}
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Currency Settings */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-4">Currency Settings</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Base Currency
                        </label>
                        <select 
                          value={currencySettings.baseCurrency}
                          onChange={(e) => setCurrencySettings({ ...currencySettings, baseCurrency: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        >
                          {Object.entries(currencySettings.exchangeRates).map(([code, data]) => (
                            <option key={code} value={code}>
                              {code} - {data.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Rate Update Frequency
                        </label>
                        <select 
                          value={currencySettings.rateUpdateFrequency}
                          onChange={(e) => setCurrencySettings({ ...currencySettings, rateUpdateFrequency: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="manual">Manual Only</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">Enable Multi-Currency Support</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Allow transactions in multiple currencies</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={currencySettings.enableMultiCurrency}
                            onChange={(e) => setCurrencySettings({ ...currencySettings, enableMultiCurrency: e.target.checked })}
                          />
                          <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">Auto-Update Exchange Rates</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Automatically fetch latest rates based on frequency</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={currencySettings.autoUpdateRates}
                            onChange={(e) => setCurrencySettings({ ...currencySettings, autoUpdateRates: e.target.checked })}
                          />
                          <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Exchange Rates Table */}
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Exchange Rates</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full border border-gray-200 dark:border-gray-600 rounded-lg">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Currency</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Code</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Symbol</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">Rate (to {currencySettings.baseCurrency})</th>
                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                          {Object.entries(currencySettings.exchangeRates).map(([code, data]) => (
                            <tr key={code} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{data.name}</td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{code}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{data.symbol}</td>
                              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                                <input
                                  type="number"
                                  step="0.000001"
                                  value={data.rate}
                                  onChange={(e) => {
                                    const newRates = { ...currencySettings.exchangeRates };
                                    newRates[code as keyof typeof newRates].rate = Number(e.target.value);
                                    setCurrencySettings({ ...currencySettings, exchangeRates: newRates });
                                  }}
                                  disabled={code === currencySettings.baseCurrency}
                                  className="w-32 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-right disabled:bg-gray-100 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
                                />
                              </td>
                              <td className="px-4 py-3 text-sm text-right">
                                {code === currencySettings.baseCurrency ? (
                                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200">
                                    Base
                                  </span>
                                ) : (
                                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                                    Active
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Currency Converter */}
                  <div className="bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 rounded-lg p-6 border border-primary-200 dark:border-primary-700">
                    <div className="flex items-center mb-4">
                      <TrendingUp className="h-5 w-5 text-primary-600 dark:text-primary-400 mr-2" />
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">Currency Converter</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Amount</label>
                        <input
                          type="number"
                          placeholder="Enter amount"
                          id="converter-amount"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">From</label>
                        <select 
                          id="converter-from"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        >
                          {Object.entries(currencySettings.exchangeRates).map(([code, data]) => (
                            <option key={code} value={code}>{code} - {data.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">To</label>
                        <select 
                          id="converter-to"
                          defaultValue="USD"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        >
                          {Object.entries(currencySettings.exchangeRates).map(([code, data]) => (
                            <option key={code} value={code}>{code} - {data.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const amount = Number((document.getElementById('converter-amount') as HTMLInputElement)?.value || 0);
                        const from = (document.getElementById('converter-from') as HTMLSelectElement)?.value;
                        const to = (document.getElementById('converter-to') as HTMLSelectElement)?.value;
                        
                        if (amount > 0) {
                          const result = convertCurrency(amount, from, to);
                          const fromCurrency = currencySettings.exchangeRates[from as keyof typeof currencySettings.exchangeRates];
                          const toCurrency = currencySettings.exchangeRates[to as keyof typeof currencySettings.exchangeRates];
                          toast.success(
                            `${fromCurrency.symbol} ${amount.toLocaleString()} = ${toCurrency.symbol} ${result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                            { duration: 5000 }
                          );
                        } else {
                          toast.error('Please enter a valid amount');
                        }
                      }}
                      className="mt-4 w-full bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg flex items-center justify-center transition-colors"
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      Convert
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* System Settings */}
            {activeTab === 'system' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">System Configuration</h3>
                </div>

                <div className="space-y-6">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Loan Parameters</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Minimum Loan Amount
                        </label>
                        <input
                          type="number"
                          value={systemSettings.minLoanAmount}
                          onChange={(e) => setSystemSettings({ ...systemSettings, minLoanAmount: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Maximum Loan Amount
                        </label>
                        <input
                          type="number"
                          value={systemSettings.maxLoanAmount}
                          onChange={(e) => setSystemSettings({ ...systemSettings, maxLoanAmount: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Default Interest Rate (%)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={systemSettings.defaultInterestRate}
                          onChange={(e) => setSystemSettings({ ...systemSettings, defaultInterestRate: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Processing Fee (%)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={systemSettings.processingFee}
                          onChange={(e) => setSystemSettings({ ...systemSettings, processingFee: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-600 pt-6">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Backup & Recovery</h4>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">Automatic Database Backup</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Backup database daily at 2:00 AM</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={systemSettings.autoBackup}
                            onChange={(e) => setSystemSettings({ ...systemSettings, autoBackup: e.target.checked })}
                          />
                          <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700 dark:text-gray-300">Backup Retention Period</span>
                        <select 
                          value={systemSettings.backupRetention}
                          onChange={(e) => setSystemSettings({ ...systemSettings, backupRetention: e.target.value })}
                          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        >
                          <option value="7">7 days</option>
                          <option value="30">30 days</option>
                          <option value="90">90 days</option>
                          <option value="365">1 year</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-600 pt-6">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">System Information</h4>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Application Version:</span>
                          <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">v1.0.0</span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Database Version:</span>
                          <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">PostgreSQL 14.2</span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Last Backup:</span>
                          <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">Today, 2:00 AM</span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">System Uptime:</span>
                          <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">7 days, 14 hours</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-6 border-t border-gray-200 dark:border-gray-600">
              <button 
                onClick={handleSaveSettings}
                disabled={saving}
                className="bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg flex items-center transition-colors"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
