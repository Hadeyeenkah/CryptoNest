import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, onSnapshot, collection, addDoc, Timestamp, runTransaction } from 'firebase/firestore';
import { sendEmailVerification } from 'firebase/auth'; // Import sendEmailVerification
import { useAuth } from '../contexts/AuthContext.jsx'; // Corrected import path with .jsx extension

// Helper function to format numbers as currency
const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// Define investment plans as constants (copied from DashboardPage.jsx for consistency)
const INVESTMENT_PLANS = [
  {
    id: 'basic',
    name: 'Basic Plan',
    dailyROI: 0.10, // 10% daily ROI
    minInvestment: 500,
    maxInvestment: 1000,
    description: 'A solid start for your investment journey.',
    // icon and gradient are not directly used here but kept for completeness if needed later
  },
  {
    id: 'gold',
    name: 'Gold Plan',
    dailyROI: 0.20, // 20% daily ROI
    minInvestment: 1001,
    maxInvestment: 5000,
    description: 'Accelerate your returns with higher potential.',
  },
  {
    id: 'platinum',
    name: 'Platinum Plan',
    dailyROI: 0.30, // 30% daily ROI
    minInvestment: 5001,
    maxInvestment: 100000,
    description: 'Maximize your earnings with our exclusive plan.',
  },
];

// Define configuration for supported cryptocurrencies and networks
const CRYPTO_CONFIG = [
  {
    id: 'BTC',
    name: 'Bitcoin',
    networks: [{ id: 'BTC', name: 'Bitcoin Network', minWithdrawal: 0.0005, estimatedFee: 0.00005 }],
    addressRegex: /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/, // Basic BTC address regex
    placeholder: 'Enter Bitcoin wallet address (e.g., bc1q...)'
  },
  {
    id: 'ETH',
    name: 'Ethereum',
    networks: [
      { id: 'ERC20', name: 'Ethereum (ERC20)', minWithdrawal: 0.01, estimatedFee: 0.005 },
      // Note: Real ETH address is same for all EVM-compatible chains, but fee/network varies
    ],
    addressRegex: /^0x[a-fA-F0-9]{40}$/, // Basic ETH address regex
    placeholder: 'Enter Ethereum wallet address (e.g., 0x...)'
  },
  {
    id: 'USDT',
    name: 'Tether (USDT)',
    networks: [
      { id: 'ERC20', name: 'Ethereum (ERC20)', minWithdrawal: 10, estimatedFee: 2 },
      { id: 'TRC20', name: 'Tron (TRC20)', minWithdrawal: 10, estimatedFee: 1 },
      { id: 'BSC', name: 'Binance Smart Chain (BEP20)', minWithdrawal: 10, estimatedFee: 0.5 },
    ],
    addressRegex: /^(0x[a-fA-F0-9]{40}|T[a-zA-Z0-9]{33})$/, // Basic ETH or TRON address regex
    placeholder: 'Enter USDT wallet address (e.g., 0x... or T...)'
  },
];

function WithdrawalPage() {
  const navigate = useNavigate();
  // Consume Firebase state from AuthContext
  const { db, userId, isAuthReady, loading: authLoading, appId, user, auth } = useAuth(); // Added 'user' and 'auth'

  // Configuration for different investment plans (derived from INVESTMENT_PLANS)
  const planConfigs = INVESTMENT_PLANS.reduce((acc, plan) => {
    acc[plan.id] = {
      min: plan.minInvestment,
      max: plan.maxInvestment,
      label: `${plan.name} ($${plan.minInvestment}${plan.maxInvestment === Infinity ? '+' : ` - $${plan.maxInvestment}`})`
    };
    return acc;
  }, {});


  // Form and UI states
  const [selectedCrypto, setSelectedCrypto] = useState('BTC'); // Default crypto
  const [selectedNetwork, setSelectedNetwork] = useState('BTC'); // Default network for BTC
  const [amount, setAmount] = useState('');
  const [walletAddress, setWalletAddress] = useState(''); // State for wallet address input

  const [loading, setLoading] = useState(true); // Local loading for this page
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [awaitingEmailVerificationForWithdrawal, setAwaitingEmailVerificationForWithdrawal] = useState(false);

  // User's current balance from dashboardData
  const [currentBalance, setCurrentBalance] = useState(0);

  // Helper functions for crypto configuration
  const getCurrentCryptoConfig = () => CRYPTO_CONFIG.find(c => c.id === selectedCrypto);
  const getCurrentNetworkConfig = () => getCurrentCryptoConfig()?.networks.find(n => n.id === selectedNetwork);
  const getMinWithdrawal = () => getCurrentNetworkConfig()?.minWithdrawal || 0;
  const getEstimatedFee = () => getCurrentNetworkConfig()?.estimatedFee || 0;
  const getAvailableBalance = () => currentBalance; // This now directly uses the state


  // Effect to fetch and listen to user's dashboard data (for balance)
  useEffect(() => {
    let unsubscribeDashboard = () => {};

    if (db && userId && appId && isAuthReady) {
      const userDashboardDocRef = doc(db, `artifacts/${appId}/users/${userId}/dashboardData`, 'data');

      unsubscribeDashboard = onSnapshot(userDashboardDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setCurrentBalance(data.balance || 0); // Get the overall balance
        } else {
          console.log("WithdrawalPage: No dashboard data found for user. Initializing with default.");
          // Initialize default dashboard data if it doesn't exist
          setDoc(userDashboardDocRef, { balance: 0.00, dailyEarnings: 0.00, totalInvested: 0.00 })
            .then(() => setCurrentBalance(0))
            .catch(e => console.error("WithdrawalPage: Error initializing dashboard data:", e));
        }
        setLoading(false); // Stop loading once dashboard data is fetched or initialized
      }, (error) => {
        console.error("WithdrawalPage: Error fetching dashboard data for withdrawal page:", error);
        setError("Failed to load dashboard data. Please try again.");
        setLoading(false);
      });
    } else if (!isAuthReady || authLoading) {
      // Keep loading if authentication is not ready or still loading
      setLoading(true);
    }

    return () => unsubscribeDashboard();
  }, [db, userId, appId, isAuthReady, authLoading]);

  // Effect to update network selection when crypto changes
  useEffect(() => {
    const crypto = getCurrentCryptoConfig();
    if (crypto && crypto.networks.length > 0) {
      setSelectedNetwork(crypto.networks[0].id); // Set default network for the selected crypto
    }
  }, [selectedCrypto]); // Only re-run when selectedCrypto changes

  // NEW EFFECT: Monitor email verification status for redirection
  useEffect(() => {
    // Reload user to get the latest emailVerified status
    const checkEmailVerification = async () => {
      if (user) {
        await user.reload(); // Force reload the user object
        if (user.emailVerified) {
          setSuccess('Email confirmed! Your withdrawal request is now fully submitted and pending admin approval. Redirecting to dashboard...');
          setAwaitingEmailVerificationForWithdrawal(false); // Reset this state
          setTimeout(() => {
            navigate('/dashboard');
          }, 2000);
        }
      }
    };

    if (awaitingEmailVerificationForWithdrawal) {
      // Set up an interval to periodically check email verification status
      const interval = setInterval(checkEmailVerification, 3000); // Check every 3 seconds
      return () => clearInterval(interval); // Clean up on unmount or state change
    }
  }, [user, awaitingEmailVerificationForWithdrawal, navigate]);


  // --- Amount validation function ---
  const validateAmount = (amountValue) => {
    const num = parseFloat(amountValue);
    const min = getMinWithdrawal();
    const max = getCurrentNetworkConfig()?.maxWithdrawal || Infinity; // Assuming maxWithdrawal might exist on network config

    // Check if the input is a valid number
    if (isNaN(num) || num <= 0) {
      setError('Please enter a valid positive withdrawal amount.');
      return false;
    }

    // Check if the amount is within the allowed range for the selected plan
    if (num < min) {
      setError(`Minimum withdrawal for ${getCurrentCryptoConfig().name} on ${getCurrentNetworkConfig().name} is ${min} ${selectedCrypto}.`);
      return false;
    }
    if (max !== Infinity && num > max) {
        setError(`Maximum withdrawal for ${getCurrentCryptoConfig().name} on ${getCurrentNetworkConfig().name} is ${max} ${selectedCrypto}.`);
        return false;
    }

    // Check against available balance
    const estimatedFee = getEstimatedFee();
    const totalAmountNeeded = num + estimatedFee;
    if (totalAmountNeeded > currentBalance) {
      setError(`Insufficient balance. You need ${totalAmountNeeded.toFixed(2)} USD (amount + fee), but you have ${currentBalance.toFixed(2)} USD.`);
      return false;
    }

    setError(''); // Clear error if validation passes
    return true;
  };

  // --- Handle form input changes ---
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'amount') {
      setAmount(value);
      validateAmount(value); // Validate on change
    } else if (name === 'walletAddress') {
      setWalletAddress(value);
    }
  };

  // --- Handle copying wallet address to clipboard ---
  const copyWallet = () => {
    // This walletAddress is a fixed demo one. In a real app, it would be dynamic.
    const tempInput = document.createElement('textarea');
    tempInput.value = walletAddress; // Use the state variable for wallet address
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);

    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Handle form submission for withdrawal (pre-confirmation)
  const handleWithdrawalSubmit = (e) => {
    e.preventDefault();
    setSuccess(''); // Clear previous success messages
    setError(''); // Clear previous error messages

    // Pre-submission checks for readiness and valid inputs
    if (!isAuthReady || !userId || !appId) {
      setError("Application services not fully ready. Please wait.");
      return;
    }

    if (!validateAmount(amount)) { // Use the validation function
      return;
    }

    const currentCrypto = getCurrentCryptoConfig();
    const currentNetwork = getCurrentNetworkConfig();

    if (!currentCrypto || !currentNetwork) {
      setError('Invalid cryptocurrency or network selected.');
      return;
    }

    if (!walletAddress.trim()) {
      setError('Wallet address cannot be empty.');
      return;
    }
    if (!currentCrypto.addressRegex.test(walletAddress)) {
      setError('Please enter a valid wallet address format for ' + currentCrypto.name + '.');
      return;
    }

    // All validations passed, show confirmation modal
    setShowConfirmModal(true);
  };

  // Confirm and execute the withdrawal (record as pending transaction and deduct from balance)
  const confirmWithdrawal = async () => {
    setShowConfirmModal(false); // Close the modal immediately
    setLoading(true); // Start loading for withdrawal submission
    setError(''); // Clear previous error messages
    setSuccess(''); // Clear previous success messages

    // Final check for Firebase readiness
    if (!db || !userId || !appId || !auth || !user) {
      setError("Application services not available. Please try again.");
      setLoading(false);
      return;
    }

    const currentCrypto = getCurrentCryptoConfig();
    const currentNetwork = getCurrentNetworkConfig();
    const parsedAmount = parseFloat(amount);
    const estimatedFee = getEstimatedFee();
    const totalDeduction = parsedAmount + estimatedFee;

    const transactionsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/transactions`);
    const userDashboardDocRef = doc(db, `artifacts/${appId}/users/${userId}/dashboardData`, 'data');

    try {
      await runTransaction(db, async (transaction) => {
        const dashboardSnap = await transaction.get(userDashboardDocRef);
        if (!dashboardSnap.exists()) {
          throw "Dashboard data does not exist!"; // Should ideally be initialized earlier
        }
        const currentData = dashboardSnap.data();
        const currentBalanceValue = currentData.balance || 0;

        if (totalDeduction > currentBalanceValue) {
          throw new Error("Insufficient balance for withdrawal.");
        }

        // Calculate new balance
        const newBalance = currentBalanceValue - totalDeduction;

        // Update the user's balance in dashboardData
        transaction.update(userDashboardDocRef, {
          balance: newBalance
        });

        // Create the new transaction object with 'pending' status
        const newTransaction = {
          type: 'withdrawal',
          crypto: selectedCrypto,
          amount: parsedAmount,
          network: selectedNetwork,
          walletAddress: walletAddress,
          fee: estimatedFee,
          timestamp: Timestamp.now(), // Server timestamp
          status: 'pending', // Set status to pending
          userId: userId,
        };

        // Add the new transaction to the transactions subcollection
        // This addDoc is outside the runTransaction scope for balance update.
        // If strict atomicity for both (balance update + transaction creation) is needed,
        // a Cloud Function would be the robust solution.
        await addDoc(transactionsCollectionRef, newTransaction);

        console.log("WithdrawalPage: Balance deducted and withdrawal transaction recorded as pending.");
      });

      // After successful transaction recording, send email verification
      if (user && !user.emailVerified) { // Only send if email is not already verified
        try {
          await sendEmailVerification(user);
          setSuccess(`Withdrawal request submitted! A verification email has been sent to ${user.email}. Please click the link in the email to finalize your request. Once verified, you will be redirected to the dashboard.`);
          setAwaitingEmailVerificationForWithdrawal(true); // Set state to await verification
        } catch (emailError) {
          console.error("WithdrawalPage: Error sending email verification:", emailError);
          setError(`Withdrawal request submitted, but failed to send verification email: ${emailError.message}. Please try again later.`);
          // Still navigate to dashboard if email sending fails but withdrawal is recorded
          setTimeout(() => navigate('/dashboard'), 2000);
        }
      } else {
        // If email is already verified, proceed directly
        setSuccess(`Withdrawal request of ${parsedAmount} ${selectedCrypto} submitted successfully! ${totalDeduction.toFixed(2)} USD has been deducted from your balance. It is now pending admin approval. Redirecting to dashboard...`);
        setTimeout(() => {
          navigate('/dashboard');
        }, 2000);
      }

      // Clear form fields after successful submission
      setAmount('');
      setWalletAddress('');

    } catch (error) {
      console.error('WithdrawalPage: Error processing withdrawal:', error);
      setError(`Withdrawal failed: ${error.message || 'An unexpected error occurred. Please try again.'}`);
    } finally {
      setLoading(false); // Ensure loading stops regardless of success or failure
    }
  };

  // Cancel withdrawal from the confirmation modal
  const cancelWithdrawal = () => {
    setShowConfirmModal(false);
  };

  // Derived values for display
  const currentCrypto = getCurrentCryptoConfig();
  const currentNetwork = getCurrentNetworkConfig();
  const displayAmount = parseFloat(amount) || 0;
  const displayFee = getEstimatedFee();
  const totalDeduction = displayAmount + displayFee;

  // Show loading state if auth is still loading or page data is loading
  if (authLoading || !isAuthReady || loading) { // Changed isLoading to loading
    return (
      <div className="loading-page">
        <p className="loading-text">Loading withdrawal page...</p>
        {/* Spinner and styles are expected to be defined in Dashboard.css or global styles */}
      </div>
    );
  }

  return (
    <>
      <section className="withdrawal-section">
        <div className="withdrawal-container">
          <h1>Withdraw Funds</h1>
          <p>Select your cryptocurrency, network, and enter your details to withdraw your earnings.</p>

          {userId && (
            <div className="user-id-display info-display">
              Your User ID: <strong>{userId}</strong> (Share this for multi-user interactions)
            </div>
          )}

          {error && <div className="error-message">{error}</div>} {/* Changed errorMessage to error */}
          {success && <div className="success-message">{success}</div>} {/* Changed successMessage to success */}

          {awaitingEmailVerificationForWithdrawal ? (
            <div className="email-verification-pending-message">
              <h3>Email Verification Required!</h3>
              <p>A confirmation email has been sent to <strong>{user?.email}</strong>. Please check your inbox (and spam folder) and click the link to finalize your withdrawal request.</p>
              <p>Once your email is verified, you will be automatically redirected to the dashboard.</p>
              <button
                onClick={async () => {
                  if (user) {
                    setLoading(true); // Changed setIsLoading to setLoading
                    try {
                      await sendEmailVerification(user);
                      setSuccess('Verification email re-sent! Please check your inbox.'); // Changed setSuccessMessage to setSuccess
                    } catch (err) {
                      setError(`Failed to resend email: ${err.message}`); // Changed setErrorMessage to setError
                    } finally {
                      setLoading(false); // Changed setIsLoading to setLoading
                    }
                  }
                }}
                className="btn-secondary"
                disabled={loading} // Changed isLoading to loading
              >
                Resend Verification Email
              </button>
            </div>
          ) : (
            <form onSubmit={handleWithdrawalSubmit} className="withdrawal-form">
              {/* Cryptocurrency Selection */}
              <div className="form-group">
                <label htmlFor="cryptoSelect">Cryptocurrency</label>
                <select
                  id="cryptoSelect"
                  value={selectedCrypto}
                  onChange={(e) => setSelectedCrypto(e.target.value)}
                  disabled={loading}
                >
                  {CRYPTO_CONFIG.map(crypto => (
                    <option key={crypto.id} value={crypto.id}>
                      {crypto.name} ({crypto.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Network Selection (conditionally rendered) */}
              {currentCrypto && currentCrypto.networks.length > 1 && (
                <div className="form-group">
                  <label htmlFor="networkSelect">Network</label>
                  <select
                    id="networkSelect"
                    value={selectedNetwork}
                    onChange={(e) => setSelectedNetwork(e.target.value)}
                    disabled={loading}
                  >
                    {currentCrypto.networks.map(network => (
                      <option key={network.id} value={network.id}>
                        {network.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Available Balance Display */}
              <div className="info-display">
                Available Balance: <strong>
                  {formatCurrency(getAvailableBalance())}
                </strong>
              </div>

              {/* Withdrawal Amount Input */}
              <div className="form-group">
                <label htmlFor="amount">Withdrawal Amount ({selectedCrypto})</label>
                <input
                  id="amount"
                  type="number"
                  min={getMinWithdrawal()}
                  step={selectedCrypto === 'BTC' ? '0.00000001' : (selectedCrypto === 'ETH' ? '0.0001' : '0.01')}
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Minimum ${getMinWithdrawal()} ${selectedCrypto}`}
                  disabled={loading}
                />
              </div>

              {/* Wallet Address Input */}
              <div className="form-group">
                <label htmlFor="walletAddress">Wallet Address</label>
                <input
                  id="walletAddress"
                  type="text"
                  required
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder={currentCrypto?.placeholder || 'Enter your wallet address'}
                  disabled={loading}
                />
              </div>

              {/* Estimated Fee Display */}
              {amount && parseFloat(amount) > 0 && (
                <div className="info-display fee-display">
                  Estimated Network Fee: <strong>{displayFee} {selectedCrypto}</strong><br />
                  Total Deduction: <strong>{totalDeduction.toFixed(
                    selectedCrypto === 'BTC' ? 8 : (selectedCrypto === 'ETH' ? 4 : 2)
                  )} {selectedCrypto}</strong>
                </div>
              )}

              {/* Submit Button */}
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Processing...' : 'Submit Withdrawal Request'}
              </button>
            </form>
          )}

          <button onClick={() => navigate('/dashboard')} className="back-link">← Back to Dashboard</button>
        </div>
      </section>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Confirm Withdrawal</h2>
            <p>Please review the details before confirming your withdrawal.</p>
            <div className="modal-details">
              <p><strong>Cryptocurrency:</strong> {currentCrypto?.name} ({selectedCrypto})</p>
              <p><strong>Network:</strong> {currentNetwork?.name}</p>
              <p><strong>Amount:</strong> {parseFloat(amount).toFixed(
                selectedCrypto === 'BTC' ? 8 : (selectedCrypto === 'ETH' ? 4 : 2)
              )} {selectedCrypto}</p>
              <p><strong>Wallet Address:</strong> {walletAddress}</p>
              <p><strong>Estimated Fee:</strong> {displayFee} {selectedCrypto}</p>
              <p><strong>Total Deduction:</strong> {totalDeduction.toFixed(
                selectedCrypto === 'BTC' ? 8 : (selectedCrypto === 'ETH' ? 4 : 2)
              )} {selectedCrypto} (from your balance)</p>
            </div>
            <div className="modal-actions">
              <button onClick={cancelWithdrawal} className="btn-secondary">Cancel</button>
              <button onClick={confirmWithdrawal} className="btn-primary">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded CSS for styling */}
      <style>{`
        /* General Styles */
        body {
          font-family: 'Inter', sans-serif;
          background-color: #f0f2f5;
          color: #333;
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .withdrawal-section {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          padding: 20px;
          background-color: #f8fafc;
        }

        .withdrawal-container {
          background-color: #ffffff;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
          padding: 40px;
          max-width: 500px;
          width: 100%;
          text-align: center;
          border: 1px solid #e2e8f0;
        }

        .withdrawal-container h1 {
          font-size: 2.2em;
          color: #673AB7;
          margin-bottom: 15px;
          font-weight: 700;
        }

        .withdrawal-container p {
          color: #666;
          margin-bottom: 25px;
        }

        .user-id-display {
          background-color: #e0f2f7;
          color: #01579b;
          padding: 10px 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          font-size: 0.9em;
          word-break: break-all;
        }

        .info-display {
          background-color: #e8f5e9;
          color: #2e7d32;
          padding: 10px 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          font-size: 0.9em;
          text-align: left;
        }

        .fee-display {
          background-color: #fffde7;
          color: #f9a825;
          border: 1px solid #fbc02d;
        }

        .error-message, .success-message {
          padding: 12px 20px;
          border-radius: 8px;
          margin-bottom: 20px;
          font-size: 0.9em;
          text-align: left;
        }

        .error-message {
          background-color: #ffebee;
          color: #d32f2f;
          border: 1px solid #d32f2f;
        }

        .success-message {
          background-color: #e8f5e9;
          color: #388e3c;
          border: 1px solid #388e3c;
        }

        .withdrawal-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .form-group label {
          display: block;
          text-align: left;
          margin-bottom: 8px;
          font-weight: 600;
          color: #444;
        }

        .form-group select,
        .form-group input[type="number"],
        .form-group input[type="text"] {
          width: 100%;
          padding: 12px 15px;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 1em;
          color: #333;
          background-color: #fdfdfd;
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
          box-sizing: border-box;
        }

        .form-group select:focus,
        .form-group input[type="number"]:focus,
        .form-group input[type="text"]:focus {
          border-color: #673AB7;
          box-shadow: 0 0 0 3px rgba(103, 58, 183, 0.1);
          outline: none;
        }

        .btn-primary {
          background-color: #673AB7;
          color: white;
          padding: 14px 20px;
          border: none;
          border-radius: 8px;
          font-size: 1.1em;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.3s ease, transform 0.2s ease, box-shadow 0.3s ease;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }

        .btn-primary:hover:not(:disabled) {
          background-color: #5e35b1;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
        }

        .btn-primary:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
          opacity: 0.7;
          box-shadow: none;
        }

        .btn-secondary {
          background-color: #e0e0e0;
          color: #333;
          padding: 12px 20px;
          border: none;
          border-radius: 8px;
          font-size: 1em;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.3s ease, transform 0.2s ease, box-shadow 0.3s ease;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
        }

        .btn-secondary:hover:not(:disabled) {
          background-color: #d5d5d5;
          transform: translateY(-1px);
        }

        .btn-secondary:disabled {
          background-color: #f0f0f0;
          cursor: not-allowed;
          opacity: 0.7;
        }

        .back-link {
          display: inline-block;
          margin-top: 25px;
          color: #673AB7;
          text-decoration: none;
          font-weight: 600;
          transition: color 0.2s ease;
        }

        .back-link:hover {
          color: #5e35b1;
          text-decoration: underline;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.6);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }

        .modal-content {
          background-color: #ffffff;
          padding: 30px;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
          max-width: 450px;
          width: 90%;
          text-align: center;
          animation: modalFadeIn 0.3s ease-out;
        }

        .modal-content h2 {
          font-size: 1.8em;
          color: #673AB7;
          margin-bottom: 20px;
        }

        .modal-details p {
          text-align: left;
          margin-bottom: 10px;
          color: #444;
          font-size: 0.95em;
        }

        .modal-details strong {
          color: #222;
        }

        .modal-actions {
          display: flex;
          justify-content: space-around;
          margin-top: 30px;
          gap: 15px;
        }

        .modal-actions .btn-primary,
        .modal-actions .btn-secondary {
          flex: 1;
          padding: 12px 15px;
          font-size: 1em;
        }

        .modal-actions .btn-secondary {
          background-color: #e0e0e0;
          color: #333;
        }

        .modal-actions .btn-secondary:hover {
          background-color: #d5d5d5;
          transform: translateY(-1px);
        }

        /* Loading Spinner */
        .loading-spinner {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100px;
          font-size: 1.1em;
          color: #673AB7;
        }

        @keyframes modalFadeIn {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* NEW: Email Verification Pending Message Styles */
        .email-verification-pending-message {
          background-color: #e3f2fd; /* Light blue background */
          border: 1px solid #90caf9; /* Blue border */
          color: #1565c0; /* Darker blue text */
          padding: 25px;
          border-radius: 10px;
          margin-bottom: 25px;
          text-align: center;
        }

        .email-verification-pending-message h3 {
          font-size: 1.6em;
          color: #0d47a1; /* Even darker blue */
          margin-bottom: 15px;
        }

        .email-verification-pending-message p {
          font-size: 1em;
          line-height: 1.6;
          color: #1976d2;
          margin-bottom: 20px;
        }

        .email-verification-pending-message .btn-secondary {
          margin-top: 15px;
          width: auto; /* Allow button to size naturally */
          padding: 10px 20px;
        }
      `}</style>
    </>
  );
}

export default WithdrawalPage;
