const mongoose = require('mongoose');

const linkedDeviceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deviceName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    deviceType: {
      type: String,
      enum: ['smartwatch', 'fitness-band', 'phone', 'glucose-monitor', 'blood-pressure-monitor', 'other'],
      default: 'other',
    },
    identifier: {
      type: String,
      trim: true,
      default: '',
      maxlength: 120,
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

linkedDeviceSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('LinkedDevice', linkedDeviceSchema);
