const mongoose = require('mongoose');

const insuranceSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'InsurancePlan', required: true },
  status: { 
    type: String, 
    enum: ['active', 'cancelled', 'expired', 'pending'],
    default: 'active' 
  },
  startDate: { type: Date, default: Date.now },
  endDate: Date,
  autoRenew: { type: Boolean, default: true },
  paymentMethod: String,
  coverageUsed: Object,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InsuranceSubscription', insuranceSubscriptionSchema);