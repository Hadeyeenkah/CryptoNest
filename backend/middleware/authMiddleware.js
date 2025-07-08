const jwt = require('jsonwebtoken');
const User = require('../models/User');
const admin = require('firebase-admin'); // import the initialized admin

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided. Authorization denied.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || !decoded.userId) {
      return res.status(403).json({ message: 'Invalid token payload.' });
    }

    // Look up user by ID and exclude sensitive info
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Attach user to request for downstream handlers
    req.user = user;
    next();

  } catch (err) {
    console.error('JWT verification failed:', err.name, err.message);

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired. Please log in again.' });
    } else if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({ message: 'Invalid token. Authorization denied.' });
    } else {
      return res.status(500).json({ message: 'Internal server error while validating token.' });
    }
  }
};

module.exports = protect;
