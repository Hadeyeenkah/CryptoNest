// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// If running locally with emulator, ensure GOOGLE_APPLICATION_CREDENTIALS
// environment variable is set or you use `firebase emulators:start`
admin.initializeApp();

const db = admin.firestore();

// --- Callable Cloud Function: processTransactionApproval ---
// This function handles approving or rejecting deposits/withdrawals.
// It updates the transaction status and user's balance.
exports.processTransactionApproval = functions.https.onCall(async (data, context) => {
  // 1. Authenticate and Authorize
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  if (!context.auth.token.admin) { // Check for admin custom claim
    throw new functions.https.HttpsError('permission-denied', 'Only administrators can perform this action.');
  }

  const { transactionId, userId, amount, type, action, appId } = data;

  if (!transactionId || !userId || typeof amount !== 'number' || !type || !action || !appId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid parameters for transaction processing.');
  }

  if (!['approve', 'reject'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid action. Must be "approve" or "reject".');
  }

  const transactionRef = db.collection(`artifacts/${appId}/users/${userId}/transactions`).doc(transactionId);
  const userBalanceRef = db.collection(`artifacts/${appId}/users/${userId}/balances`).doc('current');
  const userDashboardRef = db.collection(`artifacts/${appId}/users/${userId}/dashboardData`).doc('data');

  try {
    return await db.runTransaction(async (transaction) => {
      const transactionDoc = await transaction.get(transactionRef);
      if (!transactionDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Transaction not found.');
      }
      const currentTxData = transactionDoc.data();

      // Ensure transaction is still pending
      if (currentTxData.status !== 'pending') {
        throw new functions.https.HttpsError('failed-precondition', `Transaction is already ${currentTxData.status}.`);
      }

      // Update transaction status
      transaction.update(transactionRef, {
        status: action === 'approve' ? 'completed' : 'rejected',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedBy: context.auth.uid, // Admin who processed it
      });

      if (action === 'approve') {
        // Update user's balance and dashboard data
        const balanceDoc = await transaction.get(userBalanceRef);
        const currentBalance = balanceDoc.exists ? (balanceDoc.data().USDT || 0) : 0;

        const dashboardDoc = await transaction.get(userDashboardRef);
        const currentDashboard = dashboardDoc.exists ? dashboardDoc.data() : { totalInvested: 0, totalWithdrawal: 0, totalInterest: 0 };

        if (type === 'deposit') {
          transaction.set(userBalanceRef, { USDT: currentBalance + amount }, { merge: true });
          transaction.set(userDashboardRef, {
            totalInvested: (currentDashboard.totalInvested || 0) + amount
          }, { merge: true });
        } else if (type === 'withdrawal') {
          // You might add a check here to ensure currentBalance >= amount before deducting
          if (currentBalance < amount) {
            // This scenario should ideally be prevented earlier (client-side validation),
            // but a server-side check is crucial.
            throw new functions.https.HttpsError('failed-precondition', 'Insufficient balance for withdrawal approval.');
          }
          transaction.set(userBalanceRef, { USDT: currentBalance - amount }, { merge: true });
          transaction.set(userDashboardRef, {
            totalWithdrawal: (currentDashboard.totalWithdrawal || 0) + amount
          }, { merge: true });
        }
      }

      return { success: true, message: `Transaction ${transactionId} ${action}d.` };
    });
  } catch (error) {
    console.error(`Error processing transaction ${transactionId}:`, error);
    if (error instanceof functions.https.HttpsError) {
      throw error; // Re-throw Callable function errors
    }
    throw new functions.https.HttpsError('internal', `An unexpected error occurred: ${error.message}`);
  }
});

// --- Callable Cloud Function: updateUserProfile ---
// This function allows an admin to edit a user's profile and some dashboard/balance data.
exports.updateUserProfile = functions.https.onCall(async (data, context) => {
  // 1. Authenticate and Authorize
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Only administrators can perform this action.');
  }

  const { userId, appId, updates } = data;

  if (!userId || !appId || !updates || typeof updates !== 'object') {
    throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid parameters for user profile update.');
  }

  // Define paths to update
  const userProfileRef = db.collection(`artifacts/${appId}/users/${userId}/profile`).doc('data');
  const userBalanceRef = db.collection(`artifacts/${appId}/users/${userId}/balances`).doc('current');
  const userDashboardRef = db.collection(`artifacts/${appId}/users/${userId}/dashboardData`).doc('data');

  const profileUpdates = {};
  const balanceUpdates = {};
  const dashboardUpdates = {};

  // Map incoming updates to their respective documents
  if (updates.fullName !== undefined) profileUpdates.fullName = updates.fullName;
  if (updates.username !== undefined) profileUpdates.username = updates.username;
  if (updates.isAdmin !== undefined) {
    // Handling isAdmin for custom claims (more complex, covered next)
    // For now, only update the profile field for display/Firestore rules
    profileUpdates.isAdmin = updates.isAdmin;
  }

  if (updates.USDTBalance !== undefined) balanceUpdates.USDT = parseFloat(updates.USDTBalance);

  if (updates.totalInvestment !== undefined) dashboardUpdates.totalInvested = parseFloat(updates.totalInvestment);
  if (updates.totalInterest !== undefined) dashboardUpdates.totalInterest = parseFloat(updates.totalInterest);
  if (updates.totalWithdrawal !== undefined) dashboardUpdates.totalWithdrawal = parseFloat(updates.totalWithdrawal);

  try {
    await db.runTransaction(async (transaction) => {
      // Update profile
      if (Object.keys(profileUpdates).length > 0) {
        transaction.set(userProfileRef, profileUpdates, { merge: true });
      }

      // Update balance
      if (Object.keys(balanceUpdates).length > 0) {
        transaction.set(userBalanceRef, balanceUpdates, { merge: true });
      }

      // Update dashboard data
      if (Object.keys(dashboardUpdates).length > 0) {
        transaction.set(userDashboardRef, dashboardUpdates, { merge: true });
      }

      // Special handling for isAdmin: Update Firebase Auth Custom Claims
      if (updates.isAdmin !== undefined) {
        await admin.auth().setCustomUserClaims(userId, { admin: updates.isAdmin });
        // After setting claims, client needs to re-authenticate to pick them up,
        // or refresh token, but for admin panel this is usually fine on next login/refresh.
      }
    });

    return { success: true, message: `User ${userId} profile updated.` };
  } catch (error) {
    console.error(`Error updating user profile ${userId}:`, error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', `An unexpected error occurred: ${error.message}`);
  }
});


// --- Callable Cloud Function: addDeductFunds ---
// This function allows an admin to add or deduct funds from a user's balance.
exports.addDeductFunds = functions.https.onCall(async (data, context) => {
  // 1. Authenticate and Authorize
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Only administrators can perform this action.');
  }

  const { userId, amount, type, description, adminId, appId } = data;

  if (!userId || typeof amount !== 'number' || !['add', 'deduct'].includes(type) || !adminId || !appId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid parameters for fund operation.');
  }

  const userBalanceRef = db.collection(`artifacts/${appId}/users/${userId}/balances`).doc('current');
  const transactionsCollectionRef = db.collection(`artifacts/${appId}/users/${userId}/transactions`);

  try {
    return await db.runTransaction(async (transaction) => {
      const balanceDoc = await transaction.get(userBalanceRef);
      const currentBalance = balanceDoc.exists ? (balanceDoc.data().USDT || 0) : 0;

      let newBalance = currentBalance;
      if (type === 'add') {
        newBalance += amount;
      } else { // deduct
        if (currentBalance < amount) {
          throw new functions.https.HttpsError('failed-precondition', 'Insufficient balance to deduct funds.');
        }
        newBalance -= amount;
      }

      // Update the user's balance
      transaction.set(userBalanceRef, { USDT: newBalance }, { merge: true });

      // Record this admin action as a transaction
      await transactionsCollectionRef.add({
        type: type === 'add' ? 'admin_credit' : 'admin_debit',
        amount: amount,
        status: 'completed',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        description: description || `Admin ${type}ed ${amount} USDT`,
        processedByAdmin: adminId,
        currency: 'USDT',
        source: 'admin_adjustment', // Indicates it was an admin action
      });

      return { success: true, message: `Funds ${type}ed successfully.` };
    });
  } catch (error) {
    console.error(`Error ${type}ing funds for user ${userId}:`, error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', `An unexpected error occurred: ${error.message}`);
  }
});

// --- Callable Cloud Function: deleteUserAndData ---
// This function deletes a Firebase Auth user and all their associated Firestore data.
exports.deleteUserAndData = functions.https.onCall(async (data, context) => {
  // 1. Authenticate and Authorize
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Only administrators can perform this action.');
  }

  const { userId, appId } = data;

  if (!userId || !appId) {
    throw new functions.https.HttpsError('invalid-argument', 'User ID and App ID are required for deletion.');
  }

  try {
    // 1. Delete Firebase Auth user
    await admin.auth().deleteUser(userId);
    console.log(`Successfully deleted auth user: ${userId}`);

    // 2. Delete Firestore data (recursively for the user's top-level document)
    // Note: This requires a Recursive Delete Cloud Function (separate file/advanced setup)
    // or manually deleting subcollections. For simplicity here, we'll just delete the
    // top-level user document. For full recursive delete, you'd need to use a separate
    // callable function or trigger on user deletion.
    const userDocRef = db.collection(`artifacts/${appId}/users`).doc(userId);
    await userDocRef.delete(); // This only deletes the document, not subcollections by default

    // More robust approach for deleting subcollections:
    // For a simple example, you could iterate and delete. For large datasets,
    // consider the `deleteCollection` utility or a separate Cloud Function.
    // Example (simplified - not truly recursive for arbitrary depth):
    const subCollectionsToDelete = ['profile', 'balances', 'dashboardData', 'transactions']; // Add all subcollections
    for (const sub of subCollectionsToDelete) {
      const subColRef = userDocRef.collection(sub);
      const snapshot = await subColRef.limit(500).get(); // Fetch in batches
      if (snapshot.size > 0) {
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`Deleted ${snapshot.size} documents from ${sub} for user ${userId}`);
      }
    }


    return { success: true, message: `User ${userId} and associated data deleted.` };
  } catch (error) {
    console.error(`Error deleting user ${userId} and data:`, error);
    if (error.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError('not-found', 'User not found for deletion.');
    }
    throw new functions.https.HttpsError('internal', `Failed to delete user: ${error.message}`);
  }
});