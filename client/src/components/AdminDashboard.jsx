// src/pages/Admin.jsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  collection,
  query,
  onSnapshot,
  updateDoc,
  doc,
  collectionGroup,
  getDocs,
  getDoc,
  deleteDoc,
  setDoc,
  runTransaction,
  where,
  orderBy, // ✅ Ensure orderBy is imported
  limit,
  serverTimestamp, // Import serverTimestamp
} from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../firebase.js'; // Ensure db is imported from firebase.js

import './Admin.css'; // Make sure this path is correct

// Import AdminChatComponent
import AdminChatComponent from '../components/AdminChatComponent';

// Define INVESTMENT_PLANS (ensure this is either imported or defined consistently)
const INVESTMENT_PLANS = [
  { id: 'basic', name: 'Basic Plan', dailyROI: 0.01, minInvestment: 100, maxInvestment: 1000, description: 'Basic investment plan', gradient: 'linear-gradient(to right, #6a11cb 0%, #2575fc 100%)' },
  { id: 'silver', name: 'Silver Plan', dailyROI: 0.015, minInvestment: 1001, maxInvestment: 5000, description: 'Silver investment plan', gradient: 'linear-gradient(to right, #8e2de2 0%, #4a00e0 100%)' },
  { id: 'gold', name: 'Gold Plan', dailyROI: 0.02, minInvestment: 5001, maxInvestment: 10000, description: 'Gold investment plan', gradient: 'linear-gradient(to right, #f7b733 0%, #fc4a1a 100%)' },
  // Add more plans as per your application
];


const AdminDashboard = () => {
  const [user, loading, error] = useAuthState(auth);
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dataLoading, setDataLoading] = useState(true); // Manages initial load for data
  const [isAdmin, setIsAdmin] = useState(false); // Manages admin status
  const [editingUser, setEditingUser] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending'); // Default to pending transactions

  // --- State for Chat Feature ---
  const [conversations, setConversations] = useState([]);
  const [selectedUserForChat, setSelectedUserForChat] = useState(null); // Stores the full user object (with profile)
  const adminId = 'admin'; // Consistent admin ID for chat messages
  // --- END Chat State ---

  const appId = 'cryptonest'; // Ensure this matches your Firebase setup

  // --- Effect to check and set admin status ---
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        setIsAdmin(false);
        setDataLoading(false); // If no user, no data to load for admin
        return;
      }

      try {
        // Attempt to get custom claims first
        const token = await user.getIdTokenResult();
        if (token.claims.isAdmin === true) {
          setIsAdmin(true);
          return; // Exit if admin via claims
        }

        // Fallback: Check profile document if not admin via claims
        const userProfileRef = doc(db, `artifacts/${appId}/users/${user.uid}/profile/data`);
        const profileDoc = await getDoc(userProfileRef);

        if (profileDoc.exists()) {
          const profileData = profileDoc.data();
          setIsAdmin(profileData.isAdmin === true);
        } else {
          setIsAdmin(false); // Profile doesn't exist, not an admin
        }
      } catch (err) {
        console.error('Error checking admin status:', err);
        setIsAdmin(false); // Assume not admin on error
      } finally {
        // Important: set dataLoading to false only after admin status is determined
        // as subsequent data fetches depend on isAdmin
        setDataLoading(false);
      }
    };

    // Only run if user changes or on initial load after auth state is known
    if (!loading) { // Only check admin status once firebase auth state is resolved
      checkAdminStatus();
    }
  }, [user, loading, appId]); // Depend on user and loading for auth state changes

  // --- Real-time fetch users with profile and dashboard data ---
  useEffect(() => {
    if (!isAdmin) {
        // If not admin, or admin check is still loading, do not attempt to fetch users
        console.log("Not an admin or admin status still loading. Skipping user fetch.");
        return;
    }

    console.log("Admin confirmed. Fetching users...");
    const usersColRef = collection(db, `artifacts/${appId}/users`);

    const unsubscribe = onSnapshot(
      usersColRef,
      async (snapshot) => {
        console.log("Users Snapshot received! Number of user docs:", snapshot.docs.length);
        const usersList = [];
        for (const userDoc of snapshot.docs) {
          const userId = userDoc.id;
          // console.log(`Processing userDoc.id: ${userId}`);
          try {
            const profileRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);
            const dashboardRef = doc(db, `artifacts/${appId}/users/${userId}/dashboardData/data`);

            const [profileDoc, dashboardDoc] = await Promise.all([
              getDoc(profileRef),
              getDoc(dashboardRef)
            ]);

            let profileData = {};
            let dashboardData = {};

            if (profileDoc.exists()) {
              profileData = profileDoc.data();
            } else {
              console.warn(`Profile/data document missing for user: ${userId}.`);
            }

            if (dashboardDoc.exists()) {
              dashboardData = dashboardDoc.data();
            } else {
              console.warn(`DashboardData/data document missing for user: ${userId}.`);
            }

            // Merge profile and dashboard data, prioritizing dashboard for financials
            usersList.push({
              id: userId,
              profile: {
                // Default values in case profile/dashboard docs are missing or incomplete
                email: profileData.email || 'N/A',
                displayName: profileData.displayName || userId,
                isAdmin: profileData.isAdmin || false,
                createdAt: profileData.createdAt || null, // Firebase Timestamp
                status: profileData.status || 'active',
                balance: dashboardData.balance !== undefined ? dashboardData.balance : 0,
                totalInvested: dashboardData.totalInvested !== undefined ? dashboardData.totalInvested : 0,
                // Add any other specific profile/dashboard fields you need
              },
            });
          } catch (fetchErr) {
            console.error(`Error fetching profile/dashboard for user ${userId}:`, fetchErr);
            // Push a minimal user object even if fetch fails to avoid skipping the user entirely
            usersList.push({
              id: userId,
              profile: {
                email: 'Error fetching', displayName: 'Error fetching', isAdmin: false,
                createdAt: null, balance: 0, totalInvested: 0, status: 'error'
              }
            });
          }
        }
        setUsers(usersList);
        // setDataLoading(false); // Keep dataLoading true until ALL initial fetches are done, or handle separately
      },
      (err) => {
        console.error('Error fetching real-time users from main collection:', err);
        // setDataLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isAdmin, appId]); // Depend on 'isAdmin' and 'appId'

  // --- Real-time fetch for conversations ---
  useEffect(() => {
    if (!isAdmin) return;

    const chatsColRef = collection(db, 'chats');
    // Query to get conversations involving 'admin' or all conversations if 'admin' isn't explicitly in data
    // Assuming 'userIds' array exists on conversation documents and contains 'admin' ID
    const q = query(chatsColRef, orderBy('lastMessageTimestamp', 'desc'));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const convos = [];
      for (const docSnap of snapshot.docs) {
        const conversationData = docSnap.data();
        const userIds = conversationData.userIds || []; // Ensure userIds exists
        const participants = userIds.filter(id => id !== adminId); // Filter out the adminId

        let userId = participants.length > 0 ? participants[0] : docSnap.id; // Get the user's ID
        if (userId.startsWith('user_')) {
          userId = userId.substring(5); // Remove 'user_' prefix if present, to match actual UID
        }

        let userName = userId; // Default to user ID
        const userProfile = users.find(u => u.id === userId); // Find user from loaded users state
        if (userProfile?.profile?.displayName) { // Use optional chaining for safety
          userName = userProfile.profile.displayName;
        } else if (userProfile?.profile?.email) {
            userName = userProfile.profile.email;
        }

        convos.push({
          id: docSnap.id, // This is the conversationId (e.g., 'user_abc-admin')
          userId: userId, // The specific user's raw UID involved in this chat
          userName: userName,
          ...conversationData,
        });
      }
      setConversations(convos);
    }, (err) => {
      console.error('Error fetching real-time conversations:', err);
    });

    return () => unsubscribe();
  }, [isAdmin, users]); // Depend on 'users' to get display names, also on isAdmin

  // Enhanced fetch transactions with user details
  const fetchTransactions = useCallback(async () => {
    if (!isAdmin) return;
    try {
      // Use collectionGroup to query across all 'transactions' subcollections
      const transColRef = collectionGroup(db, 'transactions');
      // ✅ NEW: Order by 'createdAt' in descending order to get latest transactions first
      const q = query(transColRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q); // Use the query 'q' here

      let transList = snapshot.docs.map((transDoc) => {
        const data = transDoc.data();
        // Extract userId from the path: artifacts/{appId}/users/{userId}/transactions/{transactionId}
        const userIdFromPath = transDoc.ref.path.split('/')[3];
        return {
          id: transDoc.id,
          ref: transDoc.ref, // Keep the reference for updates/deletes
          ...data,
          userId: userIdFromPath,
        };
      });

      // Map users by ID for quick lookup to attach display names
      const usersMap = new Map(users.map(u => [u.id, u.profile]));

      transList = transList.map(trans => ({
        ...trans,
        userName: usersMap.get(trans.userId)?.displayName || usersMap.get(trans.userId)?.email || trans.userId,
        userProfile: usersMap.get(trans.userId) // Attach full user profile
      }));

      setTransactions(transList);
    } catch (err) {
      console.error('Error fetching transactions:', err.code, err.message);
    }
  }, [isAdmin, users, appId]); // Added isAdmin to dependencies

  useEffect(() => {
    // Only fetch transactions if user is loaded, is admin, and users list has been populated
    // This ensures that `users` array in `fetchTransactions` is not empty when used.
    if (!loading && user && isAdmin && users.length > 0) {
      fetchTransactions();
    } else if (!loading && (!user || !isAdmin)) {
      // If not authenticated or not admin, ensure dataLoading is false
      // This path is hit after the initial isAdmin check in its useEffect
    }
  }, [user, loading, isAdmin, users.length, fetchTransactions]);


  // Update user profile
  const handleUpdateUser = async (userId, profileUpdates, dashboardUpdates) => {
    try {
      const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);
      const userDashboardRef = doc(db, `artifacts/${appId}/users/${userId}/dashboardData/data`);

      await runTransaction(db, async (transactionFirestore) => {
        // Read current states for robust updates if needed, though not strictly required if overwriting
        const currentProfileDoc = await transactionFirestore.get(userProfileRef);
        const currentDashboardDoc = await transactionFirestore.get(userDashboardRef);

        // Update user profile data
        transactionFirestore.update(userProfileRef, {
          ...profileUpdates,
          updatedAt: serverTimestamp(), // Use serverTimestamp()
        });

        // Update user dashboard data
        transactionFirestore.update(userDashboardRef, {
          ...dashboardUpdates,
          updatedAt: serverTimestamp(), // Use serverTimestamp()
        });
      });

      alert('User updated successfully');
      // Re-fetch transactions to ensure associated user names are updated
      fetchTransactions();
      setEditingUser(null);
    } catch (err) {
      console.error('Error updating user:', err.code, err.message);
      alert('Error updating user: ' + err.message);
    }
  };

  // Delete user
  const handleDeleteUser = async (userId) => {
    if (
      window.confirm(
        'Are you sure you want to delete this user? This will delete their profile and dashboard data. Transactions will remain but will no longer be linked to a profile. This action cannot be undone.'
      )
    ) {
      try {
        const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);
        const userDashboardRef = doc(db, `artifacts/${appId}/users/${userId}/dashboardData/data`);
        // Note: Deleting the parent user document (artifacts/{appId}/users/{userId})
        // requires all its subcollections to be empty or a Cloud Function for recursive deletion.
        // For client-side, we primarily delete the profile and dashboard data documents.

        await runTransaction(db, async (transactionFirestore) => {
          // Delete profile and dashboard data documents
          transactionFirestore.delete(userProfileRef);
          transactionFirestore.delete(userDashboardRef);
        });

        alert('User profile and dashboard data deleted successfully.');
        // No need to fetch users/transactions explicitly here as onSnapshot will update states
        // fetchTransactions(); // May not be necessary due to onSnapshot, but can keep for explicit refresh
      } catch (err) {
        console.error('Error deleting user profile/dashboard data:', err.code, err.message);
        alert('Error deleting user: ' + err.message);
      }
    }
  };


  // NEW: Handle transaction approval/decline and update user balances
  const handleApproveDeclineTransaction = async (transaction, actionType) => {
    const { ref: transRef, status: currentStatus, type, amount, userId, planId } = transaction;

    if (currentStatus !== 'pending') {
      alert(`Transaction is already ${currentStatus}.`);
      return;
    }

    const newStatus = actionType === 'approve' ? 'approved' : 'declined';
    const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);
    const userDashboardRef = doc(db, `artifacts/${appId}/users/${userId}/dashboardData/data`);

    try {
      await runTransaction(db, async (transactionFirestore) => {
        const userProfileDoc = await transactionFirestore.get(userProfileRef);
        const userDashboardDoc = await transactionFirestore.get(userDashboardRef);

        if (!userProfileDoc.exists()) {
          throw new Error("User profile not found for transaction processing!");
        }
        if (!userDashboardDoc.exists()) {
          // If dashboard data doesn't exist, create it with initial zeros
          transactionFirestore.set(userDashboardRef, {
            balance: 0,
            totalInvested: 0,
            currentInvestment: null,
            updatedAt: serverTimestamp(), // Use serverTimestamp()
            createdAt: serverTimestamp(), // Use serverTimestamp()
          });
        }

        const userProfileData = userProfileDoc.data();
        const userDashboardData = userDashboardDoc.exists() ? userDashboardDoc.data() : { balance: 0, totalInvested: 0, currentInvestment: null };

        let updatedBalance = userDashboardData.balance || 0;
        let updatedTotalInvested = userDashboardData.totalInvested || 0;
        let updatedCurrentInvestment = userDashboardData.currentInvestment || null;

        if (newStatus === 'approved') {
          if (type === 'deposit') {
            updatedBalance += amount;
          } else if (type === 'withdrawal') {
            if (updatedBalance < amount) {
              throw new Error(`Insufficient balance for withdrawal of ${amount}. User balance: ${updatedBalance}`);
            }
            updatedBalance -= amount;
          } else if (type === 'investment') {
            if (updatedBalance < amount) {
              throw new Error(`Insufficient balance for investment of ${amount}. User balance: ${updatedBalance}`);
            }
            updatedBalance -= amount;
            updatedTotalInvested += amount;
            // Set the active investment plan if it's an investment transaction
            if (planId) {
                const selectedPlan = INVESTMENT_PLANS.find(p => p.id === planId);
                if (selectedPlan) {
                    updatedCurrentInvestment = {
                        id: selectedPlan.id,
                        name: selectedPlan.name,
                        dailyROI: selectedPlan.dailyROI,
                        minInvestment: selectedPlan.minInvestment,
                        maxInvestment: selectedPlan.maxInvestment,
                        description: selectedPlan.description,
                        gradient: selectedPlan.gradient,
                        // You might want to add a 'startDate' for ROI calculation
                        startDate: serverTimestamp(), // Use serverTimestamp()
                        investedAmount: amount, // Store the amount invested in this plan instance
                    };
                } else {
                    console.warn(`Investment plan with ID ${planId} not found.`);
                }
            }
          }
          // Add logic for other transaction types like 'roi' if needed here
          // For ROI transactions, you would typically increase `balance`
          // else if (type === 'roi') {
          //   updatedBalance += amount;
          // }
        }

        // Update transaction status
        transactionFirestore.update(transRef, {
          status: newStatus,
          updatedAt: serverTimestamp(), // Use serverTimestamp()
          approvedBy: user.email || user.uid, // Store who approved it
          approvedAt: serverTimestamp(), // Use serverTimestamp()
        });

        // Update user's dashboard data (balance and totalInvested)
        transactionFirestore.update(userDashboardRef, {
          balance: updatedBalance,
          totalInvested: updatedTotalInvested,
          currentInvestment: updatedCurrentInvestment,
          updatedAt: serverTimestamp(), // Use serverTimestamp()
        });

        // Also update the profile balance for consistency, though dashboardData is primary
        transactionFirestore.update(userProfileRef, {
            balance: updatedBalance,
            totalInvested: updatedTotalInvested, // Keep profile totalInvested in sync
            updatedAt: serverTimestamp(), // Use serverTimestamp()
        });

      });
      alert(`Transaction ${transaction.id} ${newStatus} successfully! User balances updated.`);
      fetchTransactions(); // Refresh transactions after update
    } catch (err) {
      console.error(`Error ${newStatus} transaction:`, err);
      alert(`Error ${newStatus} transaction: ` + err.message);
    }
  };


  // Update transaction (for general edits, not approval/decline workflow)
  const handleUpdateTransaction = async (transRef, newData) => {
    try {
      await updateDoc(transRef, {
        ...newData,
        updatedAt: serverTimestamp(), // Use serverTimestamp()
      });
      alert('Transaction updated successfully');
      fetchTransactions();
      setEditingTransaction(null);
    } catch (err) {
      console.error('Error updating transaction:', err.code, err.message);
      alert('Error updating transaction: ' + err.message);
    }
  };

  // Delete transaction
  const handleDeleteTransaction = async (transRef) => {
    if (window.confirm('Are you sure you want to delete this transaction? This cannot be undone and will not reverse balance changes.')) {
      try {
        await deleteDoc(transRef);
        alert('Transaction deleted successfully');
        fetchTransactions(); // Refresh the list
      } catch (err) {
        console.error('Error deleting transaction:', err.code, err.message);
        alert('Error deleting transaction: ' + err.message);
      }
    }
  };

  // Filter users based on search term
  const filteredUsers = users.filter((user) => {
    const profile = user.profile || {};
    const searchLower = searchTerm.toLowerCase();
    return (
      user.id.toLowerCase().includes(searchLower) ||
      (profile.email && profile.email.toLowerCase().includes(searchLower)) ||
      (profile.displayName && profile.displayName.toLowerCase().includes(searchLower))
    );
  });

  // Filter transactions based on status
  const filteredTransactions = transactions.filter((trans) => {
    if (filterStatus === 'all') return true;
    return trans.status === filterStatus;
  });

  // User Edit Form Component
  const UserEditForm = ({ user, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
      email: user.profile.email || '',
      displayName: user.profile.displayName || '',
      isAdmin: user.profile.isAdmin || false,
      balance: user.profile.balance || 0,
      totalInvested: user.profile.totalInvested || 0,
      status: user.profile.status || 'active',
      // Add other fields you want to edit
    });

    // Fetch actual balance and totalInvested from dashboardData for display
    // This is crucial to ensure the form shows the real-time balance from dashboardData
    useEffect(() => {
        const fetchDashboardData = async () => {
            if (db && user.id && appId) {
                const dashboardRef = doc(db, `artifacts/${appId}/users/${user.id}/dashboardData/data`);
                try {
                    const docSnap = await getDoc(dashboardRef);
                    if (docSnap.exists()) {
                        const dashboardData = docSnap.data();
                        setFormData(prev => ({
                            ...prev,
                            balance: dashboardData.balance !== undefined ? dashboardData.balance : 0,
                            totalInvested: dashboardData.totalInvested !== undefined ? dashboardData.totalInvested : 0,
                        }));
                    } else {
                        console.warn(`DashboardData document for ${user.id} not found when opening edit form.`);
                    }
                } catch (err) {
                    console.error(`Error fetching dashboard data for user ${user.id}:`, err);
                }
            }
        };
        fetchDashboardData();
    }, [user.id, db, appId]);


    const handleSubmit = (e) => {
      e.preventDefault();
      const profileUpdates = {
          email: formData.email,
          displayName: formData.displayName,
          isAdmin: formData.isAdmin,
          status: formData.status,
      };
      const dashboardUpdates = {
          balance: formData.balance,
          totalInvested: formData.totalInvested,
      };
      onSave(user.id, profileUpdates, dashboardUpdates);
    };

    return (
      <form onSubmit={handleSubmit} className="edit-form">
        <h4>Edit User: {formData.displayName || user.id}</h4>
        <div className="form-group">
          <label>User ID:</label>
          <input type="text" value={user.id} disabled className="disabled-input" />
        </div>
        <div className="form-group">
          <label>Email:</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label>Display Name:</label>
          <input
            type="text"
            value={formData.displayName}
            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Balance:</label>
          <input
            type="number"
            step="0.01"
            value={formData.balance}
            onChange={(e) => setFormData({ ...formData, balance: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="form-group">
          <label>Total Invested:</label>
          <input
            type="number"
            step="0.01"
            value={formData.totalInvested}
            onChange={(e) => setFormData({ ...formData, totalInvested: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="form-group">
          <label>Status:</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
          >
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>
        </div>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={formData.isAdmin}
              onChange={(e) => setFormData({ ...formData, isAdmin: e.target.checked })}
              disabled={user.id === auth.currentUser.uid} // Prevent admin from de-admining themselves
            />
            Admin Privileges
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="save-btn">Save Changes</button>
          <button type="button" onClick={onCancel} className="cancel-btn">
            Cancel
          </button>
        </div>
      </form>
    );
  };

  // Transaction Edit Form Component
  const TransactionEditForm = ({ transaction, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
      type: transaction.type || '',
      amount: transaction.amount || 0,
      status: transaction.status || 'pending',
      description: transaction.description || '',
      // Add other fields you want to edit if they exist on your transaction documents
      planId: transaction.planId || '', // For investment transactions
      // paymentMethod: transaction.paymentMethod || '', etc.
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      onSave(transaction.ref, formData);
    };

    return (
      <form onSubmit={handleSubmit} className="edit-form">
        <h4>Edit Transaction: {transaction.id}</h4>
        <div className="form-group">
          <label>User ID:</label>
          <input type="text" value={transaction.userId} disabled className="disabled-input" />
        </div>
        <div className="form-group">
          <label>Type:</label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            required
          >
            <option value="">Select Type</option>
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="transfer">Transfer</option>
            <option value="investment">Investment</option>
            <option value="roi">ROI</option>
            {/* Add other relevant transaction types */}
          </select>
        </div>
        {formData.type === 'investment' && (
          <div className="form-group">
            <label>Plan ID:</label>
            <select
              value={formData.planId}
              onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
              required
            >
              <option value="">Select Plan</option>
              {INVESTMENT_PLANS.map(plan => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group">
          <label>Amount:</label>
          <input
            type="number"
            step="0.01"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
            required
          />
        </div>
        <div className="form-group">
          <label>Status:</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div className="form-group">
          <label>Description:</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="save-btn">Save Changes</button>
          <button type="button" onClick={onCancel} className="cancel-btn">
            Cancel
          </button>
        </div>
      </form>
    );
  };

  // Loading state handling for initial data and admin check
  if (loading || dataLoading) {
    return (
      <div className="loading-container">
        <p>Loading dashboard...</p>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="access-denied-container">
        <p>Please log in to access the admin dashboard.</p>
      </div>
    );
  }

  // Not admin
  if (!isAdmin) {
    return (
      <div className="access-denied-container">
        <p>Access denied. Admin privileges required.</p>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <h2>Admin Dashboard</h2>

      {/* Conditional rendering for chat view */}
      {selectedUserForChat ? (
        <div className="admin-chat-view">
          <button onClick={() => setSelectedUserForChat(null)} className="back-to-chats-btn">
            ← Back to Chat List
          </button>
          <h3>Chat with {selectedUserForChat.profile?.displayName || selectedUserForChat.profile?.email || selectedUserForChat.id}</h3>
          <AdminChatComponent
            userId={`user_${selectedUserForChat.id}`} // Pass the user's ID to the chat component (ensure 'user_' prefix if needed)
            adminId={adminId}
            currentUserDisplayName={user.email || "Admin"} // Pass admin's display name
          />
        </div>
      ) : (
        <>
          {/* Dashboard Stats */}
          <div className="dashboard-stats">
            <div className="stat-card">
              <h3>Total Users</h3>
              <p>{users.length}</p>
            </div>
            <div className="stat-card">
              <h3>Total Transactions</h3>
              <p>{transactions.length}</p>
            </div>
            <div className="stat-card">
              <h3>Pending Transactions</h3>
              <p>{transactions.filter((t) => t.status === 'pending').length}</p>
            </div>
          </div>

          {/* Chat Overview Section */}
          <div className="section chat-overview-section">
            <h3>Support Chats</h3>
            <div className="chat-list">
              {conversations.length === 0 && <p>No active conversations.</p>}
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className="chat-list-item"
                  onClick={() => setSelectedUserForChat(
                    users.find(u => u.id === conv.userId) // Pass the full user object
                  )}
                >
                  <div className="chat-info">
                    <strong>{conv.userName || conv.userId}</strong>
                    {conv.lastMessageText && (
                      <p className="last-message">
                        {conv.lastMessageText.length > 50
                          ? conv.lastMessageText.substring(0, 50) + '...'
                          : conv.lastMessageText}
                      </p>
                    )}
                  </div>
                  {conv.lastMessageTimestamp && (
                    <span className="last-message-time">
                      {conv.lastMessageTimestamp?.toDate ? new Date(conv.lastMessageTimestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Users Section */}
          <div className="section">
            <h3>User Management</h3>

            {/* Search and Filter */}
            <div className="controls">
              <input
                type="text"
                placeholder="Search users by ID, email, or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>

            {/* Users List */}
            <div className="users-grid">
              {filteredUsers.length === 0 && <p>No users found.</p>}
              {filteredUsers.map((user) => {
                const profile = user.profile || {};

                if (editingUser === user.id) {
                  return (
                    <div key={user.id} className="user-card editing">
                      <UserEditForm
                        user={user}
                        onSave={handleUpdateUser}
                        onCancel={() => setEditingUser(null)}
                      />
                    </div>
                  );
                }

                return (
                  <div key={user.id} className="user-card">
                    <div className="user-header">
                      <strong>{profile.displayName || user.id}</strong>{' '}
                      <span className={`status ${profile.status || 'active'}`}>
                        {profile.status || 'active'}
                      </span>
                    </div>
                    <div className="user-details">
                      <p>
                        <strong>User ID:</strong> {user.id}
                      </p>
                      <p>
                        <strong>Email:</strong> {profile.email || 'N/A'}
                      </p>
                      <p>
                        <strong>Display Name:</strong> {profile.displayName || 'N/A'}
                      </p>
                      <p>
                        <strong>Balance:</strong> ${profile.balance !== undefined ? profile.balance.toFixed(2) : 'N/A'}
                      </p>
                      <p>
                        <strong>Total Invested:</strong> ${profile.totalInvested !== undefined ? profile.totalInvested.toFixed(2) : 'N/A'}
                      </p>
                      <p>
                        <strong>Admin:</strong> {String(profile.isAdmin)}
                      </p>
                      <p>
                        <strong>Created:</strong>{' '}
                        {profile.createdAt?.toDate ? new Date(profile.createdAt.toDate()).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                    <div className="user-actions">
                      <button
                        onClick={() => setEditingUser(user.id)}
                        className="edit-btn"
                      >
                        Edit Profile
                      </button>
                      {!profile.isAdmin && (
                        <button
                          onClick={() => handleUpdateUser(user.id, { isAdmin: true }, {})} // Only update isAdmin in profile
                          className="admin-btn"
                        >
                          Make Admin
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedUserForChat(user)}
                        className="chat-btn"
                      >
                        Chat
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="delete-btn"
                      >
                        Delete User Data
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Transactions Section */}
          <div className="section">
            <h3>Transaction Management</h3>

            {/* Transaction Filter */}
            <div className="controls">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Transactions</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="declined">Declined</option>
                <option value="completed">Completed</option>
              </select>
              <button onClick={fetchTransactions} className="refresh-btn">
                Refresh Transactions
              </button>
            </div>

            {/* Transactions List */}
            <div className="transactions-grid">
              {filteredTransactions.length === 0 && <p>No transactions found for current filter.</p>}
              {filteredTransactions.map((trans) => {
                if (editingTransaction === trans.id) {
                  return (
                    <div key={trans.id} className="transaction-card editing">
                      <TransactionEditForm
                        transaction={trans}
                        onSave={handleUpdateTransaction}
                        onCancel={() => setEditingTransaction(null)}
                      />
                    </div>
                  );
                }

                return (
                  <div key={trans.id} className={`transaction-card status-${trans.status}`}>
                    <h4>{trans.type} - ${trans.amount.toFixed(2)}</h4>
                    <p><strong>User:</strong> {trans.userName}</p>
                    <p><strong>Status:</strong> <span className={`status ${trans.status}`}>{trans.status}</span></p>
                    <p><strong>Date:</strong> {trans.createdAt?.toDate ? new Date(trans.createdAt.toDate()).toLocaleString() : 'N/A'}</p>
                    {trans.description && <p><strong>Desc:</strong> {trans.description}</p>}
                    {trans.type === 'investment' && trans.planId && <p><strong>Plan:</strong> {INVESTMENT_PLANS.find(p => p.id === trans.planId)?.name || trans.planId}</p>}
                    <div className="transaction-actions">
                      {trans.status === 'pending' && (
                        <>
                          <button onClick={() => handleApproveDeclineTransaction(trans, 'approve')} className="approve-btn">Approve</button>
                          <button onClick={() => handleApproveDeclineTransaction(trans, 'declined')} className="decline-btn">Decline</button>
                        </>
                      )}
                      <button onClick={() => setEditingTransaction(trans.id)} className="edit-btn">Edit</button>
                      <button onClick={() => handleDeleteTransaction(trans.ref)} className="delete-btn">Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
