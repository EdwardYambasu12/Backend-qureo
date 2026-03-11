const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema(
  {
    inviter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    inviteeEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    inviteCode: {
      type: String,
      required: true,
      index: true,
    },
    inviteLink: {
      type: String,
      required: true,
    },
    channel: {
      type: String,
      enum: ['email', 'share', 'copy', 'unknown'],
      default: 'email',
    },
    status: {
      type: String,
      enum: ['pending', 'accepted'],
      default: 'pending',
      index: true,
    },
    emailSent: {
      type: Boolean,
      default: false,
    },
    emailError: {
      type: String,
      default: '',
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

referralSchema.index({ inviter: 1, createdAt: -1 });

module.exports = mongoose.model('Referral', referralSchema);
