const mongoose = require('mongoose');

const healthAlertSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    // Alert type
    type: {
      type: String,
      enum: ['medication_reminder', 'vital_abnormal', 'vital_warning', 'progress_update', 'health_insight'],
      required: true,
    },
    
    // Alert details
    title: { type: String, required: true },
    message: { type: String, required: true },
    
    // Severity level
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'info',
    },
    
    // Associated data
    vitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vitals' },
    prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription' },
    
    // Alert metadata
    data: {
      abnormalReading: String,      // e.g., "BP: 180/120 (HIGH)"
      previousReading: String,
      recommendation: String,
      aiAnalysis: String,
      normalRange: Object,
    },
    
    // Status
    read: { type: Boolean, default: false },
    actionTaken: { type: Boolean, default: false },
    
    // Notification sent
    notificationSent: { type: Boolean, default: false },
    notificationType: {
      type: String,
      enum: ['push', 'email', 'in_app', 'none'],
      default: 'in_app',
    },
    
    // Health progress tracking
    healthSnapshot: {
      mood: String,
      energyLevel: String,
      condition: String,           // excellent/good/fair/poor
      progressTrend: String,       // improving/stable/declining
      comparedToPrevious: String,  // "20% better than last week"
    },
  },
  { timestamps: true }
);

// Index for efficient queries
healthAlertSchema.index({ user: 1, createdAt: -1 });
healthAlertSchema.index({ user: 1, read: 1 });

module.exports = mongoose.model('HealthAlert', healthAlertSchema);
