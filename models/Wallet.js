const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.Mixed, ref: 'User', required: true, unique: true },
  balance: { type: Number, default: 0.00 },
  reservedFunds: {
    walletBalance: { type: Number, default: 0 },
    familySupport: { type: Number, default: 0 },
    employerSupport: { type: Number, default: 0 },
    donorVoucher: { type: Number, default: 0 },
    mobileMoney: { type: Number, default: 0 },
    card: { type: Number, default: 0 },
    bankTransfer: { type: Number, default: 0 },
  },
  currency: { type: String, default: 'USD' },
  status: { type: String, default: 'active' },
  lowBalanceThreshold: { type: Number, default: 25 },
  totalDeposits: { type: Number, default: 0 },
  totalWithdrawals: { type: Number, default: 0 },
  fundingProfiles: {
    employerSupport: [{
      name: { type: String, required: true },
      staffId: { type: String, default: '' },
      reference: { type: String, default: '' },
      active: { type: Boolean, default: true },
      createdAt: { type: Date, default: Date.now },
    }],
  },
  dependentSupportAllocations: [{
    dependentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dependent', required: true },
    sponsorName: { type: String, default: '' },
    sponsorPhone: { type: String, default: '' },
    reference: { type: String, default: '' },
    availableAmount: { type: Number, default: 0 },
    allowedServiceCategories: [{ type: String }],
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  }],
  donorVouchers: [{
    code: { type: String, required: true },
    sponsorName: { type: String, default: '' },
    amountRemaining: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'exhausted', 'expired'], default: 'active' },
    expiresAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  }],
  lastTransaction: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Wallet', walletSchema);