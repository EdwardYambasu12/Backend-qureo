const mongoose = require('mongoose');

const vitalsSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    // Vital measurements
    bloodPressure: {
      systolic: { type: Number },
      diastolic: { type: Number },
      raw: { type: String }, // Store as "120/80" for display
    },
    heartRate: { type: Number }, // bpm
    temperature: { type: Number }, // Fahrenheit
    oxygenLevel: { type: Number }, // percentage
    bloodSugar: {
      value: { type: Number },
      unit: { type: String, enum: ['mg/dL', 'mmol/L'], default: 'mg/dL' },
      readingType: {
        type: String,
        enum: ['fasting', 'random', 'postprandial', 'bedtime', 'other'],
        default: 'other',
      },
      measuredAt: { type: Date, default: Date.now },
    },
    
    // Additional health data
    weight: { type: Number }, // kg
    symptoms: [
      {
        name: { type: String },
        status: { type: String, enum: ['better', 'improving', 'same', 'worse'] },
        severity: { type: Number, min: 1, max: 10 },
        category: { type: String },
        dateLogged: { type: Date, default: Date.now },
      },
    ],
    adherenceEvents: [
      {
        medicationName: { type: String },
        scheduledTime: { type: String },
        status: {
          type: String,
          enum: ['taken', 'missed', 'skipped', 'snoozed'],
          default: 'taken',
        },
        notes: { type: String },
        recordedAt: { type: Date, default: Date.now },
      },
    ],
    
    hydration: { type: Number }, // ml per day
    notes: { type: String },
    
    // Metadata
    source: { type: String, enum: ['manual', 'device', 'wearable'], default: 'manual' },
    deviceName: { type: String }, // If from device
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Doctors/care team
    
  },
  { timestamps: true }
);

// Index for efficient queries
vitalsSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Vitals', vitalsSchema);
