// admin-setup.js (run from your local machine, not part of your app)
const admin = require('firebase-admin');
const serviceAccount = require('./path/to/your/serviceAccountKey.json'); // Download from Firebase Console -> Project settings -> Service accounts

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const uid = 'THE_USER_ID_OF_YOUR_ADMIN'; // Get this UID from Firebase Authentication
const email = 'admin@example.com'; // For logging/verification

admin.auth().getUserByEmail(email)
  .then((userRecord) => {
    return admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
  })
  .then(() => {
    console.log(`Custom claim 'admin: true' set for user ${email} (${uid})`);
    // Optional: Force token refresh for the user if they are currently logged in
    // admin.auth().revokeRefreshTokens(uid);
    // console.log(`Refresh tokens revoked for ${uid}. User must re-login to pick up new claims.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error setting custom claim:', error);
    process.exit(1);
  });