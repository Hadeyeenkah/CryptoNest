const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const app = express();

const mongoose = require('mongoose');
const admin = require('firebase-admin');
const cron = require('node-cron'); // Added for scheduling daily interest

// --- Import Routes ---
const depositRoutes = require('./routes/deposit');
const userRoutes = require('./routes/user'); // Assuming this handles user-specific data, not auth


// --- CORS Configuration ---
const corsOptions = {
    origin: ['http://localhost:5173', 'http://localhost:3000', process.env.FRONTEND_URL], // Use environment variable for production frontend URL
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control'],
    optionsSuccessStatus: 200
};

// Apply CORS middleware
app.use(cors(corsOptions));

// --- Middleware ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Models ---
// ⭐ UPDATED: Changed import name and path for the static plan definitions
const MasterPlan = require('./models/MasterPlan');
const User = require('./models/User');
const UserInvestment = require('./models/UserInvestment'); // This should be your RENAMED old Plan.js
const Deposit = require('./models/Deposit');
const Transaction = require('./models/Transaction');

// --- Custom Middleware ---
const authenticateToken = require('./middleware/auth');

// --- Global Firebase Admin status ---
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

        const fs = require('fs'); // Require fs here to keep it scoped
        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error(`Service account file not found at: ${serviceAccountPath}`);
        }

        const serviceAccount = require(serviceAccountPath);

        if (!serviceAccount.type || !serviceAccount.project_id || !serviceAccount.private_key_id) {
            throw new Error('Invalid service account file structure. Ensure it contains "type", "project_id", "private_key_id".');
        }

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
const connectDB = async (retryCount = 0, maxRetries = 10) => { // Increased maxRetries for better resilience
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI); // Mongoose 6+ options are default

        console.log(`✅ MongoDB connected: ${conn.connection.host}`);

        // Event listeners for Mongoose connection
        mongoose.connection.on('disconnected', () => {
            console.log('❌ MongoDB disconnected. Attempting to reconnect in 5s...');
            setTimeout(() => connectDB(), 5000);
        });

        mongoose.connection.on('error', (err) => {
            console.error(`❌ MongoDB connection error: ${err.message}`);
        });

        // ⭐ VERIFICATION: Check the MasterPlan model after it's definitely loaded
        if (MasterPlan && MasterPlan.schema && MasterPlan.schema.paths.planId) {
            console.log(`✅ Master Plan schema confirmed: 'planId' field exists and is of type ${MasterPlan.schema.paths.planId.instance}.`);
        } else {
            console.error(`❌ CRITICAL: Master Plan schema is missing 'planId' field or MasterPlan model is not properly loaded. Current schema paths for MasterPlan:`, MasterPlan && MasterPlan.schema ? Object.keys(MasterPlan.schema.paths) : 'MasterPlan model not found or schema not accessible.');
        }

        await initializePlans(); // Initialize plans after successful DB connection
    } catch (err) {
        console.error(`❌ MongoDB connection failed: ${err.message}`);
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
            console.log('✅ No duplicate users found.');
        }

        // Additional check for multiple users with email: null and no firebaseUid
        const nullEmailUsers = await User.aggregate([
            {
                $match: {
                    email: null,
                    firebaseUid: { $ne: null } // Only check those with firebaseUid, as unique sparse takes care of pure null emails
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
                    count: { $gt: 1 }
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
        // Run cleanup before seeding plans to ensure a clean user state
        console.log('Running pre-plan initialization user cleanup...');
        await cleanupDuplicateUsers();

        // UPDATED PLAN CONFIGURATIONS
        const plansToSeed = [
            { planId: 'basic', name: 'Basic Plan', minAmount: 100, maxAmount: 1000, interestRate: 10.0, duration: 15 },    // Basic: 10% for 15 days
            { planId: 'gold', name: 'Gold Plan', minAmount: 1001, maxAmount: 5000, interestRate: 15.0, duration: 20 },      // Gold: 15% for 20 days
            { planId: 'platinum', name: 'Platinum Plan', minAmount: 5001, maxAmount: 10000, interestRate: 20.0, duration: 30 }, // Platinum: 20% for 30 days
        ];

        console.log('Initializing/Updating investment plans...');
        for (const planData of plansToSeed) {
            // Use the correct 'MasterPlan' model (the static plan definitions)
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
        // ⭐ Use UserInvestment model to find active user plans
        const userInvestments = await UserInvestment.find({ status: { $in: ['active', 'pending'] } }); // Assuming status indicates active investment

        for (const userInvestment of userInvestments) {
            // ⭐ Get the master plan details from the 'MasterPlan' model
            const plan = await MasterPlan.findOne({ planId: userInvestment.planId });
            if (!plan) {
                console.warn(`⚠️ User investment (ID: ${userInvestment._id}) planId (${userInvestment.planId}) not found in master plans. Skipping interest and marking as ended.`);
                userInvestment.status = 'ended'; // Mark as ended if master plan not found
                await userInvestment.save();
                continue;
            }

            if (userInvestment.status !== 'active') {
                console.log(`ℹ️ User investment (ID: ${userInvestment._id}) is not active (status: ${userInvestment.status}). Skipping interest calculation.`);
                continue;
            }

            if (!userInvestment.startDate) { // Assuming startDate now exists on UserInvestment model
                console.warn(`⚠️ User investment (ID: ${userInvestment._id}) has no startDate. Skipping interest and marking as ended.`);
                userInvestment.status = 'ended';
                await userInvestment.save();
                continue;
            }

            const endDate = new Date(userInvestment.startDate);
            endDate.setDate(endDate.getDate() + plan.duration);

            if (new Date() > endDate) {
                console.log(`🔔 User investment (ID: ${userInvestment._id})'s plan (${plan.name}) ended. Distributing final ROI and marking as ended.`);
                // Distribute final ROI here and then update user balance
                const user = await User.findById(userInvestment.userId);
                if (user) {
                    const finalInterest = (userInvestment.amount * plan.interestRate) / 100; // Calculate total interest for the plan
                    user.balance += finalInterest;
                    user.totalInterest = (user.totalInterest || 0) + finalInterest;

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
                userInvestment.status = 'ended';
                await userInvestment.save();
                continue;
            }

            // Calculate daily interest for active plans
            const totalPlanInterest = (userInvestment.amount * plan.interestRate) / 100;
            const dailyInterest = totalPlanInterest / plan.duration;

            if (dailyInterest > 0) {
                const user = await User.findById(userInvestment.userId);
                if (user) {
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

// Schedule daily interest calculation at 00:00 UTC
cron.schedule('0 0 * * *', () => {
    console.log('⏰ Running daily interest calculation via cron job...');
    calculateDailyInterest();
}, {
    timezone: "UTC" // Ensure the cron job runs at 00:00 UTC regardless of server's local timezone
});
console.log('⏰ Daily interest calculation scheduled for 00:00 UTC.');


// --- ROUTES ---

// Basic ping endpoint
app.get('/api/ping', (req, res) => {
    res.json({ message: 'pong' });
});

// Health check endpoint
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

// Fetch plans
app.get('/api/plans', async (req, res) => {
    try {
        const plans = await MasterPlan.find({}); // Changed from Plan.find to MasterPlan.find
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

        if (!uid) { // UID is the absolute minimum requirement from Firebase
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
            decodedToken = { uid, email: email || null, email_verified: false, name: null, picture: null };
        }

        const userEmailFromTokenOrBody = decodedToken.email || email || null; // Prioritize token email, then body email

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
                // ⭐ MODIFIED: Robust firstName derivation for new users
                const derivedFirstName = decodedToken?.name?.split(' ')[0] || // From Firebase display name
                                        (userEmailFromTokenOrBody ? userEmailFromTokenOrBody.split('@')[0] : null) || // From email
                                        `Guest-${uid.substring(0, 4)}`; // Fallback to a unique 'Guest' name
                const derivedLastName = decodedToken?.name?.split(' ').slice(1).join(' ') || '';

                // Generate username for new user creation - ensure it's always set
                const generatedUsername = await generateUniqueUsername(userEmailFromTokenOrBody || derivedFirstName, uid);

                try {
                    user = new User({
                        firebaseUid: uid,
                        email: userEmailFromTokenOrBody, // Use the extracted email (can be null)
                        firstName: derivedFirstName, // Use the derived first name
                        lastName: derivedLastName,
                        username: generatedUsername, // Use the generated unique username
                        password: null, // Password should be null for Firebase Auth users initially
                        displayName: decodedToken?.name || generatedUsername, // Use display name from Firebase or the generated username
                        emailVerified: decodedToken?.email_verified || false,
                        balance: 0,
                        totalInvestment: 0,
                        totalInterest: 0,
                        preferences: { darkMode: false, notifications: true }
                    });
                    await user.save();
                    console.log(`✅ New user created: ${user.email || user.firebaseUid}`);
                } catch (saveError) {
                    console.error("❌ User creation failed during login:", saveError);
                    if (saveError.code === 11000) { // MongoDB duplicate key error
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
                // Ensure username is returned as well
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName
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

// Profile endpoint
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

            // ⭐ MODIFIED: Robust firstName derivation for new users
            const derivedFirstName = decodedToken?.name?.split(' ')[0] || // From Firebase display name
                                    (email ? email.split('@')[0] : null) || // From email
                                    `Guest-${firebaseUid.substring(0, 4)}`; // Fallback to a unique 'Guest' name
            const derivedLastName = decodedToken?.name?.split(' ').slice(1).join(' ') || '';

            // Generate a unique username for the new user - ensure it's always set
            const generatedUsername = await generateUniqueUsername(email || derivedFirstName, firebaseUid);

            try {
                user = new User({
                    firebaseUid: firebaseUid,
                    email: email, // Can be null for anonymous
                    displayName: displayName || generatedUsername, // Use display name from Firebase or the generated username
                    photoURL: photoURL, // Can be null
                    username: generatedUsername, // IMPORTANT: Use the generated unique username
                    firstName: derivedFirstName, // Set the derived first name
                    lastName: derivedLastName, // Set the derived last name
                    password: null, // No password for Firebase users
                    role: 'user',
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
                   // Log the validation errors more clearly
                   console.error("Validation Errors:", JSON.stringify(saveError.errors, null, 2));
                   return res.status(400).json({
                       error: 'Validation failed',
                       details: saveError.message,
                       fieldErrors: saveError.errors
                   });
                 }
                 // If it's a duplicate key error (code 11000) for username, it means a race condition.
                 // Try to fetch the user again.
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
                    throw saveError; // Re-throw other errors
                 }
            }
        } else {
            // Update existing user's last login, and potentially other fields
            user.lastLogin = new Date();
            if (email && user.email !== email) user.email = email;
            if (displayName && user.displayName !== displayName) user.displayName = displayName;
            if (photoURL && user.photoURL !== photoURL) user.photoURL = photoURL;

            // IMPORTANT: If an existing user somehow has a null username and your schema
            // still requires it, you might need to generate one here for existing users too.
            // This assumes initial creation always sets it.
            if (!user.username) {
                console.warn(`⚠️ User ${firebaseUid} has no username, generating one on profile fetch.`);
                user.username = await generateUniqueUsername(user.email || user.firstName || firebaseUid, firebaseUid);
            }

            // ⭐ ADDED: Ensure firstName is updated if decodedToken.name is present and current firstName is generic
            const newFirstNameFromToken = decodedToken?.name?.split(' ')[0];
            if (newFirstNameFromToken && (user.firstName === 'Guest' || user.firstName === 'User' || !user.firstName)) {
                user.firstName = newFirstNameFromToken;
            }


            await user.save();
            console.log('Existing user profile updated:', user.email || user.firebaseUid);
        }

        // Return the profile data
        const profileData = {
            uid: user.firebaseUid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            role: user.role,
            balance: user.balance,
            totalInvestment: user.totalInvestment,
            totalInterest: user.totalInterest,
            currentPlan: user.currentPlan,
            planStartDate: user.planStartDate,
            preferences: user.preferences,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            username: user.username, // Include username in the response
            firstName: user.firstName,
            lastName: user.lastName
        };
        console.log('✅ Profile data successfully retrieved');
        res.status(200).json(profileData);

    } catch (error) {
        console.error('❌ Profile fetch failed:', error);
        console.error('🔍 Error details:', {
            code: error.code,
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : 'Stack trace hidden in production'
        });

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation failed',
                details: error.message,
                fieldErrors: error.errors
            });
        }
        res.status(500).json({
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Profile fetch failed'
        });
    }
});


// Firebase token verification route (for direct token validation by client, mostly for debugging)
app.get('/api/auth/firebase-profile', async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid token' });
    }

    if (!firebaseAdminInitialized) {
        return res.status(503).json({ error: 'Firebase service unavailable' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        res.json({
            uid: decodedToken.uid,
            email: decodedToken.email,
            emailVerified: decodedToken.email_verified,
            name: decodedToken.name
        });
    } catch (error) {
        console.error('❌ Firebase token verification failed:', error);
        res.status(403).json({ error: 'Invalid or expired token' });
    }
});

// Token sync endpoint (similar to login/profile, used to refresh user data from token)
app.post('/api/auth/sync', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        if (!firebaseAdminInitialized) {
            return res.status(503).json({ error: 'Firebase service unavailable' });
        }

        const decoded = await admin.auth().verifyIdToken(token);
        console.log('🔄 Token sync for UID:', decoded.uid?.substring(0, 8) + '...');

        const decodedEmail = decoded.email || null; // Can be null

        const user = await User.findOne({ firebaseUid: decoded.uid });
        if (user) {
            user.lastLogin = new Date();
            if (decoded.email_verified !== undefined) {
                user.emailVerified = decoded.email_verified;
            }
            if (decodedEmail && user.email !== decodedEmail) {
                user.email = decodedEmail;
            }
            if (decoded.name && user.displayName !== decoded.name) {
                user.displayName = decoded.name;
            }
            if (decoded.picture && user.photoURL !== decoded.picture) {
                user.photoURL = decoded.picture;
            }

            // Ensure username is present for existing users on sync if it was somehow null
            if (!user.username) {
                console.warn(`⚠️ User ${decoded.uid} has no username, generating one on sync.`);
                user.username = await generateUniqueUsername(decodedEmail || user.firstName || decoded.uid, decoded.uid);
            }

            // ⭐ ADDED: Ensure firstName is updated on sync if decoded.name is present and current firstName is generic
            const newFirstNameFromToken = decoded.name?.split(' ')[0];
            if (newFirstNameFromToken && (user.firstName === 'Guest' || user.firstName === 'User' || !user.firstName)) {
                user.firstName = newFirstNameFromToken;
            }

            await user.save();
        } else {
            console.warn('⚠️ Sync requested for a user (UID:', decoded.uid, ') not found in DB. No DB update performed. Consider creating user on sync if not done via /profile.');
            // Option: If you want to auto-create user on sync if not existing (similar to /profile)
            // This would involve calling the generateUniqueUsername and User.create logic here too.
        }

        res.json({
            uid: decoded.uid,
            email: decoded.email,
            name: decoded.name,
            emailVerified: decoded.email_verified,
            // Include username for consistency
            username: user?.username || null
        });
    } catch (error) {
        console.error('❌ Token sync failed:', error);
        res.status(403).json({ error: 'Invalid or expired token' });
    }
});


// --- Use imported routes (place these after your auth routes if they depend on req.user) ---
// If your depositRoutes and userRoutes use the authenticateToken middleware,
// ensure that middleware successfully attaches the user object to req.user.
app.use('/api/deposits', depositRoutes);
app.use('/api/users', userRoutes);


// --- Error Handling Middleware (Last middleware to define) ---
app.use((err, req, res, next) => {
    console.error('Unhandled API Error:', err);
    console.error('Stack:', err.stack);
    res.status(500).json({
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
    });
});

// Export the app for testing or serverless environments
module.exports = app;

// Start server only if this file is run directly (not imported as a module)
if (require.main === module) {
    const PORT = process.env.PORT || 5000;
    connectDB(); // Connect to MongoDB

    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}
