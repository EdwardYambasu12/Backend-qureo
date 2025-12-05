const mongoose = require('mongoose');

const benefitSchema = new mongoose.Schema({
  provider: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthcareProvider' },
  title: { type: String, required: true },
  description: String,
  discountValue: { type: String, required: true },
  offer: String,
  validFrom: Date,
  validUntil: Date,
  usageLimit: Number,
  usedCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  icon: String,
  color: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Benefit', benefitSchema);