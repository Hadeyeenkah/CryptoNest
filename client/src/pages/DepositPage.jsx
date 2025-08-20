import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, onSnapshot, collection, addDoc, Timestamp, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext.jsx';

// Define investment plans as constants
const INVESTMENT_PLANS = [
  {
    id: 'basic',
    name: 'Basic Plan',
    dailyROI: 0.10,
    minInvestment: 500,
    maxInvestment: 1000,
    description: 'Start with $500-$1,000 and earn 10% daily returns',
  },
  {
    id: 'gold',
    name: 'Gold Plan',
    dailyROI: 0.20,
    minInvestment: 1001,
    maxInvestment: 5000,
    description: 'Invest $1,001-$5,000 and earn 20% daily returns',
  },
  {
    id: 'platinum',
    name: 'Platinum Plan',
    dailyROI: 0.30,
    minInvestment: 5001,
    maxInvestment: 100000,
    description: 'Invest $5,001+ and earn 30% daily returns',
  },
];

const DepositPage = () => {
  const navigate = useNavigate();
  const { db, userId, isAuthReady, loading: authLoading, appId } = useAuth();

  // Form states
  const [formData, setFormData] = useState({
    plan: 'basic',
    amount: ''
  });

  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fixed wallet address - prominently displayed
  const walletAddress = 'bc1qg9a93teaqcyw7v4f60j69djz9sxny8nmf0w2zf';

  // Get current plan details
  const currentPlan = INVESTMENT_PLANS.find(plan => plan.id === formData.plan);

  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(''); // Clear errors when user types
  };

  // Handle copying wallet address
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

  // Validate amount
  const validateAmount = (amount) => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      return 'Please enter a valid amount';
    }
    if (num < currentPlan.minInvestment) {
      return `Minimum investment for ${currentPlan.name} is $${currentPlan.minInvestment}`;
    }
    if (num > currentPlan.maxInvestment) {
      return `Maximum investment for ${currentPlan.name} is $${currentPlan.maxInvestment}`;
    }
    return '';
  };

  // Handle deposit submission
  const handleDeposit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate amount
    const validationError = validateAmount(formData.amount);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!isAuthReady || !userId || !db || !appId) {
      setError("Please wait for the system to load completely");
      return;
    }

    setLoading(true);

    try {
      const depositAmount = parseFloat(formData.amount);
      const transactionsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/transactions`);
      const userDashboardDocRef = doc(db, `artifacts/${appId}/users/${userId}/dashboardData`, 'data');

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

      // Update current investment plan
      await setDoc(userDashboardDocRef, {
        currentInvestment: currentPlan
      }, { merge: true });

      setSuccess('Deposit submitted successfully! Awaiting Bitcoin confirmation.');
      setFormData(prev => ({ ...prev, amount: '' }));

      setTimeout(() => {
        navigate('/dashboard');
      }, 3000);

    } catch (firebaseError) {
      console.error('Error recording deposit:', firebaseError);
      setError('Failed to submit deposit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="deposit-container">
      <style>
        {`
        .deposit-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }

        .deposit-card {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border-radius: 24px;
          padding: 40px;
          max-width: 550px;
          width: 100%;
          box-shadow: 0 25px 50px rgba(0,0,0,0.15);
          border: 1px solid rgba(255,255,255,0.2);
        }

        .header {
          text-align: center;
          margin-bottom: 30px;
        }

        .header h1 {
          font-size: 28px;
          color: #333;
          margin: 0 0 10px 0;
          font-weight: 700;
        }

        .header p {
          color: #666;
          margin: 0;
          font-size: 16px;
        }

        .wallet-section {
          background: linear-gradient(135deg, #f8fafe 0%, #eef2ff 100%);
          border: 2px solid #818cf8;
          border-radius: 16px;
          padding: 30px;
          margin-bottom: 30px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }

        .wallet-section::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #667eea, #764ba2, #f093fb);
        }

        .wallet-title {
          font-size: 18px;
          font-weight: 600;
          color: #333;
          margin: 0 0 15px 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .wallet-address {
          background: white;
          border: 2px solid #e1e8ff;
          border-radius: 12px;
          padding: 15px;
          margin: 15px 0;
          font-family: monospace;
          font-size: 14px;
          color: #333;
          word-break: break-all;
          position: relative;
        }

        .copy-btn {
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 10px;
        }

        .copy-btn:hover {
          background: #5a6fd8;
          transform: translateY(-1px);
        }

        .copy-btn.copied {
          background: #10b981;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          font-weight: 600;
          color: #333;
          margin-bottom: 8px;
          font-size: 14px;
        }

        .form-control {
          width: 100%;
          padding: 12px 15px;
          border: 2px solid #e1e5e9;
          border-radius: 10px;
          font-size: 16px;
          transition: border-color 0.2s;
          box-sizing: border-box;
          background-color: #ffffff;
          color: #333333;
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
        }

        .form-control:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
          background-color: #ffffff;
        }

        .form-control option {
          background-color: #ffffff;
          color: #333333;
          padding: 10px;
        }

        .select-wrapper {
          position: relative;
        }

        .select-wrapper::after {
          content: '▼';
          position: absolute;
          right: 15px;
          top: 50%;
          transform: translateY(-50%);
          color: #667eea;
          pointer-events: none;
          font-size: 12px;
        }

        .plan-info {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 15px;
          margin-top: 10px;
          border-left: 4px solid #667eea;
        }

        .plan-info h4 {
          margin: 0 0 5px 0;
          color: #333;
          font-size: 16px;
        }

        .plan-info p {
          margin: 0;
          color: #666;
          font-size: 14px;
        }

        .amount-input {
          position: relative;
        }

        .amount-input::before {
          content: '$';
          position: absolute;
          left: 15px;
          top: 50%;
          transform: translateY(-50%);
          color: #666;
          font-weight: 600;
          z-index: 1;
        }

        .amount-input input {
          padding-left: 35px;
        }

        .message {
          padding: 12px 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          font-weight: 500;
        }

        .error {
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
        }

        .success {
          background: #f0fdf4;
          color: #16a34a;
          border: 1px solid #bbf7d0;
        }

        .submit-btn {
          width: 100%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 12px;
          padding: 15px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 15px;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .back-btn {
          width: 100%;
          background: transparent;
          color: #667eea;
          border: 2px solid #667eea;
          border-radius: 12px;
          padding: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .back-btn:hover {
          background: #667eea;
          color: white;
        }

        .instructions {
          background: linear-gradient(135deg, #fefce8 0%, #fef3c7 100%);
          border: 2px solid #f59e0b;
          border-radius: 12px;
          padding: 25px;
          margin: 25px 0;
        }

        .instructions h3 {
          color: #92400e;
          margin: 0 0 15px 0;
          font-size: 18px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .instructions p {
          color: #92400e;
          margin: 15px 0 0 0;
          font-size: 14px;
          line-height: 1.6;
          font-weight: 500;
        }

        .instructions ol {
          color: #92400e;
          margin: 15px 0;
          padding-left: 20px;
        }

        .instructions li {
          margin-bottom: 12px;
          font-size: 15px;
          line-height: 1.5;
          font-weight: 500;
        }

        .instructions li strong {
          color: #7c2d12;
          font-weight: 700;
        }

        @media (max-width: 600px) {
          .deposit-card {
            margin: 10px;
            padding: 20px;
          }
          
          .header h1 {
            font-size: 24px;
          }
          
          .wallet-address {
            font-size: 12px;
          }
        }
        `}
      </style>

      <div className="deposit-card">
        <div className="header">
          <h1>💰 Make a Deposit</h1>
          <p>Send Bitcoin to fund your investment</p>
        </div>

        {/* Prominently display wallet address */}
        <div className="wallet-section">
          <h3 className="wallet-title">
            <span>🔗</span> Your BTC Wallet Address
          </h3>
          <div className="wallet-address">
            {walletAddress}
          </div>
          <button
            type="button"
            className={`copy-btn ${copied ? 'copied' : ''}`}
            onClick={copyWallet}
          >
            {copied ? '✅ Copied!' : '📋 Copy Address'}
          </button>
        </div>

        {error && (
          <div className="message error">
            ⚠️ {error}
          </div>
        )}

        {success && (
          <div className="message success">
            ✅ {success}
          </div>
        )}

        <form onSubmit={handleDeposit}>
          <div className="form-group">
            <label htmlFor="plan">📊 Choose Investment Plan:</label>
            <div className="select-wrapper">
              <select
                id="plan"
                name="plan"
                value={formData.plan}
                onChange={handleChange}
                className="form-control"
                disabled={loading}
              >
                {INVESTMENT_PLANS.map(plan => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} (${plan.minInvestment.toLocaleString()} - ${plan.maxInvestment === 100000 ? '100,000+' : plan.maxInvestment.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
            
            {currentPlan && (
              <div className="plan-info">
                <h4>{currentPlan.name}</h4>
                <p>{currentPlan.description}</p>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="amount">💵 Investment Amount:</label>
            <div className="amount-input">
              <input
                type="number"
                id="amount"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                className="form-control"
                placeholder={`Min: $${currentPlan?.minInvestment.toLocaleString()}`}
                min={currentPlan?.minInvestment}
                max={currentPlan?.maxInvestment}
                step="0.01"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="instructions">
            <h3>📱 How to Send Bitcoin with Trust Wallet:</h3>
            <ol>
              <li><strong>Download Trust Wallet</strong> from your device's app store (it's free and secure)</li>
              <li><strong>Buy Bitcoin</strong> directly in Trust Wallet using your debit card or bank account</li>
              <li><strong>Copy the wallet address</strong> shown above</li>
              <li><strong>In Trust Wallet</strong>, tap Bitcoin, then "Send"</li>
              <li><strong>Paste the wallet address</strong> as the recipient</li>
              <li><strong>Enter the exact amount:</strong> <strong>${formData.amount || 'XXX'}</strong></li>
              <li><strong>Confirm and send</strong> the Bitcoin transaction</li>
              <li><strong>Click "Confirm Deposit"</strong> below to record your transaction</li>
            </ol>
            <p><strong>Why Trust Wallet?</strong> It's one of the most secure and user-friendly crypto wallets, with instant Bitcoin purchases and easy sending features.</p>
            <p><strong>Processing:</strong> Your investment will be activated within 1-2 business days after Bitcoin confirmation.</p>
          </div>

          <button
            type="submit"
            className="submit-btn"
            disabled={loading || !formData.amount || !!validateAmount(formData.amount)}
          >
            {loading ? '⏳ Processing...' : '✅ Confirm Deposit'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="back-btn"
          >
            ← Back to Dashboard
          </button>
        </form>
      </div>
    </div>
  );
};

export default DepositPage;
