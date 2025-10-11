import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, Filter, Brain, BarChart3, Eye, Edit2, Download, Zap, TrendingUp, AlertCircle, Grid, List, RefreshCw, Star, Shield, Award, X } from 'lucide-react';
import { databaseService, BorrowerData } from '../services/databaseService';
import DeleteButton from '../components/DeleteButton';
import { aiCreditService } from '../services/aiCreditService';
import BorrowerDetailModal from '../components/modals/BorrowerDetailModal';
import EnhancedCreditScore from '../components/CreditScore/EnhancedCreditScore';
import AIInsightsDashboard from '../components/Dashboard/AIInsightsDashboard';

const Borrowers: React.FC = () => {
  const [borrowers, setBorrowers] = useState<BorrowerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedBorrower, setSelectedBorrower] = useState<BorrowerData | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [sortBy, setSortBy] = useState<'name' | 'creditScore' | 'totalBorrowed' | 'outstandingBalance'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedBorrowers, setSelectedBorrowers] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = viewMode === 'grid' ? 9 : 12;

  useEffect(() => {
    loadBorrowers();
  }, [searchTerm, filterStatus, sortBy, sortOrder]);

  // Reset pagination when search, filter, or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, sortBy, sortOrder]);

  const loadBorrowers = async () => {
    try {
      setLoading(true);
      const data = await databaseService.getBorrowers();
      setBorrowers(data);
      console.log('✅ Loaded borrowers:', data);
    } catch (error) {
      console.error('❌ Error loading borrowers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadBorrowers();
    setTimeout(() => setIsRefreshing(false), 500); // Add small delay for UX
  };

  const handleViewBorrower = (borrower: BorrowerData) => {
    setSelectedBorrower(borrower);
    setShowDetailModal(true);
  };

  const handleEditBorrower = (borrower: BorrowerData) => {
    setSelectedBorrower(borrower);
    setShowEditModal(true);
  };

  const handleSaveBorrower = async (updatedData: Partial<BorrowerData>) => {
    if (!selectedBorrower) return;
    
    try {
      // Update borrower using database service
      await databaseService.updateBorrower(selectedBorrower.id, updatedData);
      
      // Reload borrowers list
      await loadBorrowers();
      
      // Close modal
      setShowEditModal(false);
      setSelectedBorrower(null);
      
      console.log('✅ Borrower updated successfully');
    } catch (error) {
      console.error('❌ Error updating borrower:', error);
    }
  };

  const handleDeleteSuccess = (response: any) => {
    // Refresh the borrowers list after successful deletion
    loadBorrowers();
    // You could also show a success message here
    console.log('Borrower deleted successfully:', response.message);
  };

  const handleDeleteError = (error: Error) => {
    // Handle deletion error
    console.error('Failed to delete borrower:', error.message);
    // You could show an error toast here
  };

  const handleAIAnalysis = (borrower: BorrowerData) => {
    setSelectedBorrower(borrower);
    setShowAIModal(true);
  };

  const refreshData = () => {
    loadBorrowers();
  };

  const closeModals = () => {
    setShowDetailModal(false);
    setShowEditModal(false);
    setShowAIModal(false);
    setSelectedBorrower(null);
  };

  const handleSort = (field: 'name' | 'creditScore' | 'totalBorrowed' | 'outstandingBalance') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const handleSelectBorrower = (borrowerId: string) => {
    setSelectedBorrowers(prev => 
      prev.includes(borrowerId) 
        ? prev.filter(id => id !== borrowerId)
        : [...prev, borrowerId]
    );
  };

  const handleSelectAll = () => {
    if (selectedBorrowers.length === borrowers.length) {
      setSelectedBorrowers([]);
    } else {
      setSelectedBorrowers(borrowers.map(b => b.id));
    }
  };

  const getBorrowerRiskIcon = (borrower: BorrowerData) => {
    // Simple credit rating based on stored credit rating
    const rating = borrower.creditRating;
    
    if (rating === 'Excellent' || rating === 'Very Good') return <Shield className="h-4 w-4 text-green-600" />;
    if (rating === 'Good') return <Star className="h-4 w-4 text-yellow-600" />;
    if (rating === 'Fair') return <AlertCircle className="h-4 w-4 text-orange-600" />;
    return <AlertCircle className="h-4 w-4 text-red-600" />;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getCreditScoreColor = (score: number) => {
    // Traditional 300-850 scale
    if (score >= 750) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    if (score >= 700) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    if (score >= 650) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    if (score >= 600) return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
  };

  const getCreditScoreLabel = (score: number) => {
    // Traditional 300-850 scale
    if (score >= 750) return 'Excellent';
    if (score >= 700) return 'Very Good';
    if (score >= 650) return 'Good';
    if (score >= 600) return 'Fair';
    if (score >= 550) return 'Poor';
    return 'Very Poor';
  };

  return (
    <div className="space-y-6 dark:bg-black min-h-screen p-6">
      {/* Enhanced page header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 rounded-xl p-6 border border-blue-100 dark:border-gray-600">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center space-y-4 lg:space-y-0">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-3">
              <div className="h-12 w-12 bg-blue-600 rounded-xl flex items-center justify-center">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Borrowers
                </h1>
                <p className="text-blue-600 dark:text-blue-400 font-medium">AI-Powered Credit Management</p>
              </div>
            </div>
            
            {/* Enhanced stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{borrowers.length}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Total Borrowers</div>
                  </div>
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-green-600">{borrowers.filter(b => b.status === 'ACTIVE').length}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Active</div>
                  </div>
                  <TrendingUp className="h-5 w-5 text-green-500" />
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-red-600">{borrowers.filter(b => b.status === 'DEFAULTED').length}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Defaulted</div>
                  </div>
                  <AlertCircle className="h-5 w-5 text-red-500" />
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-purple-600">
                      {borrowers.length > 0 ? Math.round(
                        borrowers.reduce((sum, b) => sum + (b.creditScore || 500), 0) / borrowers.length
                      ) : 0}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Avg AI Score</div>
                  </div>
                  <Award className="h-5 w-5 text-purple-500" />
                </div>
              </div>
            </div>
          </div>
          

        </div>
      </div>

      {/* AI Insights Dashboard - Moved to top and horizontal */}
      <AIInsightsDashboard />

      {/* Enhanced search and filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex flex-col space-y-4">
          {/* Search and main controls */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="h-5 w-5 absolute left-3 top-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search borrowers by name, phone, email, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center space-x-2 px-4 py-3 border rounded-lg transition-colors ${
                  showFilters 
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' 
                    : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <Filter className="h-4 w-4" />
                <span>Filters</span>
                {(filterStatus !== 'all') && (
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">1</span>
                )}
              </button>
              
              <div className="flex items-center border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-3 transition-colors ${viewMode === 'table' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  title="Table View"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-3 transition-colors ${viewMode === 'grid' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  title="Grid View"
                >
                  <Grid className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          
          {/* Expandable filters */}
          {showFilters && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 animate-in slide-in-from-top duration-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                  <select 
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="all">All Status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="DEFAULTED">Defaulted</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sort By</label>
                  <select 
                    value={`${sortBy}-${sortOrder}`}
                    onChange={(e) => {
                      const [field, order] = e.target.value.split('-');
                      setSortBy(field as any);
                      setSortOrder(order as any);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="name-asc">Name A-Z</option>
                    <option value="name-desc">Name Z-A</option>
                    <option value="creditScore-desc">Credit Score High-Low</option>
                    <option value="creditScore-asc">Credit Score Low-High</option>
                    <option value="totalBorrowed-desc">Total Borrowed High-Low</option>
                    <option value="totalBorrowed-asc">Total Borrowed Low-High</option>
                    <option value="outstandingBalance-desc">Outstanding High-Low</option>
                    <option value="outstandingBalance-asc">Outstanding Low-High</option>
                  </select>
                </div>
                
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setFilterStatus('all');
                      setSortBy('name');
                      setSortOrder('asc');
                    }}
                    className="w-full px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Results summary and action buttons */}
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <div>
              {(() => {
                // Calculate filtered count for display
                const filteredCount = borrowers.filter(borrower => {
                  const matchesSearch = searchTerm === '' || 
                    `${borrower.firstName} ${borrower.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    borrower.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    borrower.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    borrower.borrowerId.toLowerCase().includes(searchTerm.toLowerCase());
                  
                  const matchesStatus = filterStatus === 'all' || borrower.status === filterStatus;
                  
                  return matchesSearch && matchesStatus;
                }).length;

                if (searchTerm || filterStatus !== 'all') {
                  return <span>Found {filteredCount} borrowers {searchTerm && `matching "${searchTerm}"`} {filterStatus !== 'all' && `with status "${filterStatus}"`}</span>;
                } else {
                  return <span>Showing {borrowers.length} borrowers</span>;
                }
              })()}
            </div>
            {selectedBorrowers.length > 0 && (
              <div className="flex items-center space-x-2">
                <span>{selectedBorrowers.length} selected</span>
                <button
                  onClick={() => setSelectedBorrowers([])}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  Clear selection
                </button>
              </div>
            )}
          </div>
          
          {/* Action buttons moved here */}
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex items-center space-x-3">
              <button className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-lg">
                <Plus className="h-4 w-4" />
                <span>Add Borrower</span>
              </button>
              <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                <Download className="h-4 w-4" />
                <span>Export</span>
              </button>
              <button 
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Borrowers display */}
      {viewMode === 'table' ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">All Borrowers</h3>
                {selectedBorrowers.length > 0 && (
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedBorrowers.length} selected
                    </span>
                    <button className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors">
                      Bulk Actions
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                <Brain className="h-4 w-4 text-blue-500" />
                <span>AI-Enhanced Analysis</span>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-4 text-left">
                    <input
                      type="checkbox"
                      checked={selectedBorrowers.length === borrowers.length && borrowers.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                    />
                  </th>
                  <th 
                    className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Name</span>
                      {sortBy === 'name' && (
                        <div className={`transform transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`}>
                          <svg className="h-3 w-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                      <svg className="h-3 w-3 text-gray-300 group-hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contact</th>
                  <th 
                    className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
                    onClick={() => handleSort('creditScore')}
                  >
                    <div className="flex items-center space-x-1">
                      <Brain className="h-3 w-3 text-blue-500" />
                      <span>Credit Score (300-850)</span>
                      {sortBy === 'creditScore' && (
                        <div className={`transform transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`}>
                          <svg className="h-3 w-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Loans</th>
                  <th 
                    className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
                    onClick={() => handleSort('outstandingBalance')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Outstanding</span>
                      {sortBy === 'outstandingBalance' && (
                        <div className={`transform transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`}>
                          <svg className="h-3 w-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                      <div className="flex flex-col items-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                        <span className="text-lg font-medium">Loading borrower data</span>
                        <span className="text-sm">AI-powered analysis in progress...</span>
                      </div>
                    </td>
                  </tr>
                ) : borrowers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                      <div className="flex flex-col items-center">
                        <Users className="h-16 w-16 text-gray-300 mb-4" />
                        <span className="text-lg font-medium mb-2">No borrowers found</span>
                        {searchTerm ? (
                          <div className="text-center">
                            <span className="text-sm">No results for "{searchTerm}"</span>
                            <button
                              onClick={() => setSearchTerm('')}
                              className="block mx-auto mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              Clear search
                            </button>
                          </div>
                        ) : (
                          <span className="text-sm">Get started by adding your first borrower</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  (() => {
                    // Filter borrowers based on search term and status
                    let filteredBorrowers = borrowers.filter(borrower => {
                      const matchesSearch = searchTerm === '' || 
                        `${borrower.firstName} ${borrower.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        borrower.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        borrower.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        borrower.borrowerId.toLowerCase().includes(searchTerm.toLowerCase());
                      
                      const matchesStatus = filterStatus === 'all' || borrower.status === filterStatus;
                      
                      return matchesSearch && matchesStatus;
                    });

                    // Sort borrowers
                    filteredBorrowers.sort((a, b) => {
                      let aValue: any, bValue: any;
                      
                      switch (sortBy) {
                        case 'name':
                          aValue = `${a.firstName} ${a.lastName}`.toLowerCase();
                          bValue = `${b.firstName} ${b.lastName}`.toLowerCase();
                          break;
                        case 'creditScore':
                          aValue = a.creditScore || 0;
                          bValue = b.creditScore || 0;
                          break;
                        case 'totalBorrowed':
                          aValue = a.totalBorrowed || 0;
                          bValue = b.totalBorrowed || 0;
                          break;
                        case 'outstandingBalance':
                          aValue = a.outstandingBalance || 0;
                          bValue = b.outstandingBalance || 0;
                          break;
                        default:
                          aValue = `${a.firstName} ${a.lastName}`.toLowerCase();
                          bValue = `${b.firstName} ${b.lastName}`.toLowerCase();
                      }
                      
                      if (typeof aValue === 'string') {
                        const comparison = aValue.localeCompare(bValue);
                        return sortOrder === 'asc' ? comparison : -comparison;
                      } else {
                        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
                      }
                    });

                    // Pagination logic for borrowers table
                    const startIndex = (currentPage - 1) * rowsPerPage;
                    const endIndex = startIndex + rowsPerPage;
                    const paginatedBorrowers = filteredBorrowers.slice(startIndex, endIndex);
                    
                    return paginatedBorrowers.map((borrower) => (
                  <tr key={borrower.id} className={`hover:bg-blue-50 dark:hover:bg-gray-800 transition-all duration-200 group ${selectedBorrowers.includes(borrower.id) ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedBorrowers.includes(borrower.id)}
                        onChange={() => handleSelectBorrower(borrower.id)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-12 w-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center ring-2 ring-white dark:ring-gray-800 group-hover:ring-blue-200 transition-all">
                          <Users className="h-6 w-6 text-white" />
                        </div>
                        <div className="ml-4">
                          <div className="flex items-center space-x-2">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{borrower.firstName} {borrower.lastName}</div>
                            {getBorrowerRiskIcon(borrower)}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">ID: {borrower.borrowerId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white">{borrower.phone}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{borrower.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <div className="flex flex-col">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getCreditScoreColor(borrower.creditScore || 500)}`}>
                            {borrower.creditScore || 500}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {borrower.creditRating}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full shadow-sm ${
                        borrower.status === 'ACTIVE' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 ring-1 ring-green-200' 
                          : borrower.status === 'DEFAULTED'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 ring-1 ring-red-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 ring-1 ring-gray-200'
                      }`}>
                        {borrower.status.charAt(0).toUpperCase() + borrower.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white">
                        <div className="font-medium">{borrower.totalLoans || 0} total</div>
                        <div className="text-xs text-gray-500">{borrower.activeLoans || 0} active</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      <div className="font-medium">{formatCurrency(borrower.outstandingBalance || 0)}</div>
                      <div className="text-xs text-gray-500">of {formatCurrency(borrower.totalBorrowed || 0)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center space-x-1">
                        <button 
                          onClick={() => handleViewBorrower(borrower)}
                          className="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-all duration-200 group-hover:scale-110"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleEditBorrower(borrower)}
                          className="p-2 text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-all duration-200 group-hover:scale-110"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleAIAnalysis(borrower)}
                          className="p-2 text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md transition-all duration-200 group-hover:scale-110"
                          title="AI Analysis"
                        >
                          <Brain className="h-4 w-4" />
                        </button>
                        <DeleteButton
                          entityType="borrower"
                          entityId={borrower.id}
                          entityData={borrower}
                          entityName={`${borrower.firstName} ${borrower.lastName}`}
                          variant="icon"
                          size="sm"
                          onSuccess={handleDeleteSuccess}
                          onError={handleDeleteError}
                          className="p-2 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all duration-200 group-hover:scale-110"
                        />
                      </div>
                    </td>
                  </tr>
                    )
                    );
                  })()
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // Grid View
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">All Borrowers</h3>
              <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                <Brain className="h-4 w-4 text-blue-500" />
                <span>AI-Enhanced Grid View</span>
              </div>
            </div>
          </div>
          
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="animate-pulse bg-gray-100 dark:bg-gray-800 rounded-lg h-64"></div>
              ))}
            </div>
          ) : borrowers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No borrowers found</p>
              {searchTerm && <p className="text-sm text-gray-400 mt-1">Try adjusting your search criteria</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(() => {
                const startIndex = (currentPage - 1) * rowsPerPage;
                const endIndex = startIndex + rowsPerPage;
                const paginatedBorrowers = borrowers.slice(startIndex, endIndex);
                
                return paginatedBorrowers.map((borrower) => (
                  <div key={borrower.id} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center space-x-4 mb-4">
                      <div className="h-16 w-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                        <Users className="h-8 w-8 text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-white">{borrower.firstName} {borrower.lastName}</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">ID: {borrower.id}</p>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full mt-1 ${
                          borrower.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : borrower.status === 'defaulted'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {borrower.status.charAt(0).toUpperCase() + borrower.status.slice(1)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="space-y-3 mb-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Credit Score:</span>
                        <EnhancedCreditScore borrower={borrower} variant="minimal" />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Total Loans:</span>
                        <span className="font-medium text-gray-900 dark:text-white">{borrower.totalLoans || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Outstanding:</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {formatCurrency(borrower.outstandingBalance || 0)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-600">
                      <div className="flex items-center space-x-2">
                        <button 
                          onClick={() => handleViewBorrower(borrower)}
                          className="flex items-center space-x-1 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 text-sm"
                        >
                          <Eye className="h-4 w-4" />
                          <span>View</span>
                        </button>
                        <button 
                          onClick={() => handleEditBorrower(borrower)}
                          className="flex items-center space-x-1 text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 text-sm"
                        >
                          <Edit2 className="h-4 w-4" />
                          <span>Edit</span>
                        </button>
                      </div>
                      <button 
                        onClick={() => handleAIAnalysis(borrower)}
                        className="flex items-center space-x-1 text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 text-sm"
                      >
                        <Brain className="h-4 w-4" />
                        <span>AI</span>
                      </button>
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}
      
      {/* Enhanced Pagination */}
      {borrowers.length > rowsPerPage && (
        <div className="bg-white dark:bg-gray-900 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-800 sm:px-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(currentPage + 1, Math.ceil(borrowers.length / rowsPerPage)))}
              disabled={currentPage === Math.ceil(borrowers.length / rowsPerPage)}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Showing <span className="font-medium">{((currentPage - 1) * rowsPerPage) + 1}</span> to{' '}
                <span className="font-medium">
                  {Math.min(currentPage * rowsPerPage, borrowers.length)}
                </span> of{' '}
                <span className="font-medium">{borrowers.length}</span> borrowers
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
                {Array.from({ length: Math.ceil(borrowers.length / rowsPerPage) }, (_, i) => i + 1)
                  .filter(page => {
                    const totalPages = Math.ceil(borrowers.length / rowsPerPage);
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
                  onClick={() => setCurrentPage(Math.min(currentPage + 1, Math.ceil(borrowers.length / rowsPerPage)))}
                  disabled={currentPage === Math.ceil(borrowers.length / rowsPerPage)}
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

      {/* Borrower Detail Modal */}
      {showDetailModal && selectedBorrower && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Borrower Details</h2>
              <button
                onClick={closeModals}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Personal Information</h3>
                <div className="space-y-2 text-sm">
                  <div><span className="font-medium">Name:</span> {selectedBorrower.firstName} {selectedBorrower.lastName}</div>
                  <div><span className="font-medium">ID:</span> {selectedBorrower.borrowerId}</div>
                  <div><span className="font-medium">Phone:</span> {selectedBorrower.phone}</div>
                  <div><span className="font-medium">Email:</span> {selectedBorrower.email || 'N/A'}</div>
                  <div><span className="font-medium">District:</span> {selectedBorrower.district || 'N/A'}</div>
                  <div><span className="font-medium">Occupation:</span> {selectedBorrower.occupation || 'N/A'}</div>
                  <div><span className="font-medium">Monthly Income:</span> {selectedBorrower.monthlyIncome ? formatCurrency(selectedBorrower.monthlyIncome) : 'N/A'}</div>
                </div>
              </div>
              
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Credit Information</h3>
                <div className="space-y-2 text-sm">
                  <div><span className="font-medium">Credit Score:</span> 
                    <span className={`ml-2 px-2 py-1 rounded text-xs ${getCreditScoreColor(selectedBorrower.creditScore || 500)}`}>
                      {selectedBorrower.creditScore || 500}
                    </span>
                  </div>
                  <div><span className="font-medium">Credit Rating:</span> {selectedBorrower.creditRating}</div>
                  <div><span className="font-medium">Status:</span> 
                    <span className={`ml-2 px-2 py-1 rounded text-xs ${
                      selectedBorrower.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedBorrower.status}
                    </span>
                  </div>
                  <div><span className="font-medium">Total Loans:</span> {selectedBorrower.totalLoans || 0}</div>
                  <div><span className="font-medium">Active Loans:</span> {selectedBorrower.activeLoans || 0}</div>
                  <div><span className="font-medium">Total Borrowed:</span> {formatCurrency(selectedBorrower.totalBorrowed || 0)}</div>
                  <div><span className="font-medium">Outstanding:</span> {formatCurrency(selectedBorrower.outstandingBalance || 0)}</div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={closeModals}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Close
              </button>
              <button
                onClick={() => {
                  closeModals();
                  handleEditBorrower(selectedBorrower);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Edit Borrower
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Borrower Modal */}
      {showEditModal && selectedBorrower && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Edit2 className="h-6 w-6 text-green-500" />
                Edit Borrower
              </h2>
              <button
                onClick={closeModals}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const updatedData: Partial<BorrowerData> = {
                firstName: formData.get('firstName') as string,
                lastName: formData.get('lastName') as string,
                phone: formData.get('phone') as string,
                email: formData.get('email') as string,
                district: formData.get('district') as string,
                occupation: formData.get('occupation') as string,
                monthlyIncome: parseFloat(formData.get('monthlyIncome') as string) || 0,
              };
              handleSaveBorrower(updatedData);
            }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* First Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    defaultValue={selectedBorrower.firstName}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Last Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    defaultValue={selectedBorrower.lastName}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    defaultValue={selectedBorrower.phone}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    defaultValue={selectedBorrower.email || ''}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                {/* District */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    District
                  </label>
                  <input
                    type="text"
                    name="district"
                    defaultValue={selectedBorrower.district || ''}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Occupation */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Occupation
                  </label>
                  <input
                    type="text"
                    name="occupation"
                    defaultValue={selectedBorrower.occupation || ''}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Monthly Income */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Monthly Income (UGX)
                  </label>
                  <input
                    type="number"
                    name="monthlyIncome"
                    defaultValue={selectedBorrower.monthlyIncome || 0}
                    min="0"
                    step="1000"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Read-only Credit Info */}
              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">Credit Information (Read-only)</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-blue-700 dark:text-blue-400">ID:</span> {selectedBorrower.borrowerId}</div>
                  <div><span className="text-blue-700 dark:text-blue-400">Score:</span> {selectedBorrower.creditScore || 500}</div>
                  <div><span className="text-blue-700 dark:text-blue-400">Rating:</span> {selectedBorrower.creditRating}</div>
                  <div><span className="text-blue-700 dark:text-blue-400">Status:</span> {selectedBorrower.status}</div>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={closeModals}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <Edit2 className="h-4 w-4" />
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Analysis Modal - Using Enhanced BorrowerDetailModal */}
      {showAIModal && selectedBorrower && (
        <BorrowerDetailModal
          borrower={selectedBorrower}
          isOpen={showAIModal}
          onClose={closeModals}
        />
      )}
    </div>
  );
};

export default Borrowers;
