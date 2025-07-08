const admin = require('firebase-admin');

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided or invalid format' });
    }

    const token = authHeader.split(' ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);

    req.user = decodedToken;

    // Optional: Check if user has admin role
    if (!req.user.admin) {
      return res.status(403).json({ message: 'Access forbidden: admin only' });
    }

    next(); // ✅ Proceed to next middleware

  } catch (error) {
    console.error('Protect middleware error:', error);
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ message: 'Token expired, please login again' });
    }
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

module.exports = protect;
