const admin = require("firebase-admin");
const path = require("path");

// Path to your service account key JSON file
const serviceAccount = require(path.resolve(__dirname, "serviceAccountKey.json"));

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Get UID from command line argument
const uid = process.argv[2];

if (!uid) {
  console.error("❌ Usage: node setAdmin.js <uid>");
  process.exit(1);
}

// Set the custom claim
admin.auth().setCustomUserClaims(uid, { isAdmin: true })
  .then(() => {
    console.log(`✅ Custom claim 'isAdmin: true' set for user UID: ${uid}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error setting custom claim:", err);
    process.exit(1);
  });
