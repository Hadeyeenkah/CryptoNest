const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Admin SDK only if it hasn't been initialized already
if (!admin.apps.length) {
  admin.initializeApp();
}

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
    throw new new functions.https.HttpsError('invalid-argument', 'The email address is required.');
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


// --- Import and re-export your existing functions ---
exports.request2FACode = require('./src/request2FACode').request2FACode;
exports.verify2FACode = require('./src/verify2FACode').verify2FACode;