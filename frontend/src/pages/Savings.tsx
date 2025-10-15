import React, { useState, useEffect } from 'react';
import { PiggyBank, Plus, Search, Filter, Eye, Download, ArrowUpCircle, ArrowDownCircle, X, Save, FileText, Clock, TrendingUp, TrendingDown, Activity, DollarSign, Users, Calendar } from 'lucide-react';
import { databaseService, SavingsData } from '../services/databaseService';
import { formatDate } from '../utils/dateUtils';
import jsPDF from 'jspdf';

// TODO: Add Saver, Deposit, Withdrawal types when backend endpoints are ready
interface Saver {
  id: string;
  name: string;
  phone: string;
  email?: string;
  registrationDate: string;
  status?: string;
}

interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  date: string;
  method?: string;
  description?: string;
}

interface SavingsAccount extends SavingsData {
  accountNumber?: string;
  accountType?: string;
}

const Savings: React.FC = () => {
  const [savers, setSavers] = useState<Saver[]>([]);
  const [savings, setSavings] = useState<SavingsData[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedAccountTransactions, setSelectedAccountTransactions] = useState<Transaction[]>([]);
  const [selectedSaver, setSelectedSaver] = useState<Saver | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'savers' | 'accounts'>('accounts'); // Default to accounts since savers not available
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 12;
  
  // Modal states
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSaverViewModalOpen, setIsSaverViewModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<SavingsData | null>(null);
  // const [selectedSaver, setSelectedSaver] = useState<Saver | null>(null);
  // const [selectedAccountTransactions, setSelectedAccountTransactions] = useState<Transaction[]>([]);
  
  // Form states
  const [newSaverForm, setNewSaverForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    nationalId: '',
    occupation: ''
  });

  // State for real transaction data
  const [realDeposits, setRealDeposits] = useState<any[]>([]);
  const [realWithdrawals, setRealWithdrawals] = useState<any[]>([]);
  const [transactionDataLoaded, setTransactionDataLoaded] = useState(false);

  const [newAccountForm, setNewAccountForm] = useState({
    saverId: '',
    accountType: 'Savings',
    initialDeposit: '',
    interestRate: '5.0'
  });
  
  // Transaction form state
  const [transactionForm, setTransactionForm] = useState({
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    const loadSavingsData = async () => {
      try {
        setLoading(true);
        const savingsData = await databaseService.getSavings();
        
        // TODO: Load savers when endpoint is available
        // const saversData = await databaseService.getSavers();
        // setSavers(saversData);
        
        setSavings(savingsData);
        
        // Create savers data from savings accounts (unique borrowers)
        const uniqueSavers = savingsData.reduce((acc: Saver[], account: SavingsData) => {
          if (account.borrower) {
            const existingSaver = acc.find(saver => saver.id === account.borrowerId);
            if (!existingSaver) {
              acc.push({
                id: account.borrowerId,
                name: `${account.borrower.firstName} ${account.borrower.lastName}`,
                phone: account.borrower.phone || 'N/A',
                email: account.borrower.email || '',
                registrationDate: new Date().toISOString(), // Use current date as fallback
                status: 'Active'
              });
            }
          }
          return acc;
        }, []);
        setSavers(uniqueSavers);
        
        console.log('💰 Savings accounts loaded:', savingsData.length);
        console.log('👥 Savers created:', uniqueSavers.length);
        
        if (savingsData.length > 0) {
          console.log('🏦 Sample savings account:', savingsData[0]);
        }

        // Load real transaction data for accurate statistics
        try {
          const [depositsData, withdrawalsData] = await Promise.all([
            databaseService.getDeposits(),
            databaseService.getWithdrawals()
          ]);
          
          console.log('📊 Loaded real transaction data:', {
            deposits: depositsData.length,
            withdrawals: withdrawalsData.length
          });
          
          // Calculate real statistics using actual transaction data
          const totalDeposits = depositsData.reduce((sum, deposit) => sum + deposit.amount, 0);
          const totalWithdrawals = withdrawalsData.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
          const netSavings = totalDeposits - totalWithdrawals;
          
          // Store real transaction data for statistics
          setRealDeposits(depositsData);
          setRealWithdrawals(withdrawalsData);
          setTransactionDataLoaded(true);

          console.log('📈 Updated statistics with real data:', {
            totalDeposits,
            totalWithdrawals,
            netSavings,
            totalSavers: savingsData.length
          });

        } catch (transactionError) {
          console.error('Failed to load transaction data:', transactionError);
          // Keep the existing fake stats as fallback
        }

      } catch (error) {
        console.error('Failed to load savings data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSavingsData();
  }, []);

  // Reset pagination when search term or active tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab]);

  // Format UGX currency
  const formatUGX = (amount: number) => {
    return `UGX ${amount.toLocaleString()}`;
  };

  // Action handlers
  const handleViewAccount = async (account: SavingsAccount) => {
    setSelectedAccount(account);
    
    // Load real transactions for this account
    try {
      console.log('🔍 Loading transactions for account:', account.savingsId);
      
      // Ensure deposits and withdrawals are loaded
      let deposits = realDeposits;
      let withdrawals = realWithdrawals;
      
      // If not loaded yet, fetch them now
      if (deposits.length === 0 || withdrawals.length === 0) {
        console.log('📥 Fetching deposits and withdrawals data...');
        const [depositsResponse, withdrawalsResponse] = await Promise.all([
          databaseService.getDeposits(),
          databaseService.getWithdrawals()
        ]);
        
        deposits = depositsResponse || [];
        withdrawals = withdrawalsResponse || [];
        
        // Update state for future use
        setRealDeposits(deposits);
        setRealWithdrawals(withdrawals);
        
        console.log('✅ Loaded:', deposits.length, 'deposits,', withdrawals.length, 'withdrawals');
      }
      
      const accountTransactions: Transaction[] = [];
      
      // Get deposits for this account
      const accountDeposits = deposits.filter(d => d.accountId === account.savingsId);
      console.log('💰 Found', accountDeposits.length, 'deposits for', account.savingsId);
      
      accountDeposits.forEach(deposit => {
        accountTransactions.push({
          id: deposit.depositId,
          type: 'deposit',
          amount: deposit.amount,
          date: deposit.depositDate,
          method: deposit.method,
          description: `Deposit via ${deposit.method}`
        });
      });
      
      // Get withdrawals for this account
      const accountWithdrawals = withdrawals.filter(w => w.accountId === account.savingsId);
      console.log('💸 Found', accountWithdrawals.length, 'withdrawals for', account.savingsId);
      
      accountWithdrawals.forEach(withdrawal => {
        accountTransactions.push({
          id: withdrawal.withdrawalId,
          type: 'withdrawal',
          amount: withdrawal.amount,
          date: withdrawal.withdrawalDate,
          method: withdrawal.method,
          description: `Withdrawal via ${withdrawal.method}`
        });
      });
      
      // Sort by date (most recent first)
      accountTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setSelectedAccountTransactions(accountTransactions);
      console.log(`✅ Loaded ${accountTransactions.length} total transactions for ${account.savingsId}`);
    } catch (error) {
      console.error('❌ Failed to load transactions:', error);
      setSelectedAccountTransactions([]);
    }
    
    setIsViewModalOpen(true);
  };

  const handleViewSaver = (saver: Saver) => {
    setSelectedSaver(saver);
    setIsSaverViewModalOpen(true);
  };

  const handleWithdraw = (account: SavingsAccount) => {
    setSelectedAccount(account);
    setIsWithdrawModalOpen(true);
  };

  const handleDeposit = (account: SavingsAccount) => {
    setSelectedAccount(account);
    setIsDepositModalOpen(true);
  };

  const handleTransactionSubmit = async (type: 'withdraw' | 'deposit') => {
    if (!selectedAccount || !transactionForm.amount) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const amount = parseFloat(transactionForm.amount);
      const newBalance = type === 'withdraw' 
        ? selectedAccount.balance - amount 
        : selectedAccount.balance + amount;

      if (type === 'withdraw' && newBalance < 0) {
        alert('Insufficient funds for this withdrawal');
        return;
      }

      // Update the account balance in state
      setSavings(prev => prev.map(account => 
        account.id === selectedAccount.id 
          ? { ...account, balance: newBalance }
          : account
      ));

      // Reset form and close modal
      setTransactionForm({
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0]
      });
      
      setIsWithdrawModalOpen(false);
      setIsDepositModalOpen(false);
      setSelectedAccount(null);

      alert(`${type === 'withdraw' ? 'Withdrawal' : 'Deposit'} completed successfully!`);
      
    } catch (error) {
      console.error('Transaction failed:', error);
      alert('Transaction failed. Please try again.');
    }
  };

  const handleDownloadStatement = async (account: SavingsAccount) => {
    try {
      // Get transactions for this account - TODO: implement when service is ready
      // const accountTransactions = realDataService.getTransactionsForAccount(account.id);
      const accountTransactions: Transaction[] = [];
      
      // Create PDF statement
      const pdf = new jsPDF();
      
      // Set font
      pdf.setFont('helvetica');
      
      // Header
      pdf.setFontSize(20);
      pdf.setTextColor(34, 197, 94); // Green color
      pdf.text('QUICKCREDIT SAVINGS STATEMENT', 20, 30);
      
      // Divider line
      pdf.setLineWidth(0.5);
      pdf.setDrawColor(34, 197, 94);
      pdf.line(20, 35, 190, 35);
      
      // Statement details
      pdf.setFontSize(12);
      pdf.setTextColor(0, 0, 0);
      
      let yPos = 50;
      const lineHeight = 8;
      
      pdf.text(`Statement Date: ${new Date().toLocaleDateString()}`, 20, yPos);
      yPos += lineHeight * 2;
      
      pdf.setFontSize(14);
      pdf.text('ACCOUNT INFORMATION', 20, yPos);
      yPos += lineHeight;
      
      pdf.setFontSize(11);
      pdf.text(`Account ID: ${account.savingsId}`, 25, yPos);
      yPos += lineHeight;
      pdf.text(`Customer Name: ${account.borrower ? `${account.borrower.firstName} ${account.borrower.lastName}` : 'N/A'}`, 25, yPos);
      yPos += lineHeight;
      pdf.text(`Phone: ${account.borrower?.phone || 'N/A'}`, 25, yPos);
      yPos += lineHeight;
      pdf.text(`Opening Date: ${formatDate(account.createdAt)}`, 25, yPos);
      yPos += lineHeight * 1.5;
      
      pdf.setFontSize(14);
      pdf.text('ACCOUNT SUMMARY', 20, yPos);
      yPos += lineHeight;
      
      pdf.setFontSize(11);
      pdf.text(`Current Balance: ${formatUGX(account.balance)}`, 25, yPos);
      yPos += lineHeight;
      pdf.text(`Interest Rate: ${account.interestRate}%`, 25, yPos);
      yPos += lineHeight;
      pdf.text(`Account Status: ${account.status}`, 25, yPos);
      yPos += lineHeight;
      pdf.text(`Last Updated: ${formatDate(account.updatedAt)}`, 25, yPos);
      yPos += lineHeight * 2;
      
      // Transaction History Section
      if (accountTransactions.length > 0) {
        pdf.setFontSize(14);
        pdf.text('TRANSACTION HISTORY', 20, yPos);
        yPos += lineHeight;
        
        // Table headers
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Date', 25, yPos);
        pdf.text('Type', 60, yPos);
        pdf.text('Amount', 95, yPos);
        pdf.text('Method', 135, yPos);
        yPos += lineHeight * 0.5;
        
        // Header line
        pdf.setLineWidth(0.3);
        pdf.line(25, yPos, 180, yPos);
        yPos += lineHeight * 0.5;
        
        // Transaction rows
        pdf.setFont('helvetica', 'normal');
        const displayTransactions = accountTransactions.slice(0, 15); // Limit to 15 transactions for space
        
        displayTransactions.forEach((transaction) => {
          if (yPos > 250) { // Start new page if needed
            pdf.addPage();
            yPos = 30;
          }
          
          pdf.text(formatDate(transaction.date), 25, yPos);
          pdf.text(transaction.type.toUpperCase(), 60, yPos);
          
          // Color amount based on type
          if (transaction.type === 'deposit') {
            pdf.setTextColor(34, 197, 94); // Green for deposits
            pdf.text(`+${formatUGX(transaction.amount)}`, 95, yPos);
          } else {
            pdf.setTextColor(239, 68, 68); // Red for withdrawals
            pdf.text(`-${formatUGX(transaction.amount)}`, 95, yPos);
          }
          
          pdf.setTextColor(0, 0, 0); // Reset to black
          pdf.text(transaction.method || 'N/A', 135, yPos);
          yPos += lineHeight;
        });
        
        if (accountTransactions.length > 15) {
          yPos += lineHeight * 0.5;
          pdf.setFontSize(9);
          pdf.setTextColor(100, 100, 100);
          pdf.text(`... and ${accountTransactions.length - 15} more transactions`, 25, yPos);
          pdf.setTextColor(0, 0, 0);
        }
        
        yPos += lineHeight * 2;
      } else {
        pdf.setFontSize(12);
        pdf.setTextColor(100, 100, 100);
        pdf.text('No transactions found for this account.', 25, yPos);
        pdf.setTextColor(0, 0, 0);
        yPos += lineHeight * 2;
      }
      
      // Additional account details
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text('QuickCredit Savings Management System', 20, yPos);
      yPos += lineHeight * 0.7;
      pdf.text('Thank you for banking with us!', 20, yPos);
      
      // Footer
      pdf.setFontSize(8);
      pdf.text(`Generated on ${new Date().toLocaleString()}`, 20, 280);
      
      // Download the PDF
      pdf.save(`QuickCredit-Statement-${account.id}-${new Date().toISOString().split('T')[0]}.pdf`);
      
      console.log('Statement downloaded for account:', account.id);
      
    } catch (error) {
      console.error('Statement download failed:', error);
      alert('Failed to download statement. Please try again.');
    }
  };

  const handleCloseModals = () => {
    setIsViewModalOpen(false);
    setIsWithdrawModalOpen(false);
    setIsDepositModalOpen(false);
    setIsAddModalOpen(false);
    setIsSaverViewModalOpen(false);
    setSelectedAccount(null);
    setSelectedSaver(null);
    setSelectedAccountTransactions([]);
    setTransactionForm({
      amount: '',
      description: '',
      date: new Date().toISOString().split('T')[0]
    });
    setNewSaverForm({
      name: '',
      phone: '',
      email: '',
      address: '',
      nationalId: '',
      occupation: ''
    });
    setNewAccountForm({
      saverId: '',
      accountType: 'Savings',
      initialDeposit: '',
      interestRate: '5.0'
    });
  };

  const handleAddNew = () => {
    setIsAddModalOpen(true);
  };

  const handleSubmitNewSaver = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!newSaverForm.name || !newSaverForm.phone || !newSaverForm.email) {
      alert('Please fill in all required fields');
      return;
    }
    
    // Generate unique account number by finding the highest existing ID
    const existingIds = savers.map(s => {
      const idNum = parseInt(s.id.replace(/\D/g, ''));
      return isNaN(idNum) ? 0 : idNum;
    });
    const nextSaverId = Math.max(0, ...existingIds) + 1;
    const saverId = `SAV${String(nextSaverId).padStart(4, '0')}`;
    
    // Create new saver object
    const newSaver: Saver = {
      id: saverId,
      name: newSaverForm.name,
      phone: newSaverForm.phone,
      email: newSaverForm.email,
      registrationDate: new Date().toISOString().split('T')[0],
      status: 'Active'
    };
    
    // Add to savers list (in real app, this would be API call)
    setSavers([...savers, newSaver]);
    
    alert(`New saver added successfully! Account Number: ${saverId}`);
    handleCloseModals();
  };

  const handleSubmitNewAccount = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!newAccountForm.saverId || !newAccountForm.initialDeposit) {
      alert('Please fill in all required fields');
      return;
    }
    
    // Find the saver
    const saver = savers.find(s => s.id === newAccountForm.saverId);
    if (!saver) {
      alert('Saver not found');
      return;
    }
    
    // Generate unique account ID by finding the highest existing account ID
    const existingAccountIds = savings.map(acc => {
      const idNum = parseInt(acc.savingsId.replace(/\D/g, ''));
      return isNaN(idNum) ? 0 : idNum;
    });
    const nextAccountId = Math.max(0, ...existingAccountIds) + 1;
    const savingsId = `SAV${String(nextAccountId).padStart(4, '0')}`; // Keeping SAV prefix as per existing data
    
    // Create new account object
    const newAccount: SavingsAccount = {
      id: '', // Will be generated by backend
      savingsId: savingsId,
      borrowerId: newAccountForm.saverId,
      balance: parseFloat(newAccountForm.initialDeposit),
      interestRate: parseFloat(newAccountForm.interestRate),
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Add to savings list (in real app, this would be API call)
    setSavings([...savings, newAccount]);
    
    alert(`New savings account created successfully! Account ID: ${savingsId}`);
    handleCloseModals();
  };

  const handleExport = () => {
    try {
      const pdf = new jsPDF();
      
      // Set font
      pdf.setFont('helvetica');
      
      // Header
      pdf.setFontSize(20);
      pdf.setTextColor(34, 197, 94); // Green color
      pdf.text(`QUICKCREDIT ${activeTab.toUpperCase()} REPORT`, 20, 30);
      
      // Divider line
      pdf.setLineWidth(0.5);
      pdf.setDrawColor(34, 197, 94);
      pdf.line(20, 35, 190, 35);
      
      // Report details
      pdf.setFontSize(12);
      pdf.setTextColor(0, 0, 0);
      
      let yPos = 50;
      const lineHeight = 8;
      
      pdf.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, yPos);
      yPos += lineHeight;
      pdf.text(`Report Type: ${activeTab === 'savers' ? 'Savers List' : 'Savings Accounts'}`, 20, yPos);
      yPos += lineHeight * 2;
      
      const dataToExport = activeTab === 'savers' ? savers : savings;
      pdf.text(`Total Records: ${dataToExport.length}`, 20, yPos);
      yPos += lineHeight * 2;
      
      // Table headers
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      
      if (activeTab === 'savers') {
        pdf.text('ID', 20, yPos);
        pdf.text('Name', 50, yPos);
        pdf.text('Phone', 100, yPos);
        pdf.text('Status', 140, yPos);
        pdf.text('Reg. Date', 170, yPos);
      } else {
        pdf.text('Account ID', 20, yPos);
        pdf.text('Customer', 60, yPos);
        pdf.text('Balance', 110, yPos);
        pdf.text('Rate', 150, yPos);
        pdf.text('Status', 175, yPos);
      }
      
      yPos += lineHeight * 0.5;
      
      // Header line
      pdf.setLineWidth(0.3);
      pdf.line(20, yPos, 190, yPos);
      yPos += lineHeight * 0.5;
      
      // Data rows
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      
      dataToExport.forEach((item, index) => {
        if (yPos > 270) { // Start new page if needed
          pdf.addPage();
          yPos = 30;
        }
        
        if (activeTab === 'savers') {
          const saver = item as Saver;
          pdf.text(generateAccountNumber(index), 20, yPos);
          pdf.text(saver.name.substring(0, 20), 50, yPos);
          pdf.text(saver.phone, 100, yPos);
          pdf.text(saver.status || 'Active', 140, yPos);
          pdf.text(formatDate(saver.registrationDate), 170, yPos);
        } else {
          const account = item as SavingsAccount;
          pdf.text(account.savingsId, 20, yPos);
          const customerName = account.borrower 
            ? `${account.borrower.firstName} ${account.borrower.lastName}` 
            : 'N/A';
          pdf.text(customerName.substring(0, 20), 60, yPos);
          pdf.text(formatUGX(account.balance), 110, yPos);
          pdf.text(`${account.interestRate}%`, 150, yPos);
          pdf.text(account.status, 175, yPos);
        }
        
        yPos += lineHeight;
      });
      
      // Footer
      yPos += lineHeight * 2;
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text('QuickCredit Savings Management System', 20, yPos);
      
      // Download the PDF
      pdf.save(`QuickCredit-${activeTab}-Report-${new Date().toISOString().split('T')[0]}.pdf`);
      
      console.log(`${activeTab} PDF report generated successfully`);
      
    } catch (error) {
      console.error('PDF export failed:', error);
      alert('PDF export failed. Please try again.');
    }
  };

  const filteredSavers = savers.filter(saver =>
    saver.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    saver.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSavings = savings.filter(account =>
    account.savingsId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (account.borrower?.firstName + ' ' + account.borrower?.lastName)?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination logic
  const currentData = activeTab === 'savers' ? filteredSavers : filteredSavings;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedData = currentData.slice(startIndex, endIndex);
  const totalPages = Math.ceil(currentData.length / rowsPerPage);

  // Enhanced KPI calculations
  // TODO: implement when service is ready
  // Real transaction data is loaded in the main useEffect above

  useEffect(() => {
    const fetchTransactionData = async () => {
      try {
        const [depositsResponse, withdrawalsResponse] = await Promise.all([
          databaseService.getDeposits(),
          databaseService.getWithdrawals()
        ]);
        
        setRealDeposits(depositsResponse || []);
        setRealWithdrawals(withdrawalsResponse || []);
      } catch (error) {
        console.error('Error fetching transaction data:', error);
        setRealDeposits([]);
        setRealWithdrawals([]);
      }
    };

    if (savings.length > 0) {
      fetchTransactionData();
    }
  }, [savings]);

  // Use real transaction data for statistics
  const allDeposits = realDeposits;
  const allWithdrawals = realWithdrawals;
  const currentMonth = new Date().getMonth() + 1; // 1-12
  const currentYear = new Date().getFullYear();
  
  // Generate monthly data for the past 12 months
  const generateMonthlyData = () => {
    const monthlyData = [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const monthName = months[date.getMonth()];
      
      const monthDeposits = allDeposits
        .filter(deposit => {
          const depositDate = new Date(deposit.depositDate);
          return depositDate.getMonth() + 1 === month && depositDate.getFullYear() === year;
        })
        .reduce((sum, deposit) => sum + deposit.amount, 0);
        
      const monthWithdrawals = allWithdrawals
        .filter(withdrawal => {
          const withdrawalDate = new Date(withdrawal.withdrawalDate);
          return withdrawalDate.getMonth() + 1 === month && withdrawalDate.getFullYear() === year;
        })
        .reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
      
      monthlyData.push({
        month: monthName,
        year,
        deposits: monthDeposits,
        withdrawals: monthWithdrawals,
        net: monthDeposits - monthWithdrawals
      });
    }
    
    return monthlyData;
  };
  
  const monthlyData = generateMonthlyData();
  const maxAmount = Math.max(...monthlyData.map(d => Math.max(d.deposits, d.withdrawals)), 1);
  
  // Calculate KPIs using the real data from above
  const totalTransactions = allDeposits.length + allWithdrawals.length;
  
  // This month calculations
  const depositsThisMonth = allDeposits
    .filter(deposit => {
      const depositDate = new Date(deposit.depositDate);
      return depositDate.getMonth() + 1 === currentMonth && depositDate.getFullYear() === currentYear;
    })
    .reduce((sum, deposit) => sum + deposit.amount, 0);
    
  const withdrawalsThisMonth = allWithdrawals
    .filter(withdrawal => {
      const withdrawalDate = new Date(withdrawal.withdrawalDate);
      return withdrawalDate.getMonth() + 1 === currentMonth && withdrawalDate.getFullYear() === currentYear;
    })
    .reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
  
  const depositsCountThisMonth = allDeposits.filter(deposit => {
    const depositDate = new Date(deposit.depositDate);
    return depositDate.getMonth() + 1 === currentMonth && depositDate.getFullYear() === currentYear;
  }).length;
  
  const avgDepositThisMonth = depositsCountThisMonth > 0 ? depositsThisMonth / depositsCountThisMonth : 0;
  
  // Last month for MoM growth calculation
  const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  
  const depositsLastMonth = allDeposits
    .filter(deposit => {
      const depositDate = new Date(deposit.depositDate);
      return depositDate.getMonth() + 1 === lastMonth && depositDate.getFullYear() === lastMonthYear;
    })
    .reduce((sum, deposit) => sum + deposit.amount, 0);
  
  const momGrowth = depositsLastMonth > 0 ? ((depositsThisMonth - depositsLastMonth) / depositsLastMonth) * 100 : 0;
  
  // Helper function to generate better account numbers
  const generateAccountNumber = (index: number) => {
    const accountNum = String(index + 1).padStart(3, '0');
    return `SAV${accountNum}`;
  };

  // Helper function to generate better account number display
  const generateSavingsIdDisplay = (savingsId: string, index: number) => {
    const shortId = savingsId.substring(0, 6).toUpperCase();
    return `${shortId}${String(index + 1).padStart(2, '0')}`;
  };

  // New accounts this month (based on actual creation dates)
  const newAccountsThisMonth = savings.filter(account => {
    if ((account as any).createdAt) {
      const createdDate = new Date((account as any).createdAt);
      return createdDate.getMonth() + 1 === currentMonth && createdDate.getFullYear() === currentYear;
    }
    return false;
  }).length;

  // Calculate total savings using real transaction data when available
  const totalDeposits = realDeposits.reduce((sum, deposit) => sum + deposit.amount, 0);
  const totalWithdrawals = realWithdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
  const totalSavings = transactionDataLoaded 
    ? totalDeposits - totalWithdrawals 
    : savings.reduce((sum, account) => sum + account.balance, 0);
  
  const activeSavers = savers.filter(saver => saver.status === 'Active').length;
  const totalAccounts = savings.length;

  // Interest Rate Calculation Function
  // Rule: 5% annual interest (0.42% monthly) for balances consistently above UGX 5,000,000
  const calculateInterestRate = (balance: number): { rate: number; monthlyAmount: number; annualAmount: number } => {
    const MINIMUM_BALANCE = 5000000; // UGX 5 million
    const ANNUAL_RATE = 0.05; // 5% per annum
    const MONTHLY_RATE = ANNUAL_RATE / 12; // 0.42% per month
    
    if (balance >= MINIMUM_BALANCE) {
      return {
        rate: ANNUAL_RATE * 100, // Convert to percentage for display
        monthlyAmount: balance * MONTHLY_RATE,
        annualAmount: balance * ANNUAL_RATE
      };
    }
    
    return {
      rate: 0,
      monthlyAmount: 0,
      annualAmount: 0
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Savings Management</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage savers and savings accounts</p>
      </div>

      {/* Enhanced Stats Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Deposits */}
        <div className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Total Deposits</p>
              <p className="text-2xl font-bold">{formatUGX(totalDeposits)}</p>
            </div>
            <div className="p-3 bg-white bg-opacity-20 rounded-lg">
              <ArrowDownCircle className="h-6 w-6" />
            </div>
          </div>
        </div>

        {/* Deposits This Month */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm font-medium">Deposits This Month</p>
              <p className="text-2xl font-bold">{formatUGX(depositsThisMonth)}</p>
            </div>
            <div className="p-3 bg-white bg-opacity-20 rounded-lg">
              <Calendar className="h-6 w-6" />
            </div>
          </div>
        </div>

        {/* Total Withdrawals */}
        <div className="bg-gradient-to-br from-red-500 to-red-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm font-medium">Total Withdrawals</p>
              <p className="text-2xl font-bold">{formatUGX(totalWithdrawals)}</p>
            </div>
            <div className="p-3 bg-white bg-opacity-20 rounded-lg">
              <ArrowUpCircle className="h-6 w-6" />
            </div>
          </div>
        </div>

        {/* Withdrawals This Month */}
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium">Withdrawals This Month</p>
              <p className="text-2xl font-bold">{formatUGX(withdrawalsThisMonth)}</p>
            </div>
            <div className="p-3 bg-white bg-opacity-20 rounded-lg">
              <Calendar className="h-6 w-6" />
            </div>
          </div>
        </div>

        {/* Total Transactions */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Total Transactions</p>
              <p className="text-2xl font-bold">{totalTransactions}</p>
            </div>
            <div className="p-3 bg-white bg-opacity-20 rounded-lg">
              <Activity className="h-6 w-6" />
            </div>
          </div>
        </div>

        {/* Avg Deposit This Month */}
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm font-medium">Avg. Deposit (This Month)</p>
              <p className="text-2xl font-bold">{formatUGX(avgDepositThisMonth)}</p>
            </div>
            <div className="p-3 bg-white bg-opacity-20 rounded-lg">
              <DollarSign className="h-6 w-6" />
            </div>
          </div>
        </div>

        {/* MoM Growth */}
        <div className={`bg-gradient-to-br ${momGrowth >= 0 ? 'from-teal-500 to-teal-600' : 'from-red-500 to-red-600'} p-6 rounded-xl shadow-lg text-white`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-teal-100 text-sm font-medium">MoM Growth</p>
              <p className="text-2xl font-bold">{momGrowth.toFixed(1)}%</p>
            </div>
            <div className="p-3 bg-white bg-opacity-20 rounded-lg">
              {momGrowth >= 0 ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
            </div>
          </div>
        </div>

        {/* New Accounts */}
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-indigo-100 text-sm font-medium">New Accounts</p>
              <p className="text-2xl font-bold">{newAccountsThisMonth}</p>
            </div>
            <div className="p-3 bg-white bg-opacity-20 rounded-lg">
              <Users className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Modern Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Monthly Comparison Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Monthly Transaction Comparison</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Deposits</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Withdrawals</span>
              </div>
            </div>
          </div>
          
          {/* Chart Container */}
          <div className="relative h-80">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-500 dark:text-gray-400 py-4">
              <span>{formatUGX(maxAmount)}</span>
              <span>{formatUGX(maxAmount * 0.75)}</span>
              <span>{formatUGX(maxAmount * 0.5)}</span>
              <span>{formatUGX(maxAmount * 0.25)}</span>
              <span>0</span>
            </div>
            
            {/* Chart area */}
            <div className="ml-16 h-full border-l border-b border-gray-200 dark:border-gray-600 relative">
              {/* Horizontal grid lines */}
              <div className="absolute inset-0">
                {[0, 25, 50, 75].map((percent) => (
                  <div 
                    key={percent}
                    className="absolute w-full border-t border-gray-100 dark:border-gray-700"
                    style={{ bottom: `${percent}%` }}
                  ></div>
                ))}
              </div>
              
              {/* Bars */}
              <div className="absolute inset-0 flex items-end justify-between px-2 pb-2">
                {monthlyData.map((data, index) => (
                  <div key={index} className="flex flex-col items-center group relative" style={{ width: `${100 / monthlyData.length - 2}%` }}>
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                      <div>Deposits: {formatUGX(data.deposits)}</div>
                      <div>Withdrawals: {formatUGX(data.withdrawals)}</div>
                      <div>Net: {formatUGX(data.net)}</div>
                    </div>
                    
                    {/* Bars container */}
                    <div className="flex items-end gap-1 h-full w-full">
                      {/* Deposits bar */}
                      <div 
                        className="bg-green-500 hover:bg-green-600 transition-colors rounded-t relative"
                        style={{ 
                          height: `${Math.max((data.deposits / maxAmount) * 100, 2)}%`,
                          width: '45%'
                        }}
                      ></div>
                      
                      {/* Withdrawals bar */}
                      <div 
                        className="bg-red-500 hover:bg-red-600 transition-colors rounded-t relative"
                        style={{ 
                          height: `${Math.max((data.withdrawals / maxAmount) * 100, 2)}%`,
                          width: '45%'
                        }}
                      ></div>
                    </div>
                    
                    {/* Month label */}
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-2 text-center">
                      {data.month}
                      <br />
                      <span className="text-xs text-gray-400">{data.year}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Chart Summary */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <div className="text-lg font-bold text-green-600 dark:text-green-400">
                {formatUGX(monthlyData.reduce((sum, data) => sum + data.deposits, 0))}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Deposits (12M)</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-600 dark:text-red-400">
                {formatUGX(monthlyData.reduce((sum, data) => sum + data.withdrawals, 0))}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Withdrawals (12M)</div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-bold ${
                monthlyData.reduce((sum, data) => sum + data.net, 0) >= 0 
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {formatUGX(monthlyData.reduce((sum, data) => sum + data.net, 0))}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Net Flow (12M)</div>
            </div>
          </div>
        </div>

        {/* Account Summary */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">Account Summary</h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <PiggyBank className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Total Savings</p>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatUGX(totalSavings)}</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Active Savers</p>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{activeSavers}</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <Activity className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Total Accounts</p>
                  <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{totalAccounts}</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                  <DollarSign className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Avg Balance</p>
                  <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
                    {formatUGX(totalAccounts > 0 ? Math.round(totalSavings / totalAccounts) : 0)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex">
            <button
              onClick={() => setActiveTab('savers')}
              className={`py-4 px-6 border-b-2 font-medium text-sm ${
                activeTab === 'savers'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              Savers ({savers.length})
            </button>
            <button
              onClick={() => setActiveTab('accounts')}
              className={`py-4 px-6 border-b-2 font-medium text-sm ${
                activeTab === 'accounts'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              Savings Accounts ({savings.length})
            </button>
          </nav>
        </div>

        {/* Search and Actions */}
        <div className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 h-4 w-4" />
                <input
                  type="text"
                  placeholder={`Search ${activeTab}...`}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-4 items-center">
              {/* Add Account/Saver Button - Circular Green */}
              <button 
                onClick={handleAddNew}
                className="w-12 h-12 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
                title={`Add ${activeTab === 'savers' ? 'Saver' : 'Account'}`}
              >
                <Plus className="h-6 w-6" />
              </button>
              
              {/* Export Button - Circular Gray with E */}
              <button 
                onClick={handleExport}
                className="w-12 h-12 bg-gray-500 hover:bg-gray-600 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 font-bold text-lg"
                title="Export Data"
              >
                E
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-x-auto">
          {activeTab === 'savers' ? (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Account Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Join Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {activeTab === 'savers' ? (
                  paginatedData.map((saver: any, index: number) => (
                    <tr key={saver.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        {generateAccountNumber(index + (currentPage - 1) * rowsPerPage)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{saver.name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{saver.address}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-gray-100">{saver.phone}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{saver.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {saver.registrationDate ? formatDate(saver.registrationDate) : 'Not specified'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          saver.status === 'Active' 
                            ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
                            : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                        }`}>
                          {saver.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button 
                          onClick={() => handleViewSaver(saver)}
                          className="text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300 flex items-center gap-1"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  paginatedData.map((account: any) => (
                    <tr key={account.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        {account.savingsId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {account.borrower ? `${account.borrower.firstName} ${account.borrower.lastName}` : 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {account.savingsId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        UGX {account.balance.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {account.interestRate}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {(account as any).createdAt ? formatDate((account as any).createdAt) : 'Not specified'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          account.status === 'Active' 
                            ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
                            : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                        }`}>
                          {account.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button className="text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300 flex items-center gap-1">
                          <Eye className="h-4 w-4" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Savings ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Customer Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Account Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Monthly Interest
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Open Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {paginatedData.map((account: any, index: number) => (
                  <tr key={account.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                      <span className="font-mono text-xs bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
                        {generateSavingsIdDisplay(account.savingsId, index)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {account.borrower ? `${account.borrower.firstName} ${account.borrower.lastName}` : 'Unknown'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      <span className="font-mono text-xs bg-green-100 dark:bg-green-900 px-2 py-1 rounded font-semibold">
                        {generateAccountNumber(index)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      UGX {account.balance.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {account.balance >= 5000000 ? (
                        <div className="flex flex-col">
                          <span className="font-semibold text-green-600">
                            {formatUGX(calculateInterestRate(account.balance).monthlyAmount)}
                          </span>
                          <span className="text-xs text-gray-500">monthly (5% p.a.)</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">Balance &lt; 5M</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {formatDate(account.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        account.status === 'Active' 
                          ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
                          : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                      }`}>
                        {account.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleViewAccount(account)}
                          className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleDownloadStatement(account)}
                          className="text-purple-600 hover:text-purple-900 p-1 rounded hover:bg-purple-50 transition-colors"
                          title="Download Statement"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleDeposit(account)}
                          className="text-green-600 hover:text-green-900 p-1 rounded hover:bg-green-50 transition-colors"
                          title="Deposit"
                        >
                          <ArrowDownCircle className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleWithdraw(account)}
                          className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 transition-colors"
                          title="Withdraw"
                        >
                          <ArrowUpCircle className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {currentData.length > rowsPerPage && (
          <div className="bg-white dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                  <span className="font-medium">{Math.min(endIndex, currentData.length)}</span> of{' '}
                  <span className="font-medium">{currentData.length}</span> {activeTab}
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      if (totalPages <= 7) return true;
                      if (page === 1 || page === totalPages) return true;
                      if (page >= currentPage - 1 && page <= currentPage + 1) return true;
                      return false;
                    })
                    .map((page, index, array) => {
                      const showEllipsis = index > 0 && array[index - 1] !== page - 1;
                      return (
                        <React.Fragment key={page}>
                          {showEllipsis && (
                            <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300">
                              ...
                            </span>
                          )}
                          <button
                            onClick={() => setCurrentPage(page)}
                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                              currentPage === page
                                ? 'z-10 bg-primary-50 dark:bg-primary-900 border-primary-500 text-primary-600 dark:text-primary-400'
                                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            {page}
                          </button>
                        </React.Fragment>
                      );
                    })}
                  <button
                    onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {paginatedData.length === 0 && (
        <div className="text-center py-12">
          <PiggyBank className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            No {activeTab} found
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {searchTerm 
              ? `No ${activeTab} match your search criteria.`
              : `No ${activeTab} have been added yet.`}
          </p>
        </div>
      )}

      {/* View Account Modal */}
      {isViewModalOpen && selectedAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Account Details</h2>
                <button
                  onClick={handleCloseModals}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Account ID</label>
                    <p className="text-lg font-semibold text-gray-900">{selectedAccount.savingsId}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Customer Name</label>
                    <p className="text-lg font-semibold text-gray-900">
                      {selectedAccount.borrower 
                        ? `${selectedAccount.borrower.firstName} ${selectedAccount.borrower.lastName}`
                        : 'N/A'}
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Phone Number</label>
                    <p className="text-lg font-semibold text-gray-900">
                      {selectedAccount.borrower?.phone || 'N/A'}
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Current Balance</label>
                    <p className="text-2xl font-bold text-green-600">{formatUGX(selectedAccount.balance)}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Interest Rate</label>
                    <p className="text-lg font-semibold text-gray-900">
                      {calculateInterestRate(selectedAccount.balance).rate}% per annum
                    </p>
                    {selectedAccount.balance >= 5000000 ? (
                      <p className="text-sm text-green-600 mt-1">
                        ✓ Qualifies for interest (Balance ≥ UGX 5M)
                      </p>
                    ) : (
                      <p className="text-sm text-orange-600 mt-1">
                        ⓘ Maintain UGX 5M+ to earn interest
                      </p>
                    )}
                  </div>
                  
                  {selectedAccount.balance >= 5000000 && (
                    <>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Monthly Interest</label>
                        <p className="text-lg font-semibold text-green-600">
                          {formatUGX(calculateInterestRate(selectedAccount.balance).monthlyAmount)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Approx. 0.42% monthly</p>
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium text-gray-500">Annual Interest</label>
                        <p className="text-lg font-semibold text-green-600">
                          {formatUGX(calculateInterestRate(selectedAccount.balance).annualAmount)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">5% of balance per year</p>
                      </div>
                    </>
                  )}
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Opening Date</label>
                    <p className="text-lg font-semibold text-gray-900">{formatDate(selectedAccount.createdAt)}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Last Updated</label>
                    <p className="text-lg font-semibold text-gray-900">
                      {formatDate(selectedAccount.updatedAt)}
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Status</label>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      selectedAccount.status === 'ACTIVE' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {selectedAccount.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Transaction History Section */}
              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <Clock className="w-5 h-5 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Transaction History</h3>
                  <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                    {selectedAccountTransactions.length} transactions
                  </span>
                </div>

                {selectedAccountTransactions.length > 0 ? (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {selectedAccountTransactions.slice(0, 10).map((transaction, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            transaction.type === 'deposit' 
                              ? 'bg-green-100 text-green-600' 
                              : 'bg-red-100 text-red-600'
                          }`}>
                            {transaction.type === 'deposit' ? (
                              <ArrowDownCircle className="w-5 h-5" />
                            ) : (
                              <ArrowUpCircle className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 capitalize">
                              {transaction.type}
                            </p>
                            <p className="text-sm text-gray-500">
                              {formatDate(transaction.date)} • {transaction.method}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${
                            transaction.type === 'deposit' 
                              ? 'text-green-600' 
                              : 'text-red-600'
                          }`}>
                            {transaction.type === 'deposit' ? '+' : '-'}{formatUGX(transaction.amount)}
                          </p>
                        </div>
                      </div>
                    ))}
                    
                    {selectedAccountTransactions.length > 10 && (
                      <div className="text-center py-2">
                        <p className="text-sm text-gray-500">
                          Showing 10 of {selectedAccountTransactions.length} transactions
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No transactions found for this account</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={handleCloseModals}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => handleDownloadStatement(selectedAccount)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Download Statement
                </button>
                <button
                  onClick={() => {
                    setIsViewModalOpen(false);
                    handleDeposit(selectedAccount);
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <ArrowDownCircle className="w-4 h-4" />
                  Make Deposit
                </button>
                <button
                  onClick={() => {
                    setIsViewModalOpen(false);
                    handleWithdraw(selectedAccount);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  Make Withdrawal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {isDepositModalOpen && selectedAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-green-600">Make Deposit</h2>
                <button
                  onClick={handleCloseModals}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-medium text-green-800">
                    {selectedAccount.borrower 
                      ? `${selectedAccount.borrower.firstName} ${selectedAccount.borrower.lastName}`
                      : 'N/A'}
                  </h3>
                  <p className="text-sm text-green-600">Account: {selectedAccount.savingsId}</p>
                  <p className="text-sm text-green-600">Current Balance: {formatUGX(selectedAccount.balance)}</p>
                </div>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleTransactionSubmit('deposit'); }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Deposit Amount (UGX) *
                    </label>
                    <input
                      type="number"
                      value={transactionForm.amount}
                      onChange={(e) => setTransactionForm(prev => ({ ...prev, amount: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Enter deposit amount"
                      min="1"
                      step="0.01"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date
                    </label>
                    <input
                      type="date"
                      value={transactionForm.date}
                      onChange={(e) => setTransactionForm(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      value={transactionForm.description}
                      onChange={(e) => setTransactionForm(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                      placeholder="Optional description"
                    />
                  </div>

                  {transactionForm.amount && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <p className="text-sm text-gray-600">New Balance: {formatUGX(selectedAccount.balance + parseFloat(transactionForm.amount || '0'))}</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={handleCloseModals}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Confirm Deposit
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {isWithdrawModalOpen && selectedAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-red-600">Make Withdrawal</h2>
                <button
                  onClick={handleCloseModals}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="mb-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h3 className="font-medium text-red-800">
                    {selectedAccount.borrower 
                      ? `${selectedAccount.borrower.firstName} ${selectedAccount.borrower.lastName}`
                      : 'N/A'}
                  </h3>
                  <p className="text-sm text-red-600">Account: {selectedAccount.savingsId}</p>
                  <p className="text-sm text-red-600">Available Balance: {formatUGX(selectedAccount.balance)}</p>
                </div>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleTransactionSubmit('withdraw'); }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Withdrawal Amount (UGX) *
                    </label>
                    <input
                      type="number"
                      value={transactionForm.amount}
                      onChange={(e) => setTransactionForm(prev => ({ ...prev, amount: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Enter withdrawal amount"
                      min="1"
                      max={selectedAccount.balance}
                      step="0.01"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Maximum: {formatUGX(selectedAccount.balance)}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date
                    </label>
                    <input
                      type="date"
                      value={transactionForm.date}
                      onChange={(e) => setTransactionForm(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      value={transactionForm.description}
                      onChange={(e) => setTransactionForm(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                      placeholder="Optional description"
                    />
                  </div>

                  {transactionForm.amount && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <p className="text-sm text-gray-600">
                        Remaining Balance: {formatUGX(selectedAccount.balance - parseFloat(transactionForm.amount || '0'))}
                      </p>
                      {selectedAccount.balance - parseFloat(transactionForm.amount || '0') < 0 && (
                        <p className="text-xs text-red-600 mt-1">⚠ Insufficient funds</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={handleCloseModals}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!!transactionForm.amount && selectedAccount.balance - parseFloat(transactionForm.amount || '0') < 0}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    Confirm Withdrawal
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add Account/Saver Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-green-600">
                  Add New {activeTab === 'savers' ? 'Saver' : 'Savings Account'}
                </h2>
                <button
                  onClick={handleCloseModals}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {activeTab === 'savers' ? (
                /* New Saver Form */
                <form onSubmit={handleSubmitNewSaver} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      value={newSaverForm.name}
                      onChange={(e) => setNewSaverForm({ ...newSaverForm, name: e.target.value })}
                      placeholder="Enter full name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number *
                    </label>
                    <input
                      type="tel"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      value={newSaverForm.phone}
                      onChange={(e) => setNewSaverForm({ ...newSaverForm, phone: e.target.value })}
                      placeholder="e.g., +256 700 123 456"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      value={newSaverForm.email}
                      onChange={(e) => setNewSaverForm({ ...newSaverForm, email: e.target.value })}
                      placeholder="Enter email address"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Address
                    </label>
                    <textarea
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      rows={3}
                      value={newSaverForm.address}
                      onChange={(e) => setNewSaverForm({ ...newSaverForm, address: e.target.value })}
                      placeholder="Enter residential address"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      National ID
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      value={newSaverForm.nationalId}
                      onChange={(e) => setNewSaverForm({ ...newSaverForm, nationalId: e.target.value })}
                      placeholder="Enter national ID"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Occupation
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      value={newSaverForm.occupation}
                      onChange={(e) => setNewSaverForm({ ...newSaverForm, occupation: e.target.value })}
                      placeholder="Enter occupation"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={handleCloseModals}
                      className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Add Saver
                    </button>
                  </div>
                </form>
              ) : (
                /* New Account Form */
                <form onSubmit={handleSubmitNewAccount} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Select Saver *
                    </label>
                    <select
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      value={newAccountForm.saverId}
                      onChange={(e) => setNewAccountForm({ ...newAccountForm, saverId: e.target.value })}
                    >
                      <option value="">Select a saver</option>
                      {savers.map((saver, index) => (
                        <option key={saver.id} value={saver.id}>
                          {saver.name} ({generateAccountNumber(index)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Account Type
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      value={newAccountForm.accountType}
                      onChange={(e) => setNewAccountForm({ ...newAccountForm, accountType: e.target.value })}
                    >
                      <option value="Savings">Savings Account</option>
                      <option value="Fixed Deposit">Fixed Deposit</option>
                      <option value="Current">Current Account</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Initial Deposit (UGX) *
                    </label>
                    <input
                      type="number"
                      required
                      min="10000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      value={newAccountForm.initialDeposit}
                      onChange={(e) => setNewAccountForm({ ...newAccountForm, initialDeposit: e.target.value })}
                      placeholder="Minimum 10,000 UGX"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Interest Rate (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="20"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      value={newAccountForm.interestRate}
                      onChange={(e) => setNewAccountForm({ ...newAccountForm, interestRate: e.target.value })}
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={handleCloseModals}
                      className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Create Account
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Saver View Modal */}
      {isSaverViewModalOpen && selectedSaver && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Saver Details</h2>
                <button
                  onClick={handleCloseModals}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Account Number</label>
                    <p className="text-lg font-semibold text-gray-900">
                      {generateAccountNumber(savers.findIndex(s => s.id === selectedSaver.id))}
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Full Name</label>
                    <p className="text-lg font-semibold text-gray-900">{selectedSaver.name}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Phone Number</label>
                    <p className="text-lg font-semibold text-gray-900">{selectedSaver.phone}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Email Address</label>
                    <p className="text-lg font-semibold text-gray-900">{selectedSaver.email}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Registration Date</label>
                    <p className="text-lg font-semibold text-gray-900">
                      {selectedSaver.registrationDate ? formatDate(selectedSaver.registrationDate) : 'Not specified'}
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Status</label>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      selectedSaver.status === 'Active' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {selectedSaver.status}
                    </span>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Savings Accounts</label>
                    <p className="text-lg font-semibold text-green-600">
                      {savings.filter(account => account.borrowerId === selectedSaver.id).length} accounts
                    </p>
                  </div>
                </div>
              </div>

              {/* Saver's Accounts Summary */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Savings Accounts</h3>
                
                {savings.filter(account => account.borrowerId === selectedSaver.id).length > 0 ? (
                  <div className="space-y-3">
                    {savings.filter(account => account.borrowerId === selectedSaver.id).map((account) => (
                      <div key={account.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-semibold text-gray-900">{account.savingsId}</p>
                          <p className="text-sm text-gray-500">Savings Account</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">{formatUGX(account.balance)}</p>
                          <p className="text-sm text-gray-500">{account.interestRate}% interest</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <PiggyBank className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No savings accounts found for this saver</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={handleCloseModals}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setIsSaverViewModalOpen(false);
                    setActiveTab('accounts');
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <PiggyBank className="w-4 h-4" />
                  View Accounts
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Savings;