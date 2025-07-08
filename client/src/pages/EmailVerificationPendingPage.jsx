import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// Firebase Imports
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, sendEmailVerification, signOut } from 'firebase/auth';

import { MailCheck, RefreshCcw, LogOut, AlertCircle } from 'lucide-react';

function EmailVerificationPendingPage() {
  const navigate = useNavigate();
  const [auth, setAuth] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Refs for stable Firebase instances
  const authRef = useRef(null);

  useEffect(() => {
    console.log("EmailVerificationPendingPage: Initializing Firebase...");
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

    let appInstance;
    if (getApps().length === 0) {
      appInstance = initializeApp(firebaseConfig);
    } else {
      appInstance = getApp();
    }

    try {
      const authInstance = getAuth(appInstance);
      setAuth(authInstance);
      authRef.current = authInstance;

      const unsubscribeAuth = onAuthStateChanged(authInstance, (user) => {
        if (user) {
          setUserEmail(user.email || 'your email');
          if (user.emailVerified) {
            console.log("EmailVerificationPendingPage: User email already verified, redirecting to dashboard.");
            navigate('/dashboard'); // If email is already verified, redirect
          } else {
            setLoading(false); // Stop loading if user is present but not verified
          }
        } else {
          console.log("EmailVerificationPendingPage: No user found, redirecting to login.");
          navigate('/login'); // If no user, redirect to login
        }
      });

      return () => unsubscribeAuth();
    } catch (initializationError) {
      console.error("EmailVerificationPendingPage: Firebase initialization error:", initializationError);
      setError("Failed to initialize application services.");
      setLoading(false);
    }
  }, []);

  const handleResendVerification = async () => {
    setError('');
    if (!authRef.current || !authRef.current.currentUser) {
      setError("No active user session. Please log in again.");
      return;
    }

    setLoading(true);
    try {
      await sendEmailVerification(authRef.current.currentUser);
      setVerificationSent(true);
      setError('');
      console.log('Verification email resent.');
    } catch (err) {
      console.error('Error resending verification email:', err);
      let errorMessage = 'Failed to resend verification email. Please try again later.';
      if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Too many requests. Please wait a moment before trying again.';
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (auth) {
      try {
        await signOut(auth);
        console.log("EmailVerificationPendingPage: User logged out.");
        navigate('/login');
      } catch (logoutError) {
        console.error("EmailVerificationPendingPage: Error logging out:", logoutError);
        setError("Failed to log out. Please try again.");
      }
    }
  };

  if (loading) {
    return (
      <div className="verification-page loading-screen">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <main className="verification-page">
      <div className="verification-container">
        <div className="verification-header">
          <MailCheck className="verification-icon" />
          <h2 className="verification-title">Verify Your Email Address</h2>
          <p className="verification-subtitle">
            A verification email has been sent to <strong className="break-all">{userEmail}</strong>.
            Please check your inbox and click the link to activate your account.
          </p>
        </div>

        {error && (
          <div className="verification-error" role="alert">
            <AlertCircle className="error-icon" />
            {error}
          </div>
        )}

        {verificationSent && !error && (
          <div className="verification-success" role="status">
            Verification email resent! Please check your inbox.
          </div>
        )}

        <div className="verification-actions">
          <button
            onClick={handleResendVerification}
            className="btn btn-primary full-width"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="loading-spinner"></span>
                Resending...
              </>
            ) : (
              <>
                <RefreshCcw className="button-icon" />
                Resend Verification Email
              </>
            )}
          </button>
          <button
            onClick={handleLogout}
            className="btn btn-secondary full-width"
            disabled={loading}
          >
            <LogOut className="button-icon" />
            Logout
          </button>
        </div>

        <p className="verification-footer">
          After verifying, you can return to the <Link to="/login" className="verification-link">login page</Link> to access your dashboard.
        </p>
      </div>

      {/* Embedded CSS for professional design */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* Define CSS Variables for a Professional Theme */
        :root {
            --primary-color: #673AB7; /* Deep Purple */
            --secondary-color: #7B1FA2; /* Darker Purple for accents */
            --background-color: #f0f2f5; /* Light Gray Background */
            --card-background: #ffffff; /* White Card */
            --text-color-primary: #333333;
            --text-color-secondary: #666666;
            --border-color: #e0e0e0;
            --button-hover-bg: #5e35b1;
            --error-color: #d32f2f;
            --error-background: #ffebee;
            --success-color: #388e3c;
            --success-background: #e8f5e9;
            --shadow-light: rgba(0, 0, 0, 0.05);
            --shadow-medium: rgba(0, 0, 0, 0.1);
            --font-family: 'Inter', sans-serif;
        }

        /* Global Body Styles */
        body {
            margin: 0;
            font-family: var(--font-family);
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            background-color: var(--background-color);
            color: var(--text-color-primary);
            line-height: 1.6;
        }

        /* Verification Page Container */
        .verification-page {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background-color: var(--background-color);
            padding: 20px;
            box-sizing: border-box;
        }

        .verification-page.loading-screen {
          background-color: var(--background-color);
          color: var(--text-color-secondary);
          font-size: 1.125rem;
          font-weight: 500;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
        }

        .verification-container {
            background-color: var(--card-background);
            border-radius: 12px;
            box-shadow: 0 8px 25px var(--shadow-medium);
            padding: 40px;
            width: 100%;
            max-width: 500px;
            text-align: center;
            border: 1px solid var(--border-color);
            animation: fadeIn 0.5s ease-out;
            box-sizing: border-box;
        }

        .verification-header {
            margin-bottom: 30px;
        }

        .verification-icon {
            width: 60px;
            height: 60px;
            color: var(--primary-color);
            margin: 0 auto 20px;
        }

        .verification-title {
            font-size: 2.2em;
            color: var(--primary-color);
            margin-bottom: 15px;
            font-weight: 700;
        }

        .verification-subtitle {
            color: var(--text-color-secondary);
            margin-bottom: 30px;
            font-size: 1em;
            line-height: 1.5;
        }

        .verification-error, .verification-success {
            background-color: var(--error-background);
            color: var(--error-color);
            border: 1px solid var(--error-color);
            padding: 12px 20px;
            border-radius: 8px;
            margin-bottom: 25px;
            font-size: 0.9em;
            text-align: left;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideIn 0.3s ease-out;
        }

        .verification-success {
            background-color: var(--success-background);
            color: var(--success-color);
            border: 1px solid var(--success-color);
        }

        .verification-error .error-icon, .verification-success .success-icon {
            font-size: 1.2em;
            line-height: 1;
            flex-shrink: 0;
        }

        .verification-actions {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .btn {
            padding: 14px 20px;
            border: none;
            border-radius: 8px;
            font-size: 1.1em;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.3s ease, transform 0.2s ease, box-shadow 0.3s ease;
            box-shadow: 0 4px 15px var(--shadow-light);
            position: relative;
            overflow: hidden;
            display: inline-flex;
            justify-content: center;
            align-items: center;
            gap: 10px;
        }

        .btn-primary {
            background-color: var(--primary-color);
            color: white;
        }

        .btn-primary:hover:not(:disabled) {
            background-color: var(--button-hover-bg);
            transform: translateY(-2px);
            box-shadow: 0 6px 20px var(--shadow-medium);
        }

        .btn-secondary {
            background-color: #e0e0e0; /* Lighter grey for secondary actions */
            color: var(--text-color-primary);
        }

        .btn-secondary:hover:not(:disabled) {
            background-color: #c9c9c9;
            transform: translateY(-2px);
        }

        .btn:disabled {
            background-color: #cccccc;
            cursor: not-allowed;
            box-shadow: none;
        }

        .full-width {
            width: 100%;
        }

        .loading-spinner {
            display: inline-block;
            width: 18px;
            height: 18px;
            border: 2px solid rgba(255, 255, 255, 0.5);
            border-top-color: white;
            border-radius: 50%;
            animation: spinner 0.8s linear infinite;
            flex-shrink: 0;
        }

        .button-icon {
            width: 20px;
            height: 20px;
            margin-right: 8px;
        }

        .verification-footer {
            margin-top: 25px;
            font-size: 0.9em;
            color: var(--text-color-secondary);
        }

        .verification-link {
            color: var(--primary-color);
            font-weight: 600;
            text-decoration: none;
            transition: color 0.2s ease;
        }

        .verification-link:hover {
            color: var(--button-hover-bg);
            text-decoration: underline;
        }

        /* Keyframe Animations */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideIn {
            from { opacity: 0; transform: translateX(-10px); }
            to { opacity: 1; transform: translateX(0); }
        }

        @keyframes spinner {
            to { transform: rotate(360deg); }
        }

        /* Responsive adjustments */
        @media (max-width: 500px) {
            .verification-container {
                padding: 30px 20px;
                border-radius: 0;
                box-shadow: none;
                border-left: none;
                border-right: none;
            }
            .verification-title {
                font-size: 2em;
            }
            .verification-subtitle {
                font-size: 0.95em;
            }
            .btn {
                font-size: 1em;
                padding: 12px 15px;
            }
            .verification-error, .verification-success {
                font-size: 0.85em;
            }
            .verification-icon {
                width: 50px;
                height: 50px;
            }
        }
      `}}></style>
    </main>
  );
}

export default EmailVerificationPendingPage;
