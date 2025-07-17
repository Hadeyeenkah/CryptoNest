// src/pages/SupportPage.jsx
import React, { useEffect, useState, useRef } from 'react';
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  doc, // Import doc
  setDoc, // Import setDoc
  getDoc // Import getDoc
} from 'firebase/firestore';
import { db } from '../firebase'; // adjust this import path to your firebase config

function SupportPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  // For a real app, userId should come from your authentication context (e.g., Firebase Auth currentUser.uid)
  const userId = 'user_' + localStorage.getItem('uid') || 'anonymous_user'; // Fallback for testing
  const adminId = 'admin'; // Identifier for your admin
  const chatRef = useRef(null);

  // Generate a consistent conversation ID
  // It's crucial that both user and admin calculate the same ID.
  // A simple way is to concatenate sorted user and admin IDs.
  const conversationId = [userId, adminId].sort().join('-');

  // Reference to the messages sub-collection within the conversation document
  const messagesCollectionRef = collection(db, 'chats', conversationId, 'messages');

  // Load messages in real-time
  useEffect(() => {
    // Ensure the conversation document exists (optional, but good for structure)
    const conversationDocRef = doc(db, 'chats', conversationId);
    getDoc(conversationDocRef).then((docSnap) => {
      if (!docSnap.exists()) {
        setDoc(conversationDocRef, {
          userIds: [userId, adminId],
          createdAt: serverTimestamp(),
          // You can add other metadata here like 'status: open'
        });
      }
    });

    const q = query(messagesCollectionRef, orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
      scrollToBottom();
    });
    return () => unsubscribe();
  }, [conversationId]); // Re-run if conversationId changes (though it shouldn't for a fixed user-admin chat)

  const sendMessage = async () => {
    if (!input.trim()) return;

    await addDoc(messagesCollectionRef, {
      sender: userId, // The sender is always the current user
      recipient: adminId, // The recipient for the user's message is always the admin
      text: input,
      timestamp: serverTimestamp()
    });

    // Optionally update the conversation document with last message details
    const conversationDocRef = doc(db, 'chats', conversationId);
    await setDoc(conversationDocRef, {
      lastMessageText: input,
      lastMessageTimestamp: serverTimestamp(),
    }, { merge: true }); // Use merge: true to only update specified fields

    setInput('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') sendMessage();
  };

  const scrollToBottom = () => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  };

  return (
    <div style={styles.container}>
      <h2>Support Chat with Admin</h2>
      <div ref={chatRef} style={styles.chatBox}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              ...styles.message,
              alignSelf: msg.sender === userId ? 'flex-end' : 'flex-start',
              backgroundColor: msg.sender === userId ? '#DCF8C6' : '#FFF',
              // Add a subtle border for incoming messages
              border: msg.sender === userId ? 'none' : '1px solid #eee'
            }}
          >
            {msg.text}
          </div>
        ))}
      </div>
      <div style={styles.inputBox}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
          style={styles.input}
        />
        <button onClick={sendMessage} style={styles.button}>Send</button>
      </div>
    </div>
  );
}

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
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
  },
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
  message: {
    maxWidth: '70%',
    padding: '0.5rem 1rem',
    borderRadius: '16px',
    marginBottom: '0.5rem',
    wordBreak: 'break-word',
    // Text color
    color: '#333'
  },
  inputBox: {
    display: 'flex',
    gap: '0.5rem'
  },
  input: {
    flex: 1,
    padding: '0.75rem',
    borderRadius: '4px',
    border: '1px solid #ccc',
    fontSize: '1rem'
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
    ':hover': {
      backgroundColor: '#0056b3'
    }
  }
};

export default SupportPage;