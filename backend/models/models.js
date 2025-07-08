// backend/models/models.js

const mongoose = require("mongoose");
const PlanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  amount: { type: Number, required: true },
  dailyROI: { type: Number, required: true },
  totalROI: { type: Number, required: true },
  daysRemaining: { type: Number, required: true },
  status: { type: String, enum: ['active', 'inactive', 'expired'], required: true },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  interestRate: { type: Number, required: true },
}, { timestamps: true });

// Prevent redefinition of model
const Plan = mongoose.models.Plan || mongoose.model('Plan', PlanSchema);

module.exports = { Plan };
