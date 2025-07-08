const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Deposit = require('../models/Deposit');
const { Plan } = require('../models/models'); // Ensure Plan is correctly destructured if it's in models.js
const fetch = require('node-fetch'); // Make sure you actually use fetch if you import it

// *** IMPORTANT: Consolidate Authentication Middleware ***
// You have `authenticate` and `authMiddleware`.
// It's best to use one consistent name for your user authentication middleware.
// I'm assuming `authMiddleware` is your primary user authentication middleware that sets `req.user.userId`.
const authMiddleware = require('../middleware/auth'); // Use this for user authentication
const adminAuth = require('../middleware/adminAuth'); // For admin authentication

// Helper: Generate JWT token
const generateToken = (payload, expiresIn = '1h') =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

// --------- USER ROUTES ---------

// GET /api/auth/profile
// Removed the duplicate and incorrect `router.get('/profile', authenticate, authController.getProfile);`
// Ensure authMiddleware correctly populates `req.user.userId`
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    // req.user.userId should be populated by authMiddleware
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Destructure properties you want to send back, including currentPlan and planStartDate
    const {
      fullName,
      username,
      email,
      balance,
      totalInvestment,
      currentPlan,    // Added
      planStartDate,  // Added
      preferences     // Added (assuming you have this field for UI settings)
    } = user;

    res.json({
      fullName,
      username,
      email,
      balance,
      totalInvestment,
      currentPlan,
      planStartDate,
      preferences
    });
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { fullName, username, email, password } = req.body;
  if (!fullName || !username || !email || !password)
    return res.status(400).json({ message: 'All fields are required' });

  try {
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser)
      return res.status(400).json({ message: 'Email or username already in use' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      fullName,
      username,
      email,
      password: hashedPassword,
      balance: 0,
      totalInvestment: 0,
      // Initialize other fields as necessary, e.g., currentPlan, planStartDate, preferences
      // currentPlan: null,
      // planStartDate: null,
      // preferences: { darkMode: false, notifications: true }
    });

    await newUser.save();

    const token = generateToken({
      userId: newUser._id,
      email: newUser.email,
      username: newUser.username,
    });

    res.status(201).json({
      message: `Welcome, ${newUser.fullName}! Signup successful.`,
      token,
      userId: newUser._id,
      // Optionally return some basic user info for immediate use in client
      user: {
        fullName: newUser.fullName,
        username: newUser.username,
        email: newUser.email,
        balance: newUser.balance,
        totalInvestment: newUser.totalInvestment
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    // Be careful not to expose too much detail about the error to the client
    res.status(500).json({ message: 'Server error', error: 'Failed to create user account.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required' });

  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ message: 'Invalid email or password' });

    const token = generateToken({
      userId: user._id,
      email: user.email,
      username: user.username,
    });

    res.json({
      message: `Welcome back, ${user.fullName}!`,
      token,
      userId: user._id,
      // Optionally return some basic user info for immediate use in client
      user: {
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        balance: user.balance,
        totalInvestment: user.totalInvestment
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error', error: 'Failed to log in.' });
  }
});

// POST /api/auth/logout
// While `authMiddleware` is used here, for a simple logout (client-side token removal),
// it might not strictly be necessary as the token is invalidated on the client.
// However, it's good practice if you plan to implement server-side token invalidation/blacklist.
router.post('/logout', authMiddleware, (_req, res) => {
  // In a real application, if you implement server-side token blacklisting,
  // this is where you'd add the token to a blacklist.
  res.json({ message: 'Logged out successfully' });
});


// POST /api/deposit - This route should probably be under a /api/user or /api/transaction endpoint
// However, if you are mounting this router at `/api/auth`, then the path would become `/api/auth/deposit`.
// If you intend for this to be `/api/deposit`, then this route should not be in the auth router.
// For now, I'm keeping it here as per your original code.
router.post('/deposit', authMiddleware, async (req, res) => {
  const { amount, planId } = req.body; // Changed 'plan' to 'planId' for clarity
  const userId = req.user.userId;

  if (!amount || !planId) // Check for planId
    return res.status(400).json({ message: 'Amount and plan ID are required' });

  try {
    // Validate that the planId exists and is a valid plan
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({ message: 'Invalid plan selected.' });
    }

    const deposit = new Deposit({
      userId,
      amount,
      plan: plan.name, // Store plan name or ID, depending on your schema design
      planId: plan._id, // Store the plan's ID for better reference
      status: 'pending',
      date: new Date(),
    });

    await deposit.save();
    res.status(201).json({ message: 'Deposit submitted for approval.', depositId: deposit._id });
  } catch (err) {
    console.error('Error creating deposit:', err);
    res.status(500).json({ message: 'Server error.', error: 'Failed to submit deposit.' });
  }
});

// --------- ADMIN ROUTES ---------

// POST /api/admin/signup
// CONSIDERATION: This route should ideally be protected and not openly accessible
// for creating new admins in a production environment.
router.post('/admin/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password required' });

  try {
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin)
      return res.status(400).json({ message: 'Admin already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new Admin({ email, password: hashedPassword });
    await admin.save();

    res.status(201).json({ message: 'Admin created successfully' });
  } catch (err) {
    console.error('Admin signup error:', err);
    res.status(500).json({ message: 'Server error', error: 'Failed to create admin account.' });
  }
});

// POST /api/admin/login
router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password required' });

  try {
    const admin = await Admin.findOne({ email });
    if (!admin || !(await bcrypt.compare(password, admin.password)))
      return res.status(401).json({ message: 'Invalid credentials' });

    const token = generateToken({ id: admin._id, role: 'admin' }, '1d');
    res.json({ message: 'Admin login successful', token });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ message: 'Server error', error: 'Failed to log in as admin.' });
  }
});

// GET /api/admin/deposits/pending
router.get('/admin/deposits/pending', adminAuth, async (_req, res) => {
  try {
    const pending = await Deposit.find({ status: 'pending' }).populate('userId', 'fullName username email'); // Populate user info
    res.json(pending);
  } catch (err) {
    console.error('Error fetching pending deposits:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/deposits/:id/approve
router.post('/admin/deposits/:id/approve', adminAuth, async (req, res) => {
  try {
    const deposit = await Deposit.findById(req.params.id);
    if (!deposit)
      return res.status(404).json({ message: 'Deposit not found' });

    if (deposit.status !== 'pending') {
      return res.status(400).json({ message: 'Deposit is not pending approval.' });
    }

    deposit.status = 'approved';
    await deposit.save();

    // After approving, update the user's balance and total investment
    const user = await User.findById(deposit.userId);
    if (user) {
      user.balance += deposit.amount;
      user.totalInvestment += deposit.amount;
      // You might also want to set the user's currentPlan and planStartDate here if it's the first deposit or a plan change
      // For example:
      // user.currentPlan = deposit.planId; // Assuming deposit.planId is the actual Plan _id
      // user.planStartDate = new Date();
      await user.save();
    } else {
      console.warn(`User with ID ${deposit.userId} not found for approved deposit ${deposit._id}`);
    }

    res.json({ message: 'Deposit approved and user balance updated' });
  } catch (err) {
    console.error('Error approving deposit:', err);
    res.status(500).json({ message: 'Server error', error: 'Failed to approve deposit.' });
  }
});

// POST /api/admin/deposits/:id/reject
router.post('/admin/deposits/:id/reject', adminAuth, async (req, res) => {
  try {
    const deposit = await Deposit.findById(req.params.id);
    if (!deposit)
      return res.status(404).json({ message: 'Deposit not found' });

    if (deposit.status !== 'pending') {
      return res.status(400).json({ message: 'Deposit is not pending rejection.' });
    }

    deposit.status = 'rejected';
    await deposit.save();

    res.json({ message: 'Deposit rejected' });
  } catch (err) {
    console.error('Error rejecting deposit:', err);
    res.status(500).json({ message: 'Server error', error: 'Failed to reject deposit.' });
  }
});

// GET /api/admin/plans
router.get('/admin/plans', adminAuth, async (_req, res) => {
  try {
    const plans = await Plan.find();
    res.json(plans);
  } catch (err) {
    console.error('Error fetching plans:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/plans/:id
router.put('/admin/plans/:id', adminAuth, async (req, res) => {
  const { interestRate, duration, minAmount, maxAmount, name, description } = req.body; // Added other plan fields for flexibility
  const updateFields = {};

  if (interestRate != null) updateFields.interestRate = interestRate;
  if (duration != null) updateFields.duration = duration;
  if (minAmount != null) updateFields.minAmount = minAmount;
  if (maxAmount != null) updateFields.maxAmount = maxAmount;
  if (name != null) updateFields.name = name;
  if (description != null) updateFields.description = description;


  if (Object.keys(updateFields).length === 0) {
    return res.status(400).json({ message: 'No valid fields provided for update.' });
  }

  try {
    const plan = await Plan.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields }, // Use $set to update specific fields
      { new: true, runValidators: true } // runValidators ensures updates respect schema validations
    );

    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    res.json({ message: 'Plan updated successfully', plan });
  } catch (err) {
    console.error('Error updating plan:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message, errors: err.errors });
    }
    res.status(500).json({ message: 'Server error', error: 'Failed to update plan.' });
  }
});

// POST /api/admin/plans (New route to add a plan)
router.post('/admin/plans', adminAuth, async (req, res) => {
  const { name, description, interestRate, duration, minAmount, maxAmount } = req.body;

  if (!name || !description || interestRate == null || !duration || minAmount == null || maxAmount == null) {
    return res.status(400).json({ message: 'All plan fields are required.' });
  }

  try {
    const newPlan = new Plan({
      name,
      description,
      interestRate,
      duration,
      minAmount,
      maxAmount,
    });
    await newPlan.save();
    res.status(201).json({ message: 'Plan created successfully', plan: newPlan });
  } catch (err) {
    console.error('Error creating plan:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message, errors: err.errors });
    }
    res.status(500).json({ message: 'Server error', error: 'Failed to create plan.' });
  }
});

// DELETE /api/admin/plans/:id (New route to delete a plan)
router.delete('/admin/plans/:id', adminAuth, async (req, res) => {
  try {
    const plan = await Plan.findByIdAndDelete(req.params.id);
    if (!plan) {
      return res.status(404).json({ message: 'Plan not found.' });
    }
    res.json({ message: 'Plan deleted successfully.' });
  } catch (err) {
    console.error('Error deleting plan:', err);
    res.status(500).json({ message: 'Server error', error: 'Failed to delete plan.' });
  }
});


module.exports = router;