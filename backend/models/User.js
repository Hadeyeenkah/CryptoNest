const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    firebaseUid: {
        type: String,
        required: false,
        unique: true, // Unique for non-null Firebase UIDs
        sparse: true, // Allows multiple documents to have a null firebaseUid (e.g., if a user exists with only email/password)
        index: true
    },
    email: {
        type: String,
        required: false, // Email is not required for anonymous Firebase users
        // ⭐ CRITICAL CHANGE: Removed 'unique: true' from here.
        // This allows multiple documents to have 'null' as their email value.
        sparse: true, // Still useful if you wanted to index non-null emails but not enforce uniqueness on null.
                      // However, without 'unique: true', 'sparse' is less relevant for preventing null duplicates.
        lowercase: true,
        trim: true,
        match: [/.+@.+\..+/, 'Please fill a valid email address'] // Basic email regex validation for non-null emails
    },
    username: {
        type: String,
        required: true,
        unique: true, // Username should always be unique across all users
        trim: true,
        minlength: 3,
        maxlength: 30
    },
    password: { // Hashed password for traditional email/password login (can be null for Firebase Auth users)
        type: String,
        required: false // Not required as Firebase Auth handles passwords externally
    },
    firstName: {
        type: String,
        required: false, // Make optional, can be derived from Firebase or input
        trim: true
    },
    lastName: {
        type: String,
        required: false, // Make optional, can be derived from Firebase or input
        trim: true
    },
    displayName: { // Combines first and last name or derived from email/username
        type: String,
        required: false,
        trim: true
    },
    photoURL: {
        type: String,
        required: false
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    balance: {
        type: Number,
        default: 0,
        min: 0
    },
    totalInvestment: {
        type: Number,
        default: 0,
        min: 0
    },
    totalInterest: {
        type: Number,
        default: 0,
        min: 0
    },
    currentPlan: {
        type: String,
        ref: 'MasterPlan', // Reference to the MasterPlan model
        default: null
    },
    planStartDate: {
        type: Date,
        default: null
    },
    preferences: {
        darkMode: { type: Boolean, default: false },
        notifications: { type: Boolean, default: true }
    },
    lastLogin: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true // Adds createdAt and updatedAt
});

// Middleware to hash password before saving (only if password is provided and modified)
UserSchema.pre('save', async function (next) {
    if (this.isModified('password') && this.password) { // Only hash if password exists and is modified
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }
    next();
});

// Method to compare entered password with hashed password
UserSchema.methods.matchPassword = async function (enteredPassword) {
    if (!this.password) return false; // No password to match if it's a Firebase user
    return await bcrypt.compare(enteredPassword, this.password);
};

// ⭐ CRITICAL CHANGE: Removed 'UserSchema.index({ email: 1 }, { unique: true, sparse: true });'
// This was the explicit index definition causing the issue.
// MongoDB's default behavior for a non-unique index allows multiple nulls.

// Add unique index on username to ensure usernames are unique
UserSchema.index({ username: 1 }, { unique: true });

// Note: firebaseUid already has unique: true, sparse: true defined directly in its schema path.

module.exports = mongoose.model('User', UserSchema);
