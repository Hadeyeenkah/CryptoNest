import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, onSnapshot, collection, query, orderBy, Timestamp, updateDoc, getDocs } from "firebase/firestore";

import { useAuth } from '../contexts/AuthContext.jsx';
import './dashboard.css';

// Helper functions (all remain the same)
const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
};

const capitalize = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : "";

const getStatusDisplayText = (status) => {
    const statusMap = {
        'pending': 'Pending', 'processing': 'Processing', 'approved': 'Approved',
        'completed': 'Completed', 'rejected': 'Rejected', 'failed': 'Failed',
        'declined': 'Declined', 'cancelled': 'Cancelled',
    };
    return statusMap[status] || capitalize(status);
};

const getStatusIcon = (status) => {
    switch (status) {
        case 'approved':
        case 'completed': return '✓';
        case 'rejected':
        case 'failed':
        case 'declined':
        case 'cancelled': return '✗';
        case 'processing': return '⟳';
        case 'pending':
        default: return '●';
    }
};

const INVESTMENT_PLANS = [
    {
        id: 'basic', name: 'Basic Plan', dailyROI: 0.10, minInvestment: 500, maxInvestment: 1000,
        description: 'A solid start for your investment journey.', gradient: 'from-blue-500 to-purple-600',
        duration: 30
    },
    {
        id: 'gold', name: 'Gold Plan', dailyROI: 0.20, minInvestment: 1001, maxInvestment: 5000,
        description: 'Accelerate your returns with higher potential.', gradient: 'from-yellow-400 to-orange-500',
        duration: 30
    },
    {
        id: 'platinum', name: 'Platinum Plan', dailyROI: 0.30, minInvestment: 5001, maxInvestment: 100000,
        description: 'Maximize your earnings with our exclusive plan.', gradient: 'from-purple-500 to-pink-600',
        duration: 30
    },
];

const calculateCurrentBalance = (totalInvested, accumulatedEarnings, totalWithdrawals) => {
    return totalInvested + accumulatedEarnings - totalWithdrawals;
};

const calculateDaysSinceStart = (startDate) => {
    if (!startDate) return 0;
    const now = new Date();
    const start = startDate instanceof Date ? startDate : startDate.toDate();
    const diffTime = Math.abs(now - start);
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

const calculateAccumulatedEarnings = (totalInvested, dailyROI, daysSinceStart, maxDays) => {
    const effectiveDays = Math.min(daysSinceStart, maxDays);
    return totalInvested * dailyROI * effectiveDays;
};

const TransactionStatusBadge = ({ status, showIcon = false, onClick = null }) => {
    const getStatusClass = (status) => {
        const baseClass = "inline-flex items-center px-2 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer hover:opacity-80";
        switch (status) {
            case 'completed':
            case 'approved': return `${baseClass} bg-green-100 text-green-800`;
            case 'pending': return `${baseClass} bg-yellow-100 text-yellow-800`;
            case 'processing': return `${baseClass} bg-blue-100 text-blue-800`;
            default: return `${baseClass} bg-red-100 text-red-800`;
        }
    };

    return (
        <span className={getStatusClass(status)} onClick={onClick} title="Click to view transaction details">
            {showIcon && <span className="mr-1">{getStatusIcon(status)}</span>}
            {getStatusDisplayText(status)}
        </span>
    );
};

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
        const actionMap = {
            'pending': [
                { status: 'processing', label: 'Process', color: 'blue', icon: '⟳' },
                { status: 'approved', label: 'Approve', color: 'green', icon: '✓' },
                { status: 'rejected', label: 'Reject', color: 'red', icon: '✗' }
            ],
            'processing': [
                { status: 'approved', label: 'Approve', color: 'green', icon: '✓' },
                { status: 'rejected', label: 'Reject', color: 'red', icon: '✗' },
                { status: 'cancelled', label: 'Cancel', color: 'gray', icon: '✗' }
            ],
            'approved': [
                { status: 'completed', label: 'Complete', color: 'green', icon: '✓' },
                { status: 'cancelled', label: 'Cancel', color: 'gray', icon: '✗' }
            ]
        };
        return actionMap[currentStatus] || [];
    };

    const actions = getAvailableActions(transaction.status || 'pending');
    if (actions.length === 0) return <div className="text-sm text-gray-500 italic">No actions available</div>;

    return (
        <div className="flex flex-wrap gap-2 mt-2">
            {actions.map((action) => (
                <button
                    key={action.status}
                    onClick={() => handleStatusChange(action.status)}
                    disabled={isUpdating || isLoading}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-200 flex items-center gap-1
            ${action.color === 'green' ? 'bg-green-100 text-green-700 hover:bg-green-200 hover:shadow-md' :
                            action.color === 'blue' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 hover:shadow-md' :
                                action.color === 'red' ? 'bg-red-100 text-red-700 hover:bg-red-200 hover:shadow-md' :
                                    'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-md'
                        } ${(isUpdating || isLoading) ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
                >
                    <span>{action.icon}</span>
                    {isUpdating ? 'Updating...' : action.label}
                </button>
            ))}
        </div>
    );
};

const InvestmentPlanCard = ({ plan, currentInvestment, onSelectPlan, index }) => {
    const isActive = currentInvestment && currentInvestment.id === plan.id;

    return (
        <div className={`plan-card ${isActive ? 'plan-card-active' : ''}`} style={{ animationDelay: `${index * 0.1}s` }}>
            {isActive && <div className="active-badge"><span>ACTIVE</span></div>}

            <div className={`plan-icon-wrapper bg-gradient-to-br ${plan.gradient}`}>
                <svg xmlns="http://www.w3.org/2003/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
            </div>

            <h3 className="plan-title">{plan.name}</h3>
            <p className="plan-description">{plan.description}</p>

            <div className="plan-stats">
                <div className="stat-item">
                    <span className="stat-label">Daily ROI</span>
                    <span className="stat-value roi">{(plan.dailyROI * 100).toFixed(0)}%</span>
                </div>
                <div className="stat-item">
                    <span className="stat-label">Duration</span>
                    <span className="stat-value">{plan.duration} days</span>
                </div>
                <div className="stat-item">
                    <span className="stat-label">Min Investment</span>
                    <span className="stat-value">{formatCurrency(plan.minInvestment)}</span>
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

const DashboardPage = () => {
    const navigate = useNavigate();
    const { db, userId, isAuthReady, loading: authLoading, authError, appId, userProfile, user, isAdmin } = useAuth();

    const firstName = userProfile?.fullName ||
        userProfile?.displayName ||
        (user?.email ? capitalize(user.email.split("@")[0].split(".")[0]) : null) ||
        "User";

    const [dashboardData, setDashboardData] = useState({
        currentInvestment: null,
        totalInvested: 0,
        accumulatedEarnings: 0,
        totalWithdrawals: 0,
        currentBalance: 0,
        investmentStartDate: null,
        lastEarningsUpdate: null
    });

    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('pending');
    const [isBalanceHidden, setIsBalanceHidden] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [infoModal, setInfoModal] = useState({ title: '', message: '' });

    const isSystemLoading = authLoading || !isAuthReady || !db || !userId || loading;

    // --- NEW: Dark mode state and toggle handler ---
    const [isDarkMode, setIsDarkMode] = useState(() => {
        // Initialize from local storage or system preference
        const storedMode = localStorage.getItem('theme');
        if (storedMode) return storedMode === 'dark';
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    const handleThemeToggle = useCallback(() => {
        setIsDarkMode(prevMode => {
            const newMode = !prevMode;
            if (newMode) {
                document.body.classList.add('dark');
                localStorage.setItem('theme', 'dark');
            } else {
                document.body.classList.remove('dark');
                localStorage.setItem('theme', 'light');
            }
            return newMode;
        });
    }, []);

    useEffect(() => {
        // Apply the initial theme on component mount
        if (isDarkMode) {
            document.body.classList.add('dark');
        } else {
            document.body.classList.remove('dark');
        }
    }, [isDarkMode]);

    const getPlanById = useCallback((planId) => {
        return INVESTMENT_PLANS.find(p => p.id === planId) || null;
    }, []);

    const updateFirestoreData = useCallback(async (updates) => {
        if (!db || !userId || !appId) return;

        const userDocRef = doc(db, 'artifacts', appId, 'users', userId, 'dashboardData', 'data');
        const payload = { ...updates, updatedAt: Timestamp.now() };

        try {
            await setDoc(userDocRef, payload, { merge: true });
            console.log("Dashboard data updated in Firestore");
        } catch (error) {
            console.error("Error updating Firestore:", error);
            showInfoModalHandler('Error', `Failed to update data: ${error.message}`);
        }
    }, [db, userId, appId]);

    const showInfoModalHandler = (title, message) => {
        setInfoModal({ title, message });
        setShowInfoModal(true);
    };

    const calculateAndUpdateBalance = useCallback(async (data) => {
        if (!data.currentInvestment || !data.investmentStartDate) {
            return data;
        }

        const plan = getPlanById(data.currentInvestment.id);
        if (!plan) return data;

        const daysSinceStart = calculateDaysSinceStart(data.investmentStartDate);
        const newAccumulatedEarnings = calculateAccumulatedEarnings(
            data.totalInvested,
            plan.dailyROI,
            daysSinceStart,
            plan.duration
        );

        const newCurrentBalance = calculateCurrentBalance(
            data.totalInvested,
            newAccumulatedEarnings,
            data.totalWithdrawals
        );

        const updatedData = {
            ...data,
            accumulatedEarnings: newAccumulatedEarnings,
            currentBalance: newCurrentBalance,
            lastEarningsUpdate: Timestamp.now()
        };

        if (Math.abs(newAccumulatedEarnings - data.accumulatedEarnings) >= 0.01) {
            await updateFirestoreData({
                accumulatedEarnings: newAccumulatedEarnings,
                currentBalance: newCurrentBalance,
                lastEarningsUpdate: Timestamp.now()
            });
        }

        return updatedData;
    }, [getPlanById, updateFirestoreData]);

    const handleWithdrawal = useCallback(async (amount) => {
        const newTotalWithdrawals = dashboardData.totalWithdrawals + amount;
        const newCurrentBalance = calculateCurrentBalance(
            dashboardData.totalInvested,
            dashboardData.accumulatedEarnings,
            newTotalWithdrawals
        );

        const updatedData = {
            totalWithdrawals: newTotalWithdrawals,
            currentBalance: newCurrentBalance
        };

        await updateFirestoreData(updatedData);
        setDashboardData(prev => ({ ...prev, ...updatedData }));
    }, [dashboardData, updateFirestoreData]);

    const updateTransactionStatus = useCallback(async (transactionId, newStatus, transactionUserId = null) => {
        if (!isAdmin) {
            showInfoModalHandler('Error', 'You do not have permission to perform this action.');
            return;
        }

        const targetUserId = transactionUserId || userId;

        try {
            const transactionRef = doc(db, 'artifacts', appId, 'users', targetUserId, 'transactions', transactionId);
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

            if (newStatus === 'approved' && transactionData.type === 'deposit') {
                const userDashboardRef = doc(db, 'artifacts', appId, 'users', targetUserId, 'dashboardData', 'data');
                const dashboardDoc = await getDoc(userDashboardRef);

                if (dashboardDoc.exists()) {
                    const currentData = dashboardDoc.data();
                    const newTotalInvested = (currentData.totalInvested || 0) + transactionData.amount;

                    await updateDoc(userDashboardRef, {
                        totalInvested: newTotalInvested,
                        investmentStartDate: currentData.investmentStartDate || Timestamp.now(),
                        updatedAt: Timestamp.now()
                    });
                }
            }

            if (newStatus === 'completed' && transactionData.type === 'withdrawal') {
                await handleWithdrawal(transactionData.amount);
            }

            await updateDoc(transactionRef, updateData);
            showInfoModalHandler('Success', `Transaction status updated to ${getStatusDisplayText(newStatus)}.`);

        } catch (error) {
            console.error('Error updating transaction status:', error);
            showInfoModalHandler('Error', `Failed to update transaction: ${error.message}`);
        }
    }, [isAdmin, db, appId, userId, user, handleWithdrawal]);

    useEffect(() => {
        if (!db || !userId || !appId) return;

        const unsubscribers = [];

        const dashboardRef = doc(db, 'artifacts', appId, 'users', userId, 'dashboardData', 'data');
        const unsubDashboard = onSnapshot(dashboardRef, async (docSnap) => {
            if (docSnap.exists()) {
                const data = {
                    currentInvestment: null,
                    totalInvested: 0,
                    accumulatedEarnings: 0,
                    totalWithdrawals: 0,
                    currentBalance: 0,
                    investmentStartDate: null,
                    lastEarningsUpdate: null,
                    ...docSnap.data()
                };

                if (data.currentInvestment?.id) {
                    data.currentInvestment = getPlanById(data.currentInvestment.id);
                }

                if (data.investmentStartDate?.toDate) {
                    data.investmentStartDate = data.investmentStartDate.toDate();
                }
                if (data.lastEarningsUpdate?.toDate) {
                    data.lastEarningsUpdate = data.lastEarningsUpdate.toDate();
                }

                const updatedData = await calculateAndUpdateBalance(data);
                setDashboardData(updatedData);

            } else {
                const initialData = {
                    currentInvestment: null,
                    totalInvested: 0,
                    accumulatedEarnings: 0,
                    totalWithdrawals: 0,
                    currentBalance: 0,
                    investmentStartDate: null,
                    lastEarningsUpdate: null,
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now()
                };

                await setDoc(dashboardRef, initialData);
                setDashboardData(initialData);
            }
            setLoading(false);
        });

        const transactionsRef = collection(db, 'artifacts', appId, 'users', userId, 'transactions');
        const q = query(transactionsRef, orderBy('timestamp', 'desc'));
        const unsubTransactions = onSnapshot(q, (snapshot) => {
            const fetchedTransactions = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                status: doc.data().status || 'pending',
                timestamp: doc.data().timestamp?.toDate?.() || new Date(doc.data().timestamp || Date.now())
            }));
            setTransactions(fetchedTransactions);
        });

        unsubscribers.push(unsubDashboard, unsubTransactions);

        return () => unsubscribers.forEach(unsub => unsub());
    }, [db, userId, appId, getPlanById, calculateAndUpdateBalance]);

    useEffect(() => {
        const interval = setInterval(async () => {
            if (!isSystemLoading) {
                const updatedData = await calculateAndUpdateBalance(dashboardData);
                setDashboardData(updatedData);
            }
        }, 3600000);

        return () => clearInterval(interval);
    }, [dashboardData, calculateAndUpdateBalance, isSystemLoading]);

    const handleSelectPlan = useCallback((plan) => {
        navigate('/deposit');
    }, [navigate]);

    const filteredTransactions = transactions.filter(transaction => {
        if (statusFilter === 'all') return true;
        return (transaction.status || 'pending') === statusFilter;
    });

    if (isSystemLoading) {
        return (
            <div className="loading-screen">
                <div className="spinner"></div>
                <p>Loading your dashboard...</p>
                {authError && <p style={{ color: "#ef4444" }}>Authentication Error: {authError}</p>}
            </div>
        );
    }

    const getPlanProgress = () => {
        if (!dashboardData.currentInvestment || !dashboardData.investmentStartDate) return 0;
        const plan = getPlanById(dashboardData.currentInvestment.id);
        if (!plan) return 0;
        const daysSinceStart = calculateDaysSinceStart(dashboardData.investmentStartDate);
        return Math.min((daysSinceStart / plan.duration) * 100, 100);
    };

    return (
        <div className="dashboard">
            <div className="dashboard-content">
                {/* --- NEW: Dark mode toggle button is now correctly placed --- */}
                <button
                    onClick={handleThemeToggle}
                    className="theme-toggle-btn"
                    title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {isDarkMode ? '☀️' : '🌙'}
                </button>
                {/* Animated Background */}
                <div className="bg-animation">
                    <div className="floating-shape shape-1"></div>
                    <div className="floating-shape shape-2"></div>
                    <div className="floating-shape shape-3"></div>
                </div>

                {/* Header */}
                <header className="dashboard-header">
                    <div className="header-content">
                        <div className="welcome-text">
                            <h1 className="welcome-title">Welcome, <span className="username">{firstName}</span></h1>
                            <p className="welcome-subtitle">Your financial journey continues here</p>
                        </div>
                        <div className="header-actions">
                            {isAdmin && (
                                <button onClick={() => navigate('/admin')} className="action-btn admin-dashboard-btn">
                                    Admin Dashboard
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                {/* Stats Grid */}
                <section className="stats-section">
                    <div className="stats-grid">
                        <div className="stat-card balance-card">
                            <div className="stat-icon">💰</div>
                            <div className="stat-content">
                                <h3 className="stat-label">Current Balance</h3>
                                <div className="stat-value">
                                    <span>{isBalanceHidden ? '****' : formatCurrency(dashboardData.currentBalance)}</span>
                                    <button
                                        className="toggle-balance-btn"
                                        onClick={() => setIsBalanceHidden(!isBalanceHidden)}
                                        title={isBalanceHidden ? 'Show Balance' : 'Hide Balance'}
                                    >
                                        {isBalanceHidden ? '👁️' : '🙈'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="stat-card invested-card">
                            <div className="stat-icon">📈</div>
                            <div className="stat-content">
                                <h3 className="stat-label">Total Invested</h3>
                                <p className="stat-value">{formatCurrency(dashboardData.totalInvested)}</p>
                            </div>
                        </div>

                        <div className="stat-card earnings-card">
                            <div className="stat-icon">💵</div>
                            <div className="stat-content">
                                <h3 className="stat-label">Accumulated Earnings</h3>
                                <p className="stat-value">{formatCurrency(dashboardData.accumulatedEarnings)}</p>
                                <span className="stat-change positive">
                                    {dashboardData.currentInvestment &&
                                        `${getPlanProgress().toFixed(1)}% of ${dashboardData.currentInvestment.duration} days completed`
                                    }
                                </span>
                            </div>
                        </div>

                        <div className="stat-card active-plan-card">
                            <div className="stat-icon">🎯</div>
                            <div className="stat-content">
                                <h3 className="stat-label">Active Plan</h3>
                                <p className="stat-value">
                                    {dashboardData.currentInvestment ? dashboardData.currentInvestment.name : 'None'}
                                </p>
                                <span className="stat-change info">
                                    {dashboardData.currentInvestment
                                        ? `${(dashboardData.currentInvestment.dailyROI * 100).toFixed(1)}% Daily ROI`
                                        : 'Select a plan to start'}
                                </span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Investment Plans */}
                <section className="plans-section">
                    <div className="section-header">
                        <h2 className="section-title">Investment Plans</h2>
                        <p className="section-subtitle">Choose your investment duration and daily returns</p>
                    </div>
                    <div className="plans-grid">
                        {INVESTMENT_PLANS.map((plan, index) => (
                            <InvestmentPlanCard
                                key={plan.id}
                                plan={plan}
                                currentInvestment={dashboardData.currentInvestment}
                                onSelectPlan={handleSelectPlan}
                                index={index}
                            />
                        ))}
                    </div>
                </section>

                {/* Transaction History */}
                <section className="transactions-history-section">
                    <div className="section-header">
                        <h2 className="section-title">Transaction History</h2>
                    </div>

                    {/* Status Filter */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {['all', 'pending', 'processing', 'approved', 'completed', 'rejected'].map(status => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                    statusFilter === status
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                            >
                                {capitalize(status)} ({transactions.filter(t => status === 'all' || t.status === status).length})
                            </button>
                        ))}
                    </div>

                    <div className="table-responsive">
                        <table>
                            <thead>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Amount</th>
                                <th>Status</th>
                                {isAdmin && <th>Actions</th>}
                            </tr>
                            </thead>
                            <tbody>
                            {filteredTransactions.length > 0 ? (
                                filteredTransactions.map((transaction) => (
                                    <tr key={transaction.id}>
                                        <td>{transaction.timestamp.toLocaleDateString()}</td>
                                        <td>{capitalize(transaction.type)}</td>
                                        <td className="font-semibold">{formatCurrency(transaction.amount)}</td>
                                        <td>
                                            <TransactionStatusBadge status={transaction.status} showIcon={true} />
                                        </td>
                                        {isAdmin && (
                                            <td>
                                                <AdminTransactionControl
                                                    transaction={transaction}
                                                    onStatusUpdate={updateTransactionStatus}
                                                />
                                            </td>
                                        )}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={isAdmin ? "5" : "4"} className="text-center py-8">
                                        No transactions found for "{statusFilter}" status.
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            {/* Info Modal */}
            {showInfoModal && (
                <div className="modal-overlay">
                    <div className="modal-container">
                        <div className="modal-header">
                            <h3 className="modal-title">{infoModal.title}</h3>
                            <button onClick={() => setShowInfoModal(false)} className="modal-close">×</button>
                        </div>
                        <div className="modal-content">
                            <p>{infoModal.message}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardPage;
