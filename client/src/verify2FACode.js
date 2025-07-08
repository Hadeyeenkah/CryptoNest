// functions/index.js (or a separate file imported into index.js)

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Cloud Function to verify a 2FA code provided by the user.
 *
 * @param {object} data - The data passed from the client.
 * @param {string} data.userId - The UID of the user verifying the code.
 * @param {string} data.appId - The application ID to construct Firestore paths.
 * @param {string} data.code - The 2FA code entered by the user.
 * @param {functions.https.CallableContext} context - The context of the callable function call.
 * @returns {Promise<object>} - A promise that resolves to an object indicating success or failure.
 */
exports.verify2FACode = functions.https.onCall(async (data, context) => {
  // 1. Authentication Check:
  if (!context.auth || !context.auth.uid) {
    console.warn("verify2FACode: Unauthenticated call.");
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const { userId, appId, code } = data;

  // Validate input data
  if (!userId || !appId || !code || typeof code !== 'string' || code.length !== 6) {
    console.error("verify2FACode: Invalid input data.", data);
    throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid verification code.');
  }

  // Ensure the verifying user is the authenticated user
  if (context.auth.uid !== userId) {
    console.warn(`verify2FACode: User ${context.auth.uid} attempted to verify code for different user ${userId}.`);
    throw new functions.https.HttpsError('permission-denied', 'Cannot verify code for another user.');
  }

  const twoFaRef = db.doc(`artifacts/${appId}/users/${userId}/twoFactorAuth/data`);

  try {
    const docSnap = await twoFaRef.get();

    if (!docSnap.exists) {
      console.warn(`verify2FACode: No 2FA record found for user ${userId}.`);
      throw new functions.https.HttpsError('not-found', 'No verification code found. Please request a new one.');
    }

    const twoFaData = docSnap.data();
    const storedCode = twoFaData.code;
    const expiresAt = twoFaData.expiresAt; // This is a Firestore Timestamp

    // Check if code matches
    if (storedCode !== code) {
      console.warn(`verify2FACode: Invalid code provided for user ${userId}.`);
      throw new functions.https.HttpsError('invalid-argument', 'Invalid verification code.');
    }

    // Check if code has expired
    if (expiresAt && expiresAt.toDate() < new Date()) {
      console.warn(`verify2FACode: Expired code provided for user ${userId}.`);
      // Optionally clear the expired code from Firestore
      await twoFaRef.update({ code: admin.firestore.FieldValue.delete(), expiresAt: admin.firestore.FieldValue.delete() });
      throw new functions.https.HttpsError('deadline-exceeded', 'Verification code has expired. Please request a new one.');
    }

    // If code is valid and not expired, mark as verified (or delete it to prevent reuse)
    // For simplicity, we'll mark it as verified and delete the code/expiry.
    await twoFaRef.update({
      verified: true,
      code: admin.firestore.FieldValue.delete(), // Delete code after successful verification
      expiresAt: admin.firestore.FieldValue.delete(), // Delete expiry after successful verification
      verifiedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`2FA code successfully verified for user ${userId}.`);
    return { success: true, message: '2FA verification successful.' };

  } catch (error) {
    console.error(`verify2FACode: Error verifying 2FA code for user ${userId}:`, error);
    // Re-throw Firebase Callable Function errors with appropriate codes
    if (error.code) {
      throw new functions.https.HttpsError(error.code, error.message);
    }
    throw new functions.https.HttpsError('internal', `Failed to verify code: An unexpected error occurred.`);
  }
});
