// src/components/AdminChatComponent.jsx
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
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebase'; // adjust this import path to your firebase config

// You might need to adjust the adminId to be a static string if it's not coming from auth claims
// For consistency with the user side, we'll keep it a string 'admin'
const ADMIN_UID_IDENTIFIER = 'admin';

function AdminChatComponent({ userId, currentUserDisplayName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const chatRef = useRef(null);

  // Derive conversationId, must be consistent with how user page calculates it
  const conversationId = [userId, ADMIN_UID_IDENTIFIER].sort().join('-');

  const messagesCollectionRef = collection(db, 'chats', conversationId, 'messages');

  // Load messages in real-time
  useEffect(() => {
    // Ensure the conversation document exists (optional, but good for structure)
    const conversationDocRef = doc(db, 'chats', conversationId);
    getDoc(conversationDocRef).then((docSnap) => {
      if (!docSnap.exists()) {
        setDoc(conversationDocRef, {
          userIds: [userId, ADMIN_UID_IDENTIFIER],
          createdAt: serverTimestamp(),
          // You can add other metadata here like 'status: open'
        }, { merge: true }); // Use merge: true in case it's created by user simultaneously
      }
    });

    const q = query(messagesCollectionRef, orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
      scrollToBottom();
    });
    return () => unsubscribe();
  }, [conversationId, userId]); // Re-run if conversationId or userId changes

  const sendMessage = async () => {
    if (!input.trim()) return;

    await addDoc(messagesCollectionRef, {
      sender: ADMIN_UID_IDENTIFIER, // Admin is the sender
      recipient: userId, // User is the recipient
      text: input,
      timestamp: serverTimestamp(),
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
      <div ref={chatRef} style={styles.chatBox}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              ...styles.message,
              alignSelf: msg.sender === ADMIN_UID_IDENTIFIER ? 'flex-end' : 'flex-start',
              backgroundColor: msg.sender === ADMIN_UID_IDENTIFIER ? '#DCF8C6' : '#FFF',
              border: msg.sender === ADMIN_UID_IDENTIFIER ? 'none' : '1px solid #eee'
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
    maxWidth: '100%', // Adjust for admin dashboard layout
    height: '600px', // Set a fixed height for the chat area
    margin: '1rem auto',
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

export default AdminChatComponent;