const mongoose = require('mongoose');

const securitySettingsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    bioLock: {
      type: Boolean,
      default: true,
    },
    reminderLogin: {
      type: Boolean,
      default: false,
    },
    dataSharing: {
      type: Boolean,
      default: true,
    },
    passcodeHash: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SecuritySettings', securitySettingsSchema);
