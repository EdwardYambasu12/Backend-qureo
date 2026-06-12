const mongoose = require('mongoose');

const dependentSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  fullName: { type: String, required: true, trim: true },
  relationship: {
    type: String,
    enum: ['child', 'parent', 'spouse', 'spouse_partner', 'sibling', 'relative', 'domestic_worker_caregiver', 'elderly_family_member', 'other_family_member', 'other'],
    default: 'other',
  },
  dateOfBirth: { type: Date, default: null },
  linkedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  linkedAccountEmail: { type: String, default: '', trim: true, lowercase: true },
  linkedAccountStatus: {
    type: String,
    enum: ['unlinked', 'pending', 'linked'],
    default: 'unlinked',
  },
  careAccessMode: {
    type: String,
    enum: ['sponsor_managed', 'linked_wallet'],
    default: 'sponsor_managed',
  },
  active: { type: Boolean, default: true },
}, { timestamps: true });

dependentSchema.index({ owner: 1, active: 1, createdAt: -1 });

module.exports = mongoose.model('Dependent', dependentSchema);
