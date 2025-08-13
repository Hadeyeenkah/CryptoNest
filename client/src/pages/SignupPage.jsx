import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  initializeApp, getApps, getApp
} from 'firebase/app';
import {
  getAuth, createUserWithEmailAndPassword, updateProfile,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore, setDoc, doc, Timestamp
} from 'firebase/firestore';
import emailjs from '@emailjs/browser';
import './signup.css';

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
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [showLoginPromptModal, setShowLoginPromptModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [emailSendingStatus, setEmailSendingStatus] = useState('');
  const [debugInfo, setDebugInfo] = useState([]);

  const dbRef = useRef(null);
  const authRef = useRef(null);
  const emailjsInitialized = useRef(false);

  // ⚠️ IMPORTANT: Replace these with your EXACT EmailJS credentials
  const EMAILJS_CONFIG = {
    serviceId: 'service_0ihxha4',     // ✅ Verify this in EmailJS dashboard
    templateId: 'template_839zjp6',   // ✅ Verify this in EmailJS dashboard  
    publicKey: '7M64gZ4JQ08yJiuB6'    // ✅ Verify this in EmailJS dashboard
  };

  // Add debug logging function
  const addDebugLog = (message) => {
    console.log(`[DEBUG] ${message}`);
    setDebugInfo(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
  };

  // Enhanced EmailJS initialization with better error handling
  const initializeEmailJS = () => {
    return new Promise((resolve, reject) => {
      try {
        addDebugLog('Starting EmailJS initialization...');
        
        // Check if EmailJS is available
        if (typeof emailjs === 'undefined') {
          throw new Error('EmailJS library is not loaded');
        }

        // Validate configuration
        if (!EMAILJS_CONFIG.publicKey || !EMAILJS_CONFIG.serviceId || !EMAILJS_CONFIG.templateId) {
          throw new Error('EmailJS configuration is incomplete');
        }

        addDebugLog(`Initializing with PublicKey: ${EMAILJS_CONFIG.publicKey.substring(0, 8)}...`);
        
        // Initialize EmailJS
        emailjs.init({
          publicKey: EMAILJS_CONFIG.publicKey,
          // Add additional options for better reliability
          blockHeadless: true,
          limitRate: {
            throttle: 10000, // 10 seconds between emails
          },
        });

        emailjsInitialized.current = true;
        addDebugLog('✅ EmailJS initialized successfully');
        resolve(true);

      } catch (error) {
        addDebugLog(`❌ EmailJS initialization failed: ${error.message}`);
        emailjsInitialized.current = false;
        reject(error);
      }
    });
  };

  // Firebase Initialization and EmailJS Init
  useEffect(() => {
    const initializeServices = async () => {
      try {
        addDebugLog("Initializing services...");
        
        const currentAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

        setAppId(currentAppId);

        // Initialize EmailJS first
        await initializeEmailJS();

        // Initialize Firebase
        let appInstance;
        if (getApps().length === 0) {
          appInstance = initializeApp(firebaseConfig);
        } else {
          appInstance = getApp();
        }

        const firestoreInstance = getFirestore(appInstance);
        const authInstance = getAuth(appInstance);

        setDb(firestoreInstance);
        setAuth(authInstance);
        dbRef.current = firestoreInstance;
        authRef.current = authInstance;

        const unsubscribe = onAuthStateChanged(authInstance, () => {
          setIsFirebaseReady(true);
          setLoading(false);
          addDebugLog('Firebase authentication ready');
        });

        return () => unsubscribe();

      } catch (err) {
        addDebugLog(`Service initialization error: ${err.message}`);
        setError("Failed to initialize application services.");
        setIsFirebaseReady(true);
        setLoading(false);
      }
    };

    initializeServices();
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

      addDebugLog('Firestore: Created user profile and balances.');
      return profileData;
    } catch (err) {
      addDebugLog(`Firestore profile creation error: ${err.message}`);
      throw err;
    }
  };

  const generateWelcomeMessage = async (firstName, username) => {
    try {
      const prompt = `Generate a warm and friendly welcome message for a new user who just signed up for our cryptocurrency investment platform. Their first name is ${firstName} and their username is ${username}. Keep it concise, around 2-3 sentences, and mention Cryptowealth.`;
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      const apiKey = ""; // Add your Gemini API key here if you want AI-generated messages
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

      if (!apiKey || apiKey.trim() === '') {
        addDebugLog("Using default welcome message (no Gemini API key)");
        return `Welcome to Cryptowealth, ${firstName}! Your account with username ${username} has been successfully created. We're excited to have you join our investment community!`;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}`);
      }

      const result = await response.json();
      if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
        return result.candidates[0].content.parts[0].text;
      } else {
        throw new Error("Unexpected response structure");
      }
    } catch (apiError) {
      addDebugLog(`Gemini API error: ${apiError.message}`);
      return `Welcome to Cryptowealth, ${firstName}! Your account with username ${username} has been successfully created. We're excited to have you join our investment community!`;
    }
  };

  // Enhanced email sending function with comprehensive debugging
  const sendWelcomeEmail = async (userEmail, firstName, lastName, username) => {
    try {
      addDebugLog('=== EMAIL SENDING PROCESS STARTED ===');
      
      // Check if EmailJS was properly initialized
      if (!emailjsInitialized.current) {
        throw new Error('EmailJS is not properly initialized');
      }

      setEmailSendingStatus('Preparing welcome email...');
      
      // Validate email address
      const cleanEmail = userEmail.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        throw new Error('Invalid email format');
      }

      addDebugLog(`Recipient email: ${cleanEmail}`);
      addDebugLog(`User: ${firstName} ${lastName} (${username})`);

      // Environment detection
      const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      addDebugLog(`Environment: ${isProduction ? 'Production' : 'Development'}`);
      addDebugLog(`Current URL: ${window.location.href}`);

      setEmailSendingStatus('Building email template...');

      // Enhanced template parameters with explicit recipient handling
      const templateParams = {
        // Primary recipient field (most important)
        to_email: cleanEmail,
        to_name: firstName.trim(),
        user_name: username.trim(),
        
        // Backup recipient fields for compatibility
        recipient_email: cleanEmail,
        user_email: cleanEmail,
        
        // User information
        user_first_name: firstName.trim(),
        user_last_name: lastName.trim(),
        full_name: `${firstName.trim()} ${lastName.trim()}`,
        
        // Platform information
        platform_name: 'Cryptowealth Investment',
        company_name: 'Cryptowealth Investment',
        
        // Email metadata
        from_name: 'Cryptowealth Investment Team',
        reply_to: 'cryptowealthinvestment07@gmail.com',
        support_email: 'cryptowealthinvestment07@gmail.com',
        
        // URLs
        login_url: isProduction ? 'https://cryptowealthinvestment.onrender.com/' : window.location.origin,
        
        // Anti-spam fields
        message_subject: `Welcome to Cryptowealth, ${firstName.trim()}!`,
        sender_name: 'Cryptowealth Investment Team',
        
        // Timestamp for uniqueness
        timestamp: new Date().toISOString(),
        signup_date: new Date().toLocaleDateString(),
        
        // Environment info for debugging
        environment: isProduction ? 'production' : 'development'
      };

      addDebugLog(`Template parameters prepared for ${Object.keys(templateParams).length} fields`);

      setEmailSendingStatus('Sending email via EmailJS...');
      
      // Add delay to ensure all resources are loaded
      await new Promise(resolve => setTimeout(resolve, 1000));

      addDebugLog('Attempting EmailJS send...');

      // Send email with explicit error handling
      const emailResponse = await emailjs.send(
        EMAILJS_CONFIG.serviceId,
        EMAILJS_CONFIG.templateId,
        templateParams,
        {
          publicKey: EMAILJS_CONFIG.publicKey,
          // Additional options for reliability
          limitRate: {
            throttle: 10000
          }
        }
      );

      addDebugLog(`✅ Email sent successfully! Response: ${JSON.stringify(emailResponse)}`);
      setEmailSendingStatus('✅ Welcome email sent successfully! Check your inbox.');
      
      return true;

    } catch (error) {
      addDebugLog(`❌ Email sending failed: ${error.message}`);
      addDebugLog(`Error details: ${JSON.stringify({
        name: error.name,
        status: error.status,
        text: error.text,
        message: error.message
      })}`);

      let errorMessage = '❌ Email service error: ';

      // Enhanced error handling with specific solutions
      if (error.status === 412) {
        errorMessage = '❌ EmailJS service verification required. Your account was created successfully, but the welcome email could not be sent.';
      } else if (error.status === 422) {
        if (error.text && error.text.includes('recipients address is empty')) {
          errorMessage = '❌ EmailJS Template Configuration Error: The "To Email" field in your template must be set to {{to_email}}. Please check your EmailJS template settings.';
        } else {
          errorMessage = '❌ Email template validation failed. Please verify your EmailJS template configuration.';
        }
      } else if (error.status === 400) {
        if (error.text && error.text.includes('service ID not found')) {
          errorMessage = `❌ EmailJS Service ID "${EMAILJS_CONFIG.serviceId}" not found. Please verify in your EmailJS dashboard.`;
        } else if (error.text && error.text.includes('template ID not found')) {
          errorMessage = `❌ EmailJS Template ID "${EMAILJS_CONFIG.templateId}" not found. Please verify in your EmailJS dashboard.`;
        } else if (error.text && error.text.includes('Public Key is invalid')) {
          errorMessage = `❌ EmailJS Public Key is invalid. Please verify in your EmailJS account settings.`;
        } else {
          errorMessage = '❌ EmailJS configuration error. Please check your Service ID, Template ID, and Public Key.';
        }
      } else if (error.status === 401 || error.status === 403) {
        errorMessage = '❌ EmailJS authentication failed. Please verify your account credentials and service permissions.';
      } else if (error.message && error.message.includes('not properly initialized')) {
        errorMessage = '❌ Email service initialization failed. This may be due to network connectivity or browser restrictions.';
      } else if (error.text && error.text.includes('rate limit')) {
        errorMessage = '❌ Email rate limit exceeded. Please wait a moment and try again.';
      } else {
        errorMessage += (error.text || error.message || 'Unknown error. Your account was created successfully.');
      }

      setEmailSendingStatus(errorMessage);
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError('');
    setShowSuccessMessage(false);
    setWelcomeMessage('');
    setEmailSendingStatus('');
    setDebugInfo([]);

    try {
      addDebugLog('Starting signup process...');

      // Create Firebase user account
      const userCredential = await createUserWithEmailAndPassword(
        authRef.current,
        formData.email,
        formData.password
      );
      const user = userCredential.user;

      // Update user profile with display name
      const displayName = `${formData.firstName.trim()} ${formData.lastName.trim()}`;
      await updateProfile(user, { displayName });

      addDebugLog(`User created successfully: ${user.uid}`);

      // Create user profile in Firestore
      const profileResult = await createUserProfileInFirestore(user, appId);

      // Store user data in session storage
      sessionStorage.setItem('user', JSON.stringify({
        uid: user.uid,
        email: user.email,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        username: formData.username.trim(),
        displayName,
        emailVerified: user.emailVerified,
        photoURL: user.photoURL || null,
        role: profileResult.role,
        ...profileResult
      }));

      // Generate personalized welcome message
      const generatedMsg = await generateWelcomeMessage(
        formData.firstName.trim(),
        formData.username.trim()
      );
      setWelcomeMessage(generatedMsg);

      // Send welcome email (non-blocking)
      addDebugLog('Attempting to send welcome email...');
      const emailSent = await sendWelcomeEmail(
        formData.email.trim(),
        formData.firstName.trim(),
        formData.lastName.trim(),
        formData.username.trim()
      );

      if (emailSent) {
        addDebugLog('✅ Welcome email sent successfully');
      } else {
        addDebugLog('⚠️ Welcome email failed, but signup completed');
      }

      // Clear form data
      setFormData({
        firstName: '', lastName: '', username: '', email: '', password: '', confirmPassword: ''
      });

      // Show success message
      setShowSuccessMessage(true);

      // Redirect after delay
      setTimeout(() => {
        addDebugLog('Redirecting to login page...');
        navigate('/login');
      }, 6000);

    } catch (err) {
      addDebugLog(`Signup error: ${err.message}`);

      // Handle specific Firebase Auth errors
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
        setError(err.message || 'Signup failed. Please try again.');
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
    setModalMessage('');
  };

  if (loading && !isFirebaseReady) {
    return (
      <div className="auth-page">
        <p className="loading-message">Initializing application...</p>
      </div>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-container">
        <h2>Create Your Cryptowealth Account</h2>
        <p>Join us and start your investment journey</p>

        {error && <div className="auth-error">{error}</div>}

        {showSuccessMessage && (
          <div className="auth-success">
            <h3>🎉 Account Created Successfully!</h3>
            {welcomeMessage && (
              <p className="mt-2 text-blue-700 font-semibold text-lg">{welcomeMessage}</p>
            )}
            {emailSendingStatus && (
              <p className="mt-2 text-sm" style={{
                color: emailSendingStatus.includes('✅') ? '#10b981' : 
                       emailSendingStatus.includes('❌') ? '#ef4444' : '#f59e0b'
              }}>
                {emailSendingStatus}
              </p>
            )}
            <p className="mt-3 text-gray-600">
              {emailSendingStatus.includes('✅') ? 
                'Please check your email for welcome instructions. Redirecting to login page...' :
                'Redirecting to login page in a few seconds...'
              }
            </p>
            
            {/* Debug information for troubleshooting */}
            {debugInfo.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-gray-500">Debug Information (for troubleshooting)</summary>
                <div className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                  {debugInfo.map((log, index) => (
                    <div key={index} className="font-mono">{log}</div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {!showSuccessMessage && (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="form-row">
              <input
                name="firstName"
                placeholder="First Name"
                value={formData.firstName}
                onChange={handleChange}
                required
                disabled={loading}
                autoComplete="given-name"
              />
              <input
                name="lastName"
                placeholder="Last Name"
                value={formData.lastName}
                onChange={handleChange}
                required
                disabled={loading}
                autoComplete="family-name"
              />
            </div>
            <input
              name="username"
              placeholder="Username"
              value={formData.username}
              onChange={handleChange}
              required
              disabled={loading}
              minLength={3}
              autoComplete="username"
            />
            <input
              name="email"
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={loading}
              autoComplete="email"
            />
            <input
              name="password"
              type="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              required
              disabled={loading}
              minLength={6}
              autoComplete="new-password"
            />
            <input
              name="confirmPassword"
              type="password"
              placeholder="Confirm Password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              disabled={loading}
              autoComplete="new-password"
            />

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
        showConfirmButton={!!modalMessage}
      />
    </main>
  );
}

export default SignupPage;
