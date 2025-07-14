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
import emailjs from '@emailjs/browser'; // Add this import
import './signup.css'; // Assuming this CSS file exists for styling

// Custom Modal Component for confirmations and messages
const CustomModal = ({ message, onConfirm, onCancel, showConfirmButton = true }) => {
  if (!message) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full mx-4">
        <p className="text-lg text-gray-800 mb-4">{message}</p>
        <div className="flex justify-end space-x-3">
          {showConfirmButton && (
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            >
              Confirm
            </button>
          )}
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

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
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [showLoginPromptModal, setShowLoginPromptModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [emailSendingStatus, setEmailSendingStatus] = useState(''); // New state for email status

  const dbRef = useRef(null);
  const authRef = useRef(null);

  // EmailJS Configuration - Replace with your actual EmailJS credentials
  const EMAILJS_CONFIG = {
    serviceId: 'service_abc123', // Example: service_abc123 (get from EmailJS dashboard)
    templateId: 'template_xyz789', // Example: template_xyz789 (get from EmailJS dashboard)
    publicKey: 'user_def456ghi789' // Example: user_def456ghi789 (get from EmailJS dashboard)
  };

  // Firebase Initialization
  useEffect(() => {
    console.log("SignupPage: Initializing Firebase...");
    const currentAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

    setAppId(currentAppId);

    // Initialize EmailJS
    emailjs.init(EMAILJS_CONFIG.publicKey);

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
    if (!firstName.trim()) { setError('Please enter your first name.'); return false; }
    if (!lastName.trim()) { setError('Please enter your last name.'); return false; }
    if (!username.trim()) { setError('Please enter a username.'); return false; }
    if (username.length < 3) { setError('Username must be at least 3 characters.'); return false; }
    if (!email.trim()) { setError('Please enter your email.'); return false; }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { setError('Please enter a valid email.'); return false; }

    if (!password) { setError('Please enter a password.'); return false; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return false; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return false; }

    return true;
  };

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

  const generateWelcomeMessage = async (firstName, username) => {
    try {
      const prompt = `Generate a warm and friendly welcome message for a new user who just signed up for our platform. Their first name is ${firstName} and their username is ${username}. Also, remind them to check their email for verification. Keep it concise, around 2-3 sentences.`;
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      const apiKey = ""; // Leave this as-is; Canvas will provide it at runtime
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
        return result.candidates[0].content.parts[0].text;
      } else {
        console.error("Gemini API: Unexpected response structure or no content.");
        return `Welcome to our platform, ${firstName}! Your username ${username} is now active. Please check your email for verification.`;
      }
    } catch (apiError) {
      console.error("Error calling Gemini API:", apiError);
      return `Welcome to our platform, ${firstName}! Your username ${username} is now active. Please check your email for verification.`;
    }
  };

  // New function to send welcome email using EmailJS
  const sendWelcomeEmail = async (userEmail, firstName, username, welcomeMessage) => {
    try {
      setEmailSendingStatus('Sending welcome email...');
      
      const templateParams = {
        to_email: userEmail,
        to_name: firstName,
        username: username,
        welcome_message: welcomeMessage,
        platform_name: 'Your Platform Name', // Replace with your platform name
        support_email: 'support@yourplatform.com', // Replace with your support email
        login_url: window.location.origin + '/login',
        verification_reminder: 'Please check your email for a verification link to complete your account setup.'
      };

      const response = await emailjs.send(
        EMAILJS_CONFIG.serviceId,
        EMAILJS_CONFIG.templateId,
        templateParams
      );

      console.log('Welcome email sent successfully:', response.status, response.text);
      setEmailSendingStatus('Welcome email sent successfully! ✅');
      return true;
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      setEmailSendingStatus('Failed to send welcome email. Please contact support if needed.');
      return false;
    }
  };

  // Alternative function using a backend API (if you prefer server-side email sending)
  const sendWelcomeEmailViaAPI = async (userEmail, firstName, username, welcomeMessage) => {
    try {
      setEmailSendingStatus('Sending welcome email...');
      
      const response = await fetch('/api/send-welcome-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userEmail,
          firstName: firstName,
          username: username,
          welcomeMessage: welcomeMessage
        })
      });

      if (response.ok) {
        console.log('Welcome email sent successfully via API');
        setEmailSendingStatus('Welcome email sent successfully! ✅');
        return true;
      } else {
        throw new Error('Failed to send email via API');
      }
    } catch (error) {
      console.error('Failed to send welcome email via API:', error);
      setEmailSendingStatus('Failed to send welcome email. Please contact support if needed.');
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError('');
    setShowVerificationMessage(false);
    setWelcomeMessage('');
    setEmailSendingStatus('');

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

      // Generate welcome message
      const generatedMsg = await generateWelcomeMessage(formData.firstName.trim(), formData.username.trim());
      setWelcomeMessage(generatedMsg);

      // Send actual welcome email (choose one method)
      await sendWelcomeEmail(
        formData.email,
        formData.firstName.trim(),
        formData.username.trim(),
        generatedMsg
      );

      // Alternative: Use backend API instead
      // await sendWelcomeEmailViaAPI(
      //   formData.email,
      //   formData.firstName.trim(),
      //   formData.username.trim(),
      //   generatedMsg
      // );

      setFormData({
        firstName: '', lastName: '', username: '', email: '', password: '', confirmPassword: ''
      });

      setShowVerificationMessage(true);
      
      // Navigate to email verification pending page after showing welcome message
      setTimeout(() => {
        navigate('/email-verification-pending');
      }, 4000); // Increased to 4 seconds to show email status
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
          setModalMessage('An account with this email already exists. Would you like to go to the login page instead?');
          setShowLoginPromptModal(true);
        }
      } else {
        setError(err.message || 'Signup failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleModalConfirm = () => {
    setShowLoginPromptModal(false);
    navigate('/login');
  };

  const handleModalCancel = () => {
    setShowLoginPromptModal(false);
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
        {showVerificationMessage && (
          <div className="auth-success">
            <p>✅ A verification email was sent. Please check your inbox.</p>
            {welcomeMessage && (
              <p className="mt-2 text-blue-700 font-semibold">{welcomeMessage}</p>
            )}
            {emailSendingStatus && (
              <p className="mt-2 text-green-600 text-sm">{emailSendingStatus}</p>
            )}
          </div>
        )}

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

      <CustomModal
        message={modalMessage}
        onConfirm={handleModalConfirm}
        onCancel={handleModalCancel}
        showConfirmButton={true}
      />
    </main>
  );
}

export default SignupPage;