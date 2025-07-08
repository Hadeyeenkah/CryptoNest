import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx'; // Adjust path as needed

const TwoFactorAuthSetupPage = () => {
  const navigate = useNavigate();
  const {
    user,
    userId,
    userProfile,
    loading: authLoading,
    authError,
    is2FAEnabled,
    send2FAEmailLink, // New function from AuthContext
    update2FAStatus,
    pendingEmailVerification, // New state from AuthContext
  } = useAuth();

  const [emailToVerify, setEmailToVerify] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (!authLoading && !user) {
      // If not loading and no user, redirect to login
      navigate('/login');
    }
    if (!authLoading && user) {
      // Pre-fill email with the user's current email from Firebase Auth
      setEmailToVerify(user.email || '');
      // If 2FA is already enabled, show success message and redirect
      if (is2FAEnabled) {
        setMessage({ type: 'success', text: '2FA is already enabled for your account.' });
        setTimeout(() => navigate('/dashboard'), 1500);
      }
    }
  }, [authLoading, user, is2FAEnabled, navigate]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 7000); // Increased timeout for email instructions
  };

  const handleSendEmailLink = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    setLocalLoading(true);

    if (!user) {
      showMessage('error', 'You must be logged in to set up 2FA.');
      setLocalLoading(false);
      return;
    }
    if (!emailToVerify) {
      showMessage('error', 'Please enter your email address.');
      setLocalLoading(false);
      return;
    }

    try {
      const result = await send2FAEmailLink(emailToVerify);

      if (result.success) {
        showMessage('success',
          `A verification link has been sent to ${emailToVerify}. Please check your inbox and click the link to enable 2FA. This link is single-use.`
        );
        // Do not navigate immediately, user needs to interact with email
      } else {
        showMessage('error', result.error || 'Failed to send verification email.');
      }
    } catch (error) {
      console.error("Error sending 2FA email link:", error);
      showMessage('error', `An error occurred: ${error.message}`);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!user) {
      showMessage('error', 'You must be logged in to disable 2FA.');
      return;
    }
    setLocalLoading(true);
    try {
      const result = await update2FAStatus(false);
      if (result.success) {
        showMessage('success', '2FA has been successfully disabled for your account.');
        // No need to navigate, the page will update via AuthContext listener
      } else {
        showMessage('error', result.error || 'Failed to disable 2FA.');
      }
    } catch (error) {
      console.error("Error disabling 2FA:", error);
      showMessage('error', `An error occurred: ${error.message}`);
    } finally {
      setLocalLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading 2FA setup...</p>
      </div>
    );
  }

  return (
    <div className="two-factor-auth-container">
      <div className="auth-card">
        <h2>{is2FAEnabled ? '2FA Enabled' : 'Setup 2-Factor Authentication'}</h2>

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

        {is2FAEnabled ? (
          <div className="success-state">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="check-icon">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-8.8" />
              <path d="M22 4L12 14.01l-3-3" />
            </svg>
            <p>2FA is currently enabled for: <strong>{user?.email || 'your account'}</strong></p>
            <p>For security, please ensure this email is secure.</p>
            <button onClick={handleDisable2FA} className="btn-secondary mt-4" disabled={localLoading}>
              {localLoading ? 'Disabling...' : 'Disable 2FA'}
            </button>
            <button onClick={() => navigate('/dashboard')} className="btn-primary mt-3">Go to Dashboard</button>
          </div>
        ) : (
          <>
            <p className="description">
              Enhance your account security by enabling 2FA. A verification link will be sent to your email.
            </p>
            <form onSubmit={handleSendEmailLink} className="auth-form">
              <div className="form-group">
                <label htmlFor="emailToVerify">Your Email Address:</label>
                <input
                  type="email"
                  id="emailToVerify"
                  value={emailToVerify}
                  onChange={(e) => setEmailToVerify(e.target.value)}
                  placeholder="your.email@example.com"
                  required
                  disabled={localLoading || pendingEmailVerification}
                />
                <p className="form-hint">This must be the email associated with your account.</p>
              </div>
              <button type="submit" className="btn-primary" disabled={localLoading || pendingEmailVerification}>
                {localLoading ? 'Sending Link...' : (pendingEmailVerification ? 'Link Sent, Check Email' : 'Send Verification Link')}
              </button>
            </form>
          </>
        )}

        <button onClick={() => navigate('/dashboard')} className="back-link">
          ← Back to Dashboard
        </button>
      </div>

      {/* Embedded CSS for styling */}
      <style>{`
        .two-factor-auth-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          padding: 20px;
          background-color: #f8fafc;
          font-family: 'Inter', sans-serif;
        }

        .auth-card {
          background-color: #ffffff;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
          padding: 40px;
          max-width: 450px;
          width: 100%;
          text-align: center;
          border: 1px solid #e2e8f0;
        }

        .auth-card h2 {
          font-size: 2em;
          color: #673AB7;
          margin-bottom: 15px;
          font-weight: 700;
        }

        .auth-card .description {
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

        .auth-form {
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

        .form-group input {
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

        .form-group input:focus {
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

        .btn-secondary {
          background-color: #e0e0e0;
          color: #333;
          padding: 12px 20px;
          border: none;
          border-radius: 8px;
          font-size: 1em;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.3s ease, transform 0.2s ease;
        }

        .btn-secondary:hover:not(:disabled) {
          background-color: #d5d5d5;
          transform: translateY(-1px);
        }

        .btn-secondary:disabled {
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

        .success-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .success-state .check-icon {
          color: #4caf50;
          margin-bottom: 20px;
        }

        .success-state p {
          color: #333;
          margin-bottom: 10px;
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
          .auth-card {
            padding: 25px;
            margin: 10px;
          }
          .auth-card h2 {
            font-size: 1.8em;
          }
          .btn-primary, .btn-secondary {
            padding: 12px 15px;
            font-size: 1em;
          }
        }
      `}</style>
    </div>
  );
};

export default TwoFactorAuthSetupPage;
