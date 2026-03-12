const mongoose = require('mongoose');

const healthGoalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    primaryGoal: {
      type: String,
      enum: ['Improve Sleep', 'Lose Weight', 'Build Muscle', 'Reduce Stress', 'Increase Energy'],
      default: 'Improve Sleep',
    },
    weeklyTarget: {
      type: Number,
      default: 5,
      min: 1,
      max: 14,
    },
    reminderTime: {
      type: String,
      default: '08:00',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('HealthGoal', healthGoalSchema);
