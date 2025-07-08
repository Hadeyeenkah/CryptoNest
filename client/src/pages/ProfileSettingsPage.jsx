import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx'; // Adjust path as needed

// Define configuration for supported cryptocurrencies and their address regex
const CRYPTO_WALLET_CONFIG = [
  {
    id: 'btcWallet',
    name: 'Bitcoin (BTC) Wallet',
    placeholder: 'Enter Bitcoin wallet address (e.g., bc1q...)',
    addressRegex: /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/, // Basic BTC address regex
  },
  {
    id: 'ethWallet',
    name: 'Ethereum (ETH) Wallet',
    placeholder: 'Enter Ethereum wallet address (e.g., 0x...)',
    addressRegex: /^0x[a-fA-F0-9]{40}$/, // Basic ETH address regex
  },
  {
    id: 'usdtWallet',
    name: 'Tether (USDT) Wallet',
    placeholder: 'Enter USDT wallet address (e.g., 0x... or T...)',
    // This regex covers both ERC20 (0x) and TRC20 (T) formats for USDT
    addressRegex: /^(0x[a-fA-F0-9]{40}|T[a-zA-Z0-9]{33})$/,
  },
];

const ProfileSettingsPage = () => {
  const navigate = useNavigate();
  const {
    user,
    userProfile,
    authError,
    loading: authLoading,
    updateCryptoProfile,
    updateFullName, // New: for updating full name
    changePassword, // New: for changing password
    is2FAEnabled, // From AuthContext
    update2FAStatus, // From AuthContext
    send2FAEmailLink, // From AuthContext
    pendingEmailVerification, // From AuthContext
  } = useAuth();

  // Personal Info States
  const [fullName, setFullName] = useState('');
  const [isEditingFullName, setIsEditingFullName] = useState(false);

  // Change Password States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Crypto Wallet States
  const [btcWallet, setBtcWallet] = useState('');
  const [ethWallet, setEthWallet] = useState('');
  const [usdtWallet, setUsdtWallet] = useState('');

  // UI States
  const [localLoading, setLocalLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Populate form fields when userProfile loads or changes
  useEffect(() => {
    if (!authLoading && !user) {
      // If not loading and no user, redirect to login
      navigate('/login');
    }
    if (userProfile) {
      setFullName(userProfile.fullName || '');
      setBtcWallet(userProfile.btcWallet || '');
      setEthWallet(userProfile.ethWallet || '');
      setUsdtWallet(userProfile.usdtWallet || '');
    }
  }, [authLoading, user, userProfile, navigate]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const validateWalletAddress = (walletId, address) => {
    const config = CRYPTO_WALLET_CONFIG.find(c => c.id === walletId);
    if (!config) return true; // Should not happen if walletId is from config

    if (address === null || address.trim() === '') {
      // Allow empty/null addresses if user wants to clear it
      return true;
    }

    if (!config.addressRegex.test(address.trim())) {
      showMessage('error', `Invalid ${config.name} address format.`);
      return false;
    }
    return true;
  };

  // --- Handlers for Personal Information ---
  const handleSaveFullName = useCallback(async () => {
    setMessage({ type: '', text: '' });
    setLocalLoading(true);
    try {
      const result = await updateFullName(fullName);
      if (result.success) {
        showMessage('success', 'Full name updated successfully!');
        setIsEditingFullName(false);
      } else {
        showMessage('error', result.error || 'Failed to update full name.');
      }
    } catch (error) {
      console.error("Error updating full name:", error);
      showMessage('error', `An error occurred: ${error.message}`);
    } finally {
      setLocalLoading(false);
    }
  }, [fullName, updateFullName]);

  // --- Handlers for Change Password ---
  const handleChangePassword = useCallback(async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    setLocalLoading(true);

    if (newPassword !== confirmNewPassword) {
      showMessage('error', 'New passwords do not match.');
      setLocalLoading(false);
      return;
    }

    try {
      const result = await changePassword(currentPassword, newPassword);
      if (result.success) {
        showMessage('success', 'Password changed successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        showMessage('error', result.error || 'Failed to change password.');
      }
    } catch (error) {
      console.error("Error changing password:", error);
      showMessage('error', `An error occurred: ${error.message}`);
    } finally {
      setLocalLoading(false);
    }
  }, [currentPassword, newPassword, confirmNewPassword, changePassword]);

  // --- Handlers for 2FA Settings ---
  const handleToggle2FA = useCallback(async () => {
    setMessage({ type: '', text: '' });
    setLocalLoading(true);

    if (!is2FAEnabled) {
      // If 2FA is currently disabled, initiate enablement (send email link)
      try {
        const result = await send2FAEmailLink(user.email); // Send link to current user's email
        if (result.success) {
          showMessage('success', 'A 2FA verification link has been sent to your email. Please check your inbox to enable 2FA.');
          // Do not set 2FA enabled here, it will be set on email link confirmation
        } else {
          showMessage('error', result.error || 'Failed to send 2FA verification email.');
        }
      } catch (error) {
        console.error("Error sending 2FA email:", error);
        showMessage('error', `An error occurred: ${error.message}`);
      }
    } else {
      // If 2FA is currently enabled, disable it
      try {
        const result = await update2FAStatus(false);
        if (result.success) {
          showMessage('success', '2FA has been successfully disabled.');
        } else {
          showMessage('error', result.error || 'Failed to disable 2FA.');
        }
      } catch (error) {
        console.error("Error disabling 2FA:", error);
        showMessage('error', `An error occurred: ${error.message}`);
      }
    }
    setLocalLoading(false);
  }, [is2FAEnabled, user, send2FAEmailLink, update2FAStatus]);


  // --- Handlers for Crypto Profile ---
  const handleSaveCryptoProfile = useCallback(async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    setLocalLoading(true);

    if (!user) {
      showMessage('error', 'You must be logged in to save your crypto profile.');
      setLocalLoading(false);
      return;
    }

    // Validate all wallet addresses before saving
    if (!validateWalletAddress('btcWallet', btcWallet)) { setLocalLoading(false); return; }
    if (!validateWalletAddress('ethWallet', ethWallet)) { setLocalLoading(false); return; }
    if (!validateWalletAddress('usdtWallet', usdtWallet)) { setLocalLoading(false); return; }

    try {
      const updates = {
        btcWallet: btcWallet.trim() === '' ? null : btcWallet.trim(),
        ethWallet: ethWallet.trim() === '' ? null : ethWallet.trim(),
        usdtWallet: usdtWallet.trim() === '' ? null : usdtWallet.trim(),
      };

      const result = await updateCryptoProfile(updates);

      if (result.success) {
        showMessage('success', 'Your crypto profile has been updated successfully!');
      } else {
        showMessage('error', result.error || 'Failed to update crypto profile.');
      }
    } catch (error) {
      console.error("Error saving crypto profile:", error);
      showMessage('error', `An error occurred: ${error.message}`);
    } finally {
      setLocalLoading(false);
    }
  }, [user, btcWallet, ethWallet, usdtWallet, updateCryptoProfile]);

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading profile settings...</p>
      </div>
    );
  }

  return (
    <div className="profile-settings-container">
      <div className="settings-card">
        <h2>User Profile Settings</h2>
        <p className="description">Manage your personal information, security settings, and crypto wallets.</p>

        {message.text && (
          <div className={`message ${message.type === 'error' ? 'error-message' : 'success-message'}`}>
            {message.text}
          </div>
        )}
        {authError && (
          <div className="message error-message">
            {authError}
          </div>
        )}

        {/* --- Personal Information Section --- */}
        <section className="settings-section">
          <h3>Personal Information</h3>
          <div className="info-item">
            <label>Full Name:</label>
            {isEditingFullName ? (
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={localLoading}
                className="input-field"
              />
            ) : (
              <span>{userProfile?.fullName || 'N/A'}</span>
            )}
            {isEditingFullName ? (
              <button onClick={handleSaveFullName} className="btn-small-primary" disabled={localLoading}>
                {localLoading ? 'Saving...' : 'Save'}
              </button>
            ) : (
              <button onClick={() => setIsEditingFullName(true)} className="btn-small-secondary">
                Edit
              </button>
            )}
          </div>
          <div className="info-item">
            <label>Email:</label>
            <span>{user?.email || 'N/A'}</span>
            {/* Email is typically managed via Firebase Auth directly, not editable here */}
          </div>
        </section>

        {/* --- Change Password Section --- */}
        <section className="settings-section">
          <h3>Change Password</h3>
          <form onSubmit={handleChangePassword} className="settings-form">
            <div className="form-group">
              <label htmlFor="currentPassword">Current Password:</label>
              <input
                type="password"
                id="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={localLoading}
                className="input-field"
              />
            </div>
            <div className="form-group">
              <label htmlFor="newPassword">New Password:</label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength="6"
                disabled={localLoading}
                className="input-field"
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirmNewPassword">Confirm New Password:</label>
              <input
                type="password"
                id="confirmNewPassword"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                required
                minLength="6"
                disabled={localLoading}
                className="input-field"
              />
            </div>
            <button type="submit" className="btn-primary" disabled={localLoading}>
              {localLoading ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </section>

        {/* --- 2FA Settings Section --- */}
        <section className="settings-section">
          <h3>Two-Factor Authentication (2FA)</h3>
          <div className="info-item toggle-item">
            <label>Status:</label>
            <span className={`status-badge ${is2FAEnabled ? 'enabled' : 'disabled'}`}>
              {is2FAEnabled ? 'Enabled' : 'Disabled'}
            </span>
            <button
              onClick={handleToggle2FA}
              className={`btn-small-primary ${is2FAEnabled ? 'btn-danger' : ''}`}
              disabled={localLoading || pendingEmailVerification}
            >
              {localLoading ? 'Processing...' : (is2FAEnabled ? 'Disable 2FA' : 'Enable 2FA')}
            </button>
          </div>
          {!is2FAEnabled && pendingEmailVerification && (
            <p className="form-hint">
              A verification email has been sent. Please check your inbox to complete 2FA setup.
            </p>
          )}
          {!is2FAEnabled && !pendingEmailVerification && (
            <p className="form-hint">
              Enable 2FA for an extra layer of security. A verification link will be sent to your email.
            </p>
          )}
        </section>

        {/* --- Crypto Profile Settings Section --- */}
        <section className="settings-section">
          <h3>Crypto Wallet Addresses</h3>
          <form onSubmit={handleSaveCryptoProfile} className="settings-form">
            {CRYPTO_WALLET_CONFIG.map((walletConfig) => (
              <div className="form-group" key={walletConfig.id}>
                <label htmlFor={walletConfig.id}>{walletConfig.name}:</label>
                <input
                  type="text"
                  id={walletConfig.id}
                  value={
                    walletConfig.id === 'btcWallet' ? btcWallet :
                    walletConfig.id === 'ethWallet' ? ethWallet :
                    usdtWallet
                  }
                  onChange={(e) => {
                    const value = e.target.value;
                    if (walletConfig.id === 'btcWallet') setBtcWallet(value);
                    else if (walletConfig.id === 'ethWallet') setEthWallet(value);
                    else setUsdtWallet(value);
                  }}
                  placeholder={walletConfig.placeholder}
                  disabled={localLoading}
                  className="input-field"
                />
                <p className="form-hint">Ensure the address is correct for {walletConfig.name.split(' ')[0]}.</p>
              </div>
            ))}

            <button type="submit" className="btn-primary" disabled={localLoading}>
              {localLoading ? 'Saving...' : 'Save Crypto Profile'}
            </button>
          </form>
        </section>

        <button onClick={() => navigate('/dashboard')} className="back-link">
          ← Back to Dashboard
        </button>
      </div>

      {/* Embedded CSS for styling */}
      <style>{`
        .profile-settings-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          padding: 20px;
          background-color: #f8fafc;
          font-family: 'Inter', sans-serif;
        }

        .settings-card {
          background-color: #ffffff;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
          padding: 40px;
          max-width: 600px; /* Wider card to accommodate sections */
          width: 100%;
          text-align: center;
          border: 1px solid #e2e8f0;
        }

        .settings-card h2 {
          font-size: 2em;
          color: #673AB7;
          margin-bottom: 15px;
          font-weight: 700;
        }

        .settings-card .description {
          color: #666;
          margin-bottom: 25px;
          line-height: 1.5;
        }

        .message {
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

        .settings-section {
          background-color: #fcfcfc;
          border-radius: 10px;
          padding: 25px;
          margin-bottom: 25px;
          border: 1px solid #eee;
          text-align: left;
        }

        .settings-section h3 {
          font-size: 1.5em;
          color: #4a0072;
          margin-bottom: 20px;
          font-weight: 600;
          text-align: center;
        }

        .info-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #f0f0f0;
        }

        .info-item:last-child {
          border-bottom: none;
        }

        .info-item label {
          font-weight: 600;
          color: #444;
          flex-basis: 30%;
        }

        .info-item span {
          flex-basis: 50%;
          color: #555;
        }

        .info-item .input-field {
            flex-basis: 50%;
            margin-top: 0; /* Override default margin */
            margin-right: 10px;
            padding: 8px 12px;
            font-size: 0.9em;
        }

        .settings-form {
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

        .input-field {
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

        .input-field:focus {
          border-color: #673AB7;
          box-shadow: 0 0 0 3px rgba(103, 58, 183, 0.1);
          outline: none;
        }

        .form-hint {
          font-size: 0.85em;
          color: #888;
          text-align: left;
          margin-top: 5px;
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

        .btn-small-primary {
            background-color: #8b5cf6;
            color: white;
            padding: 8px 15px;
            border: none;
            border-radius: 6px;
            font-size: 0.9em;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.3s ease;
            margin-left: 10px;
        }
        .btn-small-primary:hover:not(:disabled) {
            background-color: #7c3aed;
        }
        .btn-small-primary:disabled {
            opacity: 0.7;
            cursor: not-allowed;
        }

        .btn-small-secondary {
            background-color: #e0e0e0;
            color: #333;
            padding: 8px 15px;
            border: none;
            border-radius: 6px;
            font-size: 0.9em;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.3s ease;
            margin-left: 10px;
        }
        .btn-small-secondary:hover:not(:disabled) {
            background-color: #d5d5d5;
        }
        .btn-small-secondary.btn-danger {
            background-color: #ef4444;
            color: white;
        }
        .btn-small-secondary.btn-danger:hover:not(:disabled) {
            background-color: #dc2626;
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

        .status-badge {
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 0.8em;
            font-weight: 700;
            text-transform: uppercase;
            margin-left: 10px;
        }
        .status-badge.enabled {
            background-color: #e8f5e9;
            color: #4caf50;
        }
        .status-badge.disabled {
            background-color: #ffebee;
            color: #f44336;
        }

        .toggle-item {
            justify-content: flex-start; /* Align label and status to left */
        }
        .toggle-item label {
            flex-basis: auto; /* Don't force width */
            margin-right: 15px;
        }
        .toggle-item span {
            flex-grow: 0; /* Don't grow */
            margin-right: auto; /* Push button to right */
        }


        /* Loading Screen (reused from Dashboard.css) */
        .loading-screen {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-family: 'Inter', sans-serif;
          font-size: 1.2rem;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
        }

        .spinner {
          border: 8px solid rgba(255, 255, 255, 0.3);
          border-top: 8px solid #fff;
          border-radius: 50%;
          width: 60px;
          height: 60px;
          animation: spin 1s linear infinite;
          margin-bottom: 20px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Responsive Adjustments */
        @media (max-width: 600px) {
          .settings-card {
            padding: 25px;
            margin: 10px;
          }
          .settings-card h2 {
            font-size: 1.8em;
          }
          .btn-primary, .btn-small-primary, .btn-small-secondary {
            padding: 12px 15px;
            font-size: 1em;
          }
          .info-item {
            flex-direction: column;
            align-items: flex-start;
          }
          .info-item label, .info-item span, .info-item .input-field, .info-item button {
            width: 100%;
            margin-left: 0;
            margin-right: 0;
            margin-bottom: 5px;
          }
          .info-item .input-field {
            margin-bottom: 10px;
          }
          .toggle-item {
            flex-direction: column;
            align-items: flex-start;
          }
          .toggle-item label {
            margin-bottom: 10px;
          }
          .toggle-item span {
            margin-bottom: 10px;
            margin-left: 0;
          }
          .toggle-item button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default ProfileSettingsPage;
