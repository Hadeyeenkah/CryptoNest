const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth'); // Assuming auth.js is in middleware folder
const Transaction = require('../models/Transaction'); // Assuming your Transaction model

// --- GET all transactions for the authenticated user ---
router.get('/', authenticateToken, async (req, res) => {
    try {
        // req.user will be populated by authenticateToken middleware
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'User not authenticated or ID missing.' });
        }

        const transactions = await Transaction.find({ userId: req.user._id })
                                            .sort({ createdAt: -1 }) // Sort by newest first
                                            .limit(50); // Optional: Limit to recent transactions for dashboard

        res.status(200).json(transactions);
    } catch (error) {
        console.error('Error fetching transactions for user:', req.user?._id, error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

module.exports = router;