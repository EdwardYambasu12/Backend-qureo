const mongoose = require('mongoose');

const donorVoucherSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  sponsorName: { type: String, default: '' },
  assignedUser: { type: mongoose.Schema.Types.Mixed, ref: 'User', required: true },
  issuedByUserId: { type: mongoose.Schema.Types.Mixed, ref: 'User', default: null },
  totalAmount: { type: Number, required: true, min: 0 },
  amountRemaining: { type: Number, required: true, min: 0 },
  linkedToWallet: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'exhausted', 'expired', 'revoked'], default: 'active' },
  expiresAt: { type: Date, default: null },
  metadata: { type: Object, default: {} },
}, { timestamps: true });

donorVoucherSchema.index({ assignedUser: 1, status: 1 });
donorVoucherSchema.index({ assignedUser: 1, linkedToWallet: 1 });

module.exports = mongoose.model('DonorVoucher', donorVoucherSchema);
