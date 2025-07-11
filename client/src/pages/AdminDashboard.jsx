import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// Import useAuth from your AuthContext
import { useAuth } from '../contexts/AuthContext';
// Import the Firebase app instance from your firebase.js file to initialize functions
import { app as firebaseApp } from '../firebase';

// Firebase Imports (only what's needed for Firestore operations, not initialization)
import {
  doc, getDoc, collection, query, where, onSnapshot,
  Timestamp,
  collectionGroup,
  orderBy
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import './Admin.css'; // Your custom admin CSS
import {
  Users, CreditCard, DollarSign, TrendingUp, Check, X, Edit3, Trash2,
  RefreshCw, Search, Filter, Clock, PlusCircle, MinusCircle, LogOut,
  AlertCircle, CheckCircle, XCircle
} from 'lucide-react';

// --- Reusable Modal Component ---
const Modal = ({ show, title, children, onClose, onSubmit, submitText, isSubmitting, showSubmitButton = true }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative modal-container">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">{title}</h3>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 modal-close">
          <X className="w-6 h-6" />
        </button>
        <div className="modal-content">
          {children}
        </div>
        {showSubmitButton && (
          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center"
              disabled={isSubmitting}
            >
              {isSubmitting && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              {submitText}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Reusable Confirmation Modal Component ---
const ConfirmModal = ({ show, title, message, onConfirm, onCancel, isConfirming }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 relative modal-container">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
            disabled={isConfirming}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center"
            disabled={isConfirming}
          >
            {isConfirming && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};


const AdminDashboard = () => {
  const navigate = useNavigate();
  // Use the useAuth hook to get Firebase instances and auth state
  const {
    user, // The Firebase Auth user object
    userId, // The user's UID
    isAdmin, // Boolean indicating if the user is an admin
    authChecked, // Boolean indicating if the initial auth check is complete
    db, // Firestore instance
    auth, // Auth instance
    appId, // The current application ID
    loading: authLoading, // AuthContext's internal loading state
    signOut // Logout function from AuthContext
  } = useAuth();

  // --- Data States ---
  const [allUsers, setAllUsers] = useState([]);
  const [pendingTransactions, setPendingTransactions] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    newUsers: 0,
    activeUsers: 0,
    pendingApprovals: 0,
    totalInvestments: 0,
    totalWithdrawals: 0,
  });

  // --- UI States ---
  const [message, setMessage] = useState({ type: '', text: '' });
  const [dashboardLoading, setDashboardLoading] = useState(true); // Loading state specific to dashboard data
  const [isSubmitting, setIsSubmitting] = useState(false); // For modal/action submission
  const [searchTerm, setSearchTerm] = useState('');
  const [userFilter, setUserFilter] = useState('all'); // 'all', 'new', 'active'

  // Modals
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showAddDeductModal, setShowAddDeductModal] = useState(false);
  const [addDeductDetails, setAddDeductDetails] = useState({ user: null, type: 'add', amount: '', description: '' });
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
  const [userToDeleteId, setUserToDeleteId] = useState(null);

  // Ref for functions instance (initialized once Firebase app is ready)
  const functionsInstanceRef = useRef(null);

  // --- Initialize Firebase Functions instance ---
  useEffect(() => {
    if (firebaseApp) {
      functionsInstanceRef.current = getFunctions(firebaseApp);
      console.log("AdminDashboard: Firebase Functions instance set.");
    }
  }, [firebaseApp]); // Depends on the firebaseApp instance being available


  // --- Data Fetching and Real-time Listeners (Firestore) ---
  useEffect(() => {
    let unsubscribeUsers = () => {};
    let unsubscribePendingTransactions = () => {};

    // Only proceed if Firebase instances are ready, user is confirmed admin, and auth check is complete
    if (db && appId && isAdmin && authChecked) {
      console.log("AdminDashboard: Firebase instances, admin status, and authChecked confirmed. Setting up data listeners.");
      console.log("AdminDashboard: Current isAdmin status from useAuth:", isAdmin); // Added for debugging
      setDashboardLoading(true); // Start loading dashboard data

      // 1. Listen to all users' profiles for user management and overall stats
      // The security rules for /artifacts/{appId}/users/{userId} with 'list' permission allow this.
      const usersCollectionRef = collection(db, `artifacts/${appId}/users`);
      console.log("AdminDashboard: Setting up listener for users collection:", usersCollectionRef.path);

      unsubscribeUsers = onSnapshot(usersCollectionRef, async (snapshot) => {
        console.log("AdminDashboard: Users collection snapshot received. Number of top-level user docs:", snapshot.docs.length);
        if (snapshot.empty) {
          console.log("AdminDashboard: Users collection is empty. No top-level user documents found.");
        }

        const usersDataPromises = snapshot.docs.map(async (userDoc) => {
          const userUid = userDoc.id;
          // Ensure appId is available before constructing paths, though it should be due to dependencies
          if (!appId) {
            console.error(`AdminDashboard: App ID is undefined when processing user ${userUid}. Skipping sub-document fetch.`);
            return { id: userUid, email: 'N/A', fullName: 'N/A', username: 'N/A', isAdmin: false, createdAt: null, balance: 0, totalInvestment: 0, totalInterest: 0, totalWithdrawal: 0, rawBalances: { USDT: 0 } };
          }

          const profileDocRef = doc(db, `artifacts/${appId}/users/${userUid}/profile/data`);
          const balanceDocRef = doc(db, `artifacts/${appId}/users/${userUid}/balances`, 'current');
          const dashboardDocRef = doc(db, `artifacts/${appId}/users/${userUid}/dashboardData`, 'data');

          console.log(`AdminDashboard: Attempting to fetch sub-documents for user ${userUid}: profile path: ${profileDocRef.path}, balance path: ${balanceDocRef.path}, dashboardData path: ${dashboardDocRef.path}`);

          let profile = {};
          let balance = { USDT: 0 };
          let dashboard = { totalInvested: 0, totalWithdrawal: 0, totalInterest: 0 };

          try {
            const [profileSnap, balanceSnap, dashboardSnap] = await Promise.all([
              getDoc(profileDocRef),
              getDoc(balanceDocRef),
              getDoc(dashboardDocRef)
            ]);

            profile = profileSnap.exists() ? profileSnap.data() : {};
            balance = balanceSnap.exists() ? balanceSnap.data() : { USDT: 0 };
            dashboard = dashboardSnap.exists() ? dashboardSnap.data() : { totalInvested: 0, totalWithdrawal: 0, totalInterest: 0 };

            console.log(`AdminDashboard: Data for user ${userUid}: Profile exists: ${profileSnap.exists()}, Balance exists: ${balanceSnap.exists()}, Dashboard exists: ${dashboardSnap.exists()}`);
            console.log(`AdminDashboard: Fetched data for user ${userUid}: Profile:`, profile, "Balance:", balance, "Dashboard:", dashboard);

          } catch (subDocError) {
            console.error(`AdminDashboard: Error fetching sub-documents for user ${userUid}. This might indicate a missing Firebase Security Rule for a specific sub-collection (profile, balances, dashboardData) or an issue with the admin's custom claims. Error:`, subDocError);
            // Log the error but continue processing other users
          }

          return {
            id: userUid,
            email: profile.email || 'N/A',
            fullName: profile.fullName || profile.displayName || 'N/A',
            username: profile.username || 'N/A',
            isAdmin: profile.isAdmin || false,
            createdAt: profile.createdAt ? profile.createdAt.toDate() : null,
            balance: balance.USDT || 0,
            totalInvestment: dashboard.totalInvested || 0,
            totalInterest: dashboard.totalInterest || 0,
            totalWithdrawal: dashboard.totalWithdrawal || 0,
            rawBalances: balance // Keep raw balances for potential crypto editing
          };
        });

        const resolvedUsers = await Promise.all(usersDataPromises);
        setAllUsers(resolvedUsers);
        console.log("AdminDashboard: All users data resolved and set:", resolvedUsers);

        // Calculate stats
        let totalUsersCount = resolvedUsers.length;
        let newUsersCount = resolvedUsers.filter(u => {
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
          return u.createdAt && u.createdAt > oneWeekAgo;
        }).length;
        let activeUsersCount = resolvedUsers.filter(u => u.totalInvestment > 0 || u.totalWithdrawal > 0 || u.balance > 0).length;
        let totalInvestmentsSum = resolvedUsers.reduce((sum, u) => sum + (u.totalInvestment || 0), 0);
        let totalWithdrawalsSum = resolvedUsers.reduce((sum, u) => sum + (u.totalWithdrawal || 0), 0);

        setStats(prev => ({
          ...prev,
          totalUsers: totalUsersCount,
          newUsers: newUsersCount,
          activeUsers: activeUsersCount,
          totalInvestments: totalInvestmentsSum,
          totalWithdrawals: totalWithdrawalsSum,
        }));
        console.log("AdminDashboard: Stats updated:", { totalUsersCount, newUsersCount, activeUsersCount, totalInvestmentsSum, totalWithdrawalsSum });
        setDashboardLoading(false); // Data fetching complete
      }, (error) => {
        console.error("AdminDashboard: Error fetching users (top-level collection or sub-documents). This likely indicates a missing Firebase Security Rule for the 'users' collection or its sub-documents, or an issue with the admin's custom claims. Error:", error);
        showMessage('error', 'Failed to load user data. Check console for details.');
        setDashboardLoading(false); // Stop loading on error
      });

      // 2. Fetch Pending Transactions (using Collection Group Query)
      const transactionsGroupRef = collectionGroup(db, 'transactions');
      const qPendingTransactions = query(
        transactionsGroupRef,
        where('status', '==', 'pending'),
        orderBy('timestamp', 'desc') // Order by newest first for display
      );
      console.log("AdminDashboard: Setting up listener for pending transactions collection group.");

      unsubscribePendingTransactions = onSnapshot(qPendingTransactions, async (snapshot) => {
        console.log("AdminDashboard: Pending transactions snapshot received. Number of pending docs:", snapshot.docs.length);
        if (snapshot.empty) {
          console.log("AdminDashboard: No pending transactions found.");
        }
        const pendingTxPromises = snapshot.docs.map(async (docSnap) => {
          const txData = docSnap.data();
          // Extract userId from the document reference path (e.g., artifacts/appId/users/userId/transactions/txId)
          const pathSegments = docSnap.ref.path.split('/');
          const userIdFromPath = pathSegments[pathSegments.indexOf('users') + 1];

          // Fetch user profile data for email/name associated with the transaction
          // Ensure appId is available before constructing path, though it should be due to dependencies
          if (!appId) {
            console.error(`AdminDashboard: App ID is undefined when fetching profile for transaction user ${userIdFromPath}.`);
            return { id: docSnap.id, ref: docSnap.ref, userId: userIdFromPath, userEmail: 'N/A', userName: 'N/A', ...txData, timestamp: txData.timestamp ? txData.timestamp.toDate() : new Date() };
          }
          const userProfileDocRef = doc(db, `artifacts/${appId}/users/${userIdFromPath}/profile/data`);
          console.log(`AdminDashboard: Attempting to fetch profile for transaction user ${userIdFromPath} at path: ${userProfileDocRef.path}`);

          let userProfileData = {};
          try {
            const userProfileSnap = await getDoc(userProfileDocRef);
            userProfileData = userProfileSnap.exists() ? userProfileSnap.data() : {};
            console.log(`AdminDashboard: Profile data for transaction user ${userIdFromPath}: exists: ${userProfileSnap.exists()}, data:`, userProfileData);
          } catch (profileFetchError) {
            console.error(`AdminDashboard: Error fetching profile for transaction user ${userIdFromPath}. This might indicate a missing Firebase Security Rule for the user's profile path or an issue with the admin's custom claims. Error:`, profileFetchError);
          }

          return {
            id: docSnap.id,
            ref: docSnap.ref, // Pass the full document reference for actions
            userId: userIdFromPath,
            userEmail: userProfileData.email || 'N/A',
            userName: userProfileData.fullName || userProfileData.username || 'N/A',
            ...txData,
            timestamp: txData.timestamp ? txData.timestamp.toDate() : new Date(),
          };
        });

        const resolvedPendingTx = await Promise.all(pendingTxPromises);
        setPendingTransactions(resolvedPendingTx.sort((a, b) => b.timestamp - a.timestamp)); // Sort by newest
        setStats(prev => ({ ...prev, pendingApprovals: resolvedPendingTx.length }));
        console.log("AdminDashboard: Pending transactions data resolved and set:", resolvedPendingTx);
      }, (err) => {
        console.error("AdminDashboard: Error fetching pending transactions. This likely indicates a missing Firebase Security Rule for the 'transactions' collection group or a missing composite index. Error:", err);
        showMessage('error', "Failed to load pending transactions. Check console for details.");
      });

      return () => {
        console.log("AdminDashboard: Cleaning up Firestore listeners.");
        unsubscribeUsers();
        unsubscribePendingTransactions();
      };
    } else if (authChecked && !isAdmin && !authLoading) {
      // If auth check is complete, not an admin, and not still loading auth, navigate
      console.log("AdminDashboard: Auth check complete, but user is not admin. Redirecting.");
      navigate('/dashboard');
    } else if (!authChecked || authLoading) {
      // Still waiting for auth to complete
      console.log("AdminDashboard: Waiting for authentication to complete or admin status to be confirmed.");
    }
  }, [db, appId, isAdmin, authChecked, authLoading, navigate]); // Dependencies

  // --- Utility Functions ---
  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(Math.abs(amount || 0));
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    if (date.toDate) { // Check if it's a Firestore Timestamp object
      date = date.toDate();
    }
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  // --- Admin Action Handlers (Calling Cloud Functions) ---

  const handleApproveRejectTransaction = async (txId, txUserId, amount, type, action) => {
    setIsSubmitting(true);
    try {
      if (!functionsInstanceRef.current || !appId || !txUserId) {
        throw new Error("Firebase Functions not initialized or missing user ID/App ID.");
      }

      const callableFunction = httpsCallable(functionsInstanceRef.current, 'processTransactionApproval');
      const result = await callableFunction({
        transactionId: txId,
        userId: txUserId, // Use txUserId here, not the admin's userId
        amount: amount,
        type: type,
        action: action,
        appId: appId
      });

      if (result.data.success) {
        showMessage('success', `Transaction ${txId} ${action}d successfully for user ${txUserId}.`);
      } else {
        throw new Error(result.data.message || `${action} failed.`);
      }
    } catch (error) {
      console.error(`Error ${action}ing transaction:`, error);
      showMessage('error', `Failed to ${action} transaction: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditUser = (userToEdit) => {
    setEditingUser({
      ...userToEdit,
      balance: parseFloat(userToEdit.balance) || 0,
      totalInvestment: parseFloat(userToEdit.totalInvestment) || 0,
      totalInterest: parseFloat(userToEdit.totalInterest) || 0,
      totalWithdrawal: parseFloat(userToEdit.totalWithdrawal) || 0,
      isAdmin: userToEdit.isAdmin || false,
    });
    setShowEditUserModal(true);
  };

  const handleSaveUserEdit = async () => {
    if (!editingUser) return;
    setIsSubmitting(true);
    try {
      if (!functionsInstanceRef.current || !appId || !editingUser.id) {
        throw new Error("Firebase Functions not initialized or missing user ID/App ID.");
      }

      const updateUserProfileCallable = httpsCallable(functionsInstanceRef.current, 'updateUserProfile');
      const result = await updateUserProfileCallable({
        userId: editingUser.id,
        appId: appId,
        updates: {
          fullName: editingUser.fullName,
          username: editingUser.username,
          isAdmin: editingUser.isAdmin,
          totalInvestment: editingUser.totalInvestment,
          totalInterest: editingUser.totalInterest,
          totalWithdrawal: editingUser.totalWithdrawal,
          USDTBalance: editingUser.balance,
        }
      });

      if (result.data.success) {
        showMessage('success', `User ${editingUser.email} data updated successfully.`);
        setShowEditUserModal(false);
        setEditingUser(null);
      } else {
        throw new Error(result.data.message || "User update failed.");
      }
    } catch (error) {
      console.error('Error saving user edit:', error);
      showMessage('error', `Failed to update user data: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenAddDeductModal = (userToModify, type) => {
    setAddDeductDetails({ user: userToModify, type, amount: '', description: '' });
    setShowAddDeductModal(true);
  };

  const handleAddDeductFunds = async () => {
    const { user: targetUser, type, amount, description } = addDeductDetails;
    if (!targetUser || !amount || isNaN(parseFloat(amount))) {
      showMessage('error', 'Please enter a valid amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (!functionsInstanceRef.current || !appId || !targetUser.id || !userId) {
        throw new Error("Firebase Functions not initialized or missing user ID/App ID/Admin ID.");
      }

      const addDeductFundsCallable = httpsCallable(functionsInstanceRef.current, 'addDeductFunds');
      const result = await addDeductFundsCallable({
        userId: targetUser.id,
        amount: parseFloat(amount),
        type: type,
        description: description,
        adminId: userId, // The admin performing the action (from useAuth)
        appId: appId
      });

      if (result.data.success) {
        showMessage('success', `${type === 'add' ? 'Added' : 'Deducted'} ${formatCurrency(parseFloat(amount))} ${type === 'add' ? 'to' : 'from'} ${targetUser.email}.`);
        setShowAddDeductModal(false);
        setAddDeductDetails({ user: null, type: 'add', amount: '', description: '' });
      } else {
        throw new Error(result.data.message || "Funds operation failed.");
      }
    } catch (error) {
      console.error(`Error ${type}ing funds:`, error);
      showMessage('error', `Failed to ${type} funds: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = (userUid) => {
    setUserToDeleteId(userUid);
    setShowConfirmDeleteModal(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDeleteId) return;
    setIsSubmitting(true);
    try {
      if (!functionsInstanceRef.current || !appId) {
        throw new Error("Firebase Functions not initialized or missing App ID.");
      }

      const deleteUserCallable = httpsCallable(functionsInstanceRef.current, 'deleteUserAndData');
      const result = await deleteUserCallable({
        userId: userToDeleteId,
        appId: appId
      });

      if (result.data.success) {
        showMessage('success', `User ${userToDeleteId} deleted successfully.`);
      } else {
        throw new Error(result.data.message || "User deletion failed.");
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      showMessage('error', `Failed to delete user: ${error.message}`);
    } finally {
      setIsSubmitting(false);
      setShowConfirmDeleteModal(false);
      setUserToDeleteId(null);
    }
  };

  const handleLogout = async () => {
    if (auth) { // Use the auth instance from useAuth
      try {
        await signOut(); // Use the signOut function from useAuth
        console.log("AdminDashboard: User logged out.");
        navigate('/login');
      } catch (logoutError) {
        console.error("AdminDashboard: Error logging out:", logoutError);
        showMessage('error', "Failed to log out. Please try again.");
      }
    }
  };

  // --- Filtered Users for Display ---
  const filteredUsers = allUsers.filter(userItem => { // Renamed 'user' to 'userItem' to avoid conflict with 'user' from useAuth
    const matchesSearch = userItem.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          userItem.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          userItem.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          userItem.id.toLowerCase().includes(searchTerm.toLowerCase());

    if (userFilter === 'all') return matchesSearch;
    if (userFilter === 'active') return matchesSearch && (userItem.totalInvestment > 0 || userItem.balance > 0);
    if (userFilter === 'new') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      return matchesSearch && userItem.createdAt && userItem.createdAt > oneWeekAgo;
    }
    return matchesSearch;
  });


  // --- Loading Screen ---
  // Combine authLoading with dashboardLoading for overall loading indicator
  if (authLoading || dashboardLoading) {
    return (
      <div className="loading-screen">
        <RefreshCw className="w-12 h-12 text-white animate-spin mb-4" />
        <p className="text-lg text-white">Loading admin dashboard...</p>
        <p className="user-id-display">App ID: {appId || 'N/A'}</p>
      </div>
    );
  }

  // --- Access Denied Screen for Non-Admins ---
  // This check now relies on isAdmin from useAuth, which is derived from userProfile
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-6 bg-white rounded-lg shadow">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-800">Access Denied</h2>
          <p className="text-gray-600 mt-2">You do not have administrator privileges to view this page.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-6 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Go to User Dashboard
          </button>
        </div>
      </div>
    );
  }

  // --- Main Admin Dashboard UI ---
  return (
    <div className="admin-dashboard-container">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 mt-1">Manage users, deposits, and withdrawals</p>
          </div>
          <div className="flex space-x-4">
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Message Display */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg border ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex items-center space-x-2">
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <XCircle className="w-5 h-5" />
              )}
              <span>{message.text}</span>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="stat-card">
            <div className="flex items-center space-x-2 mb-4">
              <Users className="w-5 h-5 text-blue-600" />
              <span className="stat-label">Total Users</span>
            </div>
            <div className="stat-value">{stats.totalUsers}</div>
          </div>

          <div className="stat-card">
            <div className="flex items-center space-x-2 mb-4">
              <Clock className="w-5 h-5 text-orange-600" />
              <span className="stat-label">Pending Approvals</span>
            </div>
            <div className="stat-value">{stats.pendingApprovals}</div>
          </div>

          <div className="stat-card">
            <div className="flex items-center space-x-2 mb-4">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <span className="stat-label">Total Investments</span>
            </div>
            <div className="stat-value">{formatCurrency(stats.totalInvestments)}</div>
          </div>

          <div className="stat-card">
            <div className="flex items-center space-x-2 mb-4">
              <DollarSign className="w-5 h-5 text-red-600" />
              <span className="stat-label">Total Withdrawals</span>
            </div>
            <div className="stat-value">{formatCurrency(stats.totalWithdrawals)}</div>
          </div>
        </div>

        {/* Pending Transactions Section */}
        <div className="panel mb-8">
          <div className="panel-header">
            <h2 className="panel-title">Pending Deposit & Withdrawal Approvals</h2>
          </div>
          <div className="overflow-x-auto">
            {pendingTransactions.length === 0 ? (
              <div className="empty-state">
                <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No pending transactions</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-header">Date</th>
                    <th className="table-header">User</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">Amount</th>
                    <th className="table-header">Plan/Details</th>
                    <th className="table-header text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pendingTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="table-cell">{formatDate(tx.timestamp)}</td>
                      <td className="table-cell">
                        <div className="font-medium text-gray-900">{tx.userEmail}</div>
                        <div className="text-sm text-gray-500">{tx.userName}</div>
                      </td>
                      <td className="table-cell">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          tx.type === 'deposit' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="table-cell">{formatCurrency(tx.amount)}</td>
                      <td className="table-cell">{tx.plan || tx.description || 'N/A'}</td>
                      <td className="table-cell text-right">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleApproveRejectTransaction(tx.id, tx.userId, tx.amount, tx.type, 'approve')}
                            className="action-button bg-green-600 hover:bg-green-700"
                            disabled={isSubmitting}
                          >
                            <Check className="w-4 h-4 mr-1" /> Approve
                          </button>
                          <button
                            onClick={() => handleApproveRejectTransaction(tx.id, tx.userId, tx.amount, tx.type, 'reject')}
                            className="action-button bg-red-600 hover:bg-red-700"
                            disabled={isSubmitting}
                          >
                            <X className="w-4 h-4 mr-1" /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* User Management Section */}
        <div className="panel">
          <div className="panel-header flex-col-mobile md:flex-row md:justify-between md:items-center">
            <h2 className="panel-title mb-4 md:mb-0">User Management</h2>
            <div className="flex flex-col md:flex-row items-stretch md:items-center space-y-3 md:space-y-0 md:space-x-4 w-full md:w-auto">
              <div className="relative w-full md:w-auto">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field pl-10 pr-4 py-2 w-full md:w-auto"
                />
              </div>
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="input-field pl-3 pr-10 py-2 w-full md:w-auto"
              >
                <option value="all">All Users</option>
                <option value="active">Active Users</option>
                <option value="new">New Users (Last 7 Days)</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            {filteredUsers.length === 0 ? (
              <div className="empty-state">
                <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No users found matching your criteria.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-header">Email</th>
                    <th className="table-header">Name</th>
                    <th className="table-header">Balance</th>
                    <th className="table-header">Invested</th>
                    <th className="table-header">Withdrawn</th>
                    <th className="table-header">Joined</th>
                    <th className="table-header">Role</th> {/* Changed from "Admin" to "Role" */}
                    <th className="table-header text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUsers.map((userItem) => (
                    <tr key={userItem.id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium text-gray-900">{userItem.email}</td>
                      <td className="table-cell">{userItem.fullName}</td>
                      <td className="table-cell">{formatCurrency(userItem.balance)}</td>
                      <td className="table-cell">{formatCurrency(userItem.totalInvestment)}</td>
                      <td className="table-cell">{formatCurrency(userItem.totalWithdrawal)}</td>
                      <td className="table-cell">{formatDate(userItem.createdAt)}</td>
                      <td className="table-cell">{userItem.isAdmin ? 'Admin' : 'User'}</td> {/* Display "Admin" or "User" */}
                      <td className="table-cell text-right">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleEditUser(userItem)}
                            className="action-button bg-blue-600 hover:bg-blue-700"
                            title="Edit User"
                          >
                            <Edit3 className="w-4 h-4" /> Edit
                          </button>
                          <button
                            onClick={() => handleOpenAddDeductModal(userItem, 'add')}
                            className="action-button bg-green-600 hover:bg-green-700"
                            title="Add Funds"
                          >
                            <PlusCircle className="w-4 h-4" /> Add Funds
                          </button>
                          <button
                            onClick={() => handleOpenAddDeductModal(userItem, 'deduct')}
                            className="action-button bg-yellow-600 hover:bg-yellow-700"
                            title="Deduct Funds"
                          >
                            <MinusCircle className="w-4 h-4" /> Deduct Funds
                          </button>
                          <button
                            onClick={() => handleDeleteUser(userItem.id)}
                            className="action-button bg-red-600 hover:bg-red-700"
                            title="Delete User"
                          >
                            <Trash2 className="w-4 h-4" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Edit User Modal */}
      <Modal
        show={showEditUserModal}
        title={`Edit User: ${editingUser?.email || ''}`}
        onClose={() => setShowEditUserModal(false)}
        onSubmit={handleSaveUserEdit}
        submitText="Save Changes"
        isSubmitting={isSubmitting}
      >
        {/* Added conditional rendering for editingUser to prevent errors if it's null initially */}
        {editingUser && (
          <form className="space-y-4">
            <div>
              <label htmlFor="editFullName" className="block text-sm font-medium text-gray-700">Full Name</label>
              <input
                type="text"
                id="editFullName"
                className="mt-1 block w-full input-field"
                value={editingUser.fullName || ''} // Added default empty string
                onChange={(e) => setEditingUser({ ...editingUser, fullName: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="editUsername" className="block text-sm font-medium text-gray-700">Username</label>
              <input
                type="text"
                id="editUsername"
                className="mt-1 block w-full input-field"
                value={editingUser.username || ''} // Added default empty string
                onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="editBalance" className="block text-sm font-medium text-gray-700">Current Balance (USDT)</label>
              <input
                type="number"
                id="editBalance"
                className="mt-1 block w-full input-field"
                value={editingUser.balance}
                onChange={(e) => setEditingUser({ ...editingUser, balance: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label htmlFor="editTotalInvestment" className="block text-sm font-medium text-gray-700">Total Investment</label>
              <input
                type="number"
                id="editTotalInvestment"
                className="mt-1 block w-full input-field"
                value={editingUser.totalInvestment}
                onChange={(e) => setEditingUser({ ...editingUser, totalInvestment: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label htmlFor="editTotalInterest" className="block text-sm font-medium text-gray-700">Total Interest</label>
              <input
                type="number"
                id="editTotalInterest"
                className="mt-1 block w-full input-field"
                value={editingUser.totalInterest}
                onChange={(e) => setEditingUser({ ...editingUser, totalInterest: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label htmlFor="editTotalWithdrawal" className="block text-sm font-medium text-gray-700">Total Withdrawal</label>
              <input
                type="number"
                id="editTotalWithdrawal"
                className="mt-1 block w-full input-field"
                value={editingUser.totalWithdrawal}
                onChange={(e) => setEditingUser({ ...editingUser, totalWithdrawal: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="flex items-center">
              <input
                id="editIsAdmin"
                name="editIsAdmin"
                type="checkbox"
                className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                checked={editingUser.isAdmin}
                onChange={(e) => setEditingUser({ ...editingUser, isAdmin: e.target.checked })}
              />
              <label htmlFor="editIsAdmin" className="ml-2 block text-sm text-gray-900">
                Is Admin
              </label>
            </div>
          </form>
        )}
      </Modal>

      {/* Add/Deduct Funds Modal */}
      <Modal
        show={showAddDeductModal}
        title={`${addDeductDetails.type === 'add' ? 'Add Funds to' : 'Deduct Funds from'} ${addDeductDetails.user?.email || 'User'}`}
        onClose={() => setShowAddDeductModal(false)}
        onSubmit={handleAddDeductFunds}
        submitText={`${addDeductDetails.type === 'add' ? 'Add' : 'Deduct'} Funds`}
        isSubmitting={isSubmitting}
      >
        {addDeductDetails.user && (
          <form className="space-y-4">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700">Amount (USDT)</label>
              <input
                type="number"
                id="amount"
                className="mt-1 block w-full input-field"
                value={addDeductDetails.amount}
                onChange={(e) => setAddDeductDetails({ ...addDeductDetails, amount: e.target.value })}
                placeholder="e.g., 100.00"
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description (Optional)</label>
              <textarea
                id="description"
                rows="3"
                className="mt-1 block w-full input-field"
                value={addDeductDetails.description}
                onChange={(e) => setAddDeductDetails({ ...addDeductDetails, description: e.target.value })}
                placeholder="Reason for this operation"
              ></textarea>
            </div>
          </form>
        )}
      </Modal>

      {/* Confirm Delete User Modal */}
      <ConfirmModal
        show={showConfirmDeleteModal}
        title="Confirm User Deletion"
        message={`Are you sure you want to delete user with UID: ${userToDeleteId}? This action cannot be undone and will delete all associated data.`}
        onConfirm={confirmDeleteUser}
        onCancel={() => setShowConfirmDeleteModal(false)}
        isConfirming={isSubmitting}
      />
    </div>
  );
};

export default AdminDashboard;
