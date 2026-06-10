const mongoose = require('mongoose');

const dependentSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  fullName: { type: String, required: true, trim: true },
  relationship: {
    type: String,
    enum: ['child', 'parent', 'spouse', 'relative', 'other'],
    default: 'other',
  },
  dateOfBirth: { type: Date, default: null },
  active: { type: Boolean, default: true },
}, { timestamps: true });

dependentSchema.index({ owner: 1, active: 1, createdAt: -1 });

module.exports = mongoose.model('Dependent', dependentSchema);
