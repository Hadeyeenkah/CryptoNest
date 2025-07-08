// middleware/auth.js
const admin = require('../config/firebaseAdmin'); // Make sure this is initialized properly


// ✅ Optional: Only initialize here if needed (usually done once globally)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(), // or admin.credential.cert(serviceAccount)
    // databaseURL: "https://<your-project-id>.firebaseio.com", // Optional
  });
}

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];

    // ✅ Ensure authHeader exists and is in correct format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token not provided' });
    }

    // ✅ Verify Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(token);

    // ✅ Validate UID exists
    if (!decodedToken || !decodedToken.uid) {
      return res.status(400).json({ error: 'Invalid token: UID missing' });
    }

    // ✅ Attach user info to request object
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      name: decodedToken.name || null,
      picture: decodedToken.picture || null,
    };

    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

module.exports = authenticateToken;
