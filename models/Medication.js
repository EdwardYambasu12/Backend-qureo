const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Medication details
    name: { type: String, required: true },
    dosage: { type: String, required: true },            // e.g., "500mg", "2 tablets"
    frequency: { type: String, required: true },         // e.g., "3 times daily", "Once daily"

    // Scheduled times
    scheduledTimes: [
      {
        time: String,                                    // e.g., "08:00", "14:00", "20:00"
        taken: { type: Boolean, default: false },
        takenAt: Date,
      }
    ],

    // Medication metadata
    prescribedBy: String,                                // Doctor's name
    startDate: { type: Date, required: true },
    endDate: Date,                                       // If medication has end date
    reason: String,                                      // e.g., "Hypertension", "Cold"
    sideEffects: [String],                              // Possible side effects
    notes: String,                                       // Additional notes

    // Status
    isActive: { type: Boolean, default: true },
    remindMe: { type: Boolean, default: true },         // Enable reminders

    // Refill tracking
    refillsRemaining: Number,
    refillDate: Date,                                    // When last refilled
  },
  { timestamps: true }
);

// Index for efficient queries
medicationSchema.index({ user: 1, isActive: 1 });
medicationSchema.index({ user: 1, startDate: -1 });

module.exports = mongoose.model('Medication', medicationSchema);
