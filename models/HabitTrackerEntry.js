const mongoose = require('mongoose');

const habitTrackerEntrySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    dateKey: {
      type: String,
      required: true,
      index: true,
    },
    habits: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timeline: {
      type: [
        {
          habitKey: { type: String, required: true },
          label: { type: String, default: '' },
          action: { type: String, default: 'log' },
          value: { type: Number, default: 1 },
          status: { type: String, default: 'done' },
          timestamp: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    mood: {
      label: { type: String, default: '' },
      emoji: { type: String, default: '' },
    },
    weight: {
      type: Number,
      default: null,
    },
    healthScore: {
      type: Number,
      default: 0,
    },
    achievedGoal: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

habitTrackerEntrySchema.index({ user: 1, dateKey: 1 }, { unique: true });
habitTrackerEntrySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('HabitTrackerEntry', habitTrackerEntrySchema);
