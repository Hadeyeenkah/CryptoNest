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
  orderBy,
  limit,
  serverTimestamp,
  addDoc,
} from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../firebase.js';

import './Admin.css';

// Import AdminChatComponent
import AdminChatComponent from '../components/AdminChatComponent';

// Define INVESTMENT_PLANS
const INVESTMENT_PLANS = [
  { id: 'basic', name: 'Basic Plan', dailyROI: 0.01, minInvestment: 100, maxInvestment: 1000, description: 'Basic investment plan', gradient: 'linear-gradient(to right, #6a11cb 0%, #2575fc 100%)' },
  { id: 'silver', name: 'Silver Plan', dailyROI: 0.015, minInvestment: 1001, maxInvestment: 5000, description: 'Silver investment plan', gradient: 'linear-gradient(to right, #8e2de2 0%, #4a00e0 100%)' },
  { id: 'gold', name: 'Gold Plan', dailyROI: 0.02, minInvestment: 5001, maxInvestment: 10000, description: 'Gold investment plan', gradient: 'linear-gradient(to right, #f7b733 0%, #fc4a1a 100%)' },
];

const AdminDashboard = () => {
  const [user, loading, error] = useAuthState(auth);
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [showAddTransaction, setShowAddTransaction] = useState(false);

  // Chat Feature State
  const [conversations, setConversations] = useState([]);
  const [selectedUserForChat, setSelectedUserForChat] = useState(null);
  const adminId = 'admin';

  const appId = 'default-app-id';

  // Track individual data fetching completion
  const [usersFetched, setUsersFetched] = useState(false);
  const [transactionsFetched, setTransactionsFetched] = useState(false);
  const [conversationsFetched, setConversationsFetched] = useState(false);

  // Check admin status
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        setIsAdmin(false);
        setDataLoading(false);
        return;
      }

      try {
        const token = await user.getIdTokenResult();
        if (token.claims.isAdmin === true) {
          setIsAdmin(true);
          return;
        }

        const userProfileRef = doc(db, `artifacts/${appId}/users/${user.uid}/profile/data`);
        const profileDoc = await getDoc(userProfileRef);

        if (profileDoc.exists()) {
          const profileData = profileDoc.data();
          setIsAdmin(profileData.isAdmin === true);
        } else {
          setIsAdmin(false);
        }
      } catch (err) {
        console.error('Error checking admin status:', err);
        setIsAdmin(false);
      }
    };

    if (!loading) {
      checkAdminStatus();
    }
  }, [user, loading, appId]);

  // Fetch users using collectionGroup to find all profile documents
  useEffect(() => {
    if (!isAdmin) {
      console.log("Not an admin. Skipping user fetch.");
      return;
    }

    console.log("Admin confirmed. Setting up real-time user listener using collectionGroup...");
    
    const profilesQuery = collectionGroup(db, 'profile');

    const unsubscribe = onSnapshot(
      profilesQuery,
      async (snapshot) => {
        console.log("Profile documents snapshot received! Number of profile docs:", snapshot.docs.length);
        
        // Filter for only 'data' documents and from our specific app
        const dataProfileDocs = snapshot.docs.filter(doc => {
          const pathParts = doc.ref.path.split('/');
          return doc.id === 'data' && pathParts[1] === appId && pathParts[0] === 'artifacts';
        });

        console.log(`Found ${dataProfileDocs.length} profile/data documents for app: ${appId}`);
        
        const userPromises = dataProfileDocs.map(async (profileDoc) => {
          try {
            const pathParts = profileDoc.ref.path.split('/');
            const userId = pathParts[3];

            const profileData = profileDoc.data();
            
            // Fetch dashboard data for this user
            const dashboardRef = doc(db, `artifacts/${appId}/users/${userId}/dashboardData/data`);
            const dashboardDoc = await getDoc(dashboardRef);
            
            let dashboardData = {};
            if (dashboardDoc.exists()) {
              dashboardData = dashboardDoc.data();
            }

            return {
              id: userId,
              profile: {
                email: profileData.email || 'N/A',
                displayName: profileData.displayName || userId,
                isAdmin: profileData.isAdmin || false,
                createdAt: profileData.createdAt || null,  
                status: profileData.status || 'active',
                balance: dashboardData.balance !== undefined ? dashboardData.balance : 0,
                totalInvested: dashboardData.totalInvested !== undefined ? dashboardData.totalInvested : 0,
                currentInvestment: dashboardData.currentInvestment || null,
              },
            };
          } catch (fetchErr) {
            console.error(`Error fetching data for user:`, fetchErr);
            return null;
          }
        });

        const usersList = (await Promise.all(userPromises)).filter(user => user !== null);
        console.log(`Successfully fetched ${usersList.length} users`);
        
        setUsers(usersList);
        setUsersFetched(true);
      },
      (err) => {
        console.error('Error fetching users via collectionGroup:', err);
        setUsersFetched(true);
      }
    );

    return () => unsubscribe();
  }, [isAdmin, appId]);

  // Fetch conversations
  useEffect(() => {
    if (!isAdmin) return;

    const chatsColRef = collection(db, 'chats');
    const q = query(chatsColRef, orderBy('lastMessageTimestamp', 'desc'));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const convos = [];
      for (const docSnap of snapshot.docs) {
        const conversationData = docSnap.data();
        const userIds = conversationData.userIds || [];
        const participants = userIds.filter(id => id !== adminId);

        let userId = participants.length > 0 ? participants[0] : docSnap.id;
        if (userId.startsWith('user_')) {
          userId = userId.substring(5);
        }

        let userName = userId;
        if (usersFetched) {
          const userProfile = users.find(u => u.id === userId);
          if (userProfile?.profile?.displayName) {
            userName = userProfile.profile.displayName;
          } else if (userProfile?.profile?.email) {
            userName = userProfile.profile.email;
          }
        }

        convos.push({
          id: docSnap.id,
          userId: userId,
          userName: userName,
          ...conversationData,
        });
      }
      setConversations(convos);
      setConversationsFetched(true);
    }, (err) => {
      console.error('Error fetching conversations:', err);
      setConversationsFetched(true);
    });

    return () => unsubscribe();
  }, [isAdmin, users, usersFetched]);

  // Fetch transactions with real-time updates
  useEffect(() => {
    if (!isAdmin || !usersFetched) {
      console.log("Not admin or users not fetched. Skipping transaction fetch.");
      return;
    }

    console.log("Fetching transactions in real-time...");
    const transColRef = collectionGroup(db, 'transactions');
    const q = query(transColRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`Transaction snapshot received! ${snapshot.docs.length} transactions found.`);
      
      let transList = snapshot.docs.map((transDoc) => {
        const data = transDoc.data();
        const pathParts = transDoc.ref.path.split('/');
        const userIdFromPath = pathParts[3];
        
        return {
          id: transDoc.id,
          ref: transDoc.ref,
          ...data,
          userId: userIdFromPath,
        };
      });

      // Filter transactions from our specific app
      transList = transList.filter(trans => {
        const pathParts = trans.ref.path.split('/');
        return pathParts[1] === appId;
      });

      const usersMap = new Map(users.map(u => [u.id, u.profile]));

      transList = transList.map(trans => ({
        ...trans,
        userName: usersMap.get(trans.userId)?.displayName || usersMap.get(trans.userId)?.email || trans.userId,
        userProfile: usersMap.get(trans.userId)
      }));

      console.log(`Processed ${transList.length} transactions for app: ${appId}`);
      setTransactions(transList);
      setTransactionsFetched(true);
    }, (err) => {
      console.error('Error fetching transactions:', err);
      setTransactionsFetched(true);
    });

    return () => unsubscribe();
  }, [isAdmin, users, usersFetched, appId]);

  // Combined loading state
  useEffect(() => {
    if (!loading && isAdmin && usersFetched && transactionsFetched && conversationsFetched) {
      setDataLoading(false);
    } else if (!loading && !isAdmin) {
      setDataLoading(false);
    }
  }, [loading, isAdmin, usersFetched, transactionsFetched, conversationsFetched]);

  // Enhanced user update with full editing capabilities
  const handleUpdateUser = async (userId, profileUpdates, dashboardUpdates) => {
    try {
      const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);
      const userDashboardRef = doc(db, `artifacts/${appId}/users/${userId}/dashboardData/data`);

      await runTransaction(db, async (transactionFirestore) => {
        // Check if documents exist, create if they don't
        const profileDoc = await transactionFirestore.get(userProfileRef);
        const dashboardDoc = await transactionFirestore.get(userDashboardRef);

        if (!profileDoc.exists()) {
          transactionFirestore.set(userProfileRef, {
            ...profileUpdates,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          transactionFirestore.update(userProfileRef, {
            ...profileUpdates,
            updatedAt: serverTimestamp(),
          });
        }

        if (!dashboardDoc.exists()) {
          transactionFirestore.set(userDashboardRef, {
            ...dashboardUpdates,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          transactionFirestore.update(userDashboardRef, {
            ...dashboardUpdates,
            updatedAt: serverTimestamp(),
          });
        }
      });

      console.log('User updated successfully');
      setEditingUser(null);
      
      // Show success message
      alert('User updated successfully!');
    } catch (err) {
      console.error('Error updating user:', err);
      alert('Error updating user: ' + err.message);
    }
  };

  // Delete user with all related data
  const handleDeleteUser = async (userId) => {
    if (window.confirm(`Are you sure you want to delete user ${userId}? This will delete all their data and cannot be undone.`)) {
      try {
        // Delete profile and dashboard data
        const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);
        const userDashboardRef = doc(db, `artifacts/${appId}/users/${userId}/dashboardData/data`);

        // Also delete all user's transactions
        const userTransactions = transactions.filter(t => t.userId === userId);
        
        await runTransaction(db, async (transactionFirestore) => {
          transactionFirestore.delete(userProfileRef);
          transactionFirestore.delete(userDashboardRef);
          
          // Delete all user's transactions
          userTransactions.forEach(trans => {
            transactionFirestore.delete(trans.ref);
          });
        });

        console.log('User and all related data deleted successfully.');
        alert('User deleted successfully!');
      } catch (err) {
        console.error('Error deleting user:', err);
        alert('Error deleting user: ' + err.message);
      }
    }
  };

  // Enhanced transaction approval/decline with real-time updates
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
          transactionFirestore.set(userDashboardRef, {
            balance: 0,
            totalInvested: 0,
            currentInvestment: null,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          });
        }

        const userDashboardData = userDashboardDoc.exists() ? userDashboardDoc.data() : { balance: 0, totalInvested: 0, currentInvestment: null };

        let updatedBalance = userDashboardData.balance || 0;
        let updatedTotalInvested = userDashboardData.totalInvested || 0;
        let updatedCurrentInvestment = userDashboardData.currentInvestment || null;

        if (newStatus === 'approved') {
          if (type === 'deposit') {
            updatedBalance += amount;
          } else if (type === 'withdrawal') {
            if (updatedBalance < amount) {
              throw new Error(`Insufficient balance for withdrawal of $${amount}. User balance: $${updatedBalance}`);
            }
            updatedBalance -= amount;
          } else if (type === 'investment') {
            if (updatedBalance < amount) {
              throw new Error(`Insufficient balance for investment of $${amount}. User balance: $${updatedBalance}`);
            }
            updatedBalance -= amount;
            updatedTotalInvested += amount;
            
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
                  startDate: serverTimestamp(),
                  investedAmount: amount,
                };
              }
            }
          } else if (type === 'roi') {
            updatedBalance += amount;
          }
        }

        // Update transaction status with detailed approval info
        transactionFirestore.update(transRef, {
          status: newStatus,
          updatedAt: serverTimestamp(),
          approvedBy: user.email || user.uid,
          approvedAt: serverTimestamp(),
          adminNotes: `${actionType === 'approve' ? 'Approved' : 'Declined'} by admin on ${new Date().toLocaleString()}`,
        });

        // Update user's dashboard data
        transactionFirestore.update(userDashboardRef, {
          balance: updatedBalance,
          totalInvested: updatedTotalInvested,
          currentInvestment: updatedCurrentInvestment,
          updatedAt: serverTimestamp(),
        });

        // Keep profile balance in sync
        transactionFirestore.update(userProfileRef, {
          balance: updatedBalance,
          totalInvested: updatedTotalInvested,
          updatedAt: serverTimestamp(),
        });
      });

      alert(`Transaction ${newStatus} successfully! User balances updated.`);
      console.log(`Transaction ${transaction.id} ${newStatus} successfully!`);
    } catch (err) {
      console.error(`Error ${newStatus} transaction:`, err);
      alert(`Error ${newStatus} transaction: ` + err.message);
    }
  };

  // Enhanced transaction update
  const handleUpdateTransaction = async (transRef, newData) => {
    try {
      await updateDoc(transRef, {
        ...newData,
        updatedAt: serverTimestamp(),
        lastModifiedBy: user.email || user.uid,
      });
      
      console.log('Transaction updated successfully');
      alert('Transaction updated successfully!');
      setEditingTransaction(null);
    } catch (err) {
      console.error('Error updating transaction:', err);
      alert('Error updating transaction: ' + err.message);
    }
  };

  // Delete transaction
  const handleDeleteTransaction = async (transRef) => {
    if (window.confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) {
      try {
        await deleteDoc(transRef);
        console.log('Transaction deleted successfully');
        alert('Transaction deleted successfully!');
      } catch (err) {
        console.error('Error deleting transaction:', err);
        alert('Error deleting transaction: ' + err.message);
      }
    }
  };

  // Add new transaction for user
  const handleAddTransaction = async (transactionData) => {
    try {
      const userTransactionsRef = collection(db, `artifacts/${appId}/users/${transactionData.userId}/transactions`);
      
      const newTransaction = {
        ...transactionData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.email || user.uid,
        status: 'pending', // All admin-created transactions start as pending
      };

      await addDoc(userTransactionsRef, newTransaction);
      
      console.log('Transaction added successfully');
      alert('Transaction added successfully!');
      setShowAddTransaction(false);
    } catch (err) {
      console.error('Error adding transaction:', err);
      alert('Error adding transaction: ' + err.message);
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

  // Enhanced User Edit Form with full capabilities
  const UserEditForm = ({ user, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
      email: user.profile.email || '',
      displayName: user.profile.displayName || '',
      isAdmin: user.profile.isAdmin || false,
      balance: user.profile.balance || 0,
      totalInvested: user.profile.totalInvested || 0,
      status: user.profile.status || 'active',
      currentInvestment: user.profile.currentInvestment || null,
    });

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
                currentInvestment: dashboardData.currentInvestment || null,
              }));
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
        currentInvestment: formData.currentInvestment,
      };
      onSave(user.id, profileUpdates, dashboardUpdates);
    };

    return (
      <div className="edit-form-container">
        <form onSubmit={handleSubmit} className="edit-form">
          <h4>Edit User: {formData.displayName || user.id}</h4>
          
          <div className="form-row">
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
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Display Name:</label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
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
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Balance ($):</label>
              <input
                type="number"
                step="0.01"
                value={formData.balance}
                onChange={(e) => setFormData({ ...formData, balance: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group">
              <label>Total Invested ($):</label>
              <input
                type="number"
                step="0.01"
                value={formData.totalInvested}
                onChange={(e) => setFormData({ ...formData, totalInvested: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={formData.isAdmin}
                onChange={(e) => setFormData({ ...formData, isAdmin: e.target.checked })}
                disabled={user.id === auth.currentUser?.uid}
              />
              Admin Privileges
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="save-btn">Save Changes</button>
            <button type="button" onClick={onCancel} className="cancel-btn">Cancel</button>
          </div>
        </form>
      </div>
    );
  };

  // Enhanced Transaction Edit Form
  const TransactionEditForm = ({ transaction, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
      type: transaction.type || '',
      amount: transaction.amount || 0,
      status: transaction.status || 'pending',
      description: transaction.description || '',
      planId: transaction.planId || '',
      paymentMethod: transaction.paymentMethod || '',
      adminNotes: transaction.adminNotes || '',
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      onSave(transaction.ref, formData);
    };

    return (
      <div className="edit-form-container">
        <form onSubmit={handleSubmit} className="edit-form">
          <h4>Edit Transaction: {transaction.id}</h4>
          
          <div className="form-row">
            <div className="form-group">
              <label>Transaction ID:</label>
              <input type="text" value={transaction.id} disabled className="disabled-input" />
            </div>
            <div className="form-group">
              <label>User:</label>
              <input type="text" value={`${transaction.userName} (${transaction.userId})`} disabled className="disabled-input" />
            </div>
          </div>

          <div className="form-row">
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
                <option value="bonus">Bonus</option>
                <option value="penalty">Penalty</option>
              </select>
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
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Amount ($):</label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>
            <div className="form-group">
              <label>Payment Method:</label>
              <input
                type="text"
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                placeholder="e.g., Bank Transfer, PayPal, Crypto"
              />
            </div>
          </div>

          {formData.type === 'investment' && (
            <div className="form-group">
              <label>Investment Plan:</label>
              <select
                value={formData.planId}
                onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
              >
                <option value="">Select Plan</option>
                {INVESTMENT_PLANS.map(plan => (
                  <option key={plan.id} value={plan.id}>{plan.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>Description:</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Transaction description"
              rows="3"
            />
          </div>

          <div className="form-group">
            <label>Admin Notes:</label>
            <textarea
              value={formData.adminNotes}
              onChange={(e) => setFormData({ ...formData, adminNotes: e.target.value })}
              placeholder="Internal admin notes"
              rows="2"
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="save-btn">Save Changes</button>
            <button type="button" onClick={onCancel} className="cancel-btn">Cancel</button>
          </div>
        </form>
      </div>
    );
  };

  // Add Transaction Form
  const AddTransactionForm = ({ onSave, onCancel }) => {
    const [formData, setFormData] = useState({
      userId: '',
      type: '',
      amount: 0,
      description: '',
      planId: '',
      paymentMethod: '',
      adminNotes: '',
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      if (!formData.userId || !formData.type || !formData.amount) {
        alert('Please fill in all required fields');
        return;
      }
      onSave(formData);
    };

    return (
      <div className="edit-form-container">
        <form onSubmit={handleSubmit} className="edit-form">
          <h4>Add New Transaction</h4>
          
          <div className="form-row">
            <div className="form-group">
              <label>User:</label>
              <select
                value={formData.userId}
                onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                required
              >
                <option value="">Select User</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.profile.displayName || user.profile.email} ({user.id})
                  </option>
                ))}
              </select>
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
                <option value="bonus">Bonus</option>
                <option value="penalty">Penalty</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Amount ($):</label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>
            <div className="form-group">
              <label>Payment Method:</label>
              <input
                type="text"
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                placeholder="e.g., Bank Transfer, PayPal, Crypto"
              />
            </div>
          </div>

          {formData.type === 'investment' && (
            <div className="form-group">
              <label>Investment Plan:</label>
              <select
                value={formData.planId}
                onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
              >
                <option value="">Select Plan</option>
                {INVESTMENT_PLANS.map(plan => (
                  <option key={plan.id} value={plan.id}>{plan.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>Description:</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Transaction description"
              rows="3"
            />
          </div>

          <div className="form-group">
            <label>Admin Notes:</label>
            <textarea
              value={formData.adminNotes}
              onChange={(e) => setFormData({ ...formData, adminNotes: e.target.value })}
              placeholder="Internal admin notes"
              rows="2"
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="save-btn">Add Transaction</button>
            <button type="button" onClick={onCancel} className="cancel-btn">Cancel</button>
          </div>
        </form>
      </div>
    );
  };

  // Loading states
  if (loading || dataLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading admin dashboard...</p>
        <p>Fetching users: {usersFetched ? '✓' : '⏳'}</p>
        <p>Fetching transactions: {transactionsFetched ? '✓' : '⏳'}</p>
        <p>Fetching conversations: {conversationsFetched ? '✓' : '⏳'}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="access-denied-container">
        <h2>Authentication Required</h2>
        <p>Please log in to access the admin dashboard.</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="access-denied-container">
        <h2>Access Denied</h2>
        <p>Admin privileges required to access this dashboard.</p>
      </div>
    );
  }

  // Get pending transactions count for real-time updates
  const pendingTransactionsCount = transactions.filter(t => t.status === 'pending').length;

  return (
    <div className="admin-dashboard">
      <div className="dashboard-header">
        <h2>Admin Dashboard</h2>
        <div className="admin-info">
          <span>Welcome, {user.email}</span>
          {pendingTransactionsCount > 0 && (
            <span className="notification-badge">
              {pendingTransactionsCount} pending transactions
            </span>
          )}
        </div>
      </div>

      {/* Conditional rendering for chat view */}
      {selectedUserForChat ? (
        <div className="admin-chat-view">
          <button onClick={() => setSelectedUserForChat(null)} className="back-to-chats-btn">
            ← Back to Dashboard
          </button>
          <h3>Chat with {selectedUserForChat.profile?.displayName || selectedUserForChat.profile?.email || selectedUserForChat.id}</h3>
          <AdminChatComponent
            userId={`user_${selectedUserForChat.id}`}
            adminId={adminId}
            currentUserDisplayName={user.email || "Admin"}
          />
        </div>
      ) : (
        <>
          {/* Enhanced Dashboard Stats */}
          <div className="dashboard-stats">
            <div className="stat-card">
              <h3>Total Users</h3>
              <p className="stat-number">{users.length}</p>
              <small>Registered users</small>
            </div>
            <div className="stat-card">
              <h3>Total Transactions</h3>
              <p className="stat-number">{transactions.length}</p>
              <small>All time</small>
            </div>
            <div className="stat-card pending">
              <h3>Pending Transactions</h3>
              <p className="stat-number">{pendingTransactionsCount}</p>
              <small>Require approval</small>
            </div>
            <div className="stat-card">
              <h3>Active Chats</h3>
              <p className="stat-number">{conversations.length}</p>
              <small>Support conversations</small>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="quick-actions">
            <button 
              onClick={() => setShowAddTransaction(true)} 
              className="action-btn primary-btn"
            >
              + Add Transaction
            </button>
            <button 
              onClick={() => setFilterStatus('pending')} 
              className="action-btn warning-btn"
            >
              Review Pending ({pendingTransactionsCount})
            </button>
          </div>

          {/* Add Transaction Form */}
          {showAddTransaction && (
            <AddTransactionForm
              onSave={handleAddTransaction}
              onCancel={() => setShowAddTransaction(false)}
            />
          )}

          {/* Chat Overview Section */}
          <div className="section chat-overview-section">
            <h3>Support Chats</h3>
            <div className="chat-list">
              {conversations.length === 0 && <p className="no-data">No active conversations.</p>}
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className="chat-list-item"
                  onClick={() => setSelectedUserForChat(users.find(u => u.id === conv.userId))}
                >
                  <div className="chat-user-info">
                    <span className="chat-user-name">{conv.userName}</span>
                    <span className="chat-user-id">({conv.userId})</span>
                  </div>
                  <div className="chat-last-message">
                    {conv.lastMessage ? conv.lastMessage.text : 'No messages yet.'}
                  </div>
                  <div className="chat-timestamp">
                    {conv.lastMessageTimestamp?.toDate().toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Users Section */}
          <div className="section users-section">
            <div className="section-header">
              <h3>Users Management ({users.length} total)</h3>
              <div className="section-controls">
                <input
                  type="text"
                  placeholder="Search users by ID, email, or name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>

            {editingUser && (
              <UserEditForm
                user={editingUser}
                onSave={handleUpdateUser}
                onCancel={() => setEditingUser(null)}
              />
            )}

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Display Name</th>
                    <th>Email</th>
                    <th>Balance</th>
                    <th>Total Invested</th>
                    <th>Admin</th>
                    <th>Status</th>
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan="9" className="no-data">No users found.</td>
                    </tr>
                  )}
                  {filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td className="user-id">{u.id}</td>
                      <td>{u.profile.displayName}</td>
                      <td>{u.profile.email}</td>
                      <td className="balance">${u.profile.balance?.toFixed(2)}</td>
                      <td className="invested">${u.profile.totalInvested?.toFixed(2)}</td>
                      <td>
                        <span className={`badge ${u.profile.isAdmin ? 'admin' : 'user'}`}>
                          {u.profile.isAdmin ? 'Admin' : 'User'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge status-${u.profile.status}`}>
                          {u.profile.status}
                        </span>
                      </td>
                      <td>{u.profile.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}</td>
                      <td className="actions-cell">
                        <button 
                          onClick={() => setEditingUser(u)} 
                          className="action-btn edit-btn"
                          title="Edit User"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(u.id)} 
                          className="action-btn delete-btn"
                          title="Delete User"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Transactions Section */}
          <div className="section transactions-section">
            <div className="section-header">
              <h3>Transactions Management ({transactions.length} total)</h3>
              <div className="section-controls">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="status-filter-select"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending ({transactions.filter(t => t.status === 'pending').length})</option>
                  <option value="approved">Approved ({transactions.filter(t => t.status === 'approved').length})</option>
                  <option value="declined">Declined ({transactions.filter(t => t.status === 'declined').length})</option>
                  <option value="completed">Completed ({transactions.filter(t => t.status === 'completed').length})</option>
                </select>
              </div>
            </div>

            {editingTransaction && (
              <TransactionEditForm
                transaction={editingTransaction}
                onSave={handleUpdateTransaction}
                onCancel={() => setEditingTransaction(null)}
              />
            )}

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>User</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Plan</th>
                    <th>Method</th>
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.length === 0 && (
                    <tr>
                      <td colSpan="9" className="no-data">
                        No transactions found for the selected filter.
                      </td>
                    </tr>
                  )}
                  {filteredTransactions.map((trans) => (
                    <tr key={trans.id} className={trans.status === 'pending' ? 'pending-row' : ''}>
                      <td className="trans-id">{trans.id.substring(0, 8)}...</td>
                      <td>
                        <div className="user-cell">
                          <span className="user-name">{trans.userName}</span>
                          <small className="user-id">({trans.userId})</small>
                        </div>
                      </td>
                      <td>
                        <span className={`badge type-${trans.type}`}>
                          {trans.type}
                        </span>
                      </td>
                      <td className="amount">${trans.amount?.toFixed(2)}</td>
                      <td>
                        <span className={`badge status-${trans.status}`}>
                          {trans.status}
                        </span>
                      </td>
                      <td>{trans.planId || 'N/A'}</td>
                      <td>{trans.paymentMethod || 'N/A'}</td>
                      <td>{trans.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}</td>
                      <td className="actions-cell">
                        {trans.status === 'pending' && (
                          <>
                            <button 
                              onClick={() => handleApproveDeclineTransaction(trans, 'approve')} 
                              className="action-btn approve-btn"
                              title="Approve Transaction"
                            >
                              ✓ Approve
                            </button>
                            <button 
                              onClick={() => handleApproveDeclineTransaction(trans, 'decline')} 
                              className="action-btn decline-btn"
                              title="Decline Transaction"
                            >
                              ✗ Decline
                            </button>
                          </>
                        )}
                        <button 
                          onClick={() => setEditingTransaction(trans)} 
                          className="action-btn edit-btn"
                          title="Edit Transaction"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => handleDeleteTransaction(trans.ref)} 
                          className="action-btn delete-btn"
                          title="Delete Transaction"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;