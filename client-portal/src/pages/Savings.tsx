import React, { useState, useEffect } from 'react';
import { 
  PiggyBankIcon, 
  PlusIcon, 
  MinusIcon, 
  TrendingUpIcon,
  CalendarIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  AlertCircleIcon
} from 'lucide-react';
import { savingsApi, SavingsAccount, SavingsTransaction } from '../services/savingsApi';
import { formatDate } from '../utils/dateFormatter';
import { toast } from 'react-hot-toast';

const Savings: React.FC = () => {
  const [account, setAccount] = useState<SavingsAccount | null>(null);
  const [transactions, setTransactions] = useState<SavingsTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState('MTN_MOBILE_MONEY');
  const [depositDescription, setDepositDescription] = useState('');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalDescription, setWithdrawalDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [accountRes, transactionsRes] = await Promise.all([
        savingsApi.getAccount(),
        savingsApi.getTransactions(1, 20)
      ]);

      if (accountRes.success) {
        setAccount(accountRes.data);
      }

      if (transactionsRes.success) {
        setTransactions(transactionsRes.data);
      }
    } catch (error) {
      console.error('Failed to fetch savings data:', error);
      toast.error('Failed to load savings data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      setSubmitting(true);
      const response = await savingsApi.makeDeposit({
        amount,
        description: depositDescription || 'Savings deposit',
        paymentMethod: depositMethod
      });

      if (response.success) {
        toast.success(response.message || 'Deposit successful');
        setShowDepositModal(false);
        setDepositAmount('');
        setDepositDescription('');
        fetchData();
      } else {
        toast.error(response.message || 'Deposit failed');
      }
    } catch (error: any) {
      console.error('Deposit error:', error);
      toast.error(error.response?.data?.message || 'Failed to process deposit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const amount = parseFloat(withdrawalAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (account && amount > account.balance) {
      toast.error('Insufficient balance');
      return;
    }

    try {
      setSubmitting(true);
      const response = await savingsApi.requestWithdrawal({
        amount,
        description: withdrawalDescription || 'Savings withdrawal'
      });

      if (response.success) {
        toast.success(response.message || 'Withdrawal successful');
        setShowWithdrawalModal(false);
        setWithdrawalAmount('');
        setWithdrawalDescription('');
        fetchData();
      } else {
        toast.error(response.message || 'Withdrawal failed');
      }
    } catch (error: any) {
      console.error('Withdrawal error:', error);
      toast.error(error.response?.data?.message || 'Failed to process withdrawal');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Calculate estimated annual interest
  const estimatedAnnualInterest = account 
    ? (account.balance * account.interestRate) / 100 
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Savings Account</h1>
          <p className="text-gray-600 mt-1">Manage your savings and track your progress</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowDepositModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <PlusIcon className="w-5 h-5" />
            Deposit
          </button>
          <button
            onClick={() => setShowWithdrawalModal(true)}
            disabled={!account || account.balance <= 0}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <MinusIcon className="w-5 h-5" />
            Withdraw
          </button>
        </div>
      </div>

      {/* Account Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Current Balance */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-white/20 p-3 rounded-lg">
              <PiggyBankIcon className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium opacity-90">Current Balance</span>
          </div>
          <div className="text-3xl font-bold mb-1">
            {account ? formatCurrency(account.balance) : formatCurrency(0)}
          </div>
          <div className="text-sm opacity-75">
            Account ID: {account?.savingsId || 'No account'}
          </div>
        </div>

        {/* Interest Rate */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-green-100 p-3 rounded-lg">
              <TrendingUpIcon className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-sm font-medium text-gray-600">Interest Rate</span>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {account ? `${account.interestRate}%` : '0%'}
          </div>
          <div className="text-sm text-gray-500">Per annum</div>
        </div>

        {/* Estimated Annual Interest */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-purple-100 p-3 rounded-lg">
              <CalendarIcon className="w-6 h-6 text-purple-600" />
            </div>
            <span className="text-sm font-medium text-gray-600">Est. Annual Interest</span>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {formatCurrency(estimatedAnnualInterest)}
          </div>
          <div className="text-sm text-gray-500">Based on current balance</div>
        </div>
      </div>

      {/* No Account Message */}
      {!account && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <AlertCircleIcon className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                No Savings Account Yet
              </h3>
              <p className="text-yellow-800 mb-4">
                You don't have a savings account yet. Click the "Deposit" button to create one and start saving!
              </p>
              <button
                onClick={() => setShowDepositModal(true)}
                className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors"
              >
                Create Account & Deposit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Recent Transactions</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <PiggyBankIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No transactions yet</p>
              <p className="text-sm mt-1">Your transaction history will appear here</p>
            </div>
          ) : (
            transactions.map((transaction) => (
              <div key={transaction.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${
                      transaction.type === 'DEPOSIT' 
                        ? 'bg-green-100' 
                        : 'bg-red-100'
                    }`}>
                      {transaction.type === 'DEPOSIT' ? (
                        <ArrowDownIcon className={`w-5 h-5 ${
                          transaction.type === 'DEPOSIT' 
                            ? 'text-green-600' 
                            : 'text-red-600'
                        }`} />
                      ) : (
                        <ArrowUpIcon className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">
                        {transaction.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'}
                      </div>
                      <div className="text-sm text-gray-500">{transaction.description}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {formatDate(transaction.transactionDate)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xl font-bold ${
                      transaction.type === 'DEPOSIT' 
                        ? 'text-green-600' 
                        : 'text-red-600'
                    }`}>
                      {transaction.type === 'DEPOSIT' ? '+' : '-'}
                      {formatCurrency(transaction.amount)}
                    </div>
                    <div className="text-sm text-gray-500">
                      Balance: {formatCurrency(transaction.balance)}
                    </div>
                    <span className={`inline-block mt-1 px-2 py-1 text-xs rounded-full ${
                      transaction.status === 'COMPLETED'
                        ? 'bg-green-100 text-green-800'
                        : transaction.status === 'PENDING'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {transaction.status}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Make Deposit</h3>
            <form onSubmit={handleDeposit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount (UGX) *
                </label>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter amount"
                  required
                  min="1000"
                  step="1000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method *
                </label>
                <select
                  value={depositMethod}
                  onChange={(e) => setDepositMethod(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="MTN_MOBILE_MONEY">MTN Mobile Money</option>
                  <option value="AIRTEL_MONEY">Airtel Money</option>
                  <option value="AFRICELL_MONEY">Africell Money</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={depositDescription}
                  onChange={(e) => setDepositDescription(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Monthly savings"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowDepositModal(false);
                    setDepositAmount('');
                    setDepositDescription('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400"
                >
                  {submitting ? 'Processing...' : 'Confirm Deposit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Withdrawal Modal */}
      {showWithdrawalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Request Withdrawal</h3>
            <form onSubmit={handleWithdrawal} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount (UGX) *
                </label>
                <input
                  type="number"
                  value={withdrawalAmount}
                  onChange={(e) => setWithdrawalAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter amount"
                  required
                  min="1000"
                  step="1000"
                  max={account?.balance || 0}
                />
                <p className="text-sm text-gray-500 mt-1">
                  Available balance: {account ? formatCurrency(account.balance) : formatCurrency(0)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={withdrawalDescription}
                  onChange={(e) => setWithdrawalDescription(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Emergency expense"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowWithdrawalModal(false);
                    setWithdrawalAmount('');
                    setWithdrawalDescription('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400"
                >
                  {submitting ? 'Processing...' : 'Confirm Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Savings;