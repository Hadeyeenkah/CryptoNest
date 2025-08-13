import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, onSnapshot, collection, query, orderBy, Timestamp, updateDoc, getDocs } from "firebase/firestore";

import { useAuth } from '../contexts/AuthContext.jsx';
import './dashboard.css'; // Corrected import path for CSS

// Helper function to format numbers as currency
const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// Helper function to capitalize the first letter of a string
const capitalize = (str) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1) : "";

// Helper function to get status display text
const getStatusDisplayText = (status) => {
  const statusMap = {
    'pending': 'Pending',
    'processing': 'Processing',
    'approved': 'Approved',
    'completed': 'Completed',
    'rejected': 'Rejected',
    'failed': 'Failed',
    'declined': 'Declined',
    'cancelled': 'Cancelled',
  };
  return statusMap[status] || capitalize(status);
};

// Helper function to get status icon
const getStatusIcon = (status) => {
  switch (status) {
    case 'approved':
    case 'completed':
      return '✓';
    case 'rejected':
    case 'failed':
    case 'declined':
    case 'cancelled':
      return '✗';
    case 'processing':
      return '⟳';
    case 'pending':
    default:
      return '●';
  }
};

// Define investment plans as constants
const INVESTMENT_PLANS = [
  {
    id: 'basic',
    name: 'Basic Plan',
    dailyROI: 0.10, // 10% daily ROI
    minInvestment: 500,
    maxInvestment: 1000,
    description: 'A solid start for your investment journey.',
    icon: (
      // Bitcoin/Crypto Icon
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c.137-.353.21-.748.21-1.155 0-.31-.037-.612-.11-.898C17.24 4.85 15.927 4 14.406 4H9.594C8.073 4 6.76 4.85 6.338 6.108c-.073.286-.11.588-.11.898 0 .407.073.802.21 1.155.424 1.09 1.424 1.839 2.624 1.839h.844v2h-.844c-1.2 0-2.2.749-2.624 1.839-.137.353-.21.748-.21 1.155 0 .31.037.612.11.898.422 1.258 1.735 2.108 3.256 2.108h4.812c1.521 0 2.834-.85 3.256-2.108.073-.286.11-.588.11-.898 0-.407-.073-.802-.21-1.155C16.762 12.749 15.762 12 14.562 12h-.844v-2h.844c1.2 0 2.2-.749 2.624-1.839zM10.688 6.5h2.624c.621 0 1.125.504 1.125 1.125S13.933 8.75 13.312 8.75h-2.624c-.621 0-1.125-.504-1.125-1.125S10.067 6.5 10.688 6.5zm2.624 11h-2.624c-.621 0-1.125-.504-1.125-1.125s.504-1.125 1.125-1.125h2.624c.621 0 1.125.504 1.125 1.125s-.504 1.125-1.125 1.125z"/>
      </svg>
    ),
    gradient: 'from-blue-500 to-purple-600'
  },
  {
    id: 'gold',
    name: 'Gold Plan',
    dailyROI: 0.20, // 20% daily ROI
    minInvestment: 1001,
    maxInvestment: 5000,
    description: 'Accelerate your returns with higher potential.',
    icon: (
      // Gold Bar Icon
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 8H3c-.552 0-1 .448-1 1v8c0 .552.448 1 1 1h18c.552 0 1-.448 1-1V9c0-.552-.448-1-1-1z"/>
        <path d="M4 6h16c.552 0 1 .448 1 1v1H3V7c0-.552.448-1 1-1z"/>
        <path d="M5 18h14c.552 0 1-.448 1-1v-1H4v1c0 .552.448 1 1 1z"/>
        <rect x="6" y="10" width="12" height="4" rx="0.5" fill="rgba(255,255,255,0.3)"/>
        <text x="12" y="13" textAnchor="middle" fontSize="4" fill="rgba(255,255,255,0.8)" fontWeight="bold">GOLD</text>
      </svg>
    ),
    gradient: 'from-yellow-400 to-orange-500'
  },
  {
    id: 'platinum',
    name: 'Platinum Plan',
    dailyROI: 0.30, // 30% daily ROI
    minInvestment: 5001,
    maxInvestment: 100000,
    description: 'Maximize your earnings with our exclusive plan.',
    icon: (
      // Diamond Icon
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 2l3 4h6l3-4h2l-4 6v14H4V8L0 2h6z"/>
        <path d="M4 8l8 14L20 8H4z" fill="rgba(255,255,255,0.3)"/>
        <path d="M4 8h5l3-6h2l3 6h5L12 22 4 8z" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" fill="none"/>
        <path d="M6 2h12l-2 4H8L6 2z" fill="rgba(255,255,255,0.4)"/>
        <path d="M12 2v4M8 6l4 16M16 6l-4 16" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5"/>
      </svg>
    ),
    gradient: 'from-purple-500 to-pink-600'
  },
];

// TransactionStatusBadge Component
const TransactionStatusBadge = ({ status, showIcon = false, onClick = null }) => {
  const statusClass = `inline-flex items-center px-2 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer hover:opacity-80 ${
    status === 'completed' || status === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
    status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
    status === 'processing' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  }`;
  
  return (
    <span 
      className={statusClass}
      onClick={onClick}
      title="Click to view transaction details"
    >
      {showIcon && <span className="mr-1">{getStatusIcon(status)}</span>}
      {getStatusDisplayText(status)}
    </span>
  );
};

// Enhanced Admin Transaction Control Component
const AdminTransactionControl = ({ transaction, onStatusUpdate, isLoading = false }) => {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleStatusChange = async (newStatus) => {
    if (isUpdating || isLoading) return;
    
    setIsUpdating(true);
    try {
      await onStatusUpdate(transaction.id, newStatus, transaction.userId);
    } catch (error) {
      console.error('Error updating transaction status:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const getAvailableActions = (currentStatus) => {
    switch (currentStatus) {
      case 'pending':
        return [
          { status: 'processing', label: 'Process', color: 'blue', icon: '⟳' },
          { status: 'approved', label: 'Approve', color: 'green', icon: '✓' },
          { status: 'rejected', label: 'Reject', color: 'red', icon: '✗' }
        ];
      case 'processing':
        return [
          { status: 'approved', label: 'Approve', color: 'green', icon: '✓' },
          { status: 'rejected', label: 'Reject', color: 'red', icon: '✗' },
          { status: 'cancelled', label: 'Cancel', color: 'gray', icon: '✗' }
        ];
      case 'approved':
        return [
          { status: 'completed', label: 'Complete', color: 'green', icon: '✓' },
          { status: 'cancelled', label: 'Cancel', color: 'gray', icon: '✗' }
        ];
      default:
        return [];
    }
  };

  const actions = getAvailableActions(transaction.status || 'pending');

  if (actions.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic">
        No actions available
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {actions.map((action) => (
        <button
          key={action.status}
          onClick={() => handleStatusChange(action.status)}
          disabled={isUpdating || isLoading}
          className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-200 flex items-center gap-1 ${
            action.color === 'green' ? 'bg-green-100 text-green-700 hover:bg-green-200 hover:shadow-md' :
            action.color === 'blue' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 hover:shadow-md' :
            action.color === 'red' ? 'bg-red-100 text-red-700 hover:bg-red-200 hover:shadow-md' :
            'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-md'
          } ${(isUpdating || isLoading) ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
          title={`Change status to ${action.label.toLowerCase()}`}
        >
          <span>{action.icon}</span>
          {isUpdating ? 'Updating...' : action.label}
        </button>
      ))}
    </div>
  );
};

// TransactionStatusFilter Component
const TransactionStatusFilter = ({ activeFilter, onFilterChange, transactions }) => {
  const statusCounts = transactions.reduce((acc, transaction) => {
    const status = transaction.status || 'pending';
    acc[status] = (acc[status] || 0) + 1;
    acc.all = (acc.all || 0) + 1;
    return acc;
  }, {});

  const filters = [
    { key: 'all', label: 'All', count: statusCounts.all || 0, color: 'gray' },
    { key: 'pending', label: 'Pending', count: statusCounts.pending || 0, color: 'yellow' },
    { key: 'processing', label: 'Processing', count: statusCounts.processing || 0, color: 'blue' },
    { key: 'approved', label: 'Approved', count: statusCounts.approved || 0, color: 'green' },
    { key: 'completed', label: 'Completed', count: statusCounts.completed || 0, color: 'emerald' },
    { key: 'rejected', label: 'Rejected', count: statusCounts.rejected || 0, color: 'red' },
    { key: 'declined', label: 'Declined', count: statusCounts.declined || 0, color: 'red' },
    { key: 'failed', label: 'Failed', count: statusCounts.failed || 0, color: 'red' },
    { key: 'cancelled', label: 'Cancelled', count: statusCounts.cancelled || 0, color: 'gray' },
  ];

  return (
    <div className="flex flex-wrap gap-3 mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2 flex items-center">
        Filter by status:
      </div>
      {filters.map(filter => (
        // Only render filters that have at least one transaction or are the active filter
        (filter.count > 0 || activeFilter === filter.key) && (
          <button
            key={filter.key}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
              activeFilter === filter.key 
                ? filter.color === 'yellow' ? 'bg-yellow-500 text-white shadow-md' :
                  filter.color === 'blue' ? 'bg-blue-500 text-white shadow-md' :
                  filter.color === 'green' ? 'bg-green-500 text-white shadow-md' :
                  filter.color === 'emerald' ? 'bg-emerald-500 text-white shadow-md' :
                  filter.color === 'red' ? 'bg-red-500 text-white shadow-md' :
                  'bg-gray-500 text-white shadow-md'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 dark:border-gray-600 hover:shadow-md'
            } hover:scale-105`}
            onClick={() => onFilterChange(filter.key)}
          >
            <span className={`inline-block w-2 h-2 rounded-full ${
              filter.color === 'yellow' ? 'bg-yellow-400' :
              filter.color === 'blue' ? 'bg-blue-400' :
              filter.color === 'green' ? 'bg-green-400' :
              filter.color === 'emerald' ? 'bg-emerald-400' :
              filter.color === 'red' ? 'bg-red-400' :
              'bg-gray-400'
            }`}></span>
            {filter.label}
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              activeFilter === filter.key 
                ? 'bg-white bg-opacity-20 text-white' 
                : 'bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
            }`}>
              {filter.count}
            </span>
          </button>
        )
      ))}
    </div>
  );
};

// TransactionStatusModal Component
const TransactionStatusModal = ({ show, transaction, onClose }) => {
  if (!show || !transaction) return null;

  const getTimelineData = (transaction) => {
    const timeline = [];
    const createdDate = transaction.timestamp?.toDate ? transaction.timestamp.toDate() : new Date(transaction.timestamp);
    
    // Always show created/submitted
    timeline.push({
      status: 'pending',
      title: 'Transaction Submitted',
      description: `${capitalize(transaction.type)} request submitted for ${formatCurrency(transaction.amount)}`,
      timestamp: createdDate,
      completed: true
    });

    // Add processing if status is beyond pending
    if (['processing', 'approved', 'completed', 'rejected', 'failed', 'declined', 'cancelled'].includes(transaction.status)) {
      timeline.push({
        status: 'processing',
        title: 'Under Review',
        description: 'Transaction is being reviewed by our team',
        timestamp: transaction.processingAt?.toDate ? transaction.processingAt.toDate() : 
                   transaction.updatedAt?.toDate ? transaction.updatedAt.toDate() : 
                   new Date(createdDate.getTime() + 5 * 60000),
        completed: true
      });
    }

    // Add final status
    if (['approved', 'completed', 'rejected', 'failed', 'declined', 'cancelled'].includes(transaction.status)) {
      const finalStatusMessages = {
        'approved': 'Transaction has been approved and is being processed',
        'completed': 'Transaction completed successfully',
        'rejected': 'Transaction was rejected due to validation issues',
        'declined': 'Transaction was declined by administrator',
        'cancelled': 'Transaction was cancelled',
        'failed': 'Transaction failed to process due to technical issues'
      };

      timeline.push({
        status: transaction.status,
        title: getStatusDisplayText(transaction.status),
        description: finalStatusMessages[transaction.status] || 'Status updated',
        timestamp: transaction.approvedAt?.toDate ? transaction.approvedAt.toDate() :
                   transaction.completedAt?.toDate ? transaction.completedAt.toDate() :
                   transaction.updatedAt?.toDate ? transaction.updatedAt.toDate() : 
                   new Date(createdDate.getTime() + 15 * 60000),
        completed: true
      });
    }

    return timeline;
  };

  const timelineData = getTimelineData(transaction);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Transaction Details</h3>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Transaction ID</div>
              <div className="font-medium text-gray-900 dark:text-white text-sm break-all">{transaction.id}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Type</div>
              <div className="font-medium text-gray-900 dark:text-white">{capitalize(transaction.type)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Amount</div>
              <div className="font-semibold text-lg text-gray-900 dark:text-white">{formatCurrency(transaction.amount)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Current Status</div>
              <div className="mt-1">
                <TransactionStatusBadge status={transaction.status || 'pending'} showIcon={true} />
              </div>
            </div>
          </div>

          {transaction.description && (
            <div className="mb-6">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Description</div>
              <div className="text-gray-900 dark:text-white">{transaction.description}</div>
            </div>
          )}

          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12,6 12,12 16,14"/>
              </svg>
              Transaction Timeline
            </h4>
            <div className="space-y-4">
              {timelineData.map((item, index) => (
                <div key={index} className="flex items-start space-x-4">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium border-2 ${
                    item.status === 'completed' || item.status === 'approved' ? 'bg-green-100 text-green-600 border-green-200' :
                    item.status === 'pending' ? 'bg-yellow-100 text-yellow-600 border-yellow-200' :
                    item.status === 'processing' ? 'bg-blue-100 text-blue-600 border-blue-200' :
                    'bg-red-100 text-red-600 border-red-200'
                  }`}>
                    {getStatusIcon(item.status)}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="font-semibold text-gray-900 dark:text-white mb-1">{item.title}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{item.description}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-500 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12,6 12,12 16,14"/>
                      </svg>
                      {item.timestamp.toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// InvestmentPlanCard Component
const InvestmentPlanCard = ({ plan, currentInvestment, onSelectPlan, index }) => {
  const isActive = currentInvestment && currentInvestment.id === plan.id;

  return (
    <div
      className={`plan-card ${isActive ? 'plan-card-active' : ''}`}
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      {isActive && (
        <div className="active-badge">
          <span>ACTIVE</span>
        </div>
      )}

      <div className={`plan-icon-wrapper bg-gradient-to-br ${plan.gradient}`}>
        {plan.icon}
      </div>

      <h3 className="plan-title">{plan.name}</h3>
      <p className="plan-description">{plan.description}</p>

      <div className="plan-stats">
        <div className="stat-item">
          <span className="stat-label">Daily ROI</span>
          <span className="stat-value roi">{(plan.dailyROI * 100).toFixed(0)}%</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Min Investment</span>
          <span className="stat-value">{formatCurrency(plan.minInvestment)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Max Investment</span>
          <span className="stat-value">{formatCurrency(plan.maxInvestment)}</span>
        </div>
      </div>

      <button
        onClick={() => onSelectPlan(plan)}
        disabled={isActive}
        className={`plan-button ${isActive ? 'plan-button-active' : ''}`}
      >
        {isActive ? 'Currently Active' : 'Select Plan'}
      </button>
    </div>
  );
};

// InvestmentPlansSection Component
const InvestmentPlansSection = ({ currentInvestment, onSelectPlan }) => (
  <section className="plans-section">
    <div className="section-header">
      <h2 className="section-title">Explore Investment Plans</h2>
      <p className="section-subtitle">Choose the perfect plan to maximize your daily earnings potential.</p>
    </div>
    <div className="plans-grid">
      {INVESTMENT_PLANS.map((plan, index) => (
        <InvestmentPlanCard
          key={plan.id}
          plan={plan}
          currentInvestment={currentInvestment}
          onSelectPlan={onSelectPlan}
          index={index}
        />
      ))}
    </div>
  </section>
);

// Modal Component
const Modal = ({ show, title, children, onClose }) => {
  if (!show) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          {onClose && (
            <button onClick={onClose} className="modal-close">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );
};

// Main DashboardPage Component
const DashboardPage = () => {
  const navigate = useNavigate();

  // Consume Firebase state from AuthContext
  const { db, userId, isAuthReady, loading: authLoading, authError, appId, userProfile, user, isAdmin } = useAuth();

  // Compute name fallback chain
  const firstName =
    userProfile?.fullName ||
    userProfile?.displayName ||
    (user?.email ? capitalize(user.email.split("@")[0].split(".")[0]) : null) ||
    "User";

  // Dashboard data states
  const [currentInvestment, setCurrentInvestment] = useState(null);
  const [balance, setBalance] = useState(0);
  const [totalInvested, setTotalInvested] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [transactionOverview, setTransactionOverview] = useState(null);

  // States for daily earnings calculation and animation
  const [lastDailyEarningTimestamp, setLastDailyEarningTimestamp] = useState(null);
  const [lastCalculatedDailyEarningAmount, setLastCalculatedDailyEarningAmount] = useState(0);
  const [displayDailyEarnings, setDisplayDailyEarnings] = useState(0);

  // UI state
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoModalTitle, setInfoModalTitle] = useState('');
  const [infoModalMessage, setInfoModalMessage] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Transaction status states for the modal
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all'); // Changed from 'pending' to 'all'

  // Combined loading state for the dashboard
  const isLoading = authLoading || !isAuthReady || !db || !userId;

  // Helper to get the full plan object from its ID
  const getPlanById = useCallback((planId) => {
    return INVESTMENT_PLANS.find(p => p.id === planId) || null;
  }, []);

  // Filter transactions based on status
  const filteredTransactions = transactions.filter(transaction => {
    if (statusFilter === 'all') return true;
    return (transaction.status || 'pending') === statusFilter;
  });

  // Handle transaction status click to open modal
  const handleTransactionStatusClick = (transaction) => {
    setSelectedTransaction(transaction);
    setShowStatusModal(true);
  };

  // Function to update transaction overview in dashboard data
  const updateTransactionOverview = useCallback(async (transactions) => {
    if (!db || !userId || !appId) return;

    try {
      // Calculate status summary
      const statusCounts = {
        pending: 0,
        processing: 0,
        approved: 0,
        completed: 0,
        rejected: 0,
        failed: 0,
        declined: 0,
        cancelled: 0
      };

      const statusAmounts = { ...statusCounts };
      
      transactions.forEach(transaction => {
        const status = transaction.status || 'pending';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
        statusAmounts[status] = (statusAmounts[status] || 0) + transaction.amount;
      });

      // Recent transactions by status
      const recentTransactions = {
        pending: transactions.filter(t => (t.status || 'pending') === 'pending').slice(0, 3),
        processing: transactions.filter(t => t.status === 'processing').slice(0, 3),
        completed: transactions.filter(t => t.status === 'completed').slice(0, 3)
      };

      const overview = {
        counts: statusCounts,
        amounts: statusAmounts,
        recent: recentTransactions,
        lastUpdated: Timestamp.now(),
        totalTransactions: transactions.length
      };

      // Update dashboard data
      const userDashboardRef = doc(db, 'artifacts', appId, 'users', userId, 'dashboardData', 'data');
      await updateDoc(userDashboardRef, {
        transactionOverview: overview,
        updatedAt: Timestamp.now()
      });

      console.log('Transaction overview updated in dashboard data');

    } catch (error) {
      console.error('Error updating transaction overview:', error);
    }
  }, [db, userId, appId]);

  const updateTransactionStatus = useCallback(async (transactionId, newStatus, transactionUserId = null) => {
    if (!db || !appId || !isAdmin) {
      console.error('Unauthorized or missing required data for transaction update');
      setShowInfoModal(true);
      setInfoModalTitle('Error');
      setInfoModalMessage('You do not have permission to perform this action.');
      return;
    }

    setIsUpdatingStatus(true);
    const targetUserId = transactionUserId || userId;

    try {
      const transactionRef = doc(db, 'artifacts', appId, 'users', targetUserId, 'transactions', transactionId);
      
      // First, get the current transaction data
      const transactionDoc = await getDoc(transactionRef);
      if (!transactionDoc.exists()) {
        throw new Error('Transaction not found');
      }

      const transactionData = transactionDoc.data();
      
      const updateData = {
        status: newStatus,
        updatedAt: Timestamp.now(),
        updatedBy: user?.email || 'admin'
      };

      // Add specific timestamps for tracking
      if (newStatus === 'processing') {
        updateData.processingAt = Timestamp.now();
      } else if (newStatus === 'approved') {
        updateData.approvedAt = Timestamp.now();
      } else if (newStatus === 'completed') {
        updateData.completedAt = Timestamp.now();
      }

      // Handle balance updates for approved deposits
      if (newStatus === 'approved' && transactionData.type === 'deposit') {
        try {
          // Update dashboard data
          const userDashboardRef = doc(db, 'artifacts', appId, 'users', targetUserId, 'dashboardData', 'data');
          const dashboardDoc = await getDoc(userDashboardRef);
          
          if (dashboardDoc.exists()) {
            const dashboardData = dashboardDoc.data();
            const newBalance = (dashboardData.balance || 0) + transactionData.amount;
            const newTotalInvested = (dashboardData.totalInvested || 0) + transactionData.amount;
            
            await updateDoc(userDashboardRef, {
              balance: newBalance,
              totalInvested: newTotalInvested,
              updatedAt: Timestamp.now()
            });

            // Update user profile balance
            const userProfileRef = doc(db, 'artifacts', appId, 'users', targetUserId, 'profile', 'data');
            const profileDoc = await getDoc(userProfileRef);
            
            if (profileDoc.exists()) {
              await updateDoc(userProfileRef, {
                balance: newBalance,
                totalInvested: newTotalInvested,
                updatedAt: Timestamp.now()
              });
            }
          }
        } catch (balanceError) {
          console.error('Error updating balance:', balanceError);
          // Continue with status update even if balance update fails
        }
      }

      // Update the transaction status
      await updateDoc(transactionRef, updateData);
      
      console.log(`Transaction ${transactionId} status updated to ${newStatus}`);
      
      setShowInfoModal(true);
      setInfoModalTitle('Success');
      setInfoModalMessage(`Transaction status successfully updated to ${getStatusDisplayText(newStatus)}.`);
      
    } catch (error) {
      console.error('Error updating transaction status:', error);
      setShowInfoModal(true);
      setInfoModalTitle('Error');
      setInfoModalMessage(`Failed to update transaction: ${error.message}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [db, userId, appId, isAdmin, user]);

  // Effect to fetch and listen to user data from Firestore
  useEffect(() => {
    let unsubscribeDashboard = () => {};
    let unsubscribeTransactions = () => {};

    if (db && userId && isAuthReady && appId) {
      const userDashboardDocRef = doc(db, 'artifacts', appId, 'users', userId, 'dashboardData', 'data');

      unsubscribeDashboard = onSnapshot(userDashboardDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setBalance(data.balance || 0);
          setLastCalculatedDailyEarningAmount(data.lastCalculatedDailyEarningAmount || 0);
          setTotalInvested(data.totalInvested || 0);

          if (data.currentInvestment && data.currentInvestment.id) {
            setCurrentInvestment(getPlanById(data.currentInvestment.id));
          } else {
            setCurrentInvestment(null);
          }

          setLastDailyEarningTimestamp(data.lastDailyEarningTimestamp ? data.lastDailyEarningTimestamp.toDate() : null);

          // Set transaction overview data if available
          if (data.transactionOverview) {
            setTransactionOverview(data.transactionOverview);
          }

          console.log("DashboardPage: Fetched dashboard data:", data);
        } else {
          // Initialize user dashboard data if it doesn't exist
          const initialData = {
            currentInvestment: null,
            balance: 0, 
            totalInvested: 0,
            lastDailyEarningTimestamp: null,
            lastCalculatedDailyEarningAmount: 0,
            createdAt: Timestamp.now(), 
            updatedAt: Timestamp.now(), 
          };
          setDoc(userDashboardDocRef, initialData)
            .then(() => {
              console.log("Initial user dashboard data set in Firestore.");
              setBalance(initialData.balance);
              setTotalInvested(initialData.totalInvested);
              setLastDailyEarningTimestamp(initialData.lastDailyEarningTimestamp);
              setLastCalculatedDailyEarningAmount(initialData.lastCalculatedDailyEarningAmount);
            })
            .catch(error => console.error("Error setting initial user dashboard data:", error));
        }
      }, (error) => {
        console.error("Error fetching real-time dashboard data:", error);
        setShowInfoModal(true);
        setInfoModalTitle('Data Error');
        setInfoModalMessage(`Failed to load dashboard data: ${error.message}. Please refresh.`);
      });

      // Listen to user's transactions with real-time updates
      const transactionsCollectionRef = collection(db, 'artifacts', appId, 'users', userId, 'transactions');
      const q = query(transactionsCollectionRef, orderBy('timestamp', 'desc'));

      unsubscribeTransactions = onSnapshot(q, (snapshot) => {
        const fetchedTransactions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          // Ensure all transactions have a status, defaulting to 'pending'
          status: doc.data().status || 'pending',
          timestamp: doc.data().timestamp instanceof Timestamp
                             ? doc.data().timestamp.toDate()
                             : (doc.data().timestamp ? new Date(doc.data().timestamp) : new Date()),
        }));
        setTransactions(fetchedTransactions);
        
        // Update transaction overview in dashboard data
        updateTransactionOverview(fetchedTransactions);
        
        console.log("DashboardPage: Fetched user transactions:", fetchedTransactions);
      }, (error) => {
        console.error("DashboardPage: Error fetching user transactions:", error);
        setShowInfoModal(true);
        setInfoModalTitle('Transaction History Error');
        setInfoModalMessage(`Failed to load transaction history: ${error.message}.`);
      });

      return () => {
        unsubscribeDashboard();
        unsubscribeTransactions();
      };
    }
  }, [db, userId, isAuthReady, appId, getPlanById, updateTransactionOverview]);

  // Effect to apply dark mode class to body
  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  // Function to toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(prevMode => !prevMode);
  };

  // UPDATED callback to update Firestore data with balance support
  const updateFirestoreData = useCallback(async (updates) => {
    if (!db || !userId || !appId) {
      console.error("Firestore, User ID, or App ID not available for update.");
      setShowInfoModal(true);
      setInfoModalTitle('Error');
      setInfoModalMessage('System not ready for updates. Please try again.');
      return;
    }
    const userDocRef = doc(db, 'artifacts', appId, 'users', userId, 'dashboardData', 'data');

    const payload = {
      updatedAt: Timestamp.now(),
    };

    // Add fields that are being updated
    if (updates.hasOwnProperty('lastCalculatedDailyEarningAmount')) {
      payload.lastCalculatedDailyEarningAmount = updates.lastCalculatedDailyEarningAmount;
    }
    if (updates.hasOwnProperty('lastDailyEarningTimestamp')) {
      payload.lastDailyEarningTimestamp = updates.lastDailyEarningTimestamp;
    }
    if (updates.hasOwnProperty('currentInvestment')) {
      payload.currentInvestment = updates.currentInvestment;
    }
    if (updates.hasOwnProperty('balance')) {
      payload.balance = updates.balance;
    }

    try {
      console.log("Attempting to send to Firestore (owner update):", payload);
      await setDoc(userDocRef, payload, { merge: true });
      
      // Also update user profile balance if balance is being updated
      if (updates.hasOwnProperty('balance')) {
        const userProfileRef = doc(db, 'artifacts', appId, 'users', userId, 'profile', 'data');
        const profileDoc = await getDoc(userProfileRef);
        
        if (profileDoc.exists()) {
          await updateDoc(userProfileRef, {
            balance: updates.balance,
            updatedAt: Timestamp.now()
          });
        }
      }
      
      console.log("Data updated in Firestore.");
    } catch (error) {
      console.error("Error updating Firestore:", error);
      setShowInfoModal(true);
      setInfoModalTitle('Error');
      setInfoModalMessage(`Failed to update data: ${error.message}.`);
    }
  }, [db, userId, appId]);

  // Helper function to process daily earnings (admin only)
  const processDailyEarnings = useCallback(async () => {
    if (!isAdmin || !db || !appId || !userId) {
      console.log('Daily earnings processing requires admin privileges');
      setShowInfoModal(true);
      setInfoModalTitle('Access Denied');
      setInfoModalMessage('Only administrators can process daily earnings.');
      return;
    }

    setShowInfoModal(true);
    setInfoModalTitle('Processing...');
    setInfoModalMessage('Processing daily earnings for all users. This may take a moment...');

    try {
      const usersRef = collection(db, 'artifacts', appId, 'users');
      const usersSnapshot = await getDocs(usersRef);
      let processedCount = 0;

      for (const userDoc of usersSnapshot.docs) {
        const userDashboardRef = doc(db, 'artifacts', appId, 'users', userDoc.id, 'dashboardData', 'data');
        const dashboardDoc = await getDoc(userDashboardRef);

        if (dashboardDoc.exists()) {
          const dashboardData = dashboardDoc.data();
          const currentInvestment = dashboardData.currentInvestment;
          const totalInvested = dashboardData.totalInvested || 0;

          if (currentInvestment && totalInvested > 0) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let lastCalcDate = dashboardData.lastDailyEarningTimestamp?.toDate();
            if (lastCalcDate) {
              lastCalcDate.setHours(0, 0, 0, 0);
            }

            if (!lastCalcDate || lastCalcDate.getTime() < today.getTime()) {
              const plan = INVESTMENT_PLANS.find(p => p.id === currentInvestment.id);
              if (plan) {
                const earningsForToday = totalInvested * plan.dailyROI;
                const newBalance = (dashboardData.balance || 0) + earningsForToday;

                await updateDoc(userDashboardRef, {
                  balance: newBalance,
                  lastCalculatedDailyEarningAmount: earningsForToday,
                  lastDailyEarningTimestamp: Timestamp.now(),
                  updatedAt: Timestamp.now()
                });

                const userProfileRef = doc(db, 'artifacts', appId, 'users', userDoc.id, 'profile', 'data');
                const profileDoc = await getDoc(userProfileRef);
                if (profileDoc.exists()) {
                  await updateDoc(userProfileRef, {
                    balance: newBalance,
                    updatedAt: Timestamp.now()
                  });
                }

                const transactionsRef = collection(db, 'artifacts', appId, 'users', userDoc.id, 'transactions');
                await setDoc(doc(transactionsRef), {
                  type: 'earning',
                  amount: earningsForToday,
                  status: 'completed',
                  timestamp: Timestamp.now(),
                  userId: userDoc.id,
                  description: `Daily earnings from ${plan.name}`,
                  planId: plan.id,
                  autoGenerated: true
                });

                processedCount++;
                console.log(`Processed daily earnings for user ${userDoc.id}: ${earningsForToday}`);
              }
            }
          }
        }
      }

      setShowInfoModal(true);
      setInfoModalTitle('Success');
      setInfoModalMessage(`Successfully processed daily earnings for ${processedCount} users.`);
    } catch (error) {
      console.error('Error processing daily earnings:', error);
      setShowInfoModal(true);
      setInfoModalTitle('Error');
      setInfoModalMessage(`Failed to process daily earnings: ${error.message}`);
    }
  }, [isAdmin, db, appId, userId]);

  // UPDATED Calculate daily earnings effect - Auto-adds to balance with completed status
  const calculateDailyEarningsEffect = useCallback(async () => {
    if (isLoading || !currentInvestment || totalInvested <= 0) {
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let lastCalcDate = lastDailyEarningTimestamp;
    if (lastCalcDate) {
      lastCalcDate.setHours(0, 0, 0, 0);
    }

    if (!lastCalcDate || lastCalcDate.getTime() < today.getTime()) {
      const earningsForToday = totalInvested * currentInvestment.dailyROI;

      console.log(`Daily earnings calculation: totalInvested=${totalInvested}, dailyROI=${currentInvestment.dailyROI}, earningsForToday=${earningsForToday}`);

      // Calculate new balance with earnings added
      const newBalance = balance + earningsForToday;

      // Update Firestore with new balance and earnings data
      await updateFirestoreData({
        lastCalculatedDailyEarningAmount: earningsForToday,
        lastDailyEarningTimestamp: Timestamp.now(),
        balance: newBalance, // Add earnings to current balance
      });

      if (earningsForToday > 0) {
        try {
          const transactionsCollectionRef = collection(db, 'artifacts', appId, 'users', userId, 'transactions');
          const dailyEarningTransaction = {
            type: 'earning',
            amount: earningsForToday,
            status: 'completed', // Changed from 'pending' to 'completed'
            timestamp: Timestamp.now(),
            userId: userId,
            description: `Daily earnings from ${currentInvestment.name}`,
            planId: currentInvestment.id,
            autoGenerated: true
          };
          
          await setDoc(doc(transactionsCollectionRef), dailyEarningTransaction);
          console.log('Daily earnings transaction created with completed status and balance updated');
        } catch (error) {
          console.error('Error creating daily earnings transaction:', error);
        }
      }

      setDisplayDailyEarnings(earningsForToday);
    } else {
      setDisplayDailyEarnings(lastCalculatedDailyEarningAmount);
    }
  }, [isLoading, currentInvestment, totalInvested, lastDailyEarningTimestamp, updateFirestoreData, lastCalculatedDailyEarningAmount, db, appId, userId, balance]); // Added 'balance' to dependencies

  useEffect(() => {
    calculateDailyEarningsEffect();

    const dailyCheckInterval = setInterval(() => {
      calculateDailyEarningsEffect();
    }, 1000 * 60 * 60);

    return () => clearInterval(dailyCheckInterval);
  }, [calculateDailyEarningsEffect]);

  // Effect for the "counting up" animation of daily earnings
  useEffect(() => {
    if (lastCalculatedDailyEarningAmount > 0 && displayDailyEarnings < lastCalculatedDailyEarningAmount) {
      let startValue = 0;
      const duration = 1500;
      let startTime = null;

      const animateCount = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const progress = timestamp - startTime;
        const percentage = Math.min(progress / duration, 1);
        const currentCount = startValue + (percentage * (lastCalculatedDailyEarningAmount - startValue));

        setDisplayDailyEarnings(parseFloat(currentCount.toFixed(2)));

        if (percentage < 1) {
          requestAnimationFrame(animateCount);
        } else {
          setDisplayDailyEarnings(lastCalculatedDailyEarningAmount);
        }
      };

      if (displayDailyEarnings !== 0) {
        setDisplayDailyEarnings(0);
      }
      requestAnimationFrame(animateCount);
    } else if (lastCalculatedDailyEarningAmount === 0 && displayDailyEarnings !== 0) {
      setDisplayDailyEarnings(0);
    } else if (lastCalculatedDailyEarningAmount > 0 && displayDailyEarnings === 0 && !isLoading) {
      setDisplayDailyEarnings(lastCalculatedDailyEarningAmount);
    }
  }, [lastCalculatedDailyEarningAmount, isLoading]);

  const handleSelectPlan = useCallback(async (plan) => {
    if (!db || !userId || !appId) {
      setShowInfoModal(true);
      setInfoModalTitle('Error');
      setInfoModalMessage('System not ready. Please try again.');
      return;
    }

    navigate('/deposit');
  }, [db, userId, appId, navigate]); 

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading your dashboard...</p>
        {authError && (
          <p style={{ color: "#ef4444", fontSize: "14px", marginTop: "10px" }}>
            Authentication Error: {authError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-content">
        {/* Theme Toggle Button */}
        <button
          onClick={toggleDarkMode}
          className="theme-toggle-btn"
        >
          {isDarkMode ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="M4.22 4.22l1.42 1.42" />
              <path d="M18.36 18.36l1.42 1.42" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="M4.22 19.78l1.42-1.42" />
              <path d="M18.36 5.64l1.42-1.42" />
            </svg>
          )}
        </button>

        {/* Animated Background */}
        <div className="bg-animation">
          <div className="floating-shape shape-1"></div>
          <div className="floating-shape shape-2"></div>
          <div className="floating-shape shape-3"></div>
        </div>

        {/* Main content area */}
        <>
          {/* Header */}
          <header className="dashboard-header">
            <div className="header-content">
              <div className="welcome-text">
                <h1 className="welcome-title">
                  Welcome, <span className="username">{firstName}</span>
                </h1>
                <p className="welcome-subtitle">Your financial journey continues here</p>
              </div>
              <div className="header-actions">
                {isAdmin && (
                  <>
                    <button
                      onClick={() => navigate('/admin')}
                      className="action-btn admin-dashboard-btn"
                    >
                      Admin Dashboard
                    </button>
                    <button
                      onClick={processDailyEarnings}
                      className="action-btn process-earnings-btn"
                      style={{ marginLeft: '10px', backgroundColor: '#10b981' }}
                      disabled={isUpdatingStatus}
                    >
                      {isUpdatingStatus ? 'Processing...' : 'Process Daily Earnings'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* Stats Grid */}
          <section className="stats-section">
            <div className="stats-grid">
              <div className="stat-card balance-card">
                <div className="stat-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1v6m0 0l4-4m-4 4L8 3m4 8v6m0 0l4-4m-4 4l-4-4M1 12h22"/>
                  </svg>
                </div>
                <div className="stat-content">
                  <h3 className="stat-label">Current Balance</h3>
                  <div className="stat-value">
                    <span id="account-balance">
                      {isBalanceHidden ? '****' : formatCurrency(balance)}
                    </span>
                    <button 
                      id="toggle-balance-btn" 
                      className="toggle-balance-btn" 
                      aria-label={isBalanceHidden ? "Show balance" : "Hide balance"}
                      onClick={() => setIsBalanceHidden(!isBalanceHidden)}
                    >
                      {isBalanceHidden ? (
                        <i className="fas fa-eye"></i>
                      ) : (
                        <i className="fas fa-eye-slash"></i>
                      )}
                    </button>
                  </div>
                  <span className="stat-change positive">
                    {lastDailyEarningTimestamp && `Last updated: ${lastDailyEarningTimestamp.toLocaleDateString()}`}
                  </span>
                </div>
              </div>

              <div className="stat-card invested-card">
                <div className="stat-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div className="stat-content">
                  <h3 className="stat-label">Total Invested</h3>
                  <p className="stat-value">{formatCurrency(totalInvested)}</p>
                  <span className="stat-change positive">Active investments earning daily</span>
                </div>
              </div>

              <div className="stat-card earnings-card">
                <div className="stat-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20V10" />
                    <path d="M18 20V4" />
                    <path d="M6 20v-4" />
                  </svg>
                </div>
                <div className="stat-content">
                  <h3 className="stat-label">Daily Earnings</h3>
                  <p className="stat-value">{formatCurrency(displayDailyEarnings)}</p>
                  <span className="stat-change positive">
                    {currentInvestment ? `${(currentInvestment.dailyROI * 100).toFixed(1)}% of invested amount` : 'Select a plan to start earning'}
                  </span>
                </div>
              </div>

              <div className="stat-card active-plan-card">
                <div className="stat-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div className="stat-content">
                  <h3 className="stat-label">Active Plan</h3>
                  <p className="stat-value">
                    {currentInvestment ? currentInvestment.name : 'None'}
                  </p>
                  <span className="stat-change info">
                    {currentInvestment ? `ROI: ${(currentInvestment.dailyROI * 100).toFixed(1)}% Daily` : 'Select a plan to start'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Investment Plans Section */}
          <InvestmentPlansSection
            currentInvestment={currentInvestment}
            onSelectPlan={handleSelectPlan}
          />

          {/* Transaction History Section */}
          <section className="transactions-history-section">
            <div className="section-header">
              <h2 className="section-title">Transaction History</h2>
              <p className="section-subtitle">
                A detailed record of all your financial activities. 
                {isAdmin && ' As an admin, you can manage transaction statuses.'}
              </p>
            </div>
            
            <TransactionStatusFilter
              activeFilter={statusFilter}
              onFilterChange={setStatusFilter}
              transactions={transactions}
            />
            
            {/* Summary stats for admins */}
            {isAdmin && transactionOverview && (
              <div className="admin-transaction-summary mb-6 p-4 bg-blue-50 dark:bg-blue-900 rounded-lg">
                <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                  Admin Overview - Total Transactions: {transactionOverview.totalTransactions}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-blue-600 dark:text-blue-300">Pending: </span>
                    <span className="font-semibold">{transactionOverview.counts.pending}</span>
                    <span className="text-xs text-gray-500 ml-1">({formatCurrency(transactionOverview.amounts.pending)})</span>
                  </div>
                  <div>
                    <span className="text-blue-600 dark:text-blue-300">Processing: </span>
                    <span className="font-semibold">{transactionOverview.counts.processing}</span>
                    <span className="text-xs text-gray-500 ml-1">({formatCurrency(transactionOverview.amounts.processing)})</span>
                  </div>
                  <div>
                    <span className="text-blue-600 dark:text-blue-300">Approved: </span>
                    <span className="font-semibold">{transactionOverview.counts.approved}</span>
                    <span className="text-xs text-gray-500 ml-1">({formatCurrency(transactionOverview.amounts.approved)})</span>
                  </div>
                  <div>
                    <span className="text-blue-600 dark:text-blue-300">Completed: </span>
                    <span className="font-semibold">{transactionOverview.counts.completed}</span>
                    <span className="text-xs text-gray-500 ml-1">({formatCurrency(transactionOverview.amounts.completed)})</span>
                  </div>
                </div>
                {transactionOverview.lastUpdated && (
                  <div className="text-xs text-gray-500 mt-2">
                    Last updated: {transactionOverview.lastUpdated.toDate().toLocaleString()}
                  </div>
                )}
              </div>
            )}

            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                    {isAdmin && <th>Admin Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.length > 0 ? (
                    filteredTransactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <td>{transaction.timestamp ? transaction.timestamp.toLocaleDateString() : 'N/A'}</td>
                        <td>
                          <span className="inline-flex items-center gap-1">
                            {transaction.autoGenerated && (
                              <span className="text-xs bg-blue-100 text-blue-800 px-1 rounded" title="Auto-generated">
                                Auto
                              </span>
                            )}
                            {capitalize(transaction.type)}
                          </span>
                        </td>
                        <td className="font-semibold">{formatCurrency(transaction.amount)}</td>
                        <td>
                          <TransactionStatusBadge
                            status={transaction.status || 'pending'}
                            showIcon={true}
                            onClick={() => handleTransactionStatusClick(transaction)}
                          />
                        </td>
                        {isAdmin && (
                          <td>
                            <AdminTransactionControl
                              transaction={transaction}
                              onStatusUpdate={updateTransactionStatus}
                              isLoading={isUpdatingStatus}
                            />
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={isAdmin ? "5" : "4"} className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <div className="flex flex-col items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-gray-300">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14,2 14,8 20,8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                            <polyline points="10,9 9,9 8,9"/>
                          </svg>
                          <p>No transactions found for "{statusFilter}" status.</p>
                          {statusFilter !== 'all' && (
                            <button 
                              onClick={() => setStatusFilter('all')} 
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              View all transactions
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      </div>

      {/* Info Modal */}
      <Modal
        show={showInfoModal}
        title={infoModalTitle}
        onClose={() => setShowInfoModal(false)}
      >
        <p>{infoModalMessage}</p>
      </Modal>

      {/* Transaction Status Details Modal */}
      <TransactionStatusModal
        show={showStatusModal}
        transaction={selectedTransaction}
        onClose={() => setShowStatusModal(false)}
      />
    </div>
  );
};

export default DashboardPage;

