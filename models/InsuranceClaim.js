const mongoose = require('mongoose');

const insuranceClaimSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceSubscription', required: true },
  provider: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthcareProvider' },
  type: { 
    type: String, 
    enum: ['outpatient', 'lab_test', 'teleconsult', 'medication', 'emergency_transport', 'other'],
    required: true 
  },
  amount: { type: Number, required: true },
  approvedAmount: Number,
  description: String,
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'processing', 'paid'],
    default: 'pending' 
  },
  serviceDate: Date,
  supportingDocuments: [String],
  notes: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InsuranceClaim', insuranceClaimSchema);