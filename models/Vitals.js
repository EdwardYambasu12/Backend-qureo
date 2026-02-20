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
    
    // Additional health data
    weight: { type: Number }, // kg
    symptoms: [
      {
        name: { type: String },
        status: { type: String, enum: ['better', 'improving', 'same', 'worse'] },
        dateLogged: { type: Date, default: Date.now },
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
