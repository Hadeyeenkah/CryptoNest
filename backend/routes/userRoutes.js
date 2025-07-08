const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth'); // Authentication middleware

// GET /api/user/balance - Get current balance
router.get('/balance', auth, userController.getBalance);

// GET /api/user/account - Get complete account data
router.get('/account', auth, userController.getAccountData);

// GET /api/user/transactions - Get transaction history
router.get('/transactions', auth, userController.getTransactions);

// GET /api/user/investments - Get active investments
router.get('/investments', auth, userController.getInvestments);

// GET /api/user/profile - Get user profile
router.get('/profile', auth, userController.getProfile);

// PUT /api/user/profile - Update user profile
router.put('/profile', auth, userController.updateProfile);

module.exports = router;