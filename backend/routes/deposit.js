const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth'); // Assuming auth.js is in middleware folder
const Deposit = require('../models/Deposit'); // Assuming your Deposit model
const User = require('../models/User'); // Assuming your User model

// --- GET all deposits for the authenticated user ---
router.get('/', authenticateToken, async (req, res) => {
    try {
        // req.user will be populated by authenticateToken middleware
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'User not authenticated or ID missing.' });
        }

        const deposits = await Deposit.find({ userId: req.user._id }).sort({ createdAt: -1 });
        res.status(200).json(deposits);
    } catch (error) {
        console.error('Error fetching deposits for user:', req.user?._id, error);
        res.status(500).json({ error: 'Failed to fetch deposits' });
    }
});

// --- POST a new deposit ---
router.post('/', authenticateToken, async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'User not authenticated or ID missing.' });
        }

        const { amount, method, status = 'pending', transactionId } = req.body; // status defaults to 'pending'

        if (!amount || amount <= 0 || !method) {
            return res.status(400).json({ error: 'Amount and method are required and amount must be positive.' });
        }

        const newDeposit = new Deposit({
            userId: req.user._id,
            amount,
            method,
            status,
            transactionId
        });

        await newDeposit.save();

        // Optional: If you want to immediately update user balance upon 'completed' deposit
        // For 'pending' deposits, balance update would happen after admin approval
        if (status === 'completed') {
            const user = await User.findById(req.user._id);
            if (user) {
                user.balance += amount;
                await user.save();
                // Create a transaction record for this deposit
                await require('../models/Transaction').create({
                    userId: user._id,
                    type: 'deposit',
                    amount: amount,
                    details: `Deposit of ${amount} via ${method}`,
                    status: 'completed'
                });
            }
        }

        res.status(201).json({ message: 'Deposit initiated successfully', deposit: newDeposit });

    } catch (error) {
        console.error('Error creating deposit:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: error.message, details: error.errors });
        }
        res.status(500).json({ error: 'Failed to create deposit' });
    }
});

// You might also add routes for updating deposit status by admin, etc.
// For example:
// router.put('/:id/status', authenticateToken, async (req, res) => { ... admin logic ... });

module.exports = router;