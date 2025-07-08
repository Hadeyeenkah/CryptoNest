const mongoose = require('mongoose');

const investmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  purchasePrice: {
    type: Number,
    required: true,
    min: 0
  },
  currentPrice: {
    type: Number,
    required: true,
    min: 0
  },
  totalValue: {
    type: Number,
    required: true,
    min: 0
  },
  gainLoss: {
    type: Number,
    default: 0
  },
  gainLossPercentage: {
    type: Number,
    default: 0
  },
  investmentType: {
    type: String,
    enum: ['stock', 'bond', 'crypto', 'etf', 'mutual_fund', 'other'],
    default: 'stock'
  },
  // Fixed return investment fields
  dailyReturn: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  approved: {
    type: Boolean,
    default: false
  },
  profit: {
    type: Number,
    default: 0,
    min: 0
  },
  startDate: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Calculate gain/loss before saving
investmentSchema.pre('save', function(next) {
  this.totalValue = this.quantity * this.currentPrice;
  const purchaseValue = this.quantity * this.purchasePrice;
  this.gainLoss = this.totalValue - purchaseValue;
  this.gainLossPercentage = purchaseValue > 0 ? (this.gainLoss / purchaseValue) * 100 : 0;
  next();
});

module.exports = mongoose.model('Investment', investmentSchema);