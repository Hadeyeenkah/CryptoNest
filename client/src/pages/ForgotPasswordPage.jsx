import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; // Adjust path as needed

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { sendPasswordReset, authError, loading: authContextLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const [message, setMessage] = useState(''); // For success or specific error messages

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(''); // Clear previous messages
    setLocalLoading(true);

    if (!email.trim()) {
      setMessage('Please enter your email address.');
      setLocalLoading(false);
      return;
    }
    if (!validateEmail(email)) {
      setMessage('Please enter a valid email address.');
      setLocalLoading(false);
      return;
    }

    try {
      const result = await sendPasswordReset(email);
      if (result.success) {
        setMessage('Password reset link sent to your email! Please check your inbox.');
        setEmail(''); // Clear email field on success
      } else {
        // authError from AuthContext will already be set, but we can also use result.error
        setMessage(result.error || 'Failed to send password reset email. Please try again.');
      }
    } catch (error) {
      console.error("Forgot password submission error:", error);
      setMessage(`An unexpected error occurred: ${error.message}`);
    } finally {
      setLocalLoading(false);
    }
  };

  if (authContextLoading) {
    return (
      <div className="auth-page loading-screen">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <h2 className="auth-title">Forgot Password?</h2>
          <p className="auth-subtitle">Enter your email address to receive a password reset link.</p>
        </div>

        {message && (
          <div className={`auth-message ${authError ? 'auth-error' : 'auth-success'}`} role="alert">
            <span className="message-icon">{authError ? '⚠️' : '✅'}</span>
            {message}
          </div>
        )}
        {/* Display authError from context if it's present and not already covered by local message */}
        {!message && authError && (
          <div className="auth-error" role="alert">
            <span className="message-icon">⚠️</span>
            {authError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={localLoading}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary full-width"
            disabled={localLoading || !email.trim()}
          >
            {localLoading ? (
              <>
                <span className="loading-spinner"></span> Sending Link...
              </>
            ) : 'Send Reset Link'}
          </button>
        </form>

        <p className="auth-switch">
          Remember your password? <Link to="/login" className="auth-link">Sign In</Link>
        </p>
      </div>

      {/* Embedded CSS for basic auth page styling (can be moved to a shared CSS file) */}
      <style>{`
        /* Auth Page Container */
        .auth-page {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); /* Gradient background */
            font-family: 'Inter', sans-serif;
            color: #333;
            padding: 20px;
            box-sizing: border-box;
        }

        /* Auth Container Card */
        .auth-container {
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            padding: 40px;
            max-width: 450px;
            width: 100%;
            text-align: center;
            border: 1px solid #e2e8f0;
        }

        /* Header */
        .auth-header {
            margin-bottom: 30px;
        }

        .auth-title {
            font-size: 2.2em;
            color: #673AB7; /* Primary purple */
            margin-bottom: 10px;
            font-weight: 700;
        }

        .auth-subtitle {
            font-size: 1.1em;
            color: #666;
            line-height: 1.5;
        }

        /* Messages (Error/Success) */
        .auth-message {
            padding: 12px 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 0.9em;
            text-align: left;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .auth-error {
            background-color: #ffebee;
            color: #d32f2f;
            border: 1px solid #d32f2f;
        }

        .auth-success {
            background-color: #e8f5e9;
            color: #388e3c;
            border: 1px solid #388e3c;
        }

        .message-icon {
            font-size: 1.2em;
        }

        /* Form */
        .auth-form {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .form-group {
            text-align: left;
        }

        .form-group label {
            display: block;
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
            box-sizing: border-box; /* Ensures padding doesn't increase width */
        }

        .form-group input:focus {
            border-color: #673AB7;
            box-shadow: 0 0 0 3px rgba(103, 58, 183, 0.1);
            outline: none;
        }

        /* Buttons */
        .btn {
            padding: 14px 20px;
            border: none;
            border-radius: 8px;
            font-size: 1.1em;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.3s ease, transform 0.2s ease, box-shadow 0.3s ease;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }

        .btn-primary {
            background-color: #673AB7;
            color: white;
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

        .full-width {
            width: 100%;
        }

        /* Links */
        .auth-links {
            margin-top: 20px;
            text-align: right;
        }

        .auth-link {
            color: #673AB7;
            text-decoration: none;
            font-weight: 600;
            transition: color 0.2s ease;
        }

        .auth-link:hover {
            color: #5e35b1;
            text-decoration: underline;
        }

        .auth-switch {
            margin-top: 30px;
            color: #666;
        }

        /* Loading Spinner */
        .loading-spinner {
            border: 3px solid rgba(255, 255, 255, 0.3);
            border-top: 3px solid #fff;
            border-radius: 50%;
            width: 18px;
            height: 18px;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* Loading Screen for AuthContext */
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

        /* Responsive Adjustments */
        @media (max-width: 600px) {
            .auth-container {
                padding: 30px 20px;
                margin: 10px;
            }
            .auth-title {
                font-size: 1.8em;
            }
            .auth-subtitle {
                font-size: 1em;
            }
            .btn {
                padding: 12px 15px;
                font-size: 1em;
            }
        }
      `}</style>
    </main>
  );
}

export default ForgotPasswordPage;
