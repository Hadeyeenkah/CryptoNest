import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, onSnapshot, collection, addDoc, Timestamp, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext.jsx';

// Helper function to format numbers as currency
const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// Define investment plans as constants
const INVESTMENT_PLANS = [
  {
    id: 'basic',
    name: 'Basic Plan',
    dailyROI: 0.10,
    minInvestment: 500,
    maxInvestment: 1000,
    description: 'A solid start for your investment journey.',
  },
  {
    id: 'gold',
    name: 'Gold Plan',
    dailyROI: 0.20,
    minInvestment: 1001,
    maxInvestment: 5000,
    description: 'Accelerate your returns with higher potential.',
  },
  {
    id: 'platinum',
    name: 'Platinum Plan',
    dailyROI: 0.30,
    minInvestment: 5001,
    maxInvestment: 100000,
    description: 'Maximize your earnings with our exclusive plan.',
  },
];

// Main DepositPage React Component
const DepositPage = () => {
  const navigate = useNavigate();
  const { db, userId, isAuthReady, loading: authLoading, appId } = useAuth();

  // Configuration for different investment plans
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
    plan: 'basic',
    amount: ''
  });

  const [minAmount, setMinAmount] = useState(planConfigs[formData.plan].min);
  const [maxAmount, setMaxAmount] = useState(planConfigs[formData.plan].max);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('instructions'); // New state for tabs

  // Fixed wallet address
  const walletAddress = 'bc1qg9a93teaqcyw7v4f60j69djz9sxny8nmf0w2zf';
  const qrCodeImageUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(walletAddress);

  // Effect to manage initial loading state
  useEffect(() => {
    if (authLoading || !isAuthReady) {
      setLoading(true);
      return;
    }

    if (db && userId && appId) {
      const userDashboardDocRef = doc(db, `artifacts/${appId}/users/${userId}/dashboardData`, 'data');

      const checkAndInitializeDashboard = async () => {
        try {
          const docSnap = await getDoc(userDashboardDocRef);
          if (!docSnap.exists()) {
            console.log("DepositPage: No dashboard data found for user. Initializing with default.");
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
      setLoading(true);
    }
  }, [db, userId, appId, isAuthReady, authLoading]);

  // Effect to update min/max amounts when selected plan changes
  useEffect(() => {
    const { min, max } = planConfigs[formData.plan];
    setMinAmount(min);
    setMaxAmount(max);
    if (formData.amount) {
      validateAmount(formData.amount, min, max);
    }
  }, [formData.plan, formData.amount]);

  // Amount validation function
  const validateAmount = (amount, min, max) => {
    const num = parseFloat(amount);
    if (isNaN(num)) {
      setError('Please enter a valid number.');
      return false;
    }

    if (num < min || (max !== Infinity && num > max)) {
      setError(`Please enter an amount between $${min}${max === Infinity ? '+' : ` - $${max}`} for the selected plan.`);
      return false;
    }

    setError('');
    return true;
  };

  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle copying wallet address to clipboard
  const copyWallet = () => {
    navigator.clipboard.writeText(walletAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback for older browsers
      const tempInput = document.createElement('textarea');
      tempInput.value = walletAddress;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Handle deposit form submission
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
        status: 'pending',
        timestamp: Timestamp.now(),
        userId: userId,
      };

      await addDoc(transactionsCollectionRef, newTransaction);

      const selectedPlanDetails = INVESTMENT_PLANS.find(p => p.id === formData.plan);
      if (selectedPlanDetails) {
        await setDoc(userDashboardDocRef, {
          currentInvestment: selectedPlanDetails
        }, { merge: true });
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

  // Loading State UI
  if (loading) {
    return (
      <div className="loading-page">
        <div className="loading-spinner"></div>
        <p className="loading-text">Loading deposit page...</p>
      </div>
    );
  }

  // Main Deposit Page UI
  return (
    <div className="deposit-page-container">
      <style>
        {`
        .deposit-page-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          box-sizing: border-box;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #fefdffff 0%, #f6f5f7ff 100%);
        }

        .deposit-card {
          background-color: #ffffff;
          border-radius: 1rem;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          padding: 3rem;
          max-width: 42rem;
          width: 100%;
          border: 1px solid #e2e8f0;
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
        }

        .deposit-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        }

        .deposit-card h2 {
          font-size: 2.25rem;
          font-weight: 700;
          color: #1a202c;
          margin-bottom: 0.5rem;
          text-align: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .card-description {
          text-align: center;
          color: #64748b;
          margin-bottom: 2.5rem;
          font-size: 1.1rem;
          line-height: 1.6;
        }

        .message {
          padding: 1rem 1.25rem;
          border-radius: 0.75rem;
          margin-bottom: 1.5rem;
          font-size: 0.95rem;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .error-message {
          background-color: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
        }

        .success-message {
          background-color: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #16a34a;
        }

        .deposit-form {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .form-group label {
          display: block;
          font-size: 1rem;
          font-weight: 600;
          color: #374151;
          margin-bottom: 0.5rem;
        }

        .input-field {
          display: block;
          width: 100%;
          padding: 0.875rem 1rem;
          border: 2px solid #e5e7eb;
          border-radius: 0.75rem;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
          outline: none;
          font-size: 1rem;
          transition: all 0.2s ease-in-out;
          box-sizing: border-box;
          background-color: #fafafa;
        }

        .input-field:focus {
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
          background-color: #ffffff;
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
          padding-left: 1rem;
          height: 100%;
          color: #6b7280;
          font-size: 1rem;
          font-weight: 600;
          pointer-events: none;
          z-index: 1;
        }

        .input-icon-left .input-field {
          padding-left: 2.25rem;
        }

        .form-description {
          margin-top: 0.5rem;
          font-size: 0.9rem;
          color: #6b7280;
          font-style: italic;
        }

        .tabs-container {
          margin-top: 2rem;
          border: 1px solid #e5e7eb;
          border-radius: 1rem;
          overflow: hidden;
          background-color: #fafafa;
        }

        .tabs-header {
          display: flex;
          background-color: #f8fafc;
          border-bottom: 1px solid #e5e7eb;
        }

        .tab-button {
          flex: 1;
          padding: 1rem 1.5rem;
          background: none;
          border: none;
          cursor: pointer;
          font-weight: 600;
          font-size: 1rem;
          transition: all 0.2s ease-in-out;
          color: #6b7280;
          position: relative;
        }

        .tab-button.active {
          color: #667eea;
          background-color: #ffffff;
        }

        .tab-button.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        }

        .tab-button:hover:not(.active) {
          background-color: #f1f5f9;
          color: #374151;
        }

        .tab-content {
          padding: 2rem;
          background-color: #ffffff;
        }

        .cashapp-instructions {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .instruction-step {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1.25rem;
          background-color: #f8fafc;
          border-radius: 0.75rem;
          border-left: 4px solid #667eea;
        }

        .step-number {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          width: 2rem;
          height: 2rem;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.875rem;
          flex-shrink: 0;
          margin-top: 0.125rem;
        }

        .step-content h4 {
          margin: 0 0 0.5rem 0;
          font-size: 1.1rem;
          font-weight: 600;
          color: #1f2937;
        }

        .step-content p {
          margin: 0;
          color: #4b5563;
          line-height: 1.6;
        }

        .highlight-box {
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          border: 1px solid #f59e0b;
          border-radius: 0.75rem;
          padding: 1.25rem;
          margin: 1.5rem 0;
        }

        .highlight-box h4 {
          margin: 0 0 0.75rem 0;
          color: #92400e;
          font-weight: 700;
          font-size: 1.1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .highlight-box p {
          margin: 0;
          color: #92400e;
        }

        .wallet-section {
          background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
          padding: 2rem;
          border-radius: 1rem;
          border: 1px solid #bae6fd;
        }

        .wallet-section h3 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #0369a1;
          margin-bottom: 1.5rem;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .wallet-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
        }

        .qr-container {
          background-color: #ffffff;
          padding: 1rem;
          border-radius: 1rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          border: 2px solid #e0f2fe;
        }

        .qr-code-image {
          width: 220px;
          height: 220px;
          border-radius: 0.5rem;
          display: block;
        }

        .wallet-details {
          text-align: center;
          width: 100%;
        }

        .wallet-address-display {
          background-color: #ffffff;
          border: 2px solid #e0f2fe;
          border-radius: 0.75rem;
          padding: 1rem 1.25rem;
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
          font-size: 0.95rem;
          color: #1e293b;
          display: flex;
          align-items: center;
          justify-content: space-between;
          word-break: break-all;
          margin-bottom: 1rem;
        }

        .copy-button {
          margin-left: 1rem;
          display: inline-flex;
          align-items: center;
          padding: 0.5rem 1rem;
          border: none;
          font-size: 0.875rem;
          font-weight: 600;
          border-radius: 0.5rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          color: #ffffff;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          cursor: pointer;
          transition: all 0.2s ease-in-out;
          flex-shrink: 0;
        }

        .copy-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
        }

        .copy-button:active {
          transform: translateY(0);
        }

        .wallet-instructions {
          font-size: 1rem;
          color: #475569;
          line-height: 1.6;
          margin-bottom: 1rem;
        }

        .wallet-instructions strong {
          font-weight: 700;
          color: #0369a1;
        }

        .approval-note {
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          border: 1px solid #f59e0b;
          color: #92400e;
          border-radius: 0.75rem;
          padding: 1.25rem;
          font-size: 0.95rem;
          margin-top: 1.5rem;
        }

        .approval-note strong {
          font-weight: 700;
        }

        .button-primary {
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 1rem 1.5rem;
          border: none;
          border-radius: 0.75rem;
          box-shadow: 0 4px 14px 0 rgba(102, 126, 234, 0.39);
          font-size: 1.1rem;
          font-weight: 600;
          color: #ffffff;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          cursor: pointer;
          transition: all 0.2s ease-in-out;
          margin-top: 1rem;
        }

        .button-primary:hover:not(.button-disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px 0 rgba(102, 126, 234, 0.4);
        }

        .button-primary:active:not(.button-disabled) {
          transform: translateY(0);
        }

        .button-primary.button-disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .button-secondary {
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 0.875rem 1.25rem;
          border: 2px solid #e5e7eb;
          border-radius: 0.75rem;
          font-size: 1rem;
          font-weight: 600;
          color: #6b7280;
          background-color: #ffffff;
          cursor: pointer;
          transition: all 0.2s ease-in-out;
          margin-top: 1rem;
        }

        .button-secondary:hover {
          border-color: #667eea;
          color: #667eea;
          background-color: #f8fafc;
        }

        .loading-page {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          gap: 1rem;
        }

        .loading-spinner {
          width: 3rem;
          height: 3rem;
          border: 4px solid #ffffff20;
          border-top: 4px solid #ffffff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .loading-text {
          color: #ffffff;
          font-size: 1.1rem;
          font-weight: 500;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .cashapp-logo {
          color: #00d632;
          font-weight: 700;
        }

        .bitcoin-icon {
          color: #f7931a;
        }

        @media (max-width: 768px) {
          .deposit-card {
            margin: 1rem;
            padding: 2rem;
          }
          
          .tabs-header {
            flex-direction: column;
          }
          
          .wallet-address-display {
            flex-direction: column;
            gap: 1rem;
          }
          
          .copy-button {
            margin-left: 0;
            width: 100%;
          }
        }
        `}
      </style>

      <div className="deposit-card">
        <h2>💰 Fund Your Investment</h2>
        <p className="card-description">
          Choose your investment plan and follow our simple funding process using CashApp for secure Bitcoin transactions.
        </p>

        {error && (
          <div className="message error-message" role="alert">
            ⚠️ {error}
          </div>
        )}
        {success && (
          <div className="message success-message" role="alert">
            ✅ {success}
          </div>
        )}

        <form className="deposit-form" onSubmit={handleDeposit}>
          <div className="form-group">
            <label htmlFor="plan">📊 Investment Plan:</label>
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
              Select the investment plan that aligns with your financial goals and risk tolerance.
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="amount">💵 Investment Amount (USD):</label>
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
                placeholder="Enter amount"
              />
            </div>
            <p id="amount-description" className="form-description">
              {planConfigs[formData.plan]?.label}
            </p>
          </div>

          <div className="tabs-container">
            <div className="tabs-header">
              <button
                type="button"
                className={`tab-button ${activeTab === 'instructions' ? 'active' : ''}`}
                onClick={() => setActiveTab('instructions')}
              >
                📱 CashApp Instructions
              </button>
              <button
                type="button"
                className={`tab-button ${activeTab === 'wallet' ? 'active' : ''}`}
                onClick={() => setActiveTab('wallet')}
              >
                🔗 Wallet Details
              </button>
            </div>

            <div className="tab-content">
              {activeTab === 'instructions' && (
                <div className="cashapp-instructions">
                  <div className="highlight-box">
                    <h4>🚀 Why Use <span className="cashapp-logo">CashApp</span>?</h4>
                    <p>CashApp is the fastest and most secure way to buy Bitcoin instantly. No complicated exchanges or lengthy verification processes!</p>
                  </div>

                  <div className="instruction-step">
                    <div className="step-number">1</div>
                    <div className="step-content">
                      <h4>Download CashApp</h4>
                      <p>Download the official CashApp from your device's app store. It's free and takes less than 2 minutes to set up your account.</p>
                    </div>
                  </div>

                  <div className="instruction-step">
                    <div className="step-number">2</div>
                    <div className="step-content">
                      <h4>Verify Your Account</h4>
                      <p>Complete the quick verification process by linking your bank account or debit card. This ensures secure transactions and instant Bitcoin purchases.</p>
                    </div>
                  </div>

                  <div className="instruction-step">
                    <div className="step-number">3</div>
                    <div className="step-content">
                      <h4>Buy Bitcoin <span className="bitcoin-icon">₿</span></h4>
                      <p>Tap the Bitcoin tab in CashApp, then "Buy Bitcoin". Enter the exact amount from your investment above (${formData.amount || 'XXX'}) and confirm your purchase.</p>
                    </div>
                  </div>

                  <div className="instruction-step">
                    <div className="step-number">4</div>
                    <div className="step-content">
                      <h4>Send to Our Wallet</h4>
                      <p>In CashApp, tap "Withdraw Bitcoin", then "Send Bitcoin". Copy our wallet address from the "Wallet Details" tab and paste it as the destination.</p>
                    </div>
                  </div>

                  <div className="instruction-step">
                    <div className="step-number">5</div>
                    <div className="step-content">
                      <h4>Confirm Your Deposit</h4>
                      <p>After sending the Bitcoin, return here and click "Confirm Deposit" below. Your transaction will be verified and credited to your account within 1-2 business days.</p>
                    </div>
                  </div>

                  <div className="highlight-box">
                    <h4>⚡ Pro Tips for Success</h4>
                    <p>• Double-check the wallet address before sending<br/>
                    • Keep your CashApp transaction receipt<br/>
                    • Bitcoin transactions are irreversible, so accuracy is crucial<br/>
                    • Contact support if you need any assistance</p>
                  </div>
                </div>
              )}

              {activeTab === 'wallet' && (
                <div className="wallet-section">
                  <h3>🏦 Bitcoin Wallet Address</h3>
                  <div className="wallet-content">
                    <div className="qr-container">
                      <img
                        src={qrCodeImageUrl}
                        alt="Bitcoin Wallet QR Code"
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
                          {copied ? '✅ Copied!' : '📋 Copy'}
                        </button>
                      </div>
                      <p className="wallet-instructions">
                        <strong>Critical:</strong> This is your unique Bitcoin wallet address. Copy this exact address and paste it into CashApp when sending your Bitcoin. Any errors in the address will result in permanent loss of funds.
                      </p>
                      <div className="approval-note">
                        <p>
                          <strong>⏱️ Processing Time:</strong> All deposits require verification and approval by our financial team. This process typically takes 1-2 business days to ensure security and compliance.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="deposit-btn-container">
            <button
              type="submit"
              disabled={loading || !!error || !formData.amount}
              className={`button-primary ${loading || !!error || !formData.amount ? 'button-disabled' : ''}`}
            >
              {loading ? '🔄 Processing...' : '✅ Confirm Deposit'}
            </button>
          </div>

          <button
            type="button"
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