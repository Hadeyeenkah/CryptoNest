import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './login.css';
function LoginPage() {
    const navigate = useNavigate();
    const {
        login,
        isAuthenticated,
        authChecked,
        userProfile,
        loading: authContextLoading,
        isAdmin,
        refreshProfile,
        auth
    } = useAuth();

    const [formData, setFormData] = useState({ email: '', password: '' });
    const [error, setError] = useState('');
    const [localLoading, setLocalLoading] = useState(false);

    useEffect(() => {
        if (authChecked && isAuthenticated && userProfile) {
            console.log("LoginPage: Auth ready, redirecting user.");
            const isEmailVerified = userProfile.emailVerified !== undefined ? userProfile.emailVerified : true;

            let redirectPath = !isEmailVerified
                ? '/email-verification-pending'
                : (isAdmin ? '/admin' : '/dashboard');

            navigate(redirectPath);
        } else if (authChecked && !isAuthenticated && !authContextLoading) {
            console.log("LoginPage: Auth checked, no user, showing login form.");
            setLocalLoading(false);
        }
    }, [authChecked, isAuthenticated, userProfile, authContextLoading, isAdmin, navigate]);

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(''), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const validateForm = () => {
        const { email, password } = formData;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!email.trim()) return setError('Please enter your email address.') || false;
        if (!emailRegex.test(email)) return setError('Please enter a valid email address.') || false;
        if (!password) return setError('Please enter your password.') || false;

        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        setLocalLoading(true);
        setError('');

        const { success, error: loginError } = await login(formData.email, formData.password);

        if (success) {
            console.log("Login successful, manually refreshing profile.");
            // Ensure auth.currentUser is available before calling refreshProfile
            // In a successful login, auth.currentUser should be populated
            if (auth.currentUser) {
                await refreshProfile(auth.currentUser);
            } else {
                console.warn("Auth.currentUser is null after successful login, profile might not refresh immediately.");
            }
        } else {
            console.error('Login failed:', loginError);
            setError(loginError || 'Login failed. Please try again.');
        }
        setLocalLoading(false);
    };

    if (authContextLoading || !authChecked) {
        return (
            <div className="auth-page loading-screen">
                <p>Loading authentication...</p>
            </div>
        );
    }

    return (
        <main className="auth-page">
            <div className="auth-container">
                <div className="auth-header">
                    <h2 className="auth-title">Welcome Back!</h2>
                    <p className="auth-subtitle">Sign in to access your dashboard.</p>
                </div>

                {error && (
                    <div className="auth-error" role="alert">
                        <span className="error-icon">⚠️</span>
                        {error}
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
                            value={formData.email}
                            onChange={handleChange}
                            required
                            autoComplete="email"
                            disabled={localLoading}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            placeholder="Enter your password"
                            value={formData.password}
                            onChange={handleChange}
                            required
                            autoComplete="current-password"
                            disabled={localLoading}
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary full-width"
                        disabled={localLoading || !formData.email || !formData.password}
                    >
                        {localLoading ? (
                            <>
                                <span className="loading-spinner"></span> Signing In...
                            </>
                        ) : 'Sign In'}
                    </button>
                </form>

                <div className="auth-links">
                    <Link to="/forgot-password" className="auth-link"> {/* Updated link */}
                        Forgot your password?
                    </Link>
                </div>

                <p className="auth-switch">
                    Don't have an account? <Link to="/signup" className="auth-link">Sign Up</Link>
                </p>
            </div>
        </main>
    );
}

export default LoginPage;
