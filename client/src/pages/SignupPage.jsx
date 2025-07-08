import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  initializeApp, getApps, getApp
} from 'firebase/app';
import {
  getAuth, createUserWithEmailAndPassword, updateProfile,
  sendEmailVerification, onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore, setDoc, doc, Timestamp
} from 'firebase/firestore';
import './signup.css';

function SignupPage() {
  const navigate = useNavigate();

  // Firebase state refs
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [appId, setAppId] = useState(null);
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);

  const [formData, setFormData] = useState({
    firstName: '', lastName: '', username: '', email: '',
    password: '', confirmPassword: ''
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);

  const dbRef = useRef(null);
  const authRef = useRef(null);

  // Firebase Initialization
  useEffect(() => {
    console.log("SignupPage: Initializing Firebase...");
    const currentAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

    setAppId(currentAppId);

    let appInstance;
    if (getApps().length === 0) {
      appInstance = initializeApp(firebaseConfig);
    } else {
      appInstance = getApp();
    }

    try {
      const firestoreInstance = getFirestore(appInstance);
      const authInstance = getAuth(appInstance);

      setDb(firestoreInstance);
      setAuth(authInstance);
      dbRef.current = firestoreInstance;
      authRef.current = authInstance;

      const unsubscribe = onAuthStateChanged(authInstance, () => {
        setIsFirebaseReady(true);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (err) {
      console.error("Firebase initialization error:", err);
      setError("Failed to initialize application services.");
      setIsFirebaseReady(true);
      setLoading(false);
    }
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    const { firstName, lastName, username, email, password, confirmPassword } = formData;
    if (!firstName.trim()) return setError('Please enter your first name.') || false;
    if (!lastName.trim()) return setError('Please enter your last name.') || false;
    if (!username.trim()) return setError('Please enter a username.') || false;
    if (username.length < 3) return setError('Username must be at least 3 characters.') || false;
    if (!email.trim()) return setError('Please enter your email.') || false;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return setError('Please enter a valid email.') || false;

    if (!password) return setError('Please enter a password.') || false;
    if (password.length < 6) return setError('Password must be at least 6 characters.') || false;
    if (password !== confirmPassword) return setError('Passwords do not match.') || false;

    return true;
  };

  // 🔥 FIXED path here (profile/data to make 6 segments)
  const createUserProfileInFirestore = async (user, currentAppId) => {
    try {
      const userProfileDocRef = doc(
        dbRef.current,
        `artifacts/${currentAppId}/users/${user.uid}/profile/data`
      );

      const userBalanceDocRef = doc(
        dbRef.current,
        `artifacts/${currentAppId}/users/${user.uid}/balances/current`
      );

      const profileData = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        username: formData.username.trim(),
        email: formData.email.trim(),
        uid: user.uid,
        displayName: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
        emailVerified: user.emailVerified,
        photoURL: user.photoURL || null,
        role: 'user',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await setDoc(userProfileDocRef, profileData);
      await setDoc(userBalanceDocRef, {
        USDT: 0.00, BTC: 0.00, ETH: 0.00,
        updatedAt: Timestamp.now()
      });

      console.log('Firestore: Created user profile and balances.');
      return profileData;
    } catch (err) {
      console.error('Firestore profile creation error:', err);
      throw err;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError('');
    setShowVerificationMessage(false);

    try {
      const userCredential = await createUserWithEmailAndPassword(authRef.current, formData.email, formData.password);
      const user = userCredential.user;

      const displayName = `${formData.firstName.trim()} ${formData.lastName.trim()}`;
      await updateProfile(user, { displayName });

      await sendEmailVerification(user);
      console.log('Email verification sent to:', user.email);

      const profileResult = await createUserProfileInFirestore(user, appId);

      sessionStorage.setItem('user', JSON.stringify({
        uid: user.uid, email: user.email,
        firstName: formData.firstName.trim(), lastName: formData.lastName.trim(),
        username: formData.username.trim(), displayName,
        emailVerified: user.emailVerified, photoURL: user.photoURL || null,
        role: profileResult.role, ...profileResult
      }));

      setFormData({
        firstName: '', lastName: '', username: '', email: '', password: '', confirmPassword: ''
      });

      setShowVerificationMessage(true);
      navigate('/email-verification-pending');
    } catch (err) {
      console.error('Signup error:', err);
      const errorMap = {
        'auth/email-already-in-use': 'An account with this email already exists.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/operation-not-allowed': 'Account creation is disabled.',
        'auth/weak-password': 'Password is too weak.',
        'auth/network-request-failed': 'Network error. Check your connection.',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
      };

      if (err.code && errorMap[err.code]) {
        setError(errorMap[err.code]);
        if (err.code === 'auth/email-already-in-use') {
          setTimeout(() => {
            if (window.confirm('Would you like to go to the login page instead?')) {
              navigate('/login');
            }
          }, 3000);
        }
      } else {
        setError(err.message || 'Signup failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="auth-page"><p>Initializing...</p></div>;
  }

  return (
    <main className="auth-page">
      <div className="auth-container">
        <h2>Create Your Account</h2>
        <p>Join us and start your journey</p>

        {error && <div className="auth-error">{error}</div>}
        {showVerificationMessage && <div className="auth-success">
          ✅ A verification email was sent. Please check your inbox.
        </div>}

        {!showVerificationMessage && (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="form-row">
              <input name="firstName" placeholder="First Name" value={formData.firstName}
                onChange={handleChange} required disabled={loading} />
              <input name="lastName" placeholder="Last Name" value={formData.lastName}
                onChange={handleChange} required disabled={loading} />
            </div>
            <input name="username" placeholder="Username" value={formData.username}
              onChange={handleChange} required disabled={loading} minLength={3} />
            <input name="email" type="email" placeholder="Email" value={formData.email}
              onChange={handleChange} required disabled={loading} />
            <input name="password" type="password" placeholder="Password" value={formData.password}
              onChange={handleChange} required disabled={loading} minLength={6} />
            <input name="confirmPassword" type="password" placeholder="Confirm Password"
              value={formData.confirmPassword} onChange={handleChange} required disabled={loading} />
            <button type="submit" disabled={loading}>
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>
        )}

        <p className="auth-switch">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </main>
  );
}

export default SignupPage;
