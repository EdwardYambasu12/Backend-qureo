const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { 
    type: String, 
    enum: ['deposit', 'withdrawal', 'payment', 'refund', 'insurance_payment'],
    required: true 
  },
  amount: { type: Number, required: true },
  previousBalance: { type: Number, required: true },
  newBalance: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending' 
  },
  description: String,
  reference: { type: String, unique: true },
  provider: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthcareProvider' },
  metadata: Object,
  createdAt: { type: Date, default: Date.now },
  completedAt: Date
});

module.exports = mongoose.model('Transaction', transactionSchema);