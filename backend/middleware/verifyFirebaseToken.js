// middleware/verifyFirebaseToken.js
const admin = require("../admin");

async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.split("Bearer ")[1]
    : null;

  if (!token) {
    return res.status(403).json({ error: "No authorization token provided" });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken; // Attach user info (uid, email, role, etc.)
    next();
  } catch (err) {
    console.error("Invalid Firebase ID token:", err);
    res.status(403).json({ error: "Invalid or expired authorization token" });
  }
}
module.exports = async function (req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

module.exports = verifyFirebaseToken;
