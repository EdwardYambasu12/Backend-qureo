const mongoose = require('mongoose');

const habitReminderDispatchSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    habitKey: { type: String, required: true },
    reminderKey: { type: String, required: true },
    reminderDate: { type: String, required: true }, // YYYY-MM-DD (server date)
    reminderTime: { type: String, required: true }, // HH:mm
    channel: { type: String, enum: ['push'], required: true },
    success: { type: Boolean, default: false },
    reason: { type: String, default: '' },
  },
  { timestamps: true }
);

habitReminderDispatchSchema.index(
  { user: 1, habitKey: 1, reminderKey: 1, reminderDate: 1, reminderTime: 1, channel: 1 },
  { unique: true }
);

module.exports = mongoose.model('HabitReminderDispatch', habitReminderDispatchSchema);