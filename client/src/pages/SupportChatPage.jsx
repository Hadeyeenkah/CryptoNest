import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app'; // Import getApp to get the initialized app
import { useAuth } from '../contexts/AuthContext.jsx'; // Corrected import path
import './SupportChat.css'; // New CSS file for this page

// Reusable Modal Component (can be shared from DashboardPage or AdminDashboard if available)
const Modal = ({ show, title, children, onClose, showCloseButton = true }) => {
  if (!show) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          {showCloseButton && (
            <button onClick={onClose} className="modal-close">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );
};

const SupportChatPage = () => {
  const navigate = useNavigate();
  // Consume Firebase state from AuthContext
  const { userId, user, isAuthReady, authError, appId } = useAuth();

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoModalTitle, setInfoModalTitle] = useState('');
  const [infoModalMessage, setInfoModalMessage] = useState('');

  // Initialize Firebase Functions
  // Assumes Firebase app is already initialized via firebase.js and AuthContext
  const functions = getFunctions(getApp());

  const showModal = useCallback((title, msg) => {
    setInfoModalTitle(title);
    setInfoModalMessage(msg);
    setShowInfoModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowInfoModal(false);
    setInfoModalTitle('');
    setInfoModalMessage('');
  }, []);

  // Handle support request submission
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    if (!subject.trim() || !message.trim()) {
      showModal('Validation Error', 'Please fill in both subject and message fields.');
      return;
    }

    if (!isAuthReady || !userId || !appId || !user?.email) {
      showModal('System Error', 'Authentication not ready or user information missing. Please try logging in again.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Call the Cloud Function to send the support email
      const sendSupportEmailCallable = httpsCallable(functions, 'sendSupportEmail');
      const result = await sendSupportEmailCallable({
        userId: userId,
        appId: appId,
        userEmail: user.email, // Pass user's email to the function
        subject: subject,
        message: message,
      });

      if (result.data.success) {
        showModal('Success', 'Your support request has been sent. We will get back to you shortly!');
        setSubject('');
        setMessage('');
      } else {
        showModal('Submission Failed', result.data.message || 'Failed to send your support request. Please try again.');
      }
    } catch (error) {
      console.error('Error sending support email:', error);
      showModal('Error', `An unexpected error occurred: ${error.message}. Please try again.`);
    } finally {
      setIsSubmitting(false);
    }
  }, [subject, message, isAuthReady, userId, appId, user, functions, showModal]);

  // Redirect if not authenticated
  useEffect(() => {
    if (isAuthReady && !userId) {
      navigate('/login');
    }
  }, [isAuthReady, userId, navigate]);

  // Loading state for initial auth check
  if (!isAuthReady || !userId) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading support page...</p>
        {authError && (
          <p style={{ color: "#ef4444", fontSize: "14px", marginTop: "10px" }}>
            Authentication Error: {authError}
          </p>
        )}
        {/* Basic loading screen styles for consistency, usually defined globally */}
        <style>{`
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
        `}</style>
      </div>
    );
  }

  return (
    <div className="support-chat-page-container">
      <div className="support-chat-card">
        <h2>Contact Support</h2>
        <p className="card-description">
          Please fill out the form below with your query. We aim to respond within 24-48 hours.
        </p>

        <form className="support-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="subject">Subject:</label>
            <input
              type="text"
              id="subject"
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="input-field"
              placeholder="e.g., Withdrawal Issue, Account Access"
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="message">Message:</label>
            <textarea
              id="message"
              name="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows="6"
              required
              className="input-field"
              placeholder="Describe your issue or question in detail..."
              disabled={isSubmitting}
            ></textarea>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="button-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending...' : 'Send Message'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="button-secondary"
              disabled={isSubmitting}
            >
              ← Back to Dashboard
            </button>
          </div>
        </form>
      </div>

      {/* Modal for messages */}
      <Modal
        show={showInfoModal}
        title={infoModalTitle}
        onClose={closeModal}
      >
        <p className="modal-description">{infoModalMessage}</p>
      </Modal>
    </div>
  );
};

export default SupportChatPage;
