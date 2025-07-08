// config/firebaseAdmin.js

const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');

// ✅ Initialize Firebase Admin SDK with service account only once
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      // Optional: databaseURL can be added if needed
      // databaseURL: "https://<your-project-id>.firebaseio.com"
    });
    console.log("✅ Firebase Admin initialized successfully.");
  } catch (error) {
    console.error("❌ Firebase Admin initialization error:", error.message);
  }
}

module.exports = admin;
