// models/Deposit.js
const mongoose = require('mongoose');

const DepositSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
  },
  amount: {
    type: Number,
    required: [true, 'Deposit amount is required'],
    min: [500, 'Amount must be at least $500'],
    validate: {
      validator: function (value) {
        // For 'basic' and 'premium' plans, max allowed is $5000
        if (['basic', 'premium'].includes(this.plan)) {
          return value <= 5000;
        }
        // No upper limit for 'vip' plan
        return true;
      },
      message: 'Amount cannot exceed $5000 for Basic and Premium plans',
    },
  },
  plan: {
    type: String,
    enum: {
      values: ['basic', 'premium', 'vip'],
      message: '{VALUE} is not a valid plan',
    },
    required: [true, 'Plan type is required'],
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'approved', 'rejected'],
      message: '{VALUE} is not a valid status',
    },
    default: 'pending',
  },
  transactionId: {
    type: String,
    unique: true,
    sparse: true,
    default: function () {
      // Generates a unique transaction ID if none is provided
      return `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    },
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
});

module.exports = mongoose.model('Deposit', DepositSchema);
