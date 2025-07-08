const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

// Import and re-export your functions
exports.request2FACode = require('./src/request2FACode').request2FACode;
exports.verify2FACode = require('./src/verify2FACode').verify2FACode;