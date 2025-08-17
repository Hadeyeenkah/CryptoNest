const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const fs = require('fs');

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const app = express();

const mongoose = require('mongoose');
const admin = require('firebase-admin');
const cron = require('node-cron');

// --- Security Dependencies ---
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// --- Import Routes ---
const depositRoutes = require('./routes/deposit');
const userRoutes = require('./routes/user');

// --- Security Middleware ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

app.use(compression());

// --- Rate Limiting ---
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: 'Too many authentication attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/auth', authLimiter);
app.use('/api', generalLimiter);

// --- CORS Configuration ---
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:5173',
            'http://localhost:3000',
            process.env.FRONTEND_URL
        ].filter(Boolean);

        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control'],
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// --- Middleware ---
app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            res.status(400).json({ error: 'Invalid JSON' });
            throw new Error('Invalid JSON');
        }
    }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Request Logging Middleware ---
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// --- Models ---
const MasterPlan = require('./models/MasterPlan');
const User = require('./models/User');
const UserInvestment = require('./models/UserInvestment');
const Deposit = require('./models/Deposit');
const Transaction = require('./models/Transaction');

// --- Password Reset Token Management ---
class TokenManager {
    constructor() {
        this.tokens = new Map();
        this.startCleanupInterval();
    }

    store(token, data) {
        this.tokens.set(token, {
            ...data,
            email: data.email.toLowerCase().trim(),
            expiresAt: new Date(data.expiresAt),
            createdAt: new Date()
        });

        // Auto cleanup after expiration
        setTimeout(() => {
            this.tokens.delete(token);
        }, new Date(data.expiresAt).getTime() - Date.now());
    }

    get(token) {
        return this.tokens.get(token);
    }

    delete(token) {
        return this.tokens.delete(token);
    }

    cleanup() {
        const now = new Date();
        let cleanedCount = 0;
        
        for (const [token, data] of this.tokens.entries()) {
            if (now > data.expiresAt) {
                this.tokens.delete(token);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} expired reset tokens`);
        }
    }

    startCleanupInterval() {
        setInterval(() => this.cleanup(), 5 * 60 * 1000); // Every 5 minutes
    }
}

const resetTokenManager = new TokenManager();

// --- Global Firebase Admin status flag ---
let firebaseAdminInitialized = false;

// --- Firebase Admin SDK setup with improved error handling ---
const initializeFirebase = () => {
    try {
        if (admin.apps.length > 0) {
            console.log('✅ Firebase Admin already initialized');
            firebaseAdminInitialized = true;
            return true;
        }

        const serviceAccountPath = path.resolve(__dirname, './config/firebase-service-account.json');

        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error(`Service account file not found at: ${serviceAccountPath}`);
        }

        const serviceAccount = require(serviceAccountPath);

        if (!serviceAccount.type || !serviceAccount.project_id || !serviceAccount.private_key_id) {
            throw new Error('Invalid service account file structure');
        }

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        console.log('✅ Firebase Admin initialized successfully');
        firebaseAdminInitialized = true;
        return true;
    } catch (error) {
        console.error('❌ Firebase Admin initialization failed:', error.message);
        firebaseAdminInitialized = false;
        return false;
    }
};

initializeFirebase();

// --- MongoDB connection with improved error handling ---
const connectDB = async (retryCount = 0, maxRetries = 5) => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error('MONGO_URI environment variable is not set');
        }

        const conn = await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        console.log(`✅ MongoDB connected: ${conn.connection.host}`);

        mongoose.connection.on('disconnected', () => {
            console.log('❌ MongoDB disconnected');
        });

        mongoose.connection.on('error', (err) => {
            console.error(`❌ MongoDB connection error: ${err.message}`);
        });

        await initializePlans();
    } catch (err) {
        console.error(`❌ MongoDB connection failed: ${err.message}`);
        
        if (retryCount < maxRetries) {
            console.log(`Retrying connection... (${retryCount + 1}/${maxRetries})`);
            setTimeout(() => connectDB(retryCount + 1), 5000);
        } else {
            console.error('🛑 Max retries reached. Exiting...');
            process.exit(1);
        }
    }
};

// --- Helper function to generate a unique username ---
async function generateUniqueUsername(baseIdentifier, uid) {
    try {
        let baseName;
        if (baseIdentifier) {
            baseName = baseIdentifier.includes('@') 
                ? baseIdentifier.split('@')[0] 
                : baseIdentifier;
            // Sanitize username
            baseName = baseName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        } else {
            baseName = `user_${uid.substring(0, 6)}`;
        }

        // Ensure baseName is not empty
        if (!baseName) {
            baseName = `user_${uid.substring(0, 6)}`;
        }

        let username = baseName;
        let counter = 0;

        while (await User.findOne({ username })) {
            counter++;
            username = `${baseName}${counter}`;
        }

        return username;
    } catch (error) {
        console.error('Error generating username:', error);
        return `user_${uid.substring(0, 6)}_${Date.now()}`;
    }
}

// --- Cleanup duplicate users function ---
const cleanupDuplicateUsers = async () => {
    try {
        console.log('🧹 Checking for duplicate users...');

        // Find duplicate users by email
        const duplicateEmails = await User.aggregate([
            { $match: { email: { $ne: null, $exists: true } } },
            { $group: { _id: "$email", count: { $sum: 1 }, users: { $push: "$$ROOT" } } },
            { $match: { count: { $gt: 1 } } }
        ]);

        for (const emailGroup of duplicateEmails) {
            const users = emailGroup.users;
            const userToKeep = users.find(u => u.firebaseUid) ||
                users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
            
            const usersToRemove = users.filter(u => u._id.toString() !== userToKeep._id.toString());

            for (const userToRemove of usersToRemove) {
                await User.findByIdAndDelete(userToRemove._id);
                console.log(`🗑️ Removed duplicate user: ${userToRemove.email}`);
            }
        }

        console.log('✅ Duplicate user cleanup completed');
    } catch (error) {
        console.error('❌ Duplicate user cleanup failed:', error);
    }
};

// --- Initialize investment plans ---
const initializePlans = async () => {
    try {
        await cleanupDuplicateUsers();

        const plansToSeed = [
            { planId: 'basic', name: 'Basic Plan', minAmount: 100, maxAmount: 1000, interestRate: 10.0, duration: 15 },
            { planId: 'gold', name: 'Gold Plan', minAmount: 1001, maxAmount: 5000, interestRate: 15.0, duration: 20 },
            { planId: 'platinum', name: 'Platinum Plan', minAmount: 5001, maxAmount: 10000, interestRate: 20.0, duration: 30 },
        ];

        console.log('Initializing investment plans...');
        
        for (const planData of plansToSeed) {
            await MasterPlan.findOneAndUpdate(
                { planId: planData.planId },
                planData,
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            console.log(`✅ Plan "${planData.name}" initialized`);
        }

        console.log('📚 All investment plans processed');
    } catch (error) {
        console.error('❌ Failed to initialize plans:', error);
    }
};

// --- Interest calculation with improved error handling ---
const calculateDailyInterest = async () => {
    try {
        console.log(`[${new Date().toISOString()}] Calculating daily interest...`);
        
        const userInvestments = await UserInvestment.find({ 
            status: { $in: ['active', 'pending'] } 
        }).populate('userId');

        let processedCount = 0;
        let errorCount = 0;

        for (const userInvestment of userInvestments) {
            try {
                const plan = await MasterPlan.findOne({ planId: userInvestment.planId });
                
                if (!plan) {
                    console.warn(`Plan ${userInvestment.planId} not found, marking investment as ended`);
                    userInvestment.status = 'ended';
                    await userInvestment.save();
                    continue;
                }

                if (userInvestment.status !== 'active' || !userInvestment.startDate) {
                    continue;
                }

                const endDate = new Date(userInvestment.startDate);
                endDate.setDate(endDate.getDate() + plan.duration);

                const user = await User.findById(userInvestment.userId);
                if (!user) {
                    console.warn(`User not found for investment ${userInvestment._id}`);
                    continue;
                }

                if (new Date() > endDate) {
                    // Plan ended - distribute final ROI
                    const finalInterest = (userInvestment.amount * plan.interestRate) / 100;
                    
                    await User.findByIdAndUpdate(user._id, {
                        $inc: { 
                            balance: finalInterest,
                            totalInterest: finalInterest 
                        }
                    });

                    await Transaction.create({
                        userId: user._id,
                        type: 'interest',
                        amount: finalInterest,
                        details: `Final interest from ${plan.name}`,
                    });

                    userInvestment.status = 'ended';
                    await userInvestment.save();
                    
                    console.log(`✅ Final interest of ${finalInterest.toFixed(2)} paid to ${user.email || user.firebaseUid}`);
                } else {
                    // Calculate daily interest
                    const totalPlanInterest = (userInvestment.amount * plan.interestRate) / 100;
                    const dailyInterest = totalPlanInterest / plan.duration;

                    if (dailyInterest > 0) {
                        await User.findByIdAndUpdate(user._id, {
                            $inc: { 
                                balance: dailyInterest,
                                totalInterest: dailyInterest 
                            }
                        });

                        await Transaction.create({
                            userId: user._id,
                            type: 'interest',
                            amount: dailyInterest,
                            details: `Daily interest from ${plan.name}`,
                        });

                        console.log(`✅ Daily interest of ${dailyInterest.toFixed(2)} paid to ${user.email || user.firebaseUid}`);
                    }
                }
                
                processedCount++;
            } catch (investmentError) {
                console.error(`Error processing investment ${userInvestment._id}:`, investmentError);
                errorCount++;
            }
        }

        console.log(`✅ Interest calculation completed. Processed: ${processedCount}, Errors: ${errorCount}`);
    } catch (err) {
        console.error('❌ Interest calculation error:', err);
    }
};

// Schedule daily interest calculation
cron.schedule('0 0 * * *', calculateDailyInterest, { timezone: "UTC" });
console.log('⏰ Daily interest calculation scheduled for 00:00 UTC');

// --- Authentication Middleware ---
const authenticateUser = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid authorization header' });
        }

        if (!firebaseAdminInitialized) {
            return res.status(503).json({ error: 'Authentication service unavailable' });
        }

        const token = authHeader.split(' ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        const status = error.code === 'auth/id-token-expired' ? 401 : 403;
        res.status(status).json({ error: 'Invalid or expired token' });
    }
};

const authenticateAdmin = async (req, res, next) => {
    try {
        await authenticateUser(req, res, async () => {
            const user = await User.findOne({ firebaseUid: req.user.uid });
            
            if (!user || user.role !== 'admin') {
                return res.status(403).json({ error: 'Admin access required' });
            }
            
            req.dbUser = user;
            next();
        });
    } catch (error) {
        console.error('Admin authentication error:', error);
        res.status(500).json({ error: 'Authentication error' });
    }
};

// --- API ROUTES ---
app.use('/api/deposits', depositRoutes);
app.use('/api/users', userRoutes);

// Basic endpoints
app.get('/api/ping', (req, res) => {
    res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'cryptonest-backend',
        firebase: firebaseAdminInitialized,
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        uptime: process.uptime()
    });
});

app.get('/api', (req, res) => {
    res.json({
        message: 'CryptoNest API is running',
        version: '1.0.0',
        endpoints: [
            'GET /health',
            'GET /api/plans',
            'POST /api/auth/login',
            'GET /api/auth/profile',
            'POST /api/auth/check-email',
            'POST /api/auth/reset-password',
        ]
    });
});

// Placeholder endpoints
app.get('/api/placeholder/:width/:height', (req, res) => {
    const { width, height } = req.params;
    const w = Math.min(Math.max(parseInt(width) || 100, 1), 2000);
    const h = Math.min(Math.max(parseInt(height) || 100, 1), 2000);

    res.json({
        url: `https://via.placeholder.com/${w}x${h}`,
        width: w,
        height: h,
        alt: `Placeholder image ${w}x${h}`
    });
});

app.get('/api/placeholder-svg/:width/:height', (req, res) => {
    const { width, height } = req.params;
    const w = Math.min(Math.max(parseInt(width) || 100, 1), 2000);
    const h = Math.min(Math.max(parseInt(height) || 100, 1), 2000);

    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#e5e7eb" stroke="#d1d5db" stroke-width="1"/>
      <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#6b7280" font-family="Arial, sans-serif" font-size="${Math.min(w, h) / 8}">
        ${w}×${h}
      </text>
    </svg>`;

    res.set({
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600'
    });
    res.send(svg);
});

// Fetch plans endpoint
app.get('/api/plans', async (req, res) => {
    try {
        const plans = await MasterPlan.find({}).select('-__v');
        res.json(plans);
    } catch (error) {
        console.error('Failed to fetch plans:', error);
        res.status(500).json({ error: 'Failed to fetch plans' });
    }
});

// --- AUTH ROUTES ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { uid, email, idToken } = req.body;

        if (!uid) {
            return res.status(400).json({ error: 'UID is required' });
        }

        if (!firebaseAdminInitialized) {
            return res.status(503).json({ error: 'Authentication service unavailable' });
        }

        let decodedToken;
        if (idToken) {
            try {
                decodedToken = await admin.auth().verifyIdToken(idToken);
                if (decodedToken.uid !== uid) {
                    return res.status(401).json({ error: 'Token UID mismatch' });
                }
            } catch (error) {
                console.error('Token verification failed:', error);
                return res.status(401).json({ error: 'Invalid token' });
            }
        } else {
            decodedToken = { uid, email: email || null, email_verified: false };
        }

        const userEmail = decodedToken.email || email || null;

        let user = await User.findOne({ firebaseUid: uid });
        
        if (!user) {
            if (userEmail) {
                user = await User.findOne({ email: userEmail });
            }

            if (user) {
                user.firebaseUid = uid;
                user.emailVerified = decodedToken.email_verified || user.emailVerified;
                user.lastLogin = new Date();
                await user.save();
            } else {
                const firstName = decodedToken.name?.split(' ')[0] || 
                    (userEmail ? userEmail.split('@')[0] : `Guest-${uid.substring(0, 4)}`);
                const lastName = decodedToken.name?.split(' ').slice(1).join(' ') || '';
                const username = await generateUniqueUsername(userEmail || firstName, uid);

                user = new User({
                    firebaseUid: uid,
                    email: userEmail,
                    firstName,
                    lastName,
                    username,
                    displayName: decodedToken.name || username,
                    emailVerified: decodedToken.email_verified || false,
                    balance: 0,
                    totalInvestment: 0,
                    totalInterest: 0,
                    preferences: { darkMode: false, notifications: true },
                    role: 'user',
                });
                
                await user.save();
                console.log(`✅ New user created: ${user.email || user.firebaseUid}`);
            }
        }

        user.lastLogin = new Date();
        await user.save();

        // Sync Firebase custom claims
        const currentClaims = (await admin.auth().getUser(uid)).customClaims || {};
        const isAdminInDB = user.role === 'admin';

        if (currentClaims.isAdmin !== isAdminInDB) {
            await admin.auth().setCustomUserClaims(uid, { ...currentClaims, isAdmin: isAdminInDB });
            console.log(`🔑 Firebase custom claim 'isAdmin' set to ${isAdminInDB} for user ${uid}`);
        }

        res.json({
            message: 'Login successful',
            uid,
            email: user.email,
            user: {
                id: user._id,
                displayName: user.displayName,
                balance: user.balance,
                totalInvestment: user.totalInvestment,
                totalInterest: user.totalInterest,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                isAdmin: isAdminInDB
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation failed',
                details: Object.keys(error.errors).map(key => ({
                    field: key,
                    message: error.errors[key].message
                }))
            });
        }
        
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/auth/profile', authenticateUser, async (req, res) => {
    try {
        const firebaseUid = req.user.uid;
        const email = req.user.email || null;
        const displayName = req.user.name || null;

        let user = await User.findOne({ firebaseUid });

        if (!user) {
            const firstName = req.user.name?.split(' ')[0] || 
                (email ? email.split('@')[0] : `Guest-${firebaseUid.substring(0, 4)}`);
            const lastName = req.user.name?.split(' ').slice(1).join(' ') || '';
            const username = await generateUniqueUsername(email || firstName, firebaseUid);

            user = new User({
                firebaseUid,
                email,
                displayName: displayName || username,
                username,
                firstName,
                lastName,
                role: 'user',
                balance: 0,
                totalInvestment: 0,
                totalInterest: 0,
                preferences: { darkMode: false, notifications: true },
                lastLogin: new Date(),
            });
            
            await user.save();
            console.log(`✅ New user profile created: ${user.email || user.firebaseUid}`);
        } else {
            user.lastLogin = new Date();
            if (email && user.email !== email) user.email = email;
            if (displayName && user.displayName !== displayName) user.displayName = displayName;
            await user.save();
        }

        // Sync Firebase custom claims
        const currentClaims = (await admin.auth().getUser(firebaseUid)).customClaims || {};
        const isAdminInDB = user.role === 'admin';

        if (currentClaims.isAdmin !== isAdminInDB) {
            await admin.auth().setCustomUserClaims(firebaseUid, { ...currentClaims, isAdmin: isAdminInDB });
        }

        res.json({
            uid: user.firebaseUid,
            email: user.email,
            displayName: user.displayName,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            balance: user.balance,
            totalInvestment: user.totalInvestment,
            totalInterest: user.totalInterest,
            role: user.role,
            isAdmin: isAdminInDB
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin route to update user profile
app.put('/api/admin/users/:userId', authenticateAdmin, async (req, res) => {
    const { userId } = req.params;
    const { firstName, lastName, username, email, role } = req.body;

    try {
        const user = await User.findOne({ firebaseUid: userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Validate input
        if (username && username !== user.username) {
            const existingUser = await User.findOne({ username, _id: { $ne: user._id } });
            if (existingUser) {
                return res.status(400).json({ error: 'Username already taken' });
            }
        }

        if (email && email !== user.email) {
            const existingUser = await User.findOne({ email, _id: { $ne: user._id } });
            if (existingUser) {
                return res.status(400).json({ error: 'Email already registered' });
            }
        }

        // Update user data
        if (firstName !== undefined) user.firstName = firstName;
        if (lastName !== undefined) user.lastName = lastName;
        if (username !== undefined) user.username = username;
        if (email !== undefined) user.email = email;
        if (role !== undefined && ['user', 'admin'].includes(role)) {
            user.role = role;
        }

        await user.save();

        // Update Firebase custom claims
        const isAdminInDB = user.role === 'admin';
        const currentUserRecord = await admin.auth().getUser(userId);
        const currentClaims = currentUserRecord.customClaims || {};

        if (currentClaims.isAdmin !== isAdminInDB) {
            await admin.auth().setCustomUserClaims(userId, { ...currentClaims, isAdmin: isAdminInDB });
            await admin.auth().revokeRefreshTokens(userId);
            console.log(`🔑 Updated Firebase claims for user ${userId}`);
        }

        res.json({ 
            message: 'User profile updated successfully', 
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Error updating user profile:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation failed',
                details: Object.keys(error.errors).map(key => ({
                    field: key,
                    message: error.errors[key].message
                }))
            });
        }
        
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- PASSWORD RESET ROUTES ---
app.post('/api/auth/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email || !email.trim()) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        
        if (!user) {
            // Don't reveal if email exists for security
            return res.json({ exists: false, message: 'If this email exists, a reset link will be sent' });
        }
        
        res.json({ exists: true, message: 'Email found' });
    } catch (error) {
        console.error('Email check error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/store-reset-token', async (req, res) => {
    try {
        const { email, token, expiresAt } = req.body;
        
        if (!email || !token || !expiresAt) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Validate token format (should be a secure random string)
        if (typeof token !== 'string' || token.length < 32) {
            return res.status(400).json({ error: 'Invalid token format' });
        }

        // Validate expiration date
        const expDate = new Date(expiresAt);
        if (isNaN(expDate.getTime()) || expDate <= new Date()) {
            return res.status(400).json({ error: 'Invalid expiration date' });
        }

        resetTokenManager.store(token, { email, expiresAt });
        
        console.log(`Reset token stored for ${email}`);
        res.json({ success: true, message: 'Reset token stored successfully' });
    } catch (error) {
        console.error('Store token error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, token, newPassword } = req.body;
        
        if (!email || !token || !newPassword) {
            return res.status(400).json({ error: 'Email, token, and new password are required' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        
        // Verify token
        const tokenData = resetTokenManager.get(token);
        if (!tokenData || tokenData.email !== normalizedEmail) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }
        
        if (new Date() > tokenData.expiresAt) {
            resetTokenManager.delete(token);
            return res.status(400).json({ error: 'Reset token has expired' });
        }
        
        // Validate password strength
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({ 
                error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character' 
            });
        }
        
        // Find user and update password
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Hash the new password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        
        user.password = hashedPassword;
        user.lastLogin = new Date();
        await user.save();
        
        // Remove used token
        resetTokenManager.delete(token);
        
        // Record password reset transaction
        await Transaction.create({
            userId: user._id,
            type: 'security',
            amount: 0,
            details: 'Password reset completed successfully',
        });
        
        console.log(`Password reset successful for user: ${normalizedEmail}`);
        
        res.json({ 
            success: true, 
            message: 'Password reset successful'
        });
    } catch (error) {
        console.error('Reset password error:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Invalid data provided',
                details: error.message
            });
        }
        
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get reset token status (for debugging in development)
if (process.env.NODE_ENV === 'development') {
    app.get('/api/auth/reset-token-status/:token', async (req, res) => {
        try {
            const { token } = req.params;
            
            const tokenData = resetTokenManager.get(token);
            if (!tokenData) {
                return res.status(404).json({ error: 'Token not found' });
            }
            
            const isExpired = new Date() > tokenData.expiresAt;
            const timeRemaining = tokenData.expiresAt.getTime() - Date.now();
            
            res.json({
                exists: true,
                expired: isExpired,
                email: tokenData.email,
                expiresAt: tokenData.expiresAt,
                timeRemaining: isExpired ? 0 : Math.max(0, timeRemaining),
                createdAt: tokenData.createdAt
            });
        } catch (error) {
            console.error('Token status error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}

// --- INVESTMENT ROUTES ---
app.post('/api/investments', authenticateUser, async (req, res) => {
    try {
        const { planId, amount } = req.body;
        
        if (!planId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Valid plan ID and amount are required' });
        }

        const user = await User.findOne({ firebaseUid: req.user.uid });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const plan = await MasterPlan.findOne({ planId });
        if (!plan) {
            return res.status(404).json({ error: 'Investment plan not found' });
        }

        if (amount < plan.minAmount || amount > plan.maxAmount) {
            return res.status(400).json({ 
                error: `Amount must be between ${plan.minAmount} and ${plan.maxAmount}` 
            });
        }

        if (user.balance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // Create new investment
        const investment = new UserInvestment({
            userId: user._id,
            planId: plan.planId,
            amount,
            status: 'active',
            startDate: new Date()
        });

        await investment.save();

        // Update user balance and total investment
        user.balance -= amount;
        user.totalInvestment = (user.totalInvestment || 0) + amount;
        await user.save();

        // Record transaction
        await Transaction.create({
            userId: user._id,
            type: 'investment',
            amount: -amount,
            details: `Investment in ${plan.name}`,
        });

        res.status(201).json({
            message: 'Investment created successfully',
            investment: {
                id: investment._id,
                planId: investment.planId,
                planName: plan.name,
                amount: investment.amount,
                startDate: investment.startDate,
                status: investment.status
            }
        });
    } catch (error) {
        console.error('Investment creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/investments', authenticateUser, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseUid: req.user.uid });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const investments = await UserInvestment.find({ userId: user._id })
            .sort({ createdAt: -1 })
            .limit(50);

        const investmentDetails = await Promise.all(
            investments.map(async (investment) => {
                const plan = await MasterPlan.findOne({ planId: investment.planId });
                return {
                    id: investment._id,
                    planId: investment.planId,
                    planName: plan?.name || 'Unknown Plan',
                    amount: investment.amount,
                    startDate: investment.startDate,
                    status: investment.status,
                    interestRate: plan?.interestRate || 0,
                    duration: plan?.duration || 0
                };
            })
        );

        res.json(investmentDetails);
    } catch (error) {
        console.error('Fetch investments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- TRANSACTION ROUTES ---
app.get('/api/transactions', authenticateUser, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseUid: req.user.uid });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { page = 1, limit = 20, type } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const filter = { userId: user._id };
        if (type && ['deposit', 'withdrawal', 'investment', 'interest', 'security'].includes(type)) {
            filter.type = type;
        }

        const transactions = await Transaction.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .select('-userId -__v');

        const total = await Transaction.countDocuments(filter);

        res.json({
            transactions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Fetch transactions error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- ERROR HANDLING MIDDLEWARE ---
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON format' });
    }
    
    if (err.message && err.message.includes('CORS')) {
        return res.status(403).json({ error: 'CORS policy violation' });
    }
    
    res.status(500).json({ 
        error: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { details: err.message })
    });
});

// --- SERVE REACT APP ---
const frontendBuildPath = path.join(__dirname, 'client', 'dist');

console.log(`Serving static files from: ${frontendBuildPath}`);

// Check for frontend build at startup
if (!fs.existsSync(frontendBuildPath) || !fs.existsSync(path.join(frontendBuildPath, 'index.html'))) {
    console.warn(`🚨 WARNING: Frontend build not found at: ${frontendBuildPath}`);
} else {
    console.log(`✅ Frontend build found at: ${frontendBuildPath}`);
}

// Serve static files with proper caching
app.use(express.static(frontendBuildPath, {
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : '0',
    etag: true,
    lastModified: true
}));

// Catch-all route for SPA
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }

    const indexPath = path.join(frontendBuildPath, 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error(`Error serving index.html for ${req.url}:`, err);
            res.status(500).send('Error serving frontend application');
        }
    });
});

// --- GRACEFUL SHUTDOWN ---
const gracefulShutdown = (signal) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close((err) => {
        if (err) {
            console.error('Error during server shutdown:', err);
            process.exit(1);
        }
        
        console.log('HTTP server closed');
        
        // Close database connection
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
    
    // Force shutdown after 30 seconds
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 30000);
};

// --- START SERVER ---
const PORT = process.env.PORT || 10000;
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    connectDB();
});

// --- SOCKET ERROR HANDLING (FIX FOR THE WARNING) ---
server.on('clientError', (err, socket) => {
    console.error('Client connection error:', err.message);
    
    // Check if socket is still writable before attempting to send response
    if (!socket.destroyed && socket.writable) {
        try {
            // Send a simple HTTP 400 response and close
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        } catch (writeError) {
            console.error('Error writing to socket:', writeError.message);
            // If writing fails, just destroy the socket
            socket.destroy();
        }
    } else {
        // Socket is not writable or already destroyed, just destroy it
        socket.destroy();
    }
});

// Additional error handling for connection issues
server.on('connection', (socket) => {
    // Set socket timeout
    socket.setTimeout(30000, () => {
        console.log('Socket timeout, destroying connection');
        socket.destroy();
    });
    
    // Handle socket errors
    socket.on('error', (err) => {
        console.error('Socket error:', err.message);
        if (!socket.destroyed) {
            socket.destroy();
        }
    });
});

// Handle graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = app;