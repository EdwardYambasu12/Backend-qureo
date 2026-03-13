const mongoose = require('mongoose');

const dailyHealthTipSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tipDate: { type: Date, required: true, index: true },
    primaryGoal: {
      type: String,
      enum: ['Improve Sleep', 'Lose Weight', 'Build Muscle', 'Reduce Stress', 'Increase Energy'],
      default: 'Improve Sleep',
    },
    weeklyTarget: { type: Number, default: 5 },
    reminderTime: { type: String, default: '08:00' },
    content: { type: String, required: true },
    source: { type: String, enum: ['ai', 'fallback'], default: 'fallback' },
  },
  { timestamps: true }
);

dailyHealthTipSchema.index({ user: 1, tipDate: 1 }, { unique: true });
dailyHealthTipSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('DailyHealthTip', dailyHealthTipSchema);
