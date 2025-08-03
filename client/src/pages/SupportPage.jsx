import React, { useEffect, useState, useRef } from 'react';
import { Send, MessageCircle, User, Clock, CheckCircle, Circle } from 'lucide-react';

// Mock Firebase functions for demo - replace with your actual Firebase imports
const mockFirestore = {
  collection: () => ({}),
  doc: () => ({}),
  addDoc: async () => ({ id: Date.now().toString() }),
  setDoc: async () => {},
  getDoc: async () => ({ exists: () => true, data: () => ({}) }),
  onSnapshot: (query, callback) => {
    // Mock real-time updates
    setTimeout(() => {
      callback({
        docs: mockMessages.map(msg => ({
          id: msg.id,
          data: () => msg
        }))
      });
    }, 100);
    return () => {}; // unsubscribe function
  },
  serverTimestamp: () => new Date(),
  query: () => ({}),
  orderBy: () => ({})
};

// Mock messages for demo
let mockMessages = [
  {
    id: '1',
    sender: 'admin',
    recipient: 'user123',
    text: 'Hello! How can I help you today?',
    timestamp: new Date(Date.now() - 300000),
    status: 'delivered'
  }
];

// Mock auth context
const mockAuth = {
  user: { uid: 'user123', email: 'user@example.com' },
  userId: 'user123',
  appId: 'demo-app',
  isAuthReady: true
};

function SupportPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatInitialized, setChatInitialized] = useState(false);
  const [adminOnline, setAdminOnline] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const { user, userId, appId, isAuthReady } = mockAuth;
  const currentUserId = userId;
  const adminId = 'admin';
  const conversationId = currentUserId ? `${currentUserId}-${adminId}` : null;

  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Initialize chat and load messages
  useEffect(() => {
    if (!isAuthReady || !user || !currentUserId || !conversationId) {
      return;
    }

    const initializeChat = async () => {
      try {
        setIsLoading(true);
        
        // Simulate loading messages
        setTimeout(() => {
          setMessages(mockMessages);
          setChatInitialized(true);
          setIsLoading(false);
          scrollToBottom();
        }, 1000);

        // Set up real-time listener (mock)
        const unsubscribe = mockFirestore.onSnapshot(
          mockFirestore.query(),
          (snapshot) => {
            const msgs = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data()
            }));
            setMessages(msgs);
            scrollToBottom();
            
            // Check for unread messages
            const unread = msgs.filter(msg => 
              msg.sender === adminId && 
              msg.status !== 'read' &&
              msg.timestamp > (localStorage.getItem('lastSeen') || 0)
            ).length;
            setUnreadCount(unread);
          }
        );

        return () => unsubscribe();
      } catch (error) {
        console.error('Error initializing chat:', error);
        setIsLoading(false);
      }
    };

    initializeChat();
  }, [isAuthReady, user, currentUserId, conversationId]);

  // Simulate admin typing indicator
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() < 0.1) { // 10% chance admin is typing
        setIsTyping(true);
        setTimeout(() => setIsTyping(false), 3000);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Mark messages as read when user focuses on chat
  useEffect(() => {
    const handleFocus = () => {
      setUnreadCount(0);
      localStorage.setItem('lastSeen', Date.now().toString());
      // Mark messages as read in Firebase
      markMessagesAsRead();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const markMessagesAsRead = async () => {
    // Update message status to 'read' in Firebase
    // Implementation would mark admin messages as read
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const messageText = input.trim();
    setInput('');
    setIsLoading(true);

    try {
      const newMessage = {
        id: Date.now().toString(),
        sender: currentUserId,
        recipient: adminId,
        text: messageText,
        timestamp: new Date(),
        status: 'sending'
      };

      // Add message optimistically to UI
      setMessages(prev => [...prev, newMessage]);
      
      // Simulate sending to Firebase
      setTimeout(async () => {
        // Mock successful send
        mockMessages.push({
          ...newMessage,
          status: 'delivered'
        });

        setMessages(prev => prev.map(msg => 
          msg.id === newMessage.id 
            ? { ...msg, status: 'delivered' }
            : msg
        ));

        setIsLoading(false);

        // Simulate admin reply after a delay
        setTimeout(() => {
          const adminReply = {
            id: (Date.now() + 1).toString(),
            sender: adminId,
            recipient: currentUserId,
            text: getRandomAdminReply(messageText),
            timestamp: new Date(),
            status: 'delivered'
          };
          
          mockMessages.push(adminReply);
          setMessages(prev => [...prev, adminReply]);
          setUnreadCount(prev => prev + 1);
        }, Math.random() * 3000 + 1000); // Random delay 1-4 seconds
      }, 500);

    } catch (error) {
      console.error('Error sending message:', error);
      setIsLoading(false);
      
      // Update message status to failed
      setMessages(prev => prev.map(msg => 
        msg.id === newMessage?.id 
          ? { ...msg, status: 'failed' }
          : msg
      ));
    }
  };

  const getRandomAdminReply = (userMessage) => {
    const replies = [
      "Thanks for your message! I'm looking into this for you.",
      "I understand your concern. Let me help you with that.",
      "Great question! Here's what I can tell you...",
      "I'll need to check on this and get back to you shortly.",
      "Thanks for reaching out. I'm here to help!",
      "Let me investigate this issue for you right away."
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    
    return date.toLocaleDateString();
  };

  const getMessageStatus = (status) => {
    switch (status) {
      case 'sending':
        return <Circle className="w-3 h-3 text-gray-400 animate-pulse" />;
      case 'delivered':
        return <CheckCircle className="w-3 h-3 text-blue-500" />;
      case 'read':
        return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'failed':
        return <Circle className="w-3 h-3 text-red-500" />;
      default:
        return null;
    }
  };

  if (!chatInitialized && isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Connecting to support...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Support Chat</h1>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${adminOnline ? 'bg-green-400' : 'bg-gray-400'}`}></div>
                <span className="text-sm text-gray-500">
                  {adminOnline ? 'Admin online' : 'Admin offline'}
                </span>
                {unreadCount > 0 && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    {unreadCount} new
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            {user?.email}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={chatRef}
        className="flex-1 overflow-y-auto p-6 space-y-4"
        style={{ maxHeight: 'calc(100vh - 180px)' }}
      >
        {messages.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Start a conversation with our support team</p>
          </div>
        )}

        {messages.map((message) => {
          const isUser = message.sender === currentUserId;
          const isAdmin = message.sender === adminId;

          return (
            <div
              key={message.id}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex items-end space-x-2 max-w-xs lg:max-w-md`}>
                {isAdmin && (
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mb-1">
                    <User className="w-4 h-4 text-blue-600" />
                  </div>
                )}
                
                <div>
                  <div
                    className={`px-4 py-3 rounded-2xl ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md'
                    }`}
                  >
                    <p className="text-sm">{message.text}</p>
                  </div>
                  
                  <div className={`flex items-center mt-1 space-x-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-xs text-gray-500">
                      {formatTimestamp(message.timestamp)}
                    </span>
                    {isUser && getMessageStatus(message.status)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="flex items-end space-x-2 max-w-xs lg:max-w-md">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mb-1">
                <User className="w-4 h-4 text-blue-600" />
              </div>
              <div className="bg-white text-gray-900 border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="flex items-end space-x-3">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="w-full px-4 py-3 border border-gray-300 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows="1"
              disabled={isLoading}
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
          </div>
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              input.trim() && !isLoading
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
          <span>Press Enter to send, Shift+Enter for new line</span>
          <div className="flex items-center space-x-1">
            <Clock className="w-3 h-3" />
            <span>Usually replies within minutes</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SupportPage;