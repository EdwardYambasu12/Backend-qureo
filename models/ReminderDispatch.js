const mongoose = require('mongoose');

const reminderDispatchSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    medication: { type: mongoose.Schema.Types.ObjectId, ref: 'Medication', required: true },
    reminderDate: { type: String, required: true }, // YYYY-MM-DD (local server date)
    reminderTime: { type: String, required: true }, // HH:mm
    channel: { type: String, enum: ['push', 'email'], required: true },
    success: { type: Boolean, default: false },
    reason: { type: String, default: '' },
  },
  { timestamps: true }
);

reminderDispatchSchema.index(
  { user: 1, medication: 1, reminderDate: 1, reminderTime: 1, channel: 1 },
  { unique: true }
);

module.exports = mongoose.model('ReminderDispatch', reminderDispatchSchema);
