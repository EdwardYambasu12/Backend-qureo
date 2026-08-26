const mongoose = require('mongoose');

const vitalsSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    bloodPressure: [
      {
        systolic: { type: Number },
        diastolic: { type: Number },
        raw: { type: String },
        measuredAt: { type: Date, default: Date.now },
      },
    ],
    heartRate: [
      {
        value: { type: Number },
        measuredAt: { type: Date, default: Date.now },
      },
    ],
    temperature: [
      {
        value: { type: Number },
        measuredAt: { type: Date, default: Date.now },
      },
    ],
    oxygenLevel: [
      {
        value: { type: Number },
        measuredAt: { type: Date, default: Date.now },
      },
    ],
    bloodSugar: [
      {
        value: { type: Number },
        unit: { type: String, enum: ['mg/dL', 'mmol/L'], default: 'mg/dL' },
        readingType: {
          type: String,
          enum: ['fasting', 'random', 'postprandial', 'bedtime', 'other'],
          default: 'other',
        },
        measuredAt: { type: Date, default: Date.now },
      },
    ],
    weight: [
      {
        value: { type: Number },
        measuredAt: { type: Date, default: Date.now },
      },
    ],
    hydration: [
      {
        value: { type: Number },
        measuredAt: { type: Date, default: Date.now },
      },
    ],

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

    notes: [{ type: String }],
    source: { type: String, enum: ['manual', 'device', 'wearable'], default: 'manual' },
    deviceName: { type: String },
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

vitalsSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Vitals', vitalsSchema);
