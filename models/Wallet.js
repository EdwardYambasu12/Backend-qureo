const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.Mixed, ref: 'User', required: true, unique: true },
  balance: { type: Number, default: 0.00 },
  currency: { type: String, default: 'USD' },
  status: { type: String, default: 'active' },
  totalDeposits: { type: Number, default: 0 },
  totalWithdrawals: { type: Number, default: 0 },
  lastTransaction: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Wallet', walletSchema);