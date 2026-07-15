const mongoose = require('mongoose');

const healthPlanSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Date the plan is for (to support daily plans)
    planDate: {
      type: Date,
      required: true,
      index: true,
    },

    // Tasks with their completion status
    tasks: {
      bp: {
        label: { type: String, default: 'Log Blood Pressure' },
        completed: { type: Boolean, default: false },
        completedAt: Date,
      },
      hydration: {
        label: { type: String, default: 'Hydration Check' },
        completed: { type: Boolean, default: false },
        completedAt: Date,
      },
      medication: {
        label: { type: String, default: 'Take Medication' },
        completed: { type: Boolean, default: false },
        completedAt: Date,
      },
      symptoms: {
        label: { type: String, default: 'Log Symptoms' },
        completed: { type: Boolean, default: false },
        completedAt: Date,
      },
      followUpQuestions: {
        label: { type: String, default: 'Complete Follow-up Questions' },
        completed: { type: Boolean, default: false },
        completedAt: Date,
      },
    },

    followUpResponses: [
      {
        question: { type: String, required: true },
        answer: { type: String, required: true },
        answeredAt: { type: Date, default: Date.now },
      },
    ],

    notificationState: {
      lastNotifiedTaskKey: { type: String, default: '' },
      lastNotifiedAt: { type: Date },
    },

    // Progress tracking
    completionCount: {
      type: Number,
      default: 0,
    },
    completionPercentage: {
      type: Number,
      default: 0,
    },

    // Additional notes
    notes: String,

    // Status
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'partially_completed'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

// Index for efficient queries
healthPlanSchema.index({ user: 1, planDate: -1 });
healthPlanSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('HealthPlan', healthPlanSchema);
