import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, onSnapshot, collection, addDoc, Timestamp, getDoc } from 'firebase/firestore';
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

// Main DepositPage React Component
const DepositPage = () => {
  const navigate = useNavigate();
  // Consume Firebase state from AuthContext
  const { db, userId, isAuthReady, loading: authLoading, appId } = useAuth();

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
  const [formData, setFormData] = useState({
    plan: 'basic', // Default to basic plan
    amount: ''
  });

  // Initialize minAmount and maxAmount based on the default plan
  const [minAmount, setMinAmount] = useState(planConfigs[formData.plan].min);
  const [maxAmount, setMaxAmount] = useState(planConfigs[formData.plan].max);

  const [loading, setLoading] = useState(true); // Local loading for this page
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');


  // Fixed wallet address for demonstration purposes
  const walletAddress = 'bc1qg9a93teaqcyw7v4f60j69djz9sxny8nmf0w2zf';

  // Direct link to a sample QR code image (replace with your actual QR code image URL)
  // This example QR code links to https://example.com
  const qrCodeImageUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=190x190&data=https://example.com';


  // Effect to manage initial loading state and ensure dashboard data exists
  useEffect(() => {
    if (authLoading || !isAuthReady) {
      setLoading(true);
      return;
    }

    if (db && userId && appId) {
      const userDashboardDocRef = doc(db, `artifacts/${appId}/users/${userId}/dashboardData`, 'data');

      // Check if dashboard data exists, if not, initialize it
      const checkAndInitializeDashboard = async () => {
        try {
          const docSnap = await getDoc(userDashboardDocRef);
          if (!docSnap.exists()) {
            console.log("DepositPage: No dashboard data found for user. Initializing with default.");
            // Initialize with default values, transactions array is NOT part of this document anymore
            await setDoc(userDashboardDocRef, { balance: 0.00, dailyEarnings: 0.00, totalInvested: 0.00 });
          }
        } catch (e) {
          console.error("DepositPage: Error checking/initializing dashboard data:", e);
          setError("Failed to load user data. Please refresh.");
        } finally {
          setLoading(false);
        }
      };
      checkAndInitializeDashboard();
    } else {
      // If db, userId, or appId are not yet available, keep loading
      setLoading(true);
    }
  }, [db, userId, appId, isAuthReady, authLoading]);


  // --- Effect to update min/max amounts when selected plan changes ---
  useEffect(() => {
    // Get min/max from the selected plan configuration
    const { min, max } = planConfigs[formData.plan];
    setMinAmount(min);
    setMaxAmount(max);
    // Re-validate the amount if it's already entered to show immediate feedback
    if (formData.amount) {
      validateAmount(formData.amount, min, max);
    }
  }, [formData.plan, formData.amount]); // Re-run when plan or amount changes

  // --- Amount validation function ---
  const validateAmount = (amount, min, max) => {
    const num = parseFloat(amount);
    // Check if the input is a valid number
    if (isNaN(num)) {
      setError('Please enter a valid number.');
      return false;
    }

    // Check if the amount is within the allowed range for the selected plan
    if (num < min || (max !== Infinity && num > max)) {
      setError(`Please enter an amount between $${min}${max === Infinity ? '+' : ` - $${max}`} for the selected plan.`);
      return false;
    }

    setError(''); // Clear error if validation passes
    return true;
  };

  // --- Handle form input changes ---
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // --- Handle copying wallet address to clipboard ---
  const copyWallet = () => {
    const tempInput = document.createElement('textarea');
    tempInput.value = walletAddress;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);

    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // --- Handle deposit form submission ---
  const handleDeposit = async (e) => {
    e.preventDefault();

    setError('');
    setSuccess('');

    if (!validateAmount(formData.amount, minAmount, maxAmount)) {
      return;
    }

    if (!isAuthReady || !userId || !db || !appId) {
      setError("Application services not fully ready. Please wait.");
      return;
    }

    setLoading(true);

    const depositAmount = parseFloat(formData.amount);
    const transactionsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/transactions`);
    const userDashboardDocRef = doc(db, `artifacts/${appId}/users/${userId}/dashboardData`, 'data');

    try {
      const newTransaction = {
        type: 'deposit',
        amount: depositAmount,
        plan: formData.plan,
        walletAddress: walletAddress,
        currency: 'USD',
        status: 'pending', // Deposits require admin approval
        timestamp: Timestamp.now(),
        userId: userId,
      };

      console.log("DepositPage: Attempting to add new deposit transaction:", newTransaction);
      console.log("DepositPage: To collection path:", `artifacts/${appId}/users/${userId}/transactions`);

      // Use addDoc to automatically generate a new document ID for the transaction
      await addDoc(transactionsCollectionRef, newTransaction);

      // MODIFIED: Update the currentInvestment in the dashboardData document
      // This ensures the "Active Plan" card on the dashboard reflects the latest deposit's plan.
      const selectedPlanDetails = INVESTMENT_PLANS.find(p => p.id === formData.plan);
      if (selectedPlanDetails) {
        await setDoc(userDashboardDocRef, {
          currentInvestment: selectedPlanDetails // Set the entire plan object
        }, { merge: true }); // Use merge: true to only update this field
        console.log("DepositPage: Updated currentInvestment in dashboardData:", selectedPlanDetails);
      } else {
        console.warn("DepositPage: Could not find selected plan details for currentInvestment update.");
      }

      setSuccess('Deposit recorded successfully! It is now pending admin approval.');
      setFormData(prev => ({ ...prev, amount: '' }));

      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);

    } catch (firebaseError) {
      console.error('DepositPage: Error recording deposit to Firestore:', firebaseError);
      setError(`Failed to record deposit: ${firebaseError.message || 'An unexpected error occurred.'}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Loading State UI ---
  if (loading) {
    return (
      <div className="loading-page">
        <p className="loading-text">Loading deposit page...</p>
        {/* Spinner and styles are expected to be defined in Dashboard.css or global styles */}
      </div>
    );
  }

  // --- Main Deposit Page UI ---
  return (
    <div className="deposit-page-container">
      {/* Embedded CSS for styling */}
      <style>
        {`
        /* Styles for the entire page container */
        .deposit-page-container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
            box-sizing: border-box;
            font-family: 'Inter', sans-serif; /* Ensure font for the container */
            background-color: #f8fafc; /* Light gray background */
        }

        /* Styles for the main deposit card */
        .deposit-card {
            background-color: #ffffff;
            border-radius: 0.75rem;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            padding: 2.5rem; /* Increased padding */
            max-width: 36rem; /* Increased max-width for a larger feel */
            width: 100%;
            border: 1px solid #e2e8f0;
            box-sizing: border-box;
        }

        .deposit-card h2 {
            font-size: 2rem; /* Slightly larger heading */
            font-weight: 700;
            color: #1a202c;
            margin-bottom: 1.5rem;
            text-align: center;
        }

        .deposit-card .card-description {
            text-align: center;
            color: #4a5568;
            margin-bottom: 2rem;
        }

        /* Styles for messages (error/success) */
        .message {
            padding: 0.75rem 1rem;
            border-width: 1px;
            border-radius: 0.375rem;
            margin-bottom: 1rem;
            font-size: 0.875rem;
        }

        .error-message {
            background-color: #fee2e2;
            border-color: #ef4444;
            color: #b91c1c;
        }

        .success-message {
            background-color: #d1fae5;
            border-color: #34d399;
            color: #065f46;
        }

        /* Styles for form elements */
        .deposit-form {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        .form-group label {
            display: block;
            font-size: 0.9rem; /* Slightly larger label font */
            font-weight: 500;
            color: #4a5568;
            margin-bottom: 0.35rem; /* Adjusted margin */
        }

        .input-field {
            display: block;
            width: 100%;
            padding: 0.6rem 0.75rem; /* Slightly increased padding */
            border: 1px solid #d2d6dc;
            border-radius: 0.375rem;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
            outline: none;
            font-size: 0.9rem; /* Slightly larger input font */
            transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
            box-sizing: border-box;
        }

        .input-field:focus {
            border-color: #8b5cf6;
            box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.5);
        }

        .input-icon-left {
            position: relative;
        }

        .input-icon-left .icon {
            position: absolute;
            top: 0;
            left: 0;
            display: flex;
            align-items: center;
            padding-left: 0.75rem;
            height: 100%;
            color: #718096;
            font-size: 0.9rem; /* Match input font size */
            pointer-events: none;
        }

        .input-icon-left .input-field {
            padding-left: 1.9rem; /* Adjust padding for icon */
        }

        .form-description {
            margin-top: 0.5rem;
            font-size: 0.875rem;
            color: #718096;
        }

        /* Styles for wallet section */
        .wallet-section {
            background-color: #f8fafc;
            padding: 1.8rem; /* Increased padding */
            border-radius: 0.5rem;
            border: 1px solid #e2e8f0;
            margin-top: 1.8rem; /* Space above this section */
        }

        .wallet-section h3 {
            font-size: 1.35rem; /* Slightly larger heading */
            font-weight: 600;
            color: #2d3748;
            margin-bottom: 1.2rem; /* Adjusted margin */
            text-align: center;
        }

        .wallet-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1.2rem; /* Increased space between children */
        }

        .qr-container {
            background-color: #ffffff;
            padding: 0.75rem; /* Increased padding around QR */
            border-radius: 0.5rem;
            box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06);
        }

        .qr-code-image {
            width: 190px; /* Slightly larger QR code */
            height: 190px;
            border-radius: 0.5rem;
        }

        .wallet-details {
            text-align: center;
            width: 100%;
        }

        .wallet-address-display {
            background-color: #f7fafc;
            border-radius: 0.375rem;
            padding: 0.6rem 1.1rem; /* Adjusted padding */
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
            font-size: 0.9rem; /* Slightly larger font */
            color: #2d3748;
            display: flex;
            align-items: center;
            justify-content: space-between;
            word-break: break-all;
        }

        .copy-button {
            margin-left: 0.8rem; /* Adjusted margin */
            display: inline-flex;
            align-items: center;
            padding: 0.4rem 0.8rem; /* Adjusted padding */
            border: 1px solid transparent;
            font-size: 0.8rem; /* Slightly larger font */
            font-weight: 500;
            border-radius: 9999px;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
            color: #6b46c1;
            background-color: #ede9fe;
            cursor: pointer;
            transition: background-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
        }

        .copy-button:hover {
            background-color: #ddd6fe;
        }

        .copy-button:focus {
            outline: none;
            box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #8b5cf6;
        }

        .wallet-instructions {
            margin-top: 0.8rem; /* Adjusted margin */
            font-size: 0.9rem; /* Slightly larger font */
            color: #4a5568;
        }

        .wallet-instructions strong {
            font-weight: 700;
        }

        .approval-note {
            margin-top: 1.2rem; /* Adjusted margin */
            padding: 0.8rem; /* Adjusted padding */
            background-color: #fffbeb;
            border: 1px solid #fde68a;
            color: #92400e;
            border-radius: 0.5rem;
            font-size: 0.9rem; /* Slightly larger font */
        }

        .approval-note strong {
            font-weight: 700;
        }

        /* Styles for buttons */
        .button-primary {
            width: 100%;
            display: flex;
            justify-content: center;
            padding: 0.85rem 1.2rem; /* Increased padding */
            border: 1px solid transparent;
            border-radius: 0.375rem;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
            font-size: 1.2rem; /* Slightly larger font */
            font-weight: 500;
            color: #ffffff;
            background-color: #7c3aed;
            cursor: pointer;
            transition: background-color 0.15s ease-in-out, opacity 0.15s ease-in-out;
        }

        .button-primary:hover {
            background-color: #6d28d9;
        }

        .button-primary:focus {
            outline: none;
            box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #8b5cf6;
        }

        .button-primary.button-disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .button-secondary {
            width: 100%;
            display: flex;
            justify-content: center;
            padding: 0.6rem 1rem; /* Slightly increased padding */
            border: 1px solid transparent;
            border-radius: 0.375rem;
            font-size: 0.9rem; /* Slightly larger font */
            font-weight: 500;
            color: #7c3aed;
            background-color: #f5f3ff;
            cursor: pointer;
            transition: background-color 0.15s ease-in-out;
            margin-top: 1.2rem; /* Increased space from the primary button */
        }

        .button-secondary:hover {
            background-color: #ede9fe;
        }

        .button-secondary:focus {
            outline: none;
            box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #8b5cf6;
        }

        /* Styles for loading state */
        .loading-page {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background-color: #f8fafc;
        }

        .loading-text {
            color: #4a5568;
        }
        `}
      </style>

      <div className="deposit-card">
        <h2>Deposit Funds</h2>
        <p className="card-description">
          Select your investment plan and enter the amount. Your deposit will be pending until approved.
        </p>

        {error && <div className="message error-message" role="alert">{error}</div>}
        {success && <div className="message success-message" role="alert">{success}</div>}

        <form className="deposit-form" onSubmit={handleDeposit}>
          <div className="form-group">
            <label htmlFor="plan">Investment Plan:</label>
            <select
              id="plan"
              name="plan"
              value={formData.plan}
              onChange={handleChange}
              required
              className="input-field"
              aria-describedby="plan-description"
              disabled={loading}
            >
              {Object.entries(planConfigs).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
            <p id="plan-description" className="form-description">
              Select the investment plan that meets your financial goals.
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="amount">Amount (USD):</label>
            <div className="input-icon-left">
              <span className="icon">$</span>
              <input
                type="number"
                id="amount"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                required
                min={minAmount}
                max={maxAmount !== Infinity ? maxAmount : undefined}
                step="0.01"
                className="input-field"
                aria-describedby="amount-description"
                disabled={loading}
              />
            </div>
            <p id="amount-description" className="form-description">
              {planConfigs[formData.plan]?.label}
            </p>
          </div>

          <div className="wallet-section">
            <h3>Transfer to Wallet Address</h3>
            <div className="wallet-content">
              <div className="qr-container">
                {/* Replace the src below with the direct URL to your QR code image */}
                <img
                  src={qrCodeImageUrl}
                  alt="QR Code for Wallet Address"
                  className="qr-code-image"
                />
              </div>
              <div className="wallet-details">
                <div className="wallet-address-display">
                  <code>{walletAddress}</code>
                  <button
                    type="button"
                    className="copy-button"
                    onClick={copyWallet}
                    aria-label="Copy wallet address"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="wallet-instructions">
                  <strong>Important:</strong> Send the exact amount shown above to this wallet address.
                  Double-check the address before sending funds.
                </p>
                <div className="approval-note">
                  <p>
                    <strong>Note:</strong> All deposits require admin approval before being added to your balance.
                    This usually takes 1-2 business days.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="deposit-btn-container">
            <button
              type="submit"
              disabled={loading || !!error || !formData.amount}
              className={`button-primary ${loading ? 'button-disabled' : ''}`}
            >
              {loading ? 'Processing...' : 'Confirm Deposit'}
            </button>
          </div>

          <button
            onClick={() => navigate('/dashboard')}
            className="button-secondary"
          >
            ← Back to Dashboard
          </button>
        </form>
      </div>
    </div>
  );
};

export default DepositPage;
