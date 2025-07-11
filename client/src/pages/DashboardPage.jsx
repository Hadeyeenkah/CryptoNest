import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, onSnapshot, collection, query, orderBy, Timestamp } from "firebase/firestore";

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
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
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
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8c1.657 0 3 .895 3 2s-1.343 2-3 2-3-.895-3-2 1.343-2 3-2zM12 8V3m0 5v8m0 0v3.010M12 16h3.010M12 16H8.990m0 0l-1.5-1.5M12 16l1.5-1.5M12 16l-1.5 1.5M12 16l1.5 1.5" />
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
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.163 2.163V8a2 2 0 001.07 1.602l3.252 1.832a2 2 0 000 3.536l-3.252 1.832A2 2 0 0013 16v1.837L10.837 21M3 12h.01M17 12h.01M12 3h.01M12 21h.01" />
      </svg>
    ),
    gradient: 'from-purple-500 to-pink-600'
  },
];

// InvestmentPlanCard Component
const InvestmentPlanCard = ({ plan, currentInvestment, onSelectPlan, index }) => {
  // Compare by plan ID, as the stored currentInvestment won't have the icon
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
      <h2 className="section-title">Investment Plans</h2>
      <p className="section-subtitle">Choose the perfect plan to maximize your daily earnings potential.</p>
    </div>
    <div className="plans-grid">
      {INVESTMENT_PLANS.map((plan, index) => (
        <InvestmentPlanCard
          key={plan.id} // Ensure key is unique for each plan
          plan={plan}
          currentInvestment={currentInvestment}
          onSelectPlan={onSelectPlan}
          index={index}
        />
      ))}
    </div>
  </section>
);

// Modal Component (retained for info messages)
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
  const navigate = useNavigate(); // Initialize useNavigate

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
  const [transactions, setTransactions] = useState([]); // State for user's transactions

  // States for daily earnings calculation and animation
  const [lastDailyEarningTimestamp, setLastDailyEarningTimestamp] = useState(null);
  const [lastCalculatedDailyEarningAmount, setLastCalculatedDailyEarningAmount] = useState(0);
  const [displayDailyEarnings, setDisplayDailyEarnings] = useState(0); // For animated display

  // UI state
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoModalTitle, setInfoModalTitle] = useState('');
  const [infoModalMessage, setInfoModalMessage] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(
    // Set initial state to false to load in light mode by default
    false
  );

  // Combined loading state for the dashboard
  const isLoading = authLoading || !isAuthReady || !db || !userId;

  // Helper to get the full plan object from its ID
  const getPlanById = useCallback((planId) => {
    return INVESTMENT_PLANS.find(p => p.id === planId) || null;
  }, []);

  // Effect to fetch and listen to user data from Firestore
  useEffect(() => {
    let unsubscribeDashboard = () => {};
    let unsubscribeTransactions = () => {};

    // Only proceed if Firebase is ready and we have a userId
    if (db && userId && isAuthReady && appId) {
      const userDashboardDocRef = doc(db, 'artifacts', appId, 'users', userId, 'dashboardData', 'data');

      unsubscribeDashboard = onSnapshot(userDashboardDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setBalance(data.balance || 0);
          setLastCalculatedDailyEarningAmount(data.lastCalculatedDailyEarningAmount || 0);
          setTotalInvested(data.totalInvested || 0);

          // Find the full plan object using the stored plan ID
          // The stored data.currentInvestment might just be { id: 'basic' } or { id: 'gold', name: 'Gold Plan', ... (without icon) }
          if (data.currentInvestment && data.currentInvestment.id) {
            setCurrentInvestment(getPlanById(data.currentInvestment.id));
          } else {
            setCurrentInvestment(null);
          }

          setLastDailyEarningTimestamp(data.lastDailyEarningTimestamp ? data.lastDailyEarningTimestamp.toDate() : null);

          console.log("DashboardPage: Fetched dashboard data:", data);
        } else {
          // Initialize user dashboard data if it doesn't exist
          const initialData = {
            currentInvestment: null, // Store just the ID or null
            balance: 1000.00, // Initial balance for new users
            totalInvested: 0,
            lastDailyEarningTimestamp: null,
            lastCalculatedDailyEarningAmount: 0,
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

      // Listen to user's transactions subcollection
      const transactionsCollectionRef = collection(db, 'artifacts', appId, 'users', userId, 'transactions');
      const q = query(transactionsCollectionRef, orderBy('timestamp', 'desc'));

      unsubscribeTransactions = onSnapshot(q, (snapshot) => {
        const fetchedTransactions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp instanceof Timestamp
                         ? doc.data().timestamp.toDate()
                         : (doc.data().timestamp ? new Date(doc.data().timestamp) : null), // Handle potentially missing timestamp
        }));
        setTransactions(fetchedTransactions);
        console.log("DashboardPage: Fetched user transactions from subcollection:", fetchedTransactions);
      }, (error) => {
        console.error("DashboardPage: Error fetching user transactions from subcollection:", error);
        setShowInfoModal(true);
        setInfoModalTitle('Transaction History Error');
        setInfoModalMessage(`Failed to load transaction history: ${error.message}.`);
      });

      return () => {
        unsubscribeDashboard();
        unsubscribeTransactions();
      };
    }
  }, [db, userId, isAuthReady, appId, getPlanById]); // Add getPlanById to dependencies

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

  // Callback to update Firestore data
  const updateFirestoreData = useCallback(async (newData) => {
    if (!db || !userId || !appId) {
      console.error("Firestore, User ID, or App ID not available for update.");
      setShowInfoModal(true);
      setInfoModalTitle('Error');
      setInfoModalMessage('System not ready for updates. Please try again.');
      return;
    }
    const userDocRef = doc(db, 'artifacts', appId, 'users', userId, 'dashboardData', 'data');
    try {
      console.log("Attempting to send to Firestore:", newData); // For debugging
      await setDoc(userDocRef, newData, { merge: true });
      console.log("Data updated in Firestore.");
    } catch (error) {
      console.error("Error updating Firestore:", error);
      setShowInfoModal(true);
      setInfoModalTitle('Error');
      setInfoModalMessage(`Failed to update data: ${error.message}.`);
    }
  }, [db, userId, appId]);

  // Effect for daily earnings calculation and balance update
  const calculateDailyEarningsEffect = useCallback(async () => {
    if (isLoading || !currentInvestment || totalInvested <= 0) {
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day

    let lastCalcDate = lastDailyEarningTimestamp;
    if (lastCalcDate) {
      lastCalcDate.setHours(0, 0, 0, 0); // Normalize to start of day
    }

    // Check if a new day has started since the last calculation
    // Or if it's the very first time (lastCalcDate is null)
    if (!lastCalcDate || lastCalcDate.getTime() < today.getTime()) {
      const earningsForToday = totalInvested * currentInvestment.dailyROI;
      const newBalance = balance + earningsForToday;

      console.log(`Daily earnings calculation: totalInvested=${totalInvested}, dailyROI=${currentInvestment.dailyROI}, earningsForToday=${earningsForToday}`);
      console.log(`New Balance after daily payout: ${newBalance}`);

      // Update Firestore with the new balance and daily earnings amount
      await updateFirestoreData({
        balance: newBalance,
        lastCalculatedDailyEarningAmount: earningsForToday, // Store the full daily earning for display
        lastDailyEarningTimestamp: Timestamp.now(), // Update to current time
      });
    } else {
      // If it's the same day, ensure displayDailyEarnings reflects the last calculated amount
      // This prevents re-animation if the component re-renders on the same day
      setDisplayDailyEarnings(lastCalculatedDailyEarningAmount);
    }
  }, [isLoading, currentInvestment, totalInvested, lastDailyEarningTimestamp, balance, updateFirestoreData, lastCalculatedDailyEarningAmount]);

  useEffect(() => {
    // Run the daily earnings calculation logic
    calculateDailyEarningsEffect();

    // Set up a daily interval to re-check for new day and trigger earnings
    // This interval runs every hour to catch the start of a new day reliably
    const dailyCheckInterval = setInterval(() => {
      calculateDailyEarningsEffect();
    }, 1000 * 60 * 60); // Every hour

    return () => clearInterval(dailyCheckInterval); // Cleanup interval
  }, [calculateDailyEarningsEffect]);


  // Effect for the "counting up" animation of daily earnings
  useEffect(() => {
    // Only animate if there's a target amount and the display hasn't reached it
    if (lastCalculatedDailyEarningAmount > 0 && displayDailyEarnings < lastCalculatedDailyEarningAmount) {
      let startValue = 0;
      const duration = 1500; // 1.5 seconds for the animation
      let startTime = null;

      const animateCount = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const progress = timestamp - startTime;
        const percentage = Math.min(progress / duration, 1);
        const currentCount = startValue + (percentage * (lastCalculatedDailyEarningAmount - startValue));

        setDisplayDailyEarnings(parseFloat(currentCount.toFixed(2))); // Update state, limit to 2 decimal places

        if (percentage < 1) {
          requestAnimationFrame(animateCount);
        } else {
          // Ensure it ends precisely at the target value
          setDisplayDailyEarnings(lastCalculatedDailyEarningAmount);
        }
      };

      // Reset display to 0 before starting animation if it's a new animation cycle
      if (displayDailyEarnings !== 0) { // Only reset if it's not already 0
        setDisplayDailyEarnings(0);
      }
      requestAnimationFrame(animateCount);
    } else if (lastCalculatedDailyEarningAmount === 0 && displayDailyEarnings !== 0) {
      // If the target is 0, reset display to 0 immediately
      setDisplayDailyEarnings(0);
    } else if (lastCalculatedDailyEarningAmount > 0 && displayDailyEarnings === 0 && !isLoading) {
      // If there's a target but display is 0 and not animating, set it directly (e.g., on page load after earnings already processed)
      setDisplayDailyEarnings(lastCalculatedDailyEarningAmount);
    }
  }, [lastCalculatedDailyEarningAmount, isLoading]); // Trigger animation when the target amount changes


  const handleSelectPlan = useCallback(async (plan) => {
    if (!db || !userId || !appId) {
      setShowInfoModal(true);
      setInfoModalTitle('Error');
      setInfoModalMessage('System not ready. Please try again.');
      return;
    }

    // --- CRITICAL FIX HERE ---
    // Create a new object that EXCLUDES the 'icon' property before sending to Firestore
    const planToStore = { ...plan };
    delete planToStore.icon;

    await updateFirestoreData({ currentInvestment: planToStore });
    // --- END CRITICAL FIX ---

    // Redirect to deposit page after selecting a plan
    navigate('/deposit');
  }, [db, userId, appId, updateFirestoreData, navigate]);


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
                {userId && <p className="user-id-display">User ID: {userId}</p>}
              </div>
              <div className="header-actions">
                {isAdmin && (
                  <button
                    onClick={() => navigate('/admin')}
                    className="action-btn admin-dashboard-btn"
                  >
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
                <div className="stat-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1v6m0 0l4-4m-4 4L8 3m4 8v6m0 0l4-4m-4 4l-4-4M1 12h22"/>
                  </svg>
                </div>
                <div className="stat-content">
                  <h3 className="stat-label">Current Balance</h3>
                  <p className="stat-value">{formatCurrency(balance)}</p>
                  <span className="stat-change positive">+2.5% from yesterday</span>
                </div>
              </div>

              <div className="stat-card invested-card">
                <div className="stat-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="8.5" cy="7" r="4"/>
                    <path d="M20 8v6M23 11l-3 3-3-3"/>
                  </svg>
                </div>
                <div className="stat-content">
                  <h3 className="stat-label">Total Invested</h3>
                  <p className="stat-value">{formatCurrency(totalInvested)}</p>
                  <span className="stat-change neutral">Active investments</span>
                </div>
              </div>

              <div className="stat-card earnings-card">
                <div className="stat-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                </div>
                <div className="stat-content">
                  <h3 className="stat-label">Daily Earnings</h3>
                  {/* Display the animated earnings */}
                  <p className="stat-value">{formatCurrency(displayDailyEarnings)}</p>
                  <span className="stat-change positive">
                    {currentInvestment ? `${(currentInvestment.dailyROI * 100).toFixed(0)}% ROI today` : 'No active plan'}
                  </span>
                </div>
              </div>

              <div className="stat-card plan-card">
                <div className="stat-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 12l2 2 4-4M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                  </svg>
                </div>
                <div className="stat-content">
                  <h3 className="stat-label">Active Plan</h3>
                  <p className="stat-value plan-name">
                    {currentInvestment ? currentInvestment.name : 'None Selected'}
                  </p>
                  <span className="stat-change neutral">
                    {currentInvestment ? `${(currentInvestment.dailyROI * 100).toFixed(0)}% daily ROI` : 'Choose a plan'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Investment Plans */}
          <InvestmentPlansSection currentInvestment={currentInvestment} onSelectPlan={handleSelectPlan} />

          {/* Transaction History */}
          <section className="transactions-section">
            <div className="section-header">
              <h2 className="section-title">Recent Transactions</h2>
              <p className="section-subtitle">Track your financial activity</p>
            </div>

            <div className="transactions-container">
              {transactions.length > 0 ? (
                <div className="transactions-list">
                  {transactions.map((transaction, index) => (
                    <div
                      key={transaction.id}
                      className={`transaction-item ${transaction.type}`}
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <div className="transaction-icon">
                        {transaction.type === 'deposit' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M8 0a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2H9v6a1 1 0 1 1-2 0V9H1a1 1 0 0 1 0-2h6V1a1 1 0 0 1 1-1z"/>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M1 7a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H2a1 1 0 0 1-1-1z"/>
                          </svg>
                        )}
                      </div>
                      <div className="transaction-details">
                        <span className="transaction-type">
                          {transaction.type === 'deposit' ? 'Deposit' : 'Withdrawal'}
                        </span>
                        <span className="transaction-date">
                          {transaction.timestamp ? transaction.timestamp.toLocaleString() : 'N/A'}
                        </span>
                        {transaction.status && (
                          <span className={`transaction-status status-${transaction.status.toLowerCase()}`}>
                            {transaction.status}
                          </span>
                        )}
                      </div>
                      <span className={`transaction-amount ${transaction.type}`}>
                        {transaction.type === 'deposit' ? '+' : '-'}{formatCurrency(transaction.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-transactions">
                  <p>No transactions yet. Start investing today!</p>
                </div>
              )}
            </div>
          </section>
        </>
      </div> {/* End of dashboard-content wrapper */}

      {/* Modals (for info messages) */}
      <Modal
        show={showInfoModal}
        title={infoModalTitle}
        onClose={() => setShowInfoModal(false)}
      >
        <p className="modal-description">{infoModalMessage}</p>
      </Modal>
    </div>
  );
};

export default DashboardPage;