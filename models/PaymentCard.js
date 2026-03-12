const mongoose = require('mongoose');

const paymentCardSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    cardholderName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    brand: {
      type: String,
      enum: ['visa', 'mastercard', 'amex', 'discover', 'unknown'],
      default: 'unknown',
    },
    last4: {
      type: String,
      required: true,
      minlength: 4,
      maxlength: 4,
    },
    expMonth: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    expYear: {
      type: Number,
      required: true,
      min: 2000,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    stripePaymentMethodId: {
      type: String,
      default: '',
      index: true,
    },
  },
  { timestamps: true }
);

paymentCardSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('PaymentCard', paymentCardSchema);
