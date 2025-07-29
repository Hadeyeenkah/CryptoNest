// functions/index.js

// Import the Firebase Admin SDK and Firebase Functions SDK
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Admin SDK only if it hasn't been initialized already
if (!admin.apps.length) {
  admin.initializeApp();
}

// Get a reference to the Firestore database
const db = admin.firestore(); // Firestore instance for the webhook function

// --- Admin Role Management Functions ---

/**
 * Callable Cloud Function to set 'isAdmin' custom claim for a user.
 * This function should be called from a trusted environment (e.g., your local machine, a secure admin panel).
 * DO NOT expose this to the public client-side.
 */
exports.addAdminRole = functions.https.onCall(async (data, context) => {
  // Optional: Add security check to ensure only privileged users can call this function.
  // For initial setup, you might omit this check, but it's crucial for production.
  // For example, you could check if the caller's UID is a predefined admin UID,
  // or if they already have an 'isSuperAdmin' claim.
  // if (context.auth && context.auth.token.isSuperAdmin !== true) {
  //   throw new functions.https.HttpsError('permission-denied', 'Only super admins can assign admin roles.');
  // }

  if (!data.email) {
    throw new functions.https.HttpsError('invalid-argument', 'The email address is required.');
  }

  try {
    const user = await admin.auth().getUserByEmail(data.email);
    // Set the custom claim
    await admin.auth().setCustomUserClaims(user.uid, { isAdmin: true });

    console.log(`Successfully set isAdmin: true for user: ${data.email} (UID: ${user.uid})`);
    return { message: `Success! ${data.email} is now an admin. User needs to re-login to update token.` };

  } catch (error) {
    console.error("Error setting custom claim:", error);
    if (error.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError('not-found', `User with email ${data.email} not found.`);
    }
    throw new functions.https.HttpsError('internal', 'Failed to set admin role.', error.message);
  }
});

/**
 * Callable Cloud Function to remove 'isAdmin' custom claim from a user.
 * This function should be called from a trusted environment.
 * DO NOT expose this to the public client-side.
 */
exports.removeAdminRole = functions.https.onCall(async (data, context) => {
  // Optional: Add security check (e.g., only super admins can remove roles)
  // if (context.auth && context.auth.token.isSuperAdmin !== true) {
  //   throw new functions.https.HttpsError('permission-denied', 'Only super admins can revoke admin roles.');
  // }

  if (!data.email) {
    throw new functions.https.HttpsError('invalid-argument', 'The email address is required.');
  }

  try {
    const user = await admin.auth().getUserByEmail(data.email);
    // Set isAdmin to false to remove the claim effectively.
    // Setting to `null` or `{}` effectively removes all claims, so `isAdmin: false` is clearer.
    await admin.auth().setCustomUserClaims(user.uid, { isAdmin: false });

    console.log(`Successfully removed isAdmin for user: ${data.email} (UID: ${user.uid})`);
    return { message: `Success! ${data.email} is no longer an admin. User needs to re-login to update token.` };
  } catch (error) {
    console.error("Error removing custom claim:", error);
    if (error.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError('not-found', `User with email ${data.email} not found.`);
    }
    throw new functions.https.HttpsError('internal', 'Failed to remove admin role.', error.message);
  }
});

/**
 * Firebase Cloud Function to act as a Telegram Webhook.
 * This function listens for incoming messages from your Telegram bot (e.g., replies from the admin).
 * It parses the message and writes it to the appropriate Firestore chat document,
 * making the admin's reply visible in the user's support chat in the web application.
 */
exports.telegramWebhook = functions.https.onRequest(async (req, res) => {
  // Log the entire incoming request body for detailed debugging
  functions.logger.info("Received Telegram Webhook Update:", JSON.stringify(req.body, null, 2));

  // Ensure the request is a POST request, as Telegram webhooks are POST requests
  if (req.method !== 'POST') {
    functions.logger.warn("Received non-POST request to webhook. Method:", req.method);
    return res.status(405).send('Method Not Allowed');
  }

  const update = req.body;

  // Check if the update contains a message
  if (!update.message) {
    functions.logger.info("No 'message' object found in Telegram update. This might be another type of update (e.g., channel_post, edited_message).");
    return res.status(200).send('No message to process');
  }

  const message = update.message;
  const chatId = message.chat.id; // The chat ID where the message originated (e.g., your admin chat)
  const senderId = message.from.id; // The Telegram user ID of the sender (e.g., your admin ID)
  const text = message.text; // The text of the message

  functions.logger.info(`Processing message from chat ID: ${chatId}, sender ID: ${senderId}, text: "${text}"`);

  // We need to identify which user's chat this reply belongs to.
  // The most robust way is to look at the original message this is a reply to.
  // When the user sends a message from the frontend, we include "User ID: [userId]" and "Conversation ID: [conversationId]"
  // in the message text sent to Telegram. We'll parse this from the 'reply_to_message'.
  let targetUserId = null;
  let targetConversationId = null;

  // Check if this message is a reply to another message
  if (message.reply_to_message && message.reply_to_message.text) {
    const repliedToText = message.reply_to_message.text;
    functions.logger.info("This is a reply. Replied to message text:", repliedToText);

    // Use regular expressions to extract User ID and Conversation ID
    // Added 'gi' flags for global and case-insensitive search, though 'i' is usually enough for IDs
    const userIdMatch = repliedToText.match(/User ID: (.*?)\n/i);
    const conversationIdMatch = repliedToText.match(/Conversation ID: (.*?)\n/i);

    if (userIdMatch && userIdMatch[1]) {
      targetUserId = userIdMatch[1].trim();
      functions.logger.info(`Successfully extracted User ID: "${targetUserId}"`);
    } else {
      functions.logger.warn("Could not extract User ID from replied-to text using regex.");
    }

    if (conversationIdMatch && conversationIdMatch[1]) {
      targetConversationId = conversationIdMatch[1].trim();
      functions.logger.info(`Successfully extracted Conversation ID: "${targetConversationId}"`);
    } else {
      functions.logger.warn("Could not extract Conversation ID from replied-to text using regex.");
    }

  } else {
    // If it's not a reply, or reply_to_message is missing,
    // we cannot reliably determine which user's chat this belongs to.
    functions.logger.warn("Received a non-reply message or 'reply_to_message' object is missing/empty. Cannot determine target user/conversation. Ignoring message.");
    return res.status(200).send('Message not a reply or missing context');
  }

  // Ensure we have both target IDs to proceed
  if (!targetUserId || !targetConversationId) {
    functions.logger.error(`Failed to get both targetUserId (${targetUserId}) and targetConversationId (${targetConversationId}) from reply. Cannot process.`);
    // You might want to send a message back to the admin via Telegram API
    // informing them that the reply could not be processed due to missing context.
    return res.status(200).send('Missing target user or conversation ID from reply context');
  }

  try {
    // Construct the Firestore message data for the admin's reply
    const messageData = {
      sender: 'admin', // The admin is sending this message
      recipient: targetUserId, // The original user is the recipient
      text: text, // The actual reply text from the admin
      timestamp: admin.firestore.FieldValue.serverTimestamp(), // Use server timestamp
      method: 'telegram_reply' // Indicate that this message came via Telegram reply
    };

    // Add the message to the specific user's chat subcollection in Firestore
    const messagesCollectionRef = db.collection('chats').doc(targetConversationId).collection('messages');
    await messagesCollectionRef.add(messageData);

    // Update the parent conversation document with the last message details
    const conversationDocRef = db.collection('chats').doc(targetConversationId);
    await conversationDocRef.set({
      lastMessageText: text,
      lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    functions.logger.info(`Successfully recorded admin reply to Firestore for conversation ${targetConversationId}`);
    return res.status(200).send('Message processed');

  } catch (error) {
    functions.logger.error("Error writing admin reply to Firestore:", error);
    // Log the full error object for more details
    functions.logger.error("Firestore write error details:", error.message, error.code);
    return res.status(500).send('Internal Server Error');
  }
});


// --- Callable Cloud Function to update user balance securely ---
// This function will be triggered by the client-side DashboardPage.jsx
exports.updateUserBalance = functions.https.onCall(async (data, context) => {
  // 1. Authenticate the request
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }

  const userId = context.auth.uid; // Get the UID of the authenticated user
  const { earnings, planId } = data; // Data sent from the client

  // 2. Validate input data
  if (typeof earnings !== 'number' || earnings <= 0) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'The "earnings" argument must be a positive number.'
    );
  }
  // You might also validate planId if it's crucial for the calculation here
  // if (typeof planId !== 'string' || planId.length === 0) { ... }

  const appId = 'cryptonest'; // Ensure this matches your client-side appId

  const userDashboardDocRef = db.doc(`artifacts/${appId}/users/${userId}/dashboardData/data`);
  const userProfileDocRef = db.doc(`artifacts/${appId}/users/${userId}/profile/data`); // Also update profile balance for consistency

  try {
    // 3. Use a Firestore Transaction for Atomic Updates
    // This ensures that the balance is read, updated, and written as a single, atomic operation,
    // preventing race conditions if multiple updates happen simultaneously.
    await db.runTransaction(async (transaction) => {
      const dashboardDoc = await transaction.get(userDashboardDocRef);
      const profileDoc = await transaction.get(userProfileDocRef);

      if (!dashboardDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'User dashboard data not found.'
        );
      }
      if (!profileDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'User profile data not found.'
        );
      }

      const currentDashboardData = dashboardDoc.data();
      const currentProfileData = profileDoc.data();

      // Ensure that the earnings are only applied once per day per user
      // This logic should mirror or enhance the client-side check
      const lastCalcTimestamp = currentDashboardData.lastDailyEarningTimestamp ?
                                currentDashboardData.lastDailyEarningTimestamp.toDate() : null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let lastCalcDateNormalized = null;
      if (lastCalcTimestamp) {
          lastCalcDateNormalized = new Date(lastCalcTimestamp);
          lastCalcDateNormalized.setHours(0, 0, 0, 0);
      }

      if (lastCalcDateNormalized && lastCalcDateNormalized.getTime() >= today.getTime()) {
          // Earnings already processed for today, no action needed
          console.log(`Daily earnings for user ${userId} already processed today.`);
          // Return a success status as the operation completed, even if no change was made
          return { status: 'success', message: 'Earnings already processed for today.' };
      }

      const newBalance = (currentDashboardData.balance || 0) + earnings;
      // Total invested doesn't change on daily earnings, so no update needed for it here.
      // const newTotalInvested = currentDashboardData.totalInvested || 0;

      // 4. Perform the updates within the transaction
      transaction.update(userDashboardDocRef, {
        balance: newBalance,
        lastCalculatedDailyEarningAmount: earnings, // Store the amount for display
        lastDailyEarningTimestamp: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Keep profile balance in sync (if you store it there)
      transaction.update(userProfileDocRef, {
        balance: newBalance,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 5. Optionally, record a transaction for the ROI payout
      const transactionsCollectionRef = db.collection(`artifacts/${appId}/users/${userId}/transactions`);
      transaction.add(transactionsCollectionRef, {
        type: 'roi',
        amount: earnings,
        status: 'approved', // Automatically approved by system
        description: `Daily ROI for ${planId || 'active plan'}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`User ${userId}: Balance updated to ${newBalance}, earnings ${earnings} added.`);
      return { status: 'success', message: 'Balance updated successfully.' };
    });

  } catch (error) {
    console.error('Transaction failed:', error);
    // Re-throw as HttpsError to send back to client
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to update balance due to an internal error.', error.message);
  }
});

// --- Import and re-export your existing functions ---
// Make sure these paths are correct relative to your functions/index.js file
// For example, if request2FACode.js is directly in functions/src, then it's './src/request2FACode'
// If they are not in separate files, you would include their code directly here.
// Assuming they are in 'src' subdirectory as per your original export.
// exports.request2FACode = require('./src/request2FACode').request2FACode;
// exports.verify2FACode = require('./src/verify2FACode').verify2FACode;

// IMPORTANT: If you have other functions in separate files, ensure they are correctly imported and exported here.
// For example, if you have a file `functions/src/myOtherFunction.js` with `exports.myOtherFunction = ...`,
// you would add: `exports.myOtherFunction = require('./src/myOtherFunction').myOtherFunction;`
