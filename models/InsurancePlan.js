const mongoose = require('mongoose');

const insurancePlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  description: String,
  monthlyPremium: { type: Number, required: true },
  coverageLimit: { type: Number, required: true },
  coverageDetails: [{
    serviceType: String,
    limit: Number,
    coveragePercentage: Number,
    description: String
  }],
  benefits: [String],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InsurancePlan', insurancePlanSchema);