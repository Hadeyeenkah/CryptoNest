const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const { body, validationResult } = require('express-validator');

// Models
const User = require('../models/User');
const Admin = require('../models/Admin');
const Deposit = require('../models/Deposit');
const { Plan } = require('../models/models');

// Middleware
const authenticateToken = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// Firebase utils
const { getUserProfileByUid, saveUserProfile } = require('../utils/firestoreUtils');

// --------- HELPER FUNCTIONS ---------

const generateToken = (payload, expiresIn = '1h') =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

const handleValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  return null;
};

const handleDatabaseError = (error, res) => {
  console.error('Database error:', error);
  
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    return res.status(409).json({
      success: false,
      message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`
    });
  }
  
  if (error.name === 'ValidationError') {
    const validationErrors = Object.values(error.errors).map(err => err.message);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: validationErrors
    });
  }
  
  return res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
};

// Helper function to get user from database
const getUserFromDatabase = async (uid) => {
  try {
    const user = await User.findOne({ uid }).select('-password -__v');
    return user;
  } catch (error) {
    console.error('Error fetching user from database:', error);
    throw error;
  }
};

// --------- FIREBASE TOKEN VERIFICATION ---------

const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Production Firebase token verification
    if (process.env.NODE_ENV === 'production') {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = decodedToken;
    } else {
      // Development/testing fallback
      console.log('Firebase token received (dev mode):', token.substring(0, 20) + '...');
      req.user = {
        uid: 'temp-uid',
        email: 'temp@example.com',
        email_verified: true,
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser'
      };
    }

    next();
  } catch (error) {
    console.error('Firebase token verification error:', error);
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
};

// --------- HEALTH CHECK ---------

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Authentication service is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// POST /api/user/deposit
router.post('/deposit', async (req, res) => {
  try {
    const { uid, amount } = req.body;

    if (!uid || !amount) {
      return res.status(400).json({ error: 'uid and amount are required' });
    }

    // 🔁 Replace with your DB logic (e.g., update balance)
    console.log(`Received deposit: UID=${uid}, Amount=${amount}`);

    return res.status(200).json({ message: 'Deposit successful' });
  } catch (err) {
    console.error('Deposit error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// --------- USER AUTHENTICATION (JWT-based) ---------

// POST /api/auth/signup
router.post('/signup', [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  const validationError = handleValidationErrors(req, res);
  if (validationError) return;

  const { fullName, username, email, password } = req.body;

  try {
    // Check for existing user
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username: username.toLowerCase() }] 
    });
    
    if (existingUser) {
      return res.status(409).json({ 
        success: false,
        message: existingUser.email === email ? 'Email already in use' : 'Username already taken'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create new user
    const newUser = new User({
      fullName: fullName.trim(),
      username: username.trim().toLowerCase(),
      email: email.toLowerCase(),
      password: hashedPassword,
      balance: 0,
      totalInvestment: 0,
      role: 'user',
      isActive: true,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await newUser.save();

    // Generate JWT token
    const token = generateToken({
      userId: newUser._id,
      email: newUser.email,
      username: newUser.username,
      uid: newUser._id.toString(),
      role: 'user'
    });

    console.log(`✅ User created successfully: ${newUser.email}`);
    
    res.status(201).json({
      success: true,
      message: `Welcome, ${newUser.fullName}! Account created successfully.`,
      token,
      user: {
        id: newUser._id,
        fullName: newUser.fullName,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (error) {
    return handleDatabaseError(error, res);
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  const validationError = handleValidationErrors(req, res);
  if (validationError) return;

  const { email, password } = req.body;

  try {
    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ 
        success: false,
        message: 'Account has been deactivated' 
      });
    }

    // Generate JWT token
    const token = generateToken({
      userId: user._id,
      email: user.email,
      username: user.username,
      uid: user._id.toString(),
      role: user.role || 'user'
    });

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    console.log(`✅ User logged in successfully: ${user.email}`);

    res.json({
      success: true,
      message: `Welcome back, ${user.fullName}!`,
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        role: user.role,
        balance: user.balance,
        totalInvestment: user.totalInvestment
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, (req, res) => {
  console.log(`👋 User logged out: ${req.user.email}`);
  res.json({ 
    success: true,
    message: 'Logged out successfully' 
  });
});

// --------- FIREBASE USER MANAGEMENT ---------

// POST /api/auth/firebase/register
router.post('/firebase/register', 
  verifyFirebaseToken,
  [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('uid').notEmpty().withMessage('UID is required')
  ],
  async (req, res) => {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    const { firstName, lastName, username, email, uid, displayName, photoURL } = req.body;

    try {
      // Verify UID matches token
      if (req.user.uid !== uid) {
        return res.status(403).json({ 
          success: false,
          message: 'UID mismatch' 
        });
      }

      // Check for existing user
      const existingUser = await User.findOne({ 
        $or: [
          { uid: uid },
          { email: email.toLowerCase() },
          { username: username.toLowerCase() }
        ]
      });

      if (existingUser) {
        if (existingUser.uid === uid) {
          return res.status(409).json({ 
            success: false,
            message: 'User already exists' 
          });
        }
        if (existingUser.email === email.toLowerCase()) {
          return res.status(409).json({ 
            success: false,
            message: 'Email already in use' 
          });
        }
        if (existingUser.username === username.toLowerCase()) {
          return res.status(409).json({ 
            success: false,
            message: 'Username already taken' 
          });
        }
      }

      // Create new Firebase user
      const newUser = new User({
        uid,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        fullName: `${firstName.trim()} ${lastName.trim()}`,
        username: username.trim().toLowerCase(),
        email: email.toLowerCase(),
        displayName: displayName || `${firstName.trim()} ${lastName.trim()}`,
        emailVerified: req.user.email_verified || false,
        photoURL: photoURL || null,
        role: 'user',
        isActive: true,
        balance: 0,
        totalInvestment: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        profile: {
          bio: '',
          location: '',
          website: '',
          dateOfBirth: null,
          preferences: {
            theme: 'light',
            language: 'en',
            notifications: {
              email: true,
              push: true,
              sms: false
            }
          }
        }
      });

      await newUser.save();

      const userResponse = {
        uid: newUser.uid,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        fullName: newUser.fullName,
        username: newUser.username,
        email: newUser.email,
        displayName: newUser.displayName,
        role: newUser.role,
        emailVerified: newUser.emailVerified,
        photoURL: newUser.photoURL,
        balance: newUser.balance,
        totalInvestment: newUser.totalInvestment,
        createdAt: newUser.createdAt
      };

      console.log(`✅ Firebase user created successfully: ${newUser.email}`);
      
      res.status(201).json({
        success: true,
        message: 'User created successfully',
        user: userResponse
      });

    } catch (error) {
      return handleDatabaseError(error, res);
    }
  }
);

// POST /api/auth/firebase/create-profile
router.post('/firebase/create-profile', 
  verifyFirebaseToken,
  async (req, res) => {
    try {
      const { uid, email, displayName, firstName, lastName, username } = req.body;

      // Verify UID matches token
      if (req.user.uid !== uid) {
        return res.status(403).json({ 
          success: false,
          message: 'UID mismatch' 
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ uid });
      if (existingUser) {
        return res.status(409).json({ 
          success: false,
          message: 'Profile already exists' 
        });
      }

      // Create user with default values
      const newUser = new User({
        uid,
        firstName: firstName || displayName?.split(' ')[0] || 'User',
        lastName: lastName || displayName?.split(' ').slice(1).join(' ') || '',
        fullName: displayName || `${firstName || 'User'} ${lastName || ''}`.trim(),
        username: username?.toLowerCase() || email.split('@')[0].toLowerCase(),
        email: email.toLowerCase(),
        displayName: displayName || email.split('@')[0],
        emailVerified: req.user.email_verified || false,
        photoURL: null,
        role: 'user',
        isActive: true,
        balance: 0,
        totalInvestment: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        profile: {
          bio: '',
          location: '',
          website: '',
          dateOfBirth: null,
          preferences: {
            theme: 'light',
            language: 'en',
            notifications: {
              email: true,
              push: true,
              sms: false
            }
          }
        }
      });

      await newUser.save();

      const userResponse = {
        uid: newUser.uid,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        fullName: newUser.fullName,
        username: newUser.username,
        email: newUser.email,
        displayName: newUser.displayName,
        role: newUser.role,
        emailVerified: newUser.emailVerified,
        photoURL: newUser.photoURL,
        balance: newUser.balance,
        totalInvestment: newUser.totalInvestment,
        createdAt: newUser.createdAt
      };

      console.log(`✅ Missing profile created for: ${newUser.email}`);
      
      res.status(201).json({
        success: true,
        message: 'Profile created successfully',
        user: userResponse
      });

    } catch (error) {
      return handleDatabaseError(error, res);
    }
  }
);

// --------- PROFILE MANAGEMENT ---------

// GET /api/auth/profile (Firebase-compatible)
router.get('/profile', verifyFirebaseToken, async (req, res) => {
  try {
    const { uid, email, role, firstName, lastName, username } = req.user;
    const queryUid = req.query.uid || uid;

    console.log(`👤 Profile request for UID: ${queryUid}`);

    if (uid !== queryUid && role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    let user = await User.findOne({ uid: queryUid }).select('-password -__v');

    if (!user) {
      console.log(`🔍 User not found in database, checking Firestore...`);

      let userProfile = null;
      try {
        if (typeof getUserProfileByUid === 'function') {
          userProfile = await getUserProfileByUid(queryUid);
          console.log(`📄 Firestore profile found:`, !!userProfile);
        }
      } catch (err) {
        console.warn(`⚠️ Firestore lookup failed for UID ${queryUid}:`, err.message);
      }

      if (!userProfile) {
        console.log(`🆕 Creating new user profile for UID: ${queryUid}`);

        const newUserData = {
          uid: queryUid,
          firstName: firstName || 'User',
          lastName: lastName || '',
          fullName: `${firstName || 'User'} ${lastName || ''}`.trim(),
          username: username || email.split('@')[0],
          email,
          displayName: req.user.name || email.split('@')[0],
          photoURL: req.user.picture || null,
          role: 'user',
          isActive: true,
          balance: 0,
          totalInvestment: 0,
          emailVerified: req.user.email_verified || false,
          profile: {
            bio: '',
            location: '',
            website: '',
            dateOfBirth: null,
            preferences: {
              theme: 'light',
              language: 'en',
              notifications: {
                email: true,
                push: true,
                sms: false
              }
            }
          },
          lastLogin: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          backendSyncTime: new Date().toISOString(),
        };

        try {
          user = new User(newUserData);
          await user.save();
          console.log(`✅ New user created in database with ID: ${user._id}`);

          if (typeof saveUserProfile === 'function') {
            try {
              await saveUserProfile(queryUid, newUserData);
              console.log(`✅ User profile synced to Firestore`);
            } catch (firestoreError) {
              console.warn(`⚠️ Failed to sync to Firestore:`, firestoreError.message);
            }
          }

          return res.status(201).json({
            success: true,
            message: 'New user profile created',
            ...newUserData
          });

        } catch (createError) {
          console.error(`❌ Error creating new user:`, createError);
          return res.status(500).json({
            success: false,
            message: 'Failed to create user profile',
            error: process.env.NODE_ENV === 'development' ? createError.message : undefined
          });
        }
      } else {
        console.log(`🔄 Syncing Firestore user to database...`);

        const syncedUserData = {
          uid: queryUid,
          firstName: userProfile.firstName || firstName || 'User',
          lastName: userProfile.lastName || lastName || '',
          fullName: userProfile.fullName || `${firstName || 'User'} ${lastName || ''}`.trim(),
          username: userProfile.username || username || email.split('@')[0],
          email,
          displayName: userProfile.displayName || email.split('@')[0],
          photoURL: userProfile.photoURL || null,
          role: userProfile.role || 'user',
          emailVerified: userProfile.emailVerified || req.user.email_verified || false,
          balance: userProfile.balance || 0,
          totalInvestment: userProfile.totalInvestment || 0,
          profile: userProfile.profile || {
            bio: '',
            location: '',
            website: '',
            dateOfBirth: null,
            preferences: {
              theme: 'light',
              language: 'en',
              notifications: {
                email: true,
                push: true,
                sms: false
              }
            }
          },
          isActive: userProfile.isActive !== undefined ? userProfile.isActive : true,
          lastLogin: new Date(),
          backendSyncTime: new Date().toISOString(),
          createdAt: userProfile.createdAt || new Date(),
          updatedAt: new Date(),
        };

        try {
          user = new User(syncedUserData);
          await user.save();
          console.log(`✅ Firestore user synced to database`);
        } catch (syncError) {
          console.error(`❌ Error syncing user:`, syncError);

          return res.status(200).json({
            success: true,
            message: 'Profile loaded from Firestore (database sync failed)',
            ...syncedUserData
          });
        }
      }
    } else {
      console.log(`✅ User found in database: ${user._id}`);
      try {
        user.lastLogin = new Date();
        user.backendSyncTime = new Date().toISOString();
        await user.save();
      } catch (updateError) {
        console.warn(`⚠️ Failed to update last login:`, updateError.message);
      }
    }

    const profileData = {
      uid: user.uid,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: user.role,
      emailVerified: user.emailVerified,
      balance: user.balance,
      totalInvestment: user.totalInvestment,
      profile: user.profile || {
        bio: '',
        location: '',
        website: '',
        dateOfBirth: null,
        preferences: {
          theme: 'light',
          language: 'en',
          notifications: {
            email: true,
            push: true,
            sms: false
          }
        }
      },
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      backendSyncTime: user.backendSyncTime,
    };

    console.log(`✅ Profile fetch successful for UID: ${queryUid}`);

    return res.status(200).json({
      success: true,
      ...profileData
    });

  } catch (error) {
    console.error('❌ Profile route error:', {
      message: error.message,
      stack: error.stack,
      user: req.user?.uid,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/auth/profile/jwt (JWT-based profile)
router.get('/profile/jwt', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password -__v');
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const profile = {
      id: user._id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      role: user.role,
      balance: user.balance,
      totalInvestment: user.totalInvestment,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      photoURL: user.photoURL,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLogin: user.lastLogin
    };

    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// PUT /api/auth/profile (Update profile)
router.put(
  '/profile',
  verifyFirebaseToken,
  [
    body('firstName').optional().trim().notEmpty(),
    body('lastName').optional().trim().notEmpty(),
    body('username').optional().trim().isLength({ min: 3 })
  ],
  async (req, res) => {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    try {
      const { uid } = req.user;
      const updateData = { ...req.body, updatedAt: new Date() };

      // Remove sensitive fields
      delete updateData.uid;
      delete updateData.role;
      delete updateData.createdAt;
      delete updateData.balance;
      delete updateData.totalInvestment;

      // Update fullName if firstName or lastName changed
      if (updateData.firstName || updateData.lastName) {
        const user = await User.findOne({ uid });
        if (user) {
          const firstName = updateData.firstName || user.firstName;
          const lastName = updateData.lastName || user.lastName;
          updateData.fullName = `${firstName} ${lastName}`.trim();
          updateData.displayName = updateData.fullName;
        }
      }

      const updatedUser = await User.findOneAndUpdate(
        { uid },
        updateData,
        { new: true, runValidators: true }
      ).select('-password -__v');

      if (!updatedUser) {
        return res.status(404).json({ 
          success: false,
          message: 'User not found' 
        });
      }

      console.log(`✅ Profile updated for: ${updatedUser.email}`);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: updatedUser
      });

    } catch (error) {
      return handleDatabaseError(error, res);
    }
  }
);

// --------- DEPOSIT MANAGEMENT ---------

// POST /api/auth/deposit
router.post('/deposit', authenticateToken, [
  body('amount').isNumeric().custom(value => {
    if (value <= 0) throw new Error('Amount must be greater than 0');
    return true;
  }),
  body('plan').notEmpty().withMessage('Plan is required')
], async (req, res) => {
  const validationError = handleValidationErrors(req, res);
  if (validationError) return;

  const { amount, plan } = req.body;
  const userId = req.user.userId;

  try {
    const deposit = new Deposit({
      userId,
      amount: parseFloat(amount),
      plan,
      status: 'pending',
      date: new Date(),
    });

    await deposit.save();

    res.status(201).json({
      success: true,
      message: 'Deposit submitted for approval.',
      deposit
    });
  } catch (error) {
    console.error('Error creating deposit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create deposit',
      error: error.message
    });
  }
});




// --------- ADMIN ROUTES ---------

// POST /api/auth/admin/signup
router.post('/admin/signup', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
], async (req, res) => {
  const validationError = handleValidationErrors(req, res);
  if (validationError) return;

  const { email, password } = req.body;

  try {
    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(409).json({ 
        success: false,
        message: 'Admin already exists' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const admin = new Admin({ 
      email: email.toLowerCase(), 
      password: hashedPassword,
      createdAt: new Date()
    });
    
    await admin.save();

    console.log(`🔐 Admin created: ${admin.email}`);

    res.status(201).json({ 
      success: true,
      message: 'Admin created successfully' 
    });
  } catch (error) {
    console.error('Admin signup error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

// POST /api/auth/admin/login
router.post('/admin/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  const validationError = handleValidationErrors(req, res);
  if (validationError) return;

  const { email, password } = req.body;

  try {
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    const token = generateToken({ 
      id: admin._id, 
      email: admin.email,
      role: 'admin' 
    }, '1d');

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    console.log(`🔐 Admin logged in: ${admin.email}`);

    res.json({ 
      success: true,
      message: 'Admin login successful',
      token,
      role: 'admin'
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

// GET /api/auth/admin/deposits/pending
router.get('/admin/deposits/pending', adminAuth, async (req, res) => {
  try {
    const pending = await Deposit.find({ status: 'pending' })
      .populate('userId', 'fullName email username')
      .sort({ date: -1 });
      
    console.log(`📋 Fetched ${pending.length} pending deposits`);
    
    res.json({ 
      success: true,
      deposits: pending,
      count: pending.length
    });
  } catch (error) {
    console.error('Error fetching pending deposits:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch pending deposits' 
    });
  }
});

// POST /api/auth/admin/deposits/:id/approve
router.post('/admin/deposits/:id/approve', adminAuth, async (req, res) => {
  try {
    const deposit = await Deposit.findById(req.params.id);
    if (!deposit) {
      return res.status(404).json({ 
        success: false,
        message: 'Deposit not found' 
      });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({ 
        success: false,
        message: 'Deposit is not pending approval' 
      });
    }

    // Update deposit status
    deposit.status = 'approved';
    deposit.approvedAt = new Date();
    await deposit.save();

    // Update user balance
    const user = await User.findById(deposit.userId);
    if (user) {
      user.balance += deposit.amount;
      user.totalInvestment += deposit.amount;
      user.updatedAt = new Date();
      await user.save();
    }

    console.log(`✅ Deposit approved: $${deposit.amount} for user ${user?.email}`);

    res.json({ 
      success: true,
      message: 'Deposit approved successfully',
      deposit: {
        id: deposit._id,
        amount: deposit.amount,
        status: deposit.status,
        approvedAt: deposit.approvedAt
      }
    });
  } catch (error) {
    console.error('Error approving deposit:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to approve deposit' 
    });
  }
});

// POST /api/auth/admin/deposits/:id/reject
router.post('/admin/deposits/:id/reject', adminAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    
    const deposit = await Deposit.findById(req.params.id);
    if (!deposit) {
      return res.status(404).json({ 
        success: false,
        message: 'Deposit not found' 
      });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({ 
        success: false,
        message: 'Deposit is not pending approval' 
      });
    }

    deposit.status = 'rejected';
    deposit.rejectedAt = new Date();
    deposit.rejectionReason = reason || 'No reason provided';
    await deposit.save();

    console.log(`❌ Deposit rejected: $${deposit.amount} - ${reason}`);

    res.json({ 
      success: true,
      message: 'Deposit rejected successfully',
      deposit: {
        id: deposit._id,
        amount: deposit.amount,
        status: deposit.status,
        rejectedAt: deposit.rejectedAt,
        rejectionReason: deposit.rejectionReason
      }
    });
  } catch (error) {
    console.error('Error rejecting deposit:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to reject deposit' 
    });
  }
});

module.exports = router;