const mongoose = require('mongoose');

const MasterPlanSchema = new mongoose.Schema({
    // ⭐ Key field to identify the plan type (e.g., 'basic', 'gold', 'platinum')
    planId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        enum: ['basic', 'gold', 'platinum'] // Enforce valid plan IDs
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    minAmount: {
        type: Number,
        required: true,
        min: 0
    },
    maxAmount: {
        type: Number,
        required: true,
        min: 0 // Could be 0 or -1 for 'Unlimited' type representation, or a very large number
    },
    interestRate: { // Percentage, e.g., 10.0 for 10%
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    duration: { // In days
        type: Number,
        required: true,
        min: 1
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true // Adds createdAt and updatedAt
});

// Add an index to planId for faster lookups
MasterPlanSchema.index({ planId: 1 });

// ⭐ IMPORTANT: Export as 'MasterPlan' to match the variable name in server.js
module.exports = mongoose.model('MasterPlan', MasterPlanSchema);
