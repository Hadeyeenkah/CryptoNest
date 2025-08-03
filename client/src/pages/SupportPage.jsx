// src/pages/SupportPage.jsx
import React, { useEffect, useState, useRef } from 'react';
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase'; // Assuming db is initialized from firebase.js
import emailjs from '@emailjs/browser'; // npm install @emailjs/browser
import { useAuth } from '../contexts/AuthContext.jsx'; // Import useAuth to get userId and appId
import { useNavigate } from 'react-router-dom'; // Import useNavigate for redirection

function SupportPage() {
  const { user, userId, appId, isAuthReady } = useAuth(); // Get authenticated user, userId, appId, and auth readiness
  const navigate = useNavigate(); // Initialize useNavigate

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [communicationMethod, setCommunicationMethod] = useState('firestore'); // 'firestore', 'email', 'telegram'
  const [adminEmail, setAdminEmail] = useState('jzjz476@gmail.com'); // Replace with your actual admin email
  const [isLoading, setIsLoading] = useState(false);
  const [chatInitialized, setChatInitialized] = useState(false); // New state to track chat initialization

  // Use the authenticated userId directly. This will be null if user is not logged in
  const currentUserId = userId; 
  const adminId = 'admin'; // Consistent admin ID for chat messages

  // Construct conversationId only if currentUserId is available
  const conversationId = currentUserId ? [currentUserId, adminId].sort().join('-') : null;

  const chatRef = useRef(null);

  // Initialize EmailJS (do this once in your app)
  useEffect(() => {
    // IMPORTANT: Replace "T_KOAe7VGjHx7iQUY" with your actual EmailJS Public Key
    emailjs.init("T_KOAe7VGjHx7iQUY"); // Public key updated here
  }, []);

  // Effect to handle redirection if not authenticated or not ready
  useEffect(() => {
    // If auth is ready and there's no user, redirect to login
    if (isAuthReady && !user) {
      console.log("Auth not ready or user not logged in. Redirecting to /login.");
      navigate('/login'); // Redirect to login page
    }
  }, [isAuthReady, user, navigate]);


  // Load messages in real-time from Firestore for chat methods
  useEffect(() => {
    let unsubscribe = () => {}; // Initialize unsubscribe function

    // Only proceed if Firebase is ready, user is authenticated, and conversationId is valid
    if (!db || !isAuthReady || !user || !currentUserId || !conversationId) {
      console.log("Chat prerequisites not met (db, auth, user, userId, or conversationId missing). Skipping chat listener setup.");
      setMessages([]); // Clear messages if not ready
      setChatInitialized(false); // Reset initialization state
      return;
    }

    const conversationDocRef = doc(db, 'chats', conversationId);
    const messagesCollectionRef = collection(db, 'chats', conversationId, 'messages');

    const setupChatListener = async () => {
      try {
        const docSnap = await getDoc(conversationDocRef);
        if (!docSnap.exists()) {
          // Create the conversation document if it doesn't exist
          await setDoc(conversationDocRef, {
            userIds: [currentUserId, adminId], // Store both user IDs for easy lookup
            createdAt: serverTimestamp(),
            lastMessageText: '',
            lastMessageTimestamp: serverTimestamp(),
          });
          console.log("Created new conversation document in Firestore.");
        }

        // Now that the conversation document is guaranteed to exist, set up the message listener
        const q = query(messagesCollectionRef, orderBy('timestamp', 'asc'));
        unsubscribe = onSnapshot(q, (snapshot) => {
          const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          setMessages(msgs);
          scrollToBottom();
          setChatInitialized(true); // Mark chat as initialized after first successful fetch
        }, (error) => {
          console.error("Error fetching real-time messages (onSnapshot):", error);
          // This error is likely a permission issue if the rule evaluation fails during live updates
          setChatInitialized(false); // Mark as not initialized on error
        });

      } catch (error) {
        console.error("Error during initial chat setup (getDoc/setDoc):", error);
        // This error is likely a permission issue if the initial getDoc/setDoc fails
        setChatInitialized(false); // Mark as not initialized on error
      }
    };

    setupChatListener();

    // Cleanup function for the listener
    return () => unsubscribe();
  }, [db, isAuthReady, user, currentUserId, conversationId, adminId]); // Added user and isAuthReady to dependencies

  const sendMessage = async () => {
    if (!input.trim()) return;
    setIsLoading(true);

    try {
      if (communicationMethod === 'firestore') {
        await sendFirestoreMessage();
      } else if (communicationMethod === 'email') {
        await sendEmailMessage();
      } else if (communicationMethod === 'telegram') {
        await sendTelegramMessage();
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.'); // Use a custom modal instead of alert in production
    } finally {
      setIsLoading(false);
    }
  };

  const sendFirestoreMessage = async () => {
    // Ensure db and currentUserId are available before attempting to send
    if (!db || !currentUserId) {
      throw new Error("Firestore or User ID not available to send message.");
    }
    const messagesCollectionRef = collection(db, 'chats', conversationId, 'messages');

    // Add message to Firestore
    await addDoc(messagesCollectionRef, {
      sender: currentUserId, // Sender is the current user's actual UID
      recipient: adminId,
      text: input,
      timestamp: serverTimestamp(),
      method: 'firestore' // Indicate method for display/debugging
    });

    // Update conversation metadata (last message)
    const conversationDocRef = doc(db, 'chats', conversationId);
    await setDoc(conversationDocRef, {
      lastMessageText: input,
      lastMessageTimestamp: serverTimestamp(),
    }, { merge: true });

    setInput('');
  };

  const sendEmailMessage = async () => {
    // Ensure user object is available for email
    if (!user) {
      throw new Error("User not authenticated for email support.");
    }
    const templateParams = {
      from_name: `User ${currentUserId} (${user?.email || 'N/A'})`, // Include user's email if available
      to_email: adminEmail,
      message: input,
      reply_to: user?.email || `user.${currentUserId}@yourcompany.com`, // Reply-to user's email or a generated one
      user_id: currentUserId,
      timestamp: new Date().toLocaleString()
    };

    // IMPORTANT: Ensure your Service ID and Template ID are correct strings
    await emailjs.send(
      'service_fsc9y3b', // Service ID updated here (as a string)
      'template_62mg19p', // Template ID updated here (as a string)
      templateParams // templateParams is now correctly passed
    );

    // Add to local messages for immediate display (not persisted in Firestore for email method)
    const newMessage = {
      id: Date.now().toString(), // Client-side ID for display
      sender: currentUserId,
      text: input,
      timestamp: new Date(),
      method: 'email'
    };
    setMessages(prev => [...prev, newMessage]);
    setInput('');
  };

  const sendTelegramMessage = async () => {
    // IMPORTANT: Replace 'YOUR_BOT_TOKEN' and 'YOUR_ADMIN_CHAT_ID' with your actual Telegram credentials
    // These values were provided by the user in a previous turn and are now correctly formatted as strings.
    const botToken = '7825491470:AAF6P_xQCcP0bOXqIG0qKF3Hyl6fNgnf9tY'; 
    const chatId = '5634991894'; 
    
    // This check is now redundant since the values are hardcoded and correct.
    // if (botToken === 'YOUR_BOT_TOKEN' || chatId === 'YOUR_ADMIN_CHAT_ID') {
    //     throw new Error("Telegram bot token or chat ID not configured.");
    // }

    // Include the user's ID and conversation ID for easier identification by the admin/Cloud Function
    const messageText = `🔔 New Support Message\n\nUser ID: ${currentUserId}\nConversation ID: ${conversationId}\n\nMessage: ${input}\n\nTime: ${new Date().toLocaleString()}`;
    
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'HTML' // Use HTML for basic formatting if needed
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Telegram API Error:', errorData);
      throw new Error(`Failed to send Telegram message: ${errorData.description || response.statusText}`);
    }

    // Add to local messages for immediate display (not persisted in Firestore for direct Telegram send)
    const newMessage = {
      id: Date.now().toString(), // Client-side ID for display
      sender: currentUserId,
      text: input,
      timestamp: new Date(),
      method: 'telegram'
    };
    setMessages(prev => [...prev, newMessage]);
    setInput('');

    // IMPORTANT: To receive replies from Telegram back into this chat,
    // you need a Firebase Cloud Function (or similar backend) that acts as a Telegram webhook.
    // This Cloud Function would listen for replies from the admin in Telegram,
    // parse them, and then write them as new messages to the Firestore path:
    // `chats/${conversationId}/messages` with `sender: adminId` and `recipient: currentUserId`.
    console.log("Telegram message sent. Awaiting admin reply via Cloud Function (if configured).");
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const scrollToBottom = () => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  };

  // Basic styling (can be moved to CSS file)
  const styles = {
    container: {
      maxWidth: '600px',
      margin: '2rem auto',
      padding: '1rem',
      border: '1px solid #ccc',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'sans-serif',
      boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
      minHeight: '70vh', // Ensure enough height
    },
    methodSelector: {
      marginBottom: '1rem',
      padding: '1rem',
      backgroundColor: '#f8f9fa',
      borderRadius: '4px',
      border: '1px solid #e9ecef'
    },
    label: {
      display: 'block',
      marginBottom: '0.5rem',
      fontWeight: 'bold'
    },
    select: {
      width: '100%',
      padding: '0.5rem',
      borderRadius: '4px',
      border: '1px solid #ccc',
      fontSize: '1rem'
    },
    statusIndicator: {
      marginBottom: '1rem',
      padding: '0.5rem',
      textAlign: 'center',
      borderRadius: '4px',
      backgroundColor: '#e8f5e8'
    },
    statusOnline: { color: '#28a745' },
    statusEmail: { color: '#007bff' },
    statusTelegram: { color: '#0088cc' },
    chatBox: {
      flex: 1,
      height: '400px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      padding: '1rem',
      border: '1px solid #eee',
      marginBottom: '1rem',
      backgroundColor: '#f9f9f9',
      borderRadius: '4px',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)'
    },
    emptyState: {
      textAlign: 'center',
      color: '#666',
      fontStyle: 'italic',
      padding: '2rem'
    },
    message: {
      maxWidth: '70%',
      padding: '0.5rem 1rem',
      borderRadius: '16px',
      marginBottom: '0.5rem',
      wordBreak: 'break-word',
      color: '#333',
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
    },
    messageMethod: {
      fontSize: '0.75rem',
      color: '#666',
      marginTop: '0.25rem',
      fontStyle: 'italic'
    },
    inputBox: {
      display: 'flex',
      gap: '0.5rem',
      alignItems: 'flex-end'
    },
    textarea: {
      flex: 1,
      padding: '0.75rem',
      borderRadius: '4px',
      border: '1px solid #ccc',
      fontSize: '1rem',
      resize: 'vertical',
      minHeight: '60px'
    },
    button: {
      padding: '0.75rem 1.25rem',
      backgroundColor: '#007bff',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '1rem',
      transition: 'background-color 0.2s ease-in-out',
      height: 'fit-content'
    },
    instructions: {
      marginTop: '1rem',
      padding: '1rem',
      backgroundColor: '#f8f9fa',
      borderRadius: '4px',
      fontSize: '0.9rem',
      color: '#666'
    }
  };

  // Render loading state if chat is not initialized and auth is ready and user is logged in
  if (!chatInitialized && isAuthReady && user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '1.2rem', color: '#555' }}>
        <div className="spinner" style={{ marginRight: '10px' }}></div>
        Initializing chat...
      </div>
    );
  }

  // If auth is ready but no user, the useEffect above will redirect.
  // This block is a fallback for the very brief moment before redirection takes effect.
  if (!user && isAuthReady) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '1.2rem', color: '#555' }}>
        Please log in to access support.
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2>Support Chat</h2>
      
      {/* Communication Method Selector */}
      <div style={styles.methodSelector}>
        <label style={styles.label}>Communication Method:</label>
        <select 
          value={communicationMethod} 
          onChange={(e) => setCommunicationMethod(e.target.value)}
          style={styles.select}
        >
          <option value="firestore">Real-time Chat (Firestore)</option>
          <option value="email">Email Support</option>
          <option value="telegram">Telegram Support</option>
        </select>
      </div>

      {/* Status indicator */}
      <div style={styles.statusIndicator}>
        {communicationMethod === 'firestore' && (
          <span style={styles.statusOnline}>🟢 Real-time chat active</span>
        )}
        {communicationMethod === 'email' && (
          <span style={styles.statusEmail}>📧 Messages sent via email</span>
        )}
        {communicationMethod === 'telegram' && (
          <span style={styles.statusTelegram}>📱 Messages sent via Telegram</span>
        )}
      </div>

      <div ref={chatRef} style={styles.chatBox}>
        {(messages.length === 0 && (communicationMethod === 'email' || communicationMethod === 'telegram')) && (
          <div style={styles.emptyState}>
            <p>Your messages will be sent directly to our support team via {communicationMethod === 'email' ? 'email' : 'Telegram'}.</p>
            <p>For Telegram, admin replies will appear here if the Cloud Function is configured.</p>
          </div>
        )}
        
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              ...styles.message,
              alignSelf: msg.sender === currentUserId ? 'flex-end' : 'flex-start',
              backgroundColor: msg.sender === currentUserId ? '#DCF8C6' : '#FFF',
              border: msg.sender === currentUserId ? 'none' : '1px solid #eee'
            }}
          >
            <div>{msg.text}</div>
            {msg.method && (
              <div style={styles.messageMethod}>
                Sent via {msg.method}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={styles.inputBox}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={`Type your message... (will be sent via ${communicationMethod})`}
          style={styles.textarea}
          rows="3"
        />
        <button 
          onClick={sendMessage} 
          disabled={isLoading || !input.trim()}
          style={{
            ...styles.button,
            opacity: isLoading || !input.trim() ? 0.6 : 1
          }}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>

      {/* Instructions */}
      <div style={styles.instructions}>
        <h4>How it works:</h4>
        <ul>
          <li><strong>Real-time Chat:</strong> Direct messaging with admin through Firestore.</li>
          <li><strong>Email:</strong> Your message is sent to admin's email; they'll reply to you directly via email.</li>
          <li><strong>Telegram:</strong> Your message is sent to admin's Telegram. To receive replies here, you'll need a **Firebase Cloud Function** to act as a Telegram webhook, writing admin replies back to Firestore.</li>
        </ul>
      </div>
    </div>
  );
}

export default SupportPage;
