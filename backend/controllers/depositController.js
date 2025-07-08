const Deposit = require('../models/Deposit'); // Ensure the correct path to the Deposit model

const createDeposit = async (req, res) => {
  try {
    // Ensure that req.user._id is available (from auth middleware)
    if (!req.user || !req.user._id) {
      return res.status(400).json({ message: 'User ID is missing from the request.' });
    }

    // Create new deposit object
    const deposit = new Deposit({
      user: req.user._id, // Attach user ID from the authenticated user
      amount: req.body.amount, // Get deposit amount from request body
      plan: req.body.plan, // Assuming plan is passed in the body
      status: 'pending', // Default status is 'pending'
    });

    // Save the deposit to the database
    await deposit.save();

    // Respond with the created deposit data
    return res.status(201).json({
      message: 'Deposit created successfully',
      deposit,
    });
  } catch (err) {
    console.error('Error creating deposit:', err);
    return res.status(500).json({
      message: 'Failed to create deposit',
      error: err.message,
    });
  }
};

module.exports = {
  createDeposit,
};
