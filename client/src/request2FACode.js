// functions/index.js (or a separate file imported into index.js)

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore(); // Firestore instance

/**
 * Cloud Function to request a 2FA verification code.
 * Generates a code, stores it with an expiry, and "sends" it to the user's email.
 *
 * @param {object} data - The data passed from the client.
 * @param {string} data.userId - The UID of the user requesting the code.
 * @param {string} data.appId - The application ID to construct Firestore paths.
 * @param {string} data.email - The user's email address to send the code to.
 * @param {functions.https.CallableContext} context - The context of the callable function call.
 * @returns {Promise<object>} - A promise that resolves to an object indicating success or failure.
 */
exports.request2FACode = functions.https.onCall(async (data, context) => {
  console.log("request2FACode: Function triggered.");

  // 1. Authentication Check:
  if (!context.auth || !context.auth.uid) {
    console.warn("request2FACode: Unauthenticated call.");
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }
  console.log(`request2FACode: Authenticated user ID: ${context.auth.uid}`);

  const { userId, appId, email } = data;

  // Validate input data
  if (!userId || !appId || !email) {
    console.error("request2FACode: Invalid input data. Received:", data);
    throw new functions.https.HttpsError('invalid-argument', 'Missing user ID, app ID, or email.');
  }
  console.log(`request2FACode: Data received - userId: ${userId}, appId: ${appId}, email: ${email}`);


  // Ensure the requesting user is the authenticated user
  if (context.auth.uid !== userId) {
    console.warn(`request2FACode: User ${context.auth.uid} attempted to request code for different user ${userId}.`);
    throw new functions.https.HttpsError('permission-denied', 'Cannot request code for another user.');
  }

  // Defensive check for db instance
  if (!db) {
    console.error("request2FACode: Firestore DB instance is not initialized.");
    throw new functions.https.HttpsError('internal', 'Database not ready.');
  }

  const twoFaRef = db.doc(`artifacts/${appId}/users/${userId}/twoFactorAuth/data`);
  console.log(`request2FACode: Firestore document reference: ${twoFaRef.path}`);

  try {
    // Generate a 6-digit numeric code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    // Set expiry for 5 minutes from now
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 5 * 60 * 1000);

    console.log(`request2FACode: Generated code: ${code}, expiresAt: ${expiresAt.toDate()}`);

    // Store the code and its expiry in Firestore
    await twoFaRef.set({
      code: code,
      expiresAt: expiresAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      verified: false // Reset verification status
    }, { merge: true });

    console.log(`request2FACode: 2FA code successfully stored in Firestore for user ${userId}.`);

    // --- Placeholder for actual email sending logic ---
    // You would integrate with an email service here (e.g., SendGrid, Mailgun, Nodemailer)
    // For now, we'll just log it to the console as a simulation.
    console.log(`request2FACode: SIMULATING EMAIL SEND: To: ${email}, Subject: CryptoWealth 2FA, Code: ${code}`);
    // --- End of email sending placeholder ---

    return { success: true, message: 'Verification code sent successfully.' };

  } catch (error) {
    console.error(`request2FACode: Error during Firestore operation or email simulation for user ${userId}:`, error);
    // Re-throw Firebase Callable Function errors with appropriate codes
    if (error.code) {
      throw new functions.https.HttpsError(error.code, error.message);
    }
    // For unexpected errors, throw a generic internal error
    throw new functions.https.HttpsError('internal', `Failed to send verification code: ${error.message || 'An unknown error occurred.'}`);
  }
});
