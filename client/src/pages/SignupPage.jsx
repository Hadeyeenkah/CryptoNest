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

  const dbRef = useRef(null);
  const authRef = useRef(null);

  // Updated EmailJS Configuration with your new credentials
  // TODO: Replace these with the EXACT IDs from your EmailJS dashboard
  const EMAILJS_CONFIG = {
    serviceId: 'service_0ihxha4', // ⚠️ VERIFY THIS ID in your EmailJS dashboard
    templateId: 'template_839zjp6', // ⚠️ VERIFY THIS ID in your EmailJS dashboard
    publicKey: '7M64gZ4JQ08yJiuB6' // ⚠️ VERIFY THIS KEY in your EmailJS dashboard
  };

  // Firebase Initialization and EmailJS Init
  useEffect(() => {
    console.log("SignupPage: Initializing Firebase...");
    const currentAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

    setAppId(currentAppId);

    // Initialize EmailJS with the public key
    if (EMAILJS_CONFIG.publicKey) {
      try {
        emailjs.init(EMAILJS_CONFIG.publicKey);
        console.log("✅ EmailJS initialized successfully with new credentials");
        console.log("EmailJS Config:", {
          serviceId: EMAILJS_CONFIG.serviceId,
          templateId: EMAILJS_CONFIG.templateId,
          publicKeyPresent: !!EMAILJS_CONFIG.publicKey
        });
      } catch (emailjsError) {
        console.error("❌ EmailJS initialization failed:", emailjsError);
        setError("Failed to initialize email service. Please try again later.");
      }
    } else {
      console.error("❌ EmailJS public key is not configured.");
      setError("Email service is not configured. Please contact support.");
    }

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
      const prompt = `Generate a warm and friendly welcome message for a new user who just signed up for our cryptocurrency investment platform. Their first name is ${firstName} and their username is ${username}. Keep it concise, around 2-3 sentences, and mention Cryptowealth.`;
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      const apiKey = ""; // Add your Gemini API key here if you want AI-generated messages
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

      // Check for an empty API key to prevent the 403 error from being logged
      if (!apiKey || apiKey.trim() === '') {
        console.warn("Gemini API key is not configured. Using a default welcome message.");
        return `Welcome to Cryptowealth, ${firstName}! Your account with username ${username} has been successfully created. We're excited to have you join our investment community!`;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API call failed with status ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
        return result.candidates[0].content.parts[0].text;
      } else {
        console.error("Gemini API: Unexpected response structure or no content.");
        return `Welcome to Cryptowealth, ${firstName}! Your account with username ${username} has been successfully created. We're excited to have you join our investment community!`;
      }
    } catch (apiError) {
      console.error("Error calling Gemini API:", apiError);
      return `Welcome to Cryptowealth, ${firstName}! Your account with username ${username} has been successfully created. We're excited to have you join our investment community!`;
    }
  };

  // Enhanced function to send the welcome email using EmailJS with improved delivery
  const sendWelcomeEmail = async (userEmail, firstName, lastName, username) => {
    try {
      setEmailSendingStatus('Preparing to send welcome email...');

      console.log('=== EMAIL SENDING DEBUG INFO (NEW CONFIG) ===');
      console.log('1. User Email:', userEmail);
      console.log('2. First Name:', firstName);
      console.log('3. Username:', username);
      console.log('4. EmailJS Config:', {
        serviceId: EMAILJS_CONFIG.serviceId,
        templateId: EMAILJS_CONFIG.templateId,
        publicKeyPresent: !!EMAILJS_CONFIG.publicKey
      });

      // Validate email address
      if (!userEmail || userEmail.trim() === '') {
        throw new Error('❌ Recipient email address is empty or invalid.');
      }

      const cleanEmail = userEmail.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        throw new Error('❌ Invalid email format.');
      }

      // Validate EmailJS configuration
      if (!EMAILJS_CONFIG.serviceId || !EMAILJS_CONFIG.templateId || !EMAILJS_CONFIG.publicKey) {
        throw new Error('❌ EmailJS configuration is incomplete. Please check your credentials.');
      }

      setEmailSendingStatus('Building email template with new configuration...');

      // Template parameters matching your EmailJS template variables
      // IMPORTANT: Make sure your EmailJS template has the 'To Email' field set to {{to_email}}
      const templateParams = {
        to_email: cleanEmail, // This is the recipient email - CRITICAL!
        to_name: firstName.trim(), // Used in template as {{to_name}}
        user_name: username.trim(), // Used in template as {{user_name}}
        reply_to: 'cryptowealthinvestment07@gmail.com',
        from_name: 'Cryptowealth Investment Team',
        // Additional parameters for better delivery and template compatibility
        recipient_email: cleanEmail, // Backup parameter name
        user_first_name: firstName.trim(),
        user_last_name: lastName.trim(),
        full_name: `${firstName.trim()} ${lastName.trim()}`,
        platform_name: 'Cryptowealth Investment',
        login_url: 'https://cryptowealthinvestment.onrender.com/',
        support_email: 'cryptowealthinvestment07@gmail.com',
        // Anti-spam parameters for better inbox delivery
        message_subject: `Welcome to Cryptowealth, ${firstName.trim()}!`,
        sender_name: 'Cryptowealth Investment Team',
        company_name: 'Cryptowealth Investment'
      };

      console.log('5. Template Parameters for EmailJS:', templateParams);

      setEmailSendingStatus('Sending welcome email via EmailJS...');
      console.log('6. Attempting to send email with new service configuration...');

      // Add a small delay to ensure EmailJS is fully initialized
      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await emailjs.send(
        EMAILJS_CONFIG.serviceId,
        EMAILJS_CONFIG.templateId,
        templateParams,
        EMAILJS_CONFIG.publicKey
      );

      console.log('7. ✅ Email sent successfully with new configuration!', response);
      setEmailSendingStatus('✅ Welcome email sent successfully! Check your inbox.');
      
      // Log success for debugging
      console.log('Email delivery status:', response.status);
      console.log('Email delivery text:', response.text);
      
      return true;

    } catch (error) {
      console.log('8. ❌ Email sending failed with new configuration!');
      console.error('Error object:', error);

      let errorMessage = '❌ Email service temporarily unavailable: ';

      // Handle specific EmailJS error codes with more detailed messages
      if (error.status === 412) {
        errorMessage = '❌ Email service account needs verification. Your signup was successful, but the welcome email could not be sent. Please contact support at cryptowealthinvestment07@gmail.com.';
      } else if (error.status === 422) {
        if (error.text && error.text.includes('recipients address is empty')) {
          errorMessage = '❌ EmailJS Template Error: The recipient email field is not properly configured. Please check your EmailJS template "To Email" field is set to {{to_email}}';
        } else if (error.text && error.text.includes('template')) {
          errorMessage = '❌ Email template configuration issue detected. Your signup was successful, but the welcome email failed to send.';
        } else {
          errorMessage = '❌ Email template validation error. Your signup was successful, but the welcome email failed to send.';
        }
      } else if (error.status === 400) {
        if (error.text && error.text.includes('service ID not found')) {
          errorMessage = `❌ Service ID "${EMAILJS_CONFIG.serviceId}" not found in your EmailJS account. Please verify the Service ID in your EmailJS dashboard at https://dashboard.emailjs.com/admin`;
        } else if (error.text && error.text.includes('template ID not found')) {
          errorMessage = `❌ Template ID "${EMAILJS_CONFIG.templateId}" not found in your EmailJS account. Please verify the Template ID in your EmailJS dashboard.`;
        } else if (error.text && error.text.includes('Public Key is invalid')) {
          errorMessage = `❌ Public Key "${EMAILJS_CONFIG.publicKey}" is invalid. Please verify the Public Key in your EmailJS dashboard account section.`;
        } else {
          errorMessage = '❌ Email service configuration error (400). Please check your EmailJS Service ID, Template ID, and Public Key.';
        }
      } else if (error.status === 401) {
        errorMessage = '❌ Email service authentication failed. Your signup was successful, but the welcome email could not be sent.';
      } else if (error.status === 403) {
        errorMessage = '❌ Email service access denied. Your signup was successful, but the welcome email could not be sent due to service restrictions.';
      } else if (error.text && error.text.includes('suspended')) {
        errorMessage = '❌ Email service is temporarily suspended. Your account was created successfully, but the welcome email could not be sent.';
      } else if (error.text && error.text.includes('template')) {
        errorMessage = '❌ Email template not found. Your signup was successful, but there was an issue with the email template configuration.';
      } else if (error.text) {
        errorMessage += error.text;
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Unknown error occurred. Your account was created successfully, but the welcome email could not be sent.';
      }

      setEmailSendingStatus(errorMessage);
      
      // Log detailed error information for debugging
      console.log('Detailed error information:', {
        status: error.status,
        text: error.text,
        message: error.message,
        name: error.name
      });
      
      // Don't throw the error - just log it and continue signup process
      console.log('Continuing with signup process despite email failure...');
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

    try {
      console.log('Creating user account...');

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

      console.log('User created successfully:', user.uid);

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

      // Try to send welcome email with new configuration (non-blocking)
      console.log('Attempting to send welcome email with new EmailJS configuration...');
      const emailSent = await sendWelcomeEmail(
        formData.email.trim(),
        formData.firstName.trim(),
        formData.lastName.trim(),
        formData.username.trim()
      );

      if (emailSent) {
        console.log('✅ Welcome email was sent successfully');
      } else {
        console.log('⚠️ Welcome email failed to send, but signup completed');
      }

      // Clear form data
      setFormData({
        firstName: '', lastName: '', username: '', email: '', password: '', confirmPassword: ''
      });

      // Show success message regardless of email status
      setShowSuccessMessage(true);

      // Redirect to login page after 6 seconds (increased time to show email status)
      setTimeout(() => {
        console.log('Redirecting to login page...');
        navigate('/login');
      }, 6000);

    } catch (err) {
      console.error('Signup error:', err);

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