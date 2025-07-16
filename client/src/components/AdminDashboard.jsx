import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  onSnapshot, // Import onSnapshot for real-time updates for users
  updateDoc,
  doc,
  collectionGroup,
  getDocs, // Keep getDocs for transactions for now, or consider onSnapshot if needed
  getDoc,
  deleteDoc,
  setDoc,
} from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase.js';

import './Admin.css';
import { db } from '../firebase.js';

const AdminDashboard = () => {
  const [user, loading, error] = useAuthState(auth);
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const appId = 'cryptonest';

  // Check if current user is admin
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (user) {
        try {
          // First check ID token claims
          const token = await user.getIdTokenResult();
          if (token.claims.isAdmin === true) {
            setIsAdmin(true);
            return;
          }

          // Fallback: check Firestore document
          const userProfileRef = doc(
            db,
            `artifacts/${appId}/users/${user.uid}/profile/data`
          );
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
      }
    };

    if (user) {
      checkAdminStatus();
    }
  }, [user]);

  // Real-time fetch users with profile data
  useEffect(() => {
    if (!isAdmin) return; // Only fetch if admin

    setDataLoading(true); // Indicate data is loading
    const usersColRef = collection(db, `artifacts/${appId}/users`);

    const unsubscribe = onSnapshot(
      usersColRef,
      async (snapshot) => {
        const usersList = [];
        for (const userDoc of snapshot.docs) {
          try {
            const profileRef = doc(
              db,
              `artifacts/${appId}/users/${userDoc.id}/profile/data`
            );
            const profileDoc = await getDoc(profileRef);

            if (profileDoc.exists()) {
              const profileData = profileDoc.data();
              usersList.push({
                id: userDoc.id,
                profile: profileData,
              });
            } else {
              usersList.push({
                id: userDoc.id,
                profile: {
                  email: 'N/A',
                  displayName: 'N/A',
                  isAdmin: false,
                  createdAt: new Date(),
                  balance: 0,
                  status: 'active',
                },
              });
            }
          } catch (profileErr) {
            console.warn(`Could not fetch profile for user ${userDoc.id}:`, profileErr);
            usersList.push({
              id: userDoc.id,
              profile: {
                email: 'N/A',
                displayName: 'N/A',
                isAdmin: false,
                createdAt: new Date(),
                balance: 0,
                status: 'active',
              },
            });
          }
        }
        setUsers(usersList);
        setDataLoading(false); // Set dataLoading to false after initial user fetch
      },
      (err) => {
        console.error('Error fetching real-time users:', err);
        setDataLoading(false);
      }
    );

    // Cleanup function to unsubscribe from the listener when component unmounts
    return () => unsubscribe();
  }, [isAdmin, appId]); // Depend on isAdmin and appId

  // Enhanced fetch transactions with user details
  const fetchTransactions = async () => {
    try {
      const transCol = collectionGroup(db, 'transactions');
      const snapshot = await getDocs(transCol);
      let transList = snapshot.docs.map((transDoc) => {
        const data = transDoc.data();
        return {
          id: transDoc.id,
          ref: transDoc.ref,
          ...data,
          userId: transDoc.ref.path.split('/')[3], // artifacts/cryptonest/users/[userId]/...
        };
      });

      // --- NEW: Attach user display names to transactions ---
      const usersMap = new Map(users.map(u => [u.id, u.profile.displayName]));

      transList = transList.map(trans => ({
        ...trans,
        userName: usersMap.get(trans.userId) || trans.userId // Use displayName or fallback to userId
      }));
      // --- END NEW ---

      setTransactions(transList);
    } catch (err) {
      console.error('Error fetching transactions:', err.code, err.message);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (isAdmin) {
        // Users are already handled by onSnapshot. We just need to fetch transactions.
        await fetchTransactions();
      }
      // setDataLoading is now primarily controlled by the onSnapshot for users.
      // We keep this useEffect for initial transaction load.
    };

    if (!loading && user && isAdmin) {
      // If users are already loaded by onSnapshot, we can fetch transactions.
      // Add a check to ensure users are not empty or dataLoading is false for users,
      // but given the current structure, fetchTransactions will be called once users are set.
      if (users.length > 0 || !dataLoading) { // Only fetch transactions if users data is available
         loadData();
      }
    } else if (!loading && (!user || !isAdmin)) {
      setDataLoading(false);
    }
  }, [user, loading, isAdmin, users.length, dataLoading]); // Added users.length to dependencies

  // Update user profile
  const handleUpdateUser = async (userId, newData) => {
    try {
      const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);
      await updateDoc(userDocRef, {
        ...newData,
        updatedAt: new Date(),
      });
      alert('User updated successfully');
      // No need to call fetchUsers() here because onSnapshot will automatically update 'users' state
      // However, we should re-fetch transactions because user display names might have changed
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
        'Are you sure you want to delete this user? This action cannot be undone.'
      )
    ) {
      try {
        const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);
        await deleteDoc(userDocRef);
        alert('User deleted successfully');
        // No need to call fetchUsers() here because onSnapshot will automatically update 'users' state
        // Re-fetch transactions to remove transactions from deleted user
        fetchTransactions();
      } catch (err) {
        console.error('Error deleting user:', err.code, err.message);
        alert('Error deleting user: ' + err.message);
      }
    }
  };

  // Update transaction
  const handleUpdateTransaction = async (transRef, newData) => {
    try {
      await updateDoc(transRef, {
        ...newData,
        updatedAt: new Date(),
      });
      alert('Transaction updated successfully');
      fetchTransactions(); // Call fetchTransactions to refresh transactions
      setEditingTransaction(null);
    } catch (err) {
      console.error('Error updating transaction:', err.code, err.message);
      alert('Error updating transaction: ' + err.message);
    }
  };

  // Delete transaction
  const handleDeleteTransaction = async (transRef) => {
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      try {
        await deleteDoc(transRef);
        alert('Transaction deleted successfully');
        fetchTransactions(); // Call fetchTransactions to refresh transactions
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
      (profile.displayName &&
        profile.displayName.toLowerCase().includes(searchLower))
    );
  });

  // Filter transactions based on status
  const filteredTransactions = transactions.filter((trans) => {
    if (filterStatus === 'all') return true;
    return trans.status === filterStatus;
  });

  // User Edit Form Component (no change needed here)
  const UserEditForm = ({ user, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
      email: user.profile.email || '',
      displayName: user.profile.displayName || '',
      isAdmin: user.profile.isAdmin || false,
      balance: user.profile.balance || 0,
      status: user.profile.status || 'active',
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      onSave(user.id, formData);
    };

    return (
      <form onSubmit={handleSubmit} className="edit-form">
        <h4>Edit User: {formData.displayName || user.id}</h4>{' '}
        {/* Display name in edit form header */}
        <div className="form-group">
          <label>Email:</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Display Name:</label>
          <input
            type="text"
            value={formData.displayName}
            onChange={(e) =>
              setFormData({ ...formData, displayName: e.target.value })
            }
          />
        </div>
        <div className="form-group">
          <label>Balance:</label>
          <input
            type="number"
            step="0.01"
            value={formData.balance}
            onChange={(e) =>
              setFormData({ ...formData, balance: parseFloat(e.target.value) || 0 })
            }
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
            />
            Admin Privileges
          </label>
        </div>
        <div className="form-actions">
          <button type="submit">Save Changes</button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    );
  };

  // Transaction Edit Form Component (no change needed here)
  const TransactionEditForm = ({ transaction, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
      type: transaction.type || '',
      amount: transaction.amount || 0,
      status: transaction.status || 'pending',
      description: transaction.description || '',
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      onSave(transaction.ref, formData);
    };

    return (
      <form onSubmit={handleSubmit} className="edit-form">
        <h4>Edit Transaction: {transaction.id}</h4>
        <div className="form-group">
          <label>Type:</label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
          >
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="transfer">Transfer</option>
            <option value="trade">Trade</option>
          </select>
        </div>
        <div className="form-group">
          <label>Amount:</label>
          <input
            type="number"
            step="0.01"
            value={formData.amount}
            onChange={(e) =>
              setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })
            }
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
          <button type="submit">Save Changes</button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    );
  };

  // Loading state
  if (loading || dataLoading) {
    return (
      <p style={{ textAlign: 'center', fontSize: '1.5rem', marginTop: '4rem' }}>
        Loading dashboard...
      </p>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <p style={{ textAlign: 'center', fontSize: '1.5rem', marginTop: '4rem' }}>
        Please log in to access the admin dashboard.
      </p>
    );
  }

  // Not admin
  if (!isAdmin) {
    return (
      <p style={{ textAlign: 'center', fontSize: '1.5rem', marginTop: '4rem' }}>
        Access denied. Admin privileges required.
      </p>
    );
  }

  return (
    <div className="admin-dashboard">
      <h2>Admin Dashboard</h2>

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

      {/* Users Section */}
      <div className="section">
        <h3>User Management</h3>

        {/* Search and Filter */}
        <div className="controls">
          <input
            type="text"
            placeholder="Search users..."
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
                  {/* Display name or user ID */}
                  <span className={`status ${profile.status || 'active'}`}>
                    {profile.status || 'active'}
                  </span>
                </div>
                <div className="user-details">
                  <p>
                    <strong>Email:</strong> {profile.email || 'N/A'}
                  </p>
                  <p>
                    <strong>Display Name:</strong> {profile.displayName || 'N/A'}
                  </p>
                  <p>
                    <strong>Balance:</strong> ${profile.balance || 0}
                  </p>
                  <p>
                    <strong>Admin:</strong> {String(profile.isAdmin)}
                  </p>
                  <p>
                    <strong>Created:</strong>{' '}
                    {profile.createdAt
                      ? new Date(profile.createdAt.seconds * 1000).toLocaleDateString()
                      : 'N/A'}
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
                      onClick={() => handleUpdateUser(user.id, { isAdmin: true })}
                      className="admin-btn"
                    >
                      Make Admin
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteUser(user.id)}
                    className="delete-btn"
                  >
                    Delete User
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
          {filteredTransactions.length === 0 && <p>No transactions found.</p>}
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
              <div key={trans.id} className="transaction-card">
                <div className="transaction-header">
                  <strong>{trans.id}</strong>
                  <span className={`status ${trans.status || 'pending'}`}>
                    {trans.status || 'pending'}
                  </span>
                </div>
                <div className="transaction-details">
                  <p>
                    <strong>User:</strong> {trans.userName || 'N/A'}{' '}
                    {/* Display the userName */}
                  </p>
                  <p>
                    <strong>Type:</strong> {trans.type || 'N/A'}
                  </p>
                  <p>
                    <strong>Amount:</strong> ${trans.amount || 0}
                  </p>
                  <p>
                    <strong>Description:</strong> {trans.description || 'N/A'}
                  </p>
                  <p>
                    <strong>Created:</strong>{' '}
                    {trans.createdAt
                      ? new Date(trans.createdAt.seconds * 1000).toLocaleDateString()
                      : 'N/A'}
                  </p>
                </div>
                <div className="transaction-actions">
                  <button
                    onClick={() => setEditingTransaction(trans.id)}
                    className="edit-btn"
                  >
                    Edit Transaction
                  </button>
                  {trans.status === 'pending' && (
                    <>
                      <button
                        onClick={() =>
                          handleUpdateTransaction(trans.ref, { status: 'approved' })
                        }
                        className="approve-btn"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() =>
                          handleUpdateTransaction(trans.ref, { status: 'declined' })
                        }
                        className="decline-btn"
                      >
                        Decline
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleDeleteTransaction(trans.ref)}
                    className="delete-btn"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;