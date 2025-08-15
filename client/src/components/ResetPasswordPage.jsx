import React, { useState, useEffect } from 'react';

// The main App component is simplified to just the ResetPasswordPage for this example.
// In a real application, you would use a router (like React Router) to navigate to this page.
export default function App() {
  // Simulating URL parameters for email and token for demonstration.
  // In a real app, you would get these from useSearchParams().
  const searchParams = {
    get: (key) => {
      const params = {
        'email': 'user@example.com',
        'token': 'sample-reset-token-12345'
      };
      return params[key];
    }
  };

  const emailFromUrl = searchParams.get('email');
  const tokenFromUrl = searchParams.get('token');

  return <ResetPasswordPage emailFromUrl={emailFromUrl} tokenFromUrl={tokenFromUrl} />;
}

// Main password reset component.
function ResetPasswordPage({ emailFromUrl, tokenFromUrl }) {
  const [email, setEmail] = useState(emailFromUrl || '');
  const [token, setToken] = useState(tokenFromUrl || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isValidLink, setIsValidLink] = useState(true);

  // Effect to validate the presence of email and token from the URL.
  useEffect(() => {
    if (!emailFromUrl || !tokenFromUrl) {
      setIsValidLink(false);
      setMessage('Invalid or missing reset link. Please request a new password reset.');
    }
  }, [emailFromUrl, tokenFromUrl]);

  // Effect to clear the message after a delay.
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 8000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const validatePassword = (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (password.length < minLength) {
      return 'Password must be at least 8 characters long.';
    }
    if (!hasUpperCase) {
      return 'Password must contain at least one uppercase letter.';
    }
    if (!hasLowerCase) {
      return 'Password must contain at least one lowercase letter.';
    }
    if (!hasNumbers) {
      return 'Password must contain at least one number.';
    }
    if (!hasSpecialChar) {
      return 'Password must contain at least one special character.';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setIsSuccess(false);
    setLoading(true);

    // Initial form validation
    if (!newPassword.trim()) {
      setMessage('Please enter a new password.');
      setLoading(false);
      return;
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setMessage(passwordError);
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      // Simulate an API call with a delay
      const response = await new Promise((resolve, reject) => {
        setTimeout(() => {
          // Simulate an invalid token or link expiration
          if (token === 'sample-expired-token' || email === 'invalid-user@example.com') {
            reject({
              ok: false,
              json: () => Promise.resolve({ error: 'This reset link has expired.' }),
            });
          }
          // Simulate a success case
          else if (email === 'user@example.com' && token === 'sample-reset-token-12345') {
            resolve({
              ok: true,
              json: () => Promise.resolve({ message: 'Password reset successful!' }),
            });
          }
          // Simulate a generic error
          else {
            reject({
              ok: false,
              json: () => Promise.resolve({ error: 'Failed to reset password.' }),
            });
          }
        }, 1500); // 1.5 second delay to simulate network latency
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to reset password');
      }

      setMessage('Password reset successful! You can now log in with your new password.');
      setIsSuccess(true);

      // Clear form and redirect after a delay
      setNewPassword('');
      setConfirmPassword('');
      // In a real app, you'd use a navigate function here
      console.log('Password reset successful. Redirecting to login page...');

    } catch (error) {
      console.error('Password reset error:', error);
      setMessage(error.message || 'An unexpected error occurred. Please try again.');
      setIsSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  const getPasswordStrength = (password) => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;

    if (score <= 2) return { strength: 'Weak', color: '#ef4444' }; // Red
    if (score <= 3) return { strength: 'Fair', color: '#eab308' }; // Yellow
    if (score <= 4) return { strength: 'Good', color: '#3b82f6' }; // Blue
    return { strength: 'Strong', color: '#22c55e' }; // Green
  };

  const passwordStrength = newPassword ? getPasswordStrength(newPassword) : null;

  if (!isValidLink) {
    return (
      <main className="main-container">
        <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            :root {
              --main-bg-color: #f9fafb;
              --card-bg-color: #ffffff;
              --border-color: #e5e7eb;
              --primary-color: #4f46e5;
              --primary-hover-color: #4338ca;
              --secondary-text-color: #6b7280;
              --heading-color: #3730a3;
              --error-bg-color: #fef2f2;
              --error-text-color: #b91c1c;
              --error-border-color: #fca5a5;
            }
            .main-container {
              min-height: 100vh;
              background: linear-gradient(to bottom right, #6366f1, #8b5cf6);
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 1rem;
              font-family: 'Inter', sans-serif;
            }
            .card {
              background-color: var(--card-bg-color);
              border-radius: 1rem;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
              padding: 2rem;
              max-width: 28rem;
              width: 100%;
              text-align: center;
              border: 1px solid var(--border-color);
            }
            .card-heading {
              font-size: 1.875rem;
              font-weight: 700;
              color: var(--heading-color);
              margin-bottom: 0.5rem;
            }
            .card-subtitle {
              color: var(--secondary-text-color);
              margin-top: 0.5rem;
            }
            .message-box {
              padding: 1rem;
              border-radius: 0.5rem;
              display: flex;
              align-items: center;
              gap: 0.5rem;
              margin-bottom: 1.5rem;
              border: 1px solid;
            }
            .message-box.error {
              background-color: var(--error-bg-color);
              color: var(--error-text-color);
              border-color: var(--error-border-color);
            }
            .message-box p {
              font-size: 0.875rem;
            }
            .btn {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 100%;
              padding: 0.75rem 1.5rem;
              border: 1px solid transparent;
              font-size: 1rem;
              font-weight: 500;
              border-radius: 0.5rem;
              color: white;
              background-color: var(--primary-color);
              transition: all 0.2s ease-in-out;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
            }
            .btn:hover {
              background-color: var(--primary-hover-color);
            }
            .link {
              color: var(--primary-color);
              font-weight: 600;
              transition: color 0.2s ease-in-out;
            }
            .link:hover {
              color: var(--primary-hover-color);
            }
          `}
        </style>
        <div className="card">
          <div className="mb-6">
            <h2 className="card-heading">Invalid Reset Link</h2>
            <p className="card-subtitle">This password reset link is invalid or has expired.</p>
          </div>

          <div className="message-box error">
            <span style={{ fontSize: '1.25rem' }}>⚠️</span>
            <p>{message}</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <a href="/forgot-password" className="btn">
              Request New Reset Link
            </a>
            <p className="card-subtitle" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
              Remember your password? <a href="/login" className="link">Sign In</a>
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="main-container">
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          :root {
            --main-bg-color: #f9fafb;
            --card-bg-color: #ffffff;
            --border-color: #e5e7eb;
            --primary-color: #4f46e5;
            --primary-hover-color: #4338ca;
            --secondary-text-color: #6b7280;
            --heading-color: #3730a3;
            --input-border-color: #d1d5db;
            --input-focus-color: #c7d2fe;
            --input-focus-border: #6366f1;
            --input-disabled-bg: #f3f4f6;
            --success-bg-color: #ecfdf5;
            --success-text-color: #047857;
            --success-border-color: #a7f3d0;
            --error-bg-color: #fef2f2;
            --error-text-color: #b91c1c;
            --error-border-color: #fca5a5;
            --info-color: #4f46e5;
            --info-text-color: #312e81;
          }
          .main-container {
            min-height: 100vh;
            background: linear-gradient(to bottom right, #6366f1, #8b5cf6);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
            font-family: 'Inter', sans-serif;
          }
          .card {
            background-color: var(--card-bg-color);
            border-radius: 1rem;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
            padding: 2rem;
            max-width: 28rem;
            width: 100%;
            text-align: center;
            border: 1px solid var(--border-color);
          }
          .card-heading {
            font-size: 1.875rem;
            font-weight: 700;
            color: var(--heading-color);
            margin-bottom: 0.5rem;
          }
          .card-subtitle {
            color: var(--secondary-text-color);
            margin-top: 0.5rem;
          }
          .link {
            color: var(--primary-color);
            font-weight: 600;
            transition: color 0.2s ease-in-out;
          }
          .link:hover {
            color: var(--primary-hover-color);
          }
          .message-box {
            padding: 1rem;
            border-radius: 0.5rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 1.5rem;
            border: 1px solid;
            font-size: 0.875rem;
          }
          .message-box.success {
            background-color: var(--success-bg-color);
            color: var(--success-text-color);
            border-color: var(--success-border-color);
          }
          .message-box.error {
            background-color: var(--error-bg-color);
            color: var(--error-text-color);
            border-color: var(--error-border-color);
          }
          .form-group {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }
          .form-field {
            text-align: left;
            position: relative;
          }
          .form-label {
            display: block;
            font-size: 0.875rem;
            font-weight: 500;
            color: #4b5563;
            margin-bottom: 0.25rem;
          }
          .input-container {
            position: relative;
          }
          .form-input {
            width: 100%;
            padding: 0.5rem 1rem;
            padding-right: 3rem;
            border-radius: 0.5rem;
            border: 1px solid var(--input-border-color);
            transition: all 0.2s ease-in-out;
          }
          .form-input:focus {
            outline: none;
            border-color: var(--input-focus-border);
            box-shadow: 0 0 0 3px var(--input-focus-color);
          }
          .form-input:disabled {
            background-color: var(--input-disabled-bg);
            cursor: not-allowed;
          }
          .password-toggle-btn {
            position: absolute;
            right: 0.75rem;
            top: 50%;
            transform: translateY(-50%);
            color: #6b7280;
            transition: color 0.2s ease-in-out;
            border: none;
            background: none;
            padding: 0;
            cursor: pointer;
          }
          .password-toggle-btn:hover {
            color: #4b5563;
          }
          .password-toggle-btn:disabled {
            cursor: not-allowed;
            color: #9ca3af;
          }
          .password-strength-meter {
            margin-top: 0.5rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          .password-strength-bar {
            flex: 1;
            height: 0.25rem;
            background-color: #e5e7eb;
            border-radius: 9999px;
            overflow: hidden;
          }
          .password-strength-indicator {
            height: 100%;
            transition: all 0.3s ease-in-out;
          }
          .password-strength-text {
            font-size: 0.75rem;
            font-weight: 600;
          }
          .password-mismatch {
            margin-top: 0.25rem;
            font-size: 0.875rem;
            color: #ef4444;
            font-weight: 500;
          }
          .password-match {
            margin-top: 0.25rem;
            font-size: 0.875rem;
            color: #22c55e;
            font-weight: 500;
          }
          .password-requirements {
            background-color: #f9fafb;
            border-radius: 0.5rem;
            padding: 1rem;
            border: 1px solid #e5e7eb;
            text-align: left;
            margin-top: 0.5rem;
          }
          .password-requirements h4 {
            font-size: 0.875rem;
            font-weight: 600;
            color: var(--info-text-color);
            margin-bottom: 0.5rem;
          }
          .password-requirements ul {
            font-size: 0.75rem;
            color: #4b5563;
            list-style: disc;
            padding-left: 1rem;
          }
          .password-requirements ul li {
            margin-bottom: 0.25rem;
          }
          .password-requirements ul li.valid {
            color: #16a34a;
            font-weight: 500;
          }
          .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            padding: 0.75rem 1.5rem;
            border: 1px solid transparent;
            font-size: 1rem;
            font-weight: 500;
            border-radius: 0.5rem;
            color: white;
            background-color: var(--primary-color);
            transition: all 0.2s ease-in-out;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
            cursor: pointer;
            gap: 0.5rem;
          }
          .btn:hover {
            background-color: var(--primary-hover-color);
          }
          .btn:disabled {
            background-color: #9ca3af;
            cursor: not-allowed;
          }
          .btn .spinner {
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <div className="card">
        <div className="mb-6">
          <h2 className="card-heading">Reset Password</h2>
          <p className="card-subtitle">
            Enter a new password for <strong style={{ color: '#4f46e5', overflowWrap: 'break-word' }}>{email}</strong>
          </p>
        </div>

        {message && (
          <div className={`message-box ${isSuccess ? 'success' : 'error'}`}>
            <span style={{ fontSize: '1.25rem' }}>{isSuccess ? '✅' : '⚠️'}</span>
            <p>{message}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-group">
          <div className="form-field">
            <label htmlFor="newPassword" className="form-label">New Password</label>
            <div className="input-container">
              <input
                type={showPassword ? 'text' : 'password'}
                id="newPassword"
                name="newPassword"
                placeholder="Enter your new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                disabled={loading}
                className="form-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                className="password-toggle-btn"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ width: '1.5rem', height: '1.5rem' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ width: '1.5rem', height: '1.5rem' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7 1.274-4.057 5.064-7 9.542-7a10.05 10.05 0 015.625 1.825m-6.75 3.325a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 12c.005-3.03-.456-6.17-1.425-9.35C15.867 2.01 13.91 1 12 1 7.523 1 3.732 3.943 2.458 8M18.75 12c.005 3.03-.456 6.17-1.425 9.35C15.867 21.99 13.91 23 12 23c-4.477 0-8.268-2.943-9.542-7" />
                  </svg>
                )}
              </button>
            </div>
            {newPassword && (
              <div className="password-strength-meter">
                <div className="password-strength-bar">
                  <div
                    className="password-strength-indicator"
                    style={{
                      width: `${(passwordStrength.strength === 'Weak' ? 25 :
                        passwordStrength.strength === 'Fair' ? 50 :
                        passwordStrength.strength === 'Good' ? 75 : 100)}%`,
                      backgroundColor: passwordStrength.color
                    }}
                  ></div>
                </div>
                <span className="password-strength-text" style={{ color: passwordStrength.color }}>
                  {passwordStrength.strength}
                </span>
              </div>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="confirmPassword" className="form-label">Confirm New Password</label>
            <div className="input-container">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                name="confirmPassword"
                placeholder="Confirm your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                disabled={loading}
                className="form-input"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={loading}
                className="password-toggle-btn"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ width: '1.5rem', height: '1.5rem' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ width: '1.5rem', height: '1.5rem' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7 1.274-4.057 5.064-7 9.542-7a10.05 10.05 0 015.625 1.825m-6.75 3.325a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 12c.005-3.03-.456-6.17-1.425-9.35C15.867 2.01 13.91 1 12 1 7.523 1 3.732 3.943 2.458 8M18.75 12c.005 3.03-.456 6.17-1.425 9.35C15.867 21.99 13.91 23 12 23c-4.477 0-8.268-2.943-9.542-7" />
                  </svg>
                )}
              </button>
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="password-mismatch">
                ❌ Passwords do not match
              </p>
            )}
            {confirmPassword && newPassword === confirmPassword && confirmPassword.length > 0 && (
              <p className="password-match">
                ✅ Passwords match
              </p>
            )}
          </div>

          <div className="password-requirements">
            <h4>Password Requirements:</h4>
            <ul>
              <li className={newPassword.length >= 8 ? 'valid' : ''}>
                At least 8 characters
              </li>
              <li className={/[A-Z]/.test(newPassword) ? 'valid' : ''}>
                One uppercase letter
              </li>
              <li className={/[a-z]/.test(newPassword) ? 'valid' : ''}>
                One lowercase letter
              </li>
              <li className={/\d/.test(newPassword) ? 'valid' : ''}>
                One number
              </li>
              <li className={/[!@#$%^&*(),.?":{}|<>]/.test(newPassword) ? 'valid' : ''}>
                One special character
              </li>
            </ul>
          </div>

          <button
            type="submit"
            className="btn"
            disabled={loading || newPassword !== confirmPassword || !newPassword.trim() || !confirmPassword.trim() || validatePassword(newPassword)}
          >
            {loading ? (
              <>
                <svg className="spinner" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" style={{ height: '1.25rem', width: '1.25rem' }}>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Resetting Password...</span>
              </>
            ) : 'Reset Password'}
          </button>
        </form>

        <p className="card-subtitle" style={{ marginTop: '1.5rem', fontSize: '0.875rem' }}>
          Remember your password? <a href="/login" className="link">Sign In</a>
        </p>
      </div>
    </main>
  );
}
