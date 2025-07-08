const User = require('../models/User');
const Investment = require('../models/Investment');
const Transaction = require('../models/Transaction');

const userController = {
  // Get all users
  getAllUsers: async (req, res) => {
    try {
      const users = await User.find({ isActive: true }).select('-password');
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get user by ID
  getUserById: async (req, res) => {
    try {
      const user = await User.findById(req.params.id).select('-password');
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Create new user
  createUser: async (req, res) => {
    try {
      const { username, email, password, firstName, lastName } = req.body;
      
      // Check if user already exists
      const existingUser = await User.findOne({ 
        $or: [{ email }, { username }] 
      });
      
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }

      const user = new User({
        username,
        email,
        password,
        firstName,
        lastName
      });

      await user.save();
      
      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;
      
      res.status(201).json(userResponse);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Update user
  updateUser: async (req, res) => {
    try {
      const { password, ...updateData } = req.body;
      
      const user = await User.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Delete user (soft delete)
  deleteUser: async (req, res) => {
    try {
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { isActive: false },
        { new: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get user dashboard data
  getUserDashboard: async (req, res) => {
    try {
      const userId = req.params.id;
      
      const [user, investments, recentTransactions] = await Promise.all([
        User.findById(userId).select('-password'),
        Investment.find({ userId, isActive: true }),
        Transaction.find({ userId }).sort({ createdAt: -1 }).limit(10)
      ]);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const totalInvestmentValue = investments.reduce((sum, inv) => sum + inv.totalValue, 0);
      const totalGainLoss = investments.reduce((sum, inv) => sum + inv.gainLoss, 0);

      res.json({
        user,
        summary: {
          totalBalance: user.totalBalance,
          totalInvestmentValue,
          totalGainLoss,
          totalPortfolioValue: user.totalBalance + totalInvestmentValue
        },
        investments,
        recentTransactions
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get user balance
  getBalance: async (req, res) => {
    try {
      console.log('💰 Balance request for UID:', req.user?.uid);
      
      // FIXED: Check for valid UID first
      if (!req.user?.uid || req.user.uid === null || req.user.uid === undefined) {
        console.log('❌ No valid UID found in balance request');
        return res.status(401).json({ error: 'Authentication failed - no valid UID' });
      }

      const user = await User.findOne({ firebaseUid: req.user.uid });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ balance: user.balance || 0 });
    } catch (error) {
      console.error('❌ Balance fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Get account data
  getAccountData: async (req, res) => {
    try {
      console.log('📊 Account data request for UID:', req.user?.uid);
      
      // FIXED: Check for valid UID first
      if (!req.user?.uid || req.user.uid === null || req.user.uid === undefined) {
        console.log('❌ No valid UID found in account data request');
        return res.status(401).json({ error: 'Authentication failed - no valid UID' });
      }

      const user = await User.findOne({ firebaseUid: req.user.uid });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        balance: user.balance || 0,
        totalInvestments: user.totalInvestments || 0,
        totalGainLoss: user.totalGainLoss || 0,
        portfolioValue: (user.balance || 0) + (user.totalInvestments || 0)
      });
    } catch (error) {
      console.error('❌ Account data fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Get transactions
  getTransactions: async (req, res) => {
    try {
      console.log('📋 Transactions request for UID:', req.user?.uid);
      
      // FIXED: Check for valid UID first
      if (!req.user?.uid || req.user.uid === null || req.user.uid === undefined) {
        console.log('❌ No valid UID found in transactions request');
        return res.status(401).json({ error: 'Authentication failed - no valid UID' });
      }

      const user = await User.findOne({ firebaseUid: req.user.uid });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const transactions = await Transaction.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .limit(50);

      res.json(transactions);
    } catch (error) {
      console.error('❌ Transactions fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Get investments
  getInvestments: async (req, res) => {
    try {
      console.log('💼 Investments request for UID:', req.user?.uid);
      
      // FIXED: Check for valid UID first
      if (!req.user?.uid || req.user.uid === null || req.user.uid === undefined) {
        console.log('❌ No valid UID found in investments request');
        return res.status(401).json({ error: 'Authentication failed - no valid UID' });
      }

      const user = await User.findOne({ firebaseUid: req.user.uid });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const investments = await Investment.find({ userId: user._id, isActive: true });

      res.json(investments);
    } catch (error) {
      console.error('❌ Investments fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Get user profile - MAIN FIX HERE
  getProfile: async (req, res) => {
    try {
      console.log('👤 Profile request for UID:', req.user?.uid);
      console.log('🔍 Full req.user object:', JSON.stringify(req.user, null, 2));
      console.log('🔍 Type of uid:', typeof req.user?.uid);
      console.log('🔍 UID value exactly:', req.user?.uid);
      
      // FIXED: Enhanced validation to prevent null/undefined UID
      if (!req.user?.uid || 
          req.user.uid === null || 
          req.user.uid === undefined || 
          req.user.uid === '' ||
          typeof req.user.uid !== 'string') {
        console.log('❌ Invalid UID found in profile request');
        console.log('❌ UID is:', req.user?.uid, 'Type:', typeof req.user?.uid);
        return res.status(401).json({ 
          error: 'Authentication failed - invalid or missing Firebase UID',
          details: 'Please ensure you are properly authenticated with Firebase'
        });
      }

      // FIXED: Check for existing user first with better error handling
      let user;
      try {
        user = await User.findOne({ firebaseUid: req.user.uid });
      } catch (dbError) {
        console.error('❌ Database query failed:', dbError);
        return res.status(500).json({ error: 'Database query failed' });
      }
      
      if (!user) {
        console.log('👤 Creating new user profile for UID:', req.user.uid);
        
        // FIXED: Triple check UID before creating new user
        if (!req.user.uid || req.user.uid === null || typeof req.user.uid !== 'string') {
          console.log('❌ Cannot create user - UID is invalid:', req.user.uid);
          return res.status(400).json({ 
            error: 'Cannot create user profile - invalid Firebase UID',
            details: 'Firebase UID must be a valid string'
          });
        }
        
        try {
          // FIXED: Use User.create with proper error handling
          user = await User.create({
            firebaseUid: req.user.uid,
            email: req.user.email || '',
            firstName: req.user.name?.split(' ')[0] || '',
            lastName: req.user.name?.split(' ').slice(1).join(' ') || '',
            balance: 0,
            totalInvestments: 0,
            totalGainLoss: 0,
            isActive: true
          });
          
          console.log('✅ New user created successfully with ID:', user._id);
        } catch (createError) {
          console.error('❌ User creation failed:', createError);
          
          // FIXED: Handle specific MongoDB duplicate key error
          if (createError.code === 11000) {
            console.log('🔄 Duplicate key error - trying to find existing user again');
            user = await User.findOne({ firebaseUid: req.user.uid });
            if (!user) {
              return res.status(500).json({ 
                error: 'Database constraint violation - unable to create or find user',
                details: 'Please try again or contact support'
              });
            }
          } else {
            return res.status(500).json({ 
              error: 'Failed to create user profile',
              details: createError.message 
            });
          }
        }
      } else {
        console.log('✅ Found existing user with ID:', user._id);
      }

      // Remove sensitive data before sending
      const userResponse = user.toObject();
      delete userResponse.password;

      res.json(userResponse);
    } catch (error) {
      console.error('❌ Profile fetch failed:', error);
      console.error('❌ Error stack:', error.stack);
      res.status(500).json({ 
        error: 'Internal server error',
        details: error.message 
      });
    }
  },

  // Update user profile
  updateProfile: async (req, res) => {
    try {
      console.log('📝 Profile update request for UID:', req.user?.uid);
      
      // FIXED: Check for valid UID first
      if (!req.user?.uid || req.user.uid === null || req.user.uid === undefined) {
        console.log('❌ No valid UID found in profile update request');
        return res.status(401).json({ error: 'Authentication failed - no valid UID' });
      }

      const { password, firebaseUid, ...updateData } = req.body; // Don't allow updating firebaseUid
      
      const user = await User.findOneAndUpdate(
        { firebaseUid: req.user.uid },
        updateData,
        { new: true, runValidators: true }
      );

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Remove sensitive data
      const userResponse = user.toObject();
      delete userResponse.password;

      res.json(userResponse);
    } catch (error) {
      console.error('❌ Profile update failed:', error);
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = userController;