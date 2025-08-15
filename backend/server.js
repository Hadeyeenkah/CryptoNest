const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const fs = require('fs'); // Required for file system checks

const express = require('express');
const cors = require('cors');
const app = express();

const mongoose = require('mongoose');
const admin = require('firebase-admin');
const cron = require('node-cron'); // Added for scheduling daily interest

// --- Password Reset Dependencies ---
const crypto = require('crypto');
const bcrypt = require('bcrypt'); // Make sure to install: npm install bcrypt

// --- Import Routes ---
// Ensure these paths are correct relative to your server.js file
const depositRoutes = require('./routes/deposit');
const userRoutes = require('./routes/user'); // Assuming this handles user-specific data, not auth

// --- CORS Configuration ---
const corsOptions = {
    // Use environment variable for production frontend URL, fallback to localhost for development
    origin: ['http://localhost:5173', 'http://localhost:3000', process.env.FRONTEND_URL],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control'],
    optionsSuccessStatus: 200
};

// Apply CORS middleware
app.use(cors(corsOptions));

// --- Middleware ---
// Parse JSON and URL-encoded data with a limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Models ---
// Import Mongoose models for database interaction
const MasterPlan = require('./models/MasterPlan');
const User = require('./models/User');
const UserInvestment = require('./models/UserInvestment');
const Deposit = require('./models/Deposit');
const Transaction = require('./models/Transaction');

// --- Password Reset Token Management ---
// Create a simple in-memory store for reset tokens (use Redis in production)
const resetTokens = new Map();

// Clean up expired tokens periodically
setInterval(() => {
    const now = new Date();
    for (const [token, data] of resetTokens.entries()) {
        if (now > data.expiresAt) {
            resetTokens.delete(token);
            console.log(`🧹 Cleaned up expired reset token for ${data.email}`);
        }
    }
}, 300000); // Clean up every 5 minutes

// --- Global Firebase Admin status flag ---
let firebaseAdminInitialized = false;

// --- Firebase Admin SDK setup with improved error handling ---
const initializeFirebase = () => {
    try {
        // Prevent re-initialization if already done
        if (admin.apps.length > 0) {
            console.log('✅ Firebase Admin already initialized');
            firebaseAdminInitialized = true;
            return true;
        }

        // Resolve path to Firebase service account key
        const serviceAccountPath = path.resolve(__dirname, './config/firebase-service-account.json');

        // Check if the service account file exists
        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error(`Service account file not found at: ${serviceAccountPath}`);
        }

        // Load the service account credentials
        const serviceAccount = require(serviceAccountPath);

        // Basic validation of service account structure
        if (!serviceAccount.type || !serviceAccount.project_id || !serviceAccount.private_key_id) {
            throw new Error('Invalid service account file structure. Ensure it contains "type", "project_id", "private_key_id".');
        }

        // Initialize Firebase Admin SDK
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        console.log('✅ Firebase Admin initialized successfully');
        firebaseAdminInitialized = true;
        return true;
    } catch (error) {
        console.error('❌ Firebase Admin initialization failed:', error.message);
        console.log('🔧 Firebase features will be disabled. Check ./config/firebase-service-account.json');
        firebaseAdminInitialized = false;
        return false;
    }
};

// Initialize Firebase on startup (runs synchronously)
initializeFirebase();

// --- MongoDB connection ---
const connectDB = async (retryCount = 0, maxRetries = 10) => {
    try {
        // Log the MongoDB URI being used (masking sensitive parts for security in logs)
        console.log('Attempting to connect to MongoDB with URI:', process.env.MONGO_URI ? `${process.env.MONGO_URI.substring(0, process.env.MONGO_URI.indexOf('//') + 2)}<username>:<password>${process.env.MONGO_URI.substring(process.env.MONGO_URI.indexOf('@'))}` : 'MONGO_URI not set');

        // Connect to MongoDB using the URI from environment variables
        const conn = await mongoose.connect(process.env.MONGO_URI);

        console.log(`✅ MongoDB connected: ${conn.connection.host}`);

        // Event listeners for Mongoose connection to handle disconnections and errors
        mongoose.connection.on('disconnected', () => {
            console.log('❌ MongoDB disconnected. Attempting to reconnect in 5s...');
            setTimeout(() => connectDB(), 5000);
        });

        mongoose.connection.on('error', (err) => {
            console.error(`❌ MongoDB connection error: ${err.message}`);
        });

        // Verify MasterPlan schema after connection
        if (MasterPlan && MasterPlan.schema && MasterPlan.schema.paths.planId) {
            console.log(`✅ Master Plan schema confirmed: 'planId' field exists and is of type ${MasterPlan.schema.paths.planId.instance}.`);
        } else {
            console.error(`❌ CRITICAL: Master Plan schema is missing 'planId' field or MasterPlan model is not properly loaded. Current schema paths for MasterPlan:`, MasterPlan && MasterPlan.schema ? Object.keys(MasterPlan.schema.paths) : 'MasterPlan model not found or schema not accessible.');
        }

        // Initialize investment plans after successful DB connection
        await initializePlans();
    } catch (err) {
        console.error(`❌ MongoDB connection failed: ${err.message}`);
        // Retry connection if max retries not reached
        if (retryCount < maxRetries) {
            console.log(`Retrying connection... (${retryCount + 1}/${maxRetries})`);
            setTimeout(() => connectDB(retryCount + 1), 5000);
        } else {
            console.log('🛑 Max retries reached. Server will run without database or exit.');
        }
    }
};

// --- Helper function to generate a unique username ---
async function generateUniqueUsername(baseIdentifier, uid) {
    let baseName;
    if (baseIdentifier) {
        // Use the part before @ if it's an email, otherwise use it directly
        baseName = baseIdentifier.includes('@') ? baseIdentifier.split('@')[0] : baseIdentifier;
    } else {
        baseName = `user_${uid.substring(0, 6)}`; // Fallback for anonymous users
    }

    let username = baseName;
    let counter = 0;
    let userExists = true;

    // Keep trying until a unique username is found
    while (userExists) {
        const existingUser = await User.findOne({ username: username }); // Find user by generated username
        if (existingUser) {
            counter++;
            username = `${baseName}${counter}`;
        } else {
            userExists = false;
        }
    }
    return username;
}

// --- Cleanup duplicate users function ---
const cleanupDuplicateUsers = async () => {
    try {
        console.log('🧹 Checking for duplicate users...');

        // Find duplicate users by email (for non-null emails)
        const duplicateEmails = await User.aggregate([
            {
                $match: {
                    email: { $ne: null } // Only consider users with an email for duplicate email check
                }
            },
            {
                $group: {
                    _id: "$email",
                    count: { $sum: 1 },
                    users: { $push: "$$ROOT" }
                }
            },
            {
                $match: {
                    count: { $gt: 1 }
                }
            }
        ]);

        if (duplicateEmails.length > 0) {
            console.log(`🔍 Found ${duplicateEmails.length} duplicate email groups, cleaning up...`);

            for (const emailGroup of duplicateEmails) {
                const users = emailGroup.users;
                // Keep the user with a firebaseUid, or the most recently created if none have firebaseUid
                let userToKeep = users.find(u => u.firebaseUid) ||
                    users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
                let usersToRemove = users.filter(u => u._id.toString() !== userToKeep._id.toString());

                for (const userToRemove of usersToRemove) {
                    await User.findByIdAndDelete(userToRemove._id);
                    console.log(`🗑️ Removed duplicate user: ${userToRemove.email} (ID: ${userToRemove._id})`);
                }

                console.log(`✅ Cleaned up duplicates for: ${emailGroup._id}`);
            }
        } else {
            console.log('✅ No duplicate users found by email.');
        }

        // Additional check for multiple anonymous users with the same firebaseUid (should be unique)
        const nullEmailUsers = await User.aggregate([
            {
                $match: {
                    email: null, // Only consider users without an email
                    firebaseUid: { $ne: null } // But with a Firebase UID
                }
            },
            {
                $group: {
                    _id: "$firebaseUid", // Group by firebaseUid for anonymous users
                    count: { $sum: 1 },
                    users: { $push: "$$ROOT" }
                }
            },
            {
                $match: {
                    count: { $gt: 1 } // Find groups with more than one user for the same UID
                }
            }
        ]);

        if (nullEmailUsers.length > 0) {
            console.log(`🔍 Found ${nullEmailUsers.length} groups of duplicate anonymous users, cleaning up...`);
            for (const uidGroup of nullEmailUsers) {
                const users = uidGroup.users;
                // Keep the most recently created one
                let userToKeep = users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
                let usersToRemove = users.filter(u => u._id.toString() !== userToKeep._id.toString());

                for (const userToRemove of usersToRemove) {
                    await User.findByIdAndDelete(userToRemove._id);
                    console.log(`🗑️ Removed duplicate anonymous user (UID: ${userToRemove.firebaseUid}) (ID: ${userToRemove._id})`);
                }
                console.log(`✅ Cleaned up duplicates for anonymous UID: ${uidGroup._id}`);
            }
        } else {
            console.log('✅ No duplicate anonymous users found (email: null, firebaseUid present).');
        }

    } catch (error) {
        console.error('❌ Duplicate user cleanup failed:', error);
    }
};

// --- Initialize investment plans and cleanup invalid users ---
const initializePlans = async () => {
    try {
        console.log('Running pre-plan initialization user cleanup...');
        await cleanupDuplicateUsers(); // Ensure user data is clean before processing plans

        // Define the static investment plan configurations
        const plansToSeed = [
            { planId: 'basic', name: 'Basic Plan', minAmount: 100, maxAmount: 1000, interestRate: 10.0, duration: 15 },    // Basic: 10% for 15 days
            { planId: 'gold', name: 'Gold Plan', minAmount: 1001, maxAmount: 5000, interestRate: 15.0, duration: 20 },      // Gold: 15% for 20 days
            { planId: 'platinum', name: 'Platinum Plan', minAmount: 5001, maxAmount: 10000, interestRate: 20.0, duration: 30 }, // Platinum: 20% for 30 days
        ];

        console.log('Initializing/Updating investment plans...');
        for (const planData of plansToSeed) {
            // Find and update the plan by planId, or create it if it doesn't exist (upsert: true)
            const existingPlan = await MasterPlan.findOneAndUpdate(
                { planId: planData.planId },
                planData,
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            if (existingPlan) {
                console.log(`✅ Plan "${existingPlan.name}" (${existingPlan.planId}) initialized/updated.`);
            }
        }
        console.log('📚 All investment plans processed.');

    } catch (error) {
        console.error('❌ Failed to initialize plans or cleanup users:', error.message);
        if (process.env.NODE_ENV === 'development') {
            console.error('Full error details (this is likely a schema issue):', error);
        }
    }
};

// --- Interest calculation (Scheduler logic) ---
const calculateDailyInterest = async () => {
    try {
        console.log(`[${new Date().toISOString()}] Calculating daily interest...`);
        // Find all active or pending user investments
        const userInvestments = await UserInvestment.find({ status: { $in: ['active', 'pending'] } });

        for (const userInvestment of userInvestments) {
            // Get the details of the associated master plan
            const plan = await MasterPlan.findOne({ planId: userInvestment.planId });
            if (!plan) {
                console.warn(`⚠️ User investment (ID: ${userInvestment._id}) planId (${userInvestment.planId}) not found in master plans. Skipping interest and marking as ended.`);
                userInvestment.status = 'ended'; // Mark as ended if master plan not found
                await userInvestment.save();
                continue;
            }

            // Skip if the investment is not active
            if (userInvestment.status !== 'active') {
                console.log(`ℹ️ User investment (ID: ${userInvestment._id}) is not active (status: ${userInvestment.status}). Skipping interest calculation.`);
                continue;
            }

            // Ensure startDate exists for active investments
            if (!userInvestment.startDate) {
                console.warn(`⚠️ User investment (ID: ${userInvestment._id}) has no startDate. Skipping interest and marking as ended.`);
                userInvestment.status = 'ended';
                await userInvestment.save();
                continue;
            }

            // Calculate the end date of the investment
            const endDate = new Date(userInvestment.startDate);
            endDate.setDate(endDate.getDate() + plan.duration);

            // If the investment duration has passed
            if (new Date() > endDate) {
                console.log(`🔔 User investment (ID: ${userInvestment._id})'s plan (${plan.name}) ended. Distributing final ROI and marking as ended.`);
                const user = await User.findById(userInvestment.userId);
                if (user) {
                    // Calculate total interest for the plan duration
                    const finalInterest = (userInvestment.amount * plan.interestRate) / 100;
                    user.balance += finalInterest;
                    user.totalInterest = (user.totalInterest || 0) + finalInterest;

                    // Record the final interest transaction
                    await Transaction.create({
                        userId: user._id,
                        type: 'interest',
                        amount: finalInterest,
                        details: `Final interest payout from ${plan.name} (Investment ID: ${userInvestment._id})`,
                    });
                    await user.save();
                    console.log(`✅ Final interest of ${finalInterest.toFixed(2)} added to user ${user.email || user.firebaseUid}`);
                } else {
                    console.warn(`⚠️ User not found for investment ID ${userInvestment._id}. Cannot distribute final ROI.`);
                }
                userInvestment.status = 'ended'; // Mark investment as ended
                await userInvestment.save();
                continue;
            }

            // Calculate daily interest for active plans
            const totalPlanInterest = (userInvestment.amount * plan.interestRate) / 100;
            const dailyInterest = totalPlanInterest / plan.duration;

            if (dailyInterest > 0) {
                const user = await User.findById(userInvestment.userId);
                if (user) {
                    // Record daily interest transaction
                    await Transaction.create({
                        userId: user._id,
                        type: 'interest',
                        amount: dailyInterest,
                        details: `Daily interest from ${plan.name} (Investment ID: ${userInvestment._id})`,
                    });

                    user.balance += dailyInterest;
                    user.totalInterest = (user.totalInterest || 0) + dailyInterest;
                    await user.save();
                    console.log(`✅ Daily interest of ${dailyInterest.toFixed(2)} applied to user ${user.email || user.firebaseUid} for investment ${userInvestment._id}`);
                } else {
                    console.warn(`⚠️ User not found for investment ID ${userInvestment._id}. Cannot apply daily interest.`);
                }
            } else {
                console.log(`ℹ️ User investment (ID: ${userInvestment._id}): Daily interest calculated as non-positive (${dailyInterest}). Skipping transaction.`);
            }
        }

        console.log('✅ Daily interest applied');
    } catch (err) {
        console.error('❌ Interest calculation error:', err);
    }
};

// Schedule daily interest calculation at 00:00 UTC using node-cron
cron.schedule('0 0 * * *', () => {
    console.log('⏰ Running daily interest calculation via cron job...');
    calculateDailyInterest();
}, {
    timezone: "UTC" // Ensure the cron job runs at 00:00 UTC regardless of server's local timezone
});
console.log('⏰ Daily interest calculation scheduled for 00:00 UTC.');

// --- API ROUTES ---
// IMPORTANT: All API routes MUST be defined BEFORE any static file serving middleware
// that might catch API paths, and before the catch-all route for the SPA.
// This ensures that API requests are handled by your backend logic first.

// Mount your imported API routes
app.use('/api/deposits', depositRoutes);
app.use('/api/users', userRoutes);

// Basic ping endpoint
app.get('/api/ping', (req, res) => {
    res.json({ message: 'pong' });
});

// Health check endpoint for monitoring server status
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'cryptonest-backend',
        firebase: firebaseAdminInitialized,
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// API info endpoint
app.get('/api', (req, res) => {
    res.json({
        message: 'CryptoNest API is running',
        version: '1.0.0',
        endpoints: [
            'GET /health',
            'GET /api/plans',
            'POST /api/auth/login',
            'GET /api/auth/profile',
            'PUT /api/auth/profile (protected)',
            'POST /api/auth/check-email',
            'POST /api/auth/store-reset-token',
            'POST /api/auth/send-reset-email',
            'POST /api/auth/reset-password',
            'GET /api/placeholder/:width/:height',
            'GET /api/placeholder-svg/:width/:height',
            'GET /api/user/deposit (example)',
            'GET /api/user/profile (example)',
        ]
    });
});

// Handle the placeholder image requests - Updated version
app.get('/api/placeholder/:width/:height', (req, res) => {
    const { width, height } = req.params;
    const w = parseInt(width) || 100;
    const h = parseInt(height) || 100;

    res.json({
        url: `https://via.placeholder.com/${w}x${h}`,
        width: w,
        height: h,
        alt: `Placeholder image ${w}x${h}`
    });
});

// Alternative SVG placeholder endpoint
app.get('/api/placeholder-svg/:width/:height', (req, res) => {
    const { width, height } = req.params;
    const w = parseInt(width) || 100;
    const h = parseInt(height) || 100;

    const svg = `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#e5e7eb" stroke="#d1d5db" stroke-width="1"/>
      <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#6b7280" font-family="Arial, sans-serif" font-size="${Math.min(w, h) / 8}">
        ${w}×${h}
      </text>
    </svg>
  `;

    res.set({
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600'
    });
    res.send(svg);
});

// Fetch plans endpoint
app.get('/api/plans', async (req, res) => {
    try {
        const plans = await MasterPlan.find({});
        res.json(plans);
    } catch (error) {
        console.error('❌ Failed to fetch plans:', error.message);
        res.status(500).json({ error: 'Failed to fetch plans' });
    }
});

// --- AUTH ROUTES ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { uid, email, idToken } = req.body;

        console.log('🔐 Login attempt:', { uid: uid?.substring(0, 8) + '...', email });

        if (!uid) {
            return res.status(400).json({ error: 'Missing UID in request body' });
        }

        if (!firebaseAdminInitialized) {
            console.log('❌ Firebase Admin not initialized, authentication service unavailable');
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
                console.error('❌ Token verification failed:', error.message);
                return res.status(401).json({ error: 'Invalid token' });
            }
        } else {
            console.warn('⚠️ No idToken provided for login, proceeding with uid/email from request body (less secure for login).');
            // If no idToken, create a basic decodedToken object for consistency
            decodedToken = { uid, email: email || null, email_verified: false, name: null, picture: null };
        }

        const userEmailFromTokenOrBody = decodedToken.email || email || null;

        let user = await User.findOne({ firebaseUid: uid });
        if (!user) {
            console.log('🔍 User not found by firebaseUid, attempting to create new user or link by email...');

            if (userEmailFromTokenOrBody) {
                user = await User.findOne({ email: userEmailFromTokenOrBody });
            }

            if (user) {
                console.log('✅ Found existing user by email, updating firebaseUid and marking as verified.');
                user.firebaseUid = uid;
                user.emailVerified = decodedToken?.email_verified || user.emailVerified;
                user.lastLogin = new Date();
                await user.save();
            } else {
                const derivedFirstName = decodedToken?.name?.split(' ')[0] ||
                                         (userEmailFromTokenOrBody ? userEmailFromTokenOrBody.split('@')[0] : null) ||
                                         `Guest-${uid.substring(0, 4)}`;
                const derivedLastName = decodedToken?.name?.split(' ').slice(1).join(' ') || '';

                const generatedUsername = await generateUniqueUsername(userEmailFromTokenOrBody || derivedFirstName, uid);

                try {
                    user = new User({
                        firebaseUid: uid,
                        email: userEmailFromTokenOrBody,
                        firstName: derivedFirstName,
                        lastName: derivedLastName,
                        username: generatedUsername,
                        password: null, // Password should not be stored here if using Firebase Auth
                        displayName: decodedToken?.name || generatedUsername,
                        emailVerified: decodedToken?.email_verified || false,
                        balance: 0,
                        totalInvestment: 0,
                        totalInterest: 0,
                        preferences: { darkMode: false, notifications: true },
                        role: 'user', // Default role for new users
                    });
                    await user.save();
                    console.log(`✅ New user created: ${user.email || user.firebaseUid}`);
                } catch (saveError) {
                    console.error("❌ User creation failed during login:", saveError);
                    if (saveError.code === 11000) {
                        console.warn("Duplicate key error during user creation, attempting to re-fetch...");
                        user = await User.findOne({ firebaseUid: uid });
                        if (!user && userEmailFromTokenOrBody) {
                            user = await User.findOne({ email: userEmailFromTokenOrBody });
                        }
                        if (!user) {
                            return res.status(500).json({ error: 'Failed to find or create user due to database conflict.' });
                        }
                        console.log("✅ Successfully retrieved existing user after duplicate error.");
                    } else {
                        throw saveError;
                    }
                }
            }
        }

        user.lastLogin = new Date();
        await user.save();

        // --- Firebase Custom Claims Management ---
        // Ensure isAdmin custom claim matches the user's role from MongoDB
        const currentClaims = (await admin.auth().getUser(uid)).customClaims || {};
        const isAdminInDB = user.role === 'admin';

        if (currentClaims.isAdmin !== isAdminInDB) {
            await admin.auth().setCustomUserClaims(uid, { ...currentClaims, isAdmin: isAdminInDB });
            console.log(`🔑 Firebase custom claim 'isAdmin' set to ${isAdminInDB} for user ${uid}`);
            // Note: Client-side token needs to be refreshed for this to take effect immediately in Firestore rules.
            // This usually happens on subsequent requests or re-login.
        } else {
            console.log(`🔑 Firebase custom claim 'isAdmin' already in sync for user ${uid} (${isAdminInDB}).`);
        }
        // --- End Firebase Custom Claims Management ---

        return res.status(200).json({
            message: 'Login successful',
            uid,
            email: user.email,
            user: {
                id: user._id,
                displayName: user.displayName,
                balance: user.balance,
                totalInvestment: user.totalInvestment,
                totalInterest: user.totalInterest,
                currentPlan: user.currentPlan,
                planStartDate: user.planStartDate,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role, // Include role in the response
                isAdmin: isAdminInDB // Include the current admin status
            }
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation failed',
                details: error.message,
                fieldErrors: error.errors
            });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/auth/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith('Bearer ')) {
            console.log('❌ Missing or invalid authorization header (expected Bearer token)');
            return res.status(401).json({ error: 'Missing or invalid authorization header' });
        }

        const token = authHeader.split(' ')[1];

        if (!firebaseAdminInitialized) {
            console.log('❌ Firebase Admin not initialized for profile access');
            return res.status(503).json({
                error: 'Authentication service unavailable',
                details: 'Firebase Admin SDK not properly initialized. Check service account configuration.'
            });
        }

        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(token);
            console.log('✅ Token verified successfully for profile');
            console.log('DEBUG: Decoded Token for profile fetch:', decodedToken);
        } catch (tokenError) {
            console.error('❌ Token verification failed for profile:', tokenError.message);
            const status = tokenError.code === 'auth/id-token-expired' ? 401 : 403;
            return res.status(status).json({
                error: 'Invalid or expired token',
                details: process.env.NODE_ENV === 'development' ? tokenError.message : undefined
            });
        }

        if (!decodedToken.uid) {
            console.error('❌ Decoded token missing UID:', decodedToken);
            return res.status(400).json({ error: 'Invalid Firebase token - no UID' });
        }

        const firebaseUid = decodedToken.uid;
        const email = decodedToken.email || null;
        const displayName = decodedToken.name || null;
        const photoURL = decodedToken.picture || null;

        let user = await User.findOne({ firebaseUid: firebaseUid });

        if (!user) {
            console.log('User not found in DB, creating new profile for UID:', firebaseUid);

            const derivedFirstName = decodedToken?.name?.split(' ')[0] ||
                                     (email ? email.split('@')[0] : null) ||
                                     `Guest-${firebaseUid.substring(0, 4)}`;
            const derivedLastName = decodedToken?.name?.split(' ').slice(1).join(' ') || '';

            const generatedUsername = await generateUniqueUsername(email || derivedFirstName, firebaseUid);

            try {
                user = new User({
                    firebaseUid: firebaseUid,
                    email: email,
                    displayName: displayName || generatedUsername,
                    photoURL: photoURL,
                    username: generatedUsername,
                    firstName: derivedFirstName,
                    lastName: derivedLastName,
                    password: null, // Password should not be stored here if using Firebase Auth
                    role: 'user', // Default role for new users
                    balance: 0,
                    totalInvestment: 0,
                    totalInterest: 0,
                    preferences: { darkMode: false, notifications: true },
                    lastLogin: new Date(),
                });
                await user.save();
                console.log('✅ New user profile created:', user.email || user.firebaseUid);
            } catch (saveError) {
                console.error("❌ User creation failed during profile fetch:", saveError);
                if (saveError.name === 'ValidationError') {
                   console.error("Validation Errors:", JSON.stringify(saveError.errors, null, 2));
                   return res.status(400).json({
                       error: 'Validation failed',
                       details: saveError.message,
                       fieldErrors: saveError.errors
                   });
                }
                if (saveError.code === 11000) {
                    console.warn("Duplicate key error during profile creation, attempting to re-fetch...");
                    user = await User.findOne({ firebaseUid: firebaseUid });
                    if (!user && email) {
                        user = await User.findOne({ email: email });
                    }
                    if (!user) {
                        return res.status(500).json({ error: 'Failed to find or create user due to database conflict.' });
                    }
                    console.log("✅ Successfully retrieved existing user after duplicate error.");
                } else {
                    throw saveError;
                }
            }
        } else {
            user.lastLogin = new Date();
            if (email && user.email !== email) user.email = email;
            if (displayName && user.displayName !== displayName) user.displayName = displayName;
            if (photoURL && user.photoURL !== photoURL) user.photoURL = photoURL;

            if (!user.username) {
                console.warn(`⚠️ User ${firebaseUid} has no username, generating one on profile fetch.`);
                user.username = await generateUniqueUsername(user.email || user.firstName || firebaseUid, firebaseUid);
            }

            const newFirstNameFromToken = decodedToken?.name?.split(' ')[0];
            if (newFirstNameFromToken && (user.firstName === 'Guest' || user.firstName === 'User' || !user.firstName)) {
                user.firstName = newFirstNameFromToken;
            }

            await user.save();
            console.log('Existing user profile updated:', user.email || user.firebaseUid);
        }

        // --- Firebase Custom Claims Management ---
        // Ensure isAdmin custom claim matches the user's role from MongoDB
        const currentClaims = (await admin.auth().getUser(firebaseUid)).customClaims || {};
        const isAdminInDB = user.role === 'admin';

        if (currentClaims.isAdmin !== isAdminInDB) {
            await admin.auth().setCustomUserClaims(firebaseUid, { ...currentClaims, isAdmin: isAdminInDB });
            console.log(`🔑 Firebase custom claim 'isAdmin' set to ${isAdminInDB} for user ${firebaseUid}`);
            // Note: Client-side token needs to be refreshed for this to take effect immediately in Firestore rules.
            // This usually happens on subsequent requests or re-login.
        } else {
            console.log(`🔑 Firebase custom claim 'isAdmin' already in sync for user ${firebaseUid} (${isAdminInDB}).`);
        }
        // --- End Firebase Custom Claims Management ---

        const profileData = {
            uid: user.firebaseUid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            balance: user.balance,
            totalInvestment: user.totalInvestment,
            totalInterest: user.totalInterest,
            role: user.role, // Include role from MongoDB
            isAdmin: isAdminInDB // Include the calculated isAdmin status
        };
        return res.status(200).json(profileData);
    } catch (error) {
        console.error('❌ Profile fetch error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Admin-specific API to update user profile (including role) ---
// This endpoint should be protected by an authentication middleware that verifies admin status.
// For simplicity, I'm adding it here, but in a real app, ensure proper auth.
app.put('/api/admin/users/:userId', async (req, res) => {
    // IMPORTANT: In a real application, you MUST add an authentication middleware here
    // to ensure only actual administrators can access this endpoint.
    // Example: app.put('/api/admin/users/:userId', authenticateAdmin, async (req, res) => { ... });

    if (!firebaseAdminInitialized) {
        return res.status(503).json({ error: 'Firebase Admin SDK not initialized.' });
    }

    const { userId } = req.params;
    const { firstName, lastName, username, email, role } = req.body; // Add role to updatable fields

    try {
        // Find the user in MongoDB
        const user = await User.findOne({ firebaseUid: userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found in database.' });
        }

        // Update MongoDB user data
        if (firstName !== undefined) user.firstName = firstName;
        if (lastName !== undefined) user.lastName = lastName;
        if (username !== undefined) user.username = username;
        if (email !== undefined) user.email = email;
        if (role !== undefined) user.role = role; // Update role

        await user.save();
        console.log(`✅ MongoDB user profile updated for ${userId}`);

        // --- Update Firebase Custom Claims based on new role ---
        const isAdminInDB = user.role === 'admin';
        const currentUserRecord = await admin.auth().getUser(userId);
        const currentClaims = currentUserRecord.customClaims || {};

        if (currentClaims.isAdmin !== isAdminInDB) {
            await admin.auth().setCustomUserClaims(userId, { ...currentClaims, isAdmin: isAdminInDB });
            console.log(`🔑 Firebase custom claim 'isAdmin' updated to ${isAdminInDB} for user ${userId}`);
            // Revoke refresh tokens to force client-side token refresh (optional but good for immediate effect)
            await admin.auth().revokeRefreshTokens(userId);
            console.log(`🔑 Revoked refresh tokens for user ${userId} to force token refresh.`);
        } else {
            console.log(`🔑 Firebase custom claim 'isAdmin' already in sync for user ${userId} (${isAdminInDB}).`);
        }
        // --- End Firebase Custom Claims Management ---

        res.status(200).json({ message: 'User profile updated successfully', user: user });

    } catch (error) {
        console.error('❌ Error updating user profile:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation failed',
                details: error.message,
                fieldErrors: error.errors
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- PASSWORD RESET ROUTES ---

// Check if email exists in database
app.post('/api/auth/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email || !email.trim()) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        
        if (!user) {
            console.log(`Email check failed: ${email} not found in system`);
            return res.status(404).json({ error: 'Email not found in our system' });
        }
        
        console.log(`Email check successful: ${email} found in system`);
        res.json({ exists: true, message: 'Email found' });
    } catch (error) {
        console.error('Email check error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Store reset token
app.post('/api/auth/store-reset-token', async (req, res) => {
    try {
        const { email, token, expiresAt } = req.body;
        
        if (!email || !token || !expiresAt) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Store in memory (use database/Redis in production)
        resetTokens.set(token, {
            email: email.toLowerCase().trim(),
            expiresAt: new Date(expiresAt),
            createdAt: new Date()
        });
        
        console.log(`Reset token stored for ${email}, expires at ${expiresAt}`);
        
        // Clean up expired tokens for this email
        for (const [existingToken, data] of resetTokens.entries()) {
            if (data.email === email.toLowerCase().trim() && existingToken !== token) {
                resetTokens.delete(existingToken);
                console.log(`Cleaned up old reset token for ${email}`);
            }
        }
        
        // Auto cleanup after expiration
        setTimeout(() => {
            if (resetTokens.has(token)) {
                resetTokens.delete(token);
                console.log(`Auto-cleaned expired reset token for ${email}`);
            }
        }, new Date(expiresAt).getTime() - Date.now());
        
        res.json({ success: true, message: 'Reset token stored successfully' });
    } catch (error) {
        console.error('Store token error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Send reset email using EmailJS (server-side - optional, but more secure)
app.post('/api/auth/send-reset-email', async (req, res) => {
    try {
        const { email, resetUrl } = req.body;
        
        if (!email || !resetUrl) {
            return res.status(400).json({ error: 'Email and reset URL are required' });
        }

        // This is optional - EmailJS can be called directly from frontend
        // But server-side is more secure as it hides your private keys
        
        // Import EmailJS (install: npm install @emailjs/nodejs)
        const emailjs = require('@emailjs/nodejs');
        
        const templateParams = {
            to_email: email,
            user_email: email,
            reset_link: resetUrl,
            app_name: 'CryptoNest Investment',
            to_name: email.split('@')[0],
            from_name: 'CryptoNest Investment Team',
            support_email: 'support@cryptonest.com'
        };
        
        await emailjs.send(
            process.env.EMAILJS_SERVICE_ID,
            process.env.EMAILJS_TEMPLATE_ID,
            templateParams,
            {
                publicKey: process.env.EMAILJS_PUBLIC_KEY,
                privateKey: process.env.EMAILJS_PRIVATE_KEY,
            }
        );
        
        console.log(`Password reset email sent to ${email}`);
        res.json({ success: true, message: 'Reset email sent successfully' });
    } catch (error) {
        console.error('Send email error:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// Reset password
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, token, newPassword } = req.body;
        
        if (!email || !token || !newPassword) {
            return res.status(400).json({ error: 'Email, token, and new password are required' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        
        // Verify token exists and is valid
        const tokenData = resetTokens.get(token);
        if (!tokenData) {
            console.log(`Reset attempt with invalid token: ${token}`);
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }
        
        if (tokenData.email !== normalizedEmail) {
            console.log(`Token email mismatch: ${tokenData.email} vs ${normalizedEmail}`);
            return res.status(400).json({ error: 'Token does not match email' });
        }
        
        if (new Date() > tokenData.expiresAt) {
            resetTokens.delete(token);
            console.log(`Reset attempt with expired token for ${normalizedEmail}`);
            return res.status(400).json({ error: 'Reset token has expired' });
        }
        
        // Validate password strength
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({ 
                error: 'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character' 
            });
        }
        
        // Find user and update password
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            console.log(`Reset attempt for non-existent user: ${normalizedEmail}`);
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Hash the new password
        const saltRounds = 12; // Increased salt rounds for better security
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        
        // Update user password
        user.password = hashedPassword;
        user.lastLogin = new Date(); // Update last login since password was changed
        await user.save();
        
        // Remove used token
        resetTokens.delete(token);
        
        // Record password reset transaction for audit trail
        await Transaction.create({
            userId: user._id,
            type: 'security',
            amount: 0,
            details: 'Password reset completed successfully',
        });
        
        console.log(`Password reset successful for user: ${normalizedEmail}`);
        
        res.json({ 
            success: true, 
            message: 'Password reset successful',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Reset password error:', error);
        
        // Don't expose internal errors to client
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Invalid data provided',
                details: error.message
            });
        }
        
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Optional: Get reset token status (for debugging)
app.get('/api/auth/reset-token-status/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        const tokenData = resetTokens.get(token);
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

// -----------------------------------------------------------------------------------------------------------------------------------
// IMPORTANT: SERVE REACT APP STATIC FILES AND CATCH-ALL ROUTE BELOW ALL YOUR API ROUTES
// -----------------------------------------------------------------------------------------------------------------------------------

// Determine the path to your frontend build directory
// This path assumes your project structure is like:
// your-repo/
// ├── backend/
// │   └── server.js
// └── client/
//     └── dist/ (React build output)
const frontendBuildPath = path.join(__dirname, 'client', 'dist');

// Log the path to verify during deployment (check Render logs)
console.log(`Serving static files from: ${frontendBuildPath}`);

// Add a startup check for index.html existence
// This will log a warning if the main frontend file is not found at startup
if (!fs.existsSync(frontendBuildPath) || !fs.existsSync(path.join(frontendBuildPath, 'index.html'))) {
    console.warn(`🚨 WARNING: Frontend build directory or index.html not found at startup: ${frontendBuildPath}. This will likely result in blank pages.`);
    console.warn(`Please ensure your frontend build command (e.g., 'npm run build') is correctly configured in Render and creates 'client/dist'.`);
} else {
    console.log(`✅ Frontend build directory and index.html found at: ${frontendBuildPath}`);
}

// Serve static files from the React build directory
// This middleware will try to match incoming requests to files in the 'dist' folder.
// E.g., a request for /static/js/main.js will look for client/dist/static/js/main.js
app.use(express.static(frontendBuildPath));

// Catch-all route to serve the React app's index.html for any other GET requests.
// This is crucial for client-side routing (e.g., React Router), so that direct
// access to /dashboard or /profile routes in your SPA also serves index.html.
app.get('*', (req, res) => {
    // This condition ensures that requests starting with '/api' are NOT served by index.html.
    // Instead, they will either be handled by an API route defined above, or fall through
    // to Express's default 404 handler (or the custom one below if implemented).
    if (req.path.startsWith('/api')) {
        console.warn(`Attempted to serve index.html for an API path: ${req.url}. This indicates a routing issue.`);
        return res.status(404).json({ error: 'API endpoint not found' });
    }

    // Send the main index.html file from your React build
    const indexPath = path.join(frontendBuildPath, 'index.html');
    console.log(`Attempting to send index.html from: ${indexPath} for route: ${req.url}`);
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error(`Error sending index.html for ${req.url}:`, err);
            // Fallback for debugging: send a simple message if index.html can't be found
            res.status(500).send('Error serving frontend application. Check server logs for details.');
        } else {
            console.log(`Successfully sent index.html for ${req.url}`);
        }
    });
});

// --- Start the server ---
const PORT = process.env.PORT || 10000; // Use port from environment variable (e.g., Render provides one) or default to 10000
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    // Connect to MongoDB after the server starts listening
    connectDB();
});