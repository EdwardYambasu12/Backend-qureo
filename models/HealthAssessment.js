const mongoose = require('mongoose');

const assessmentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // copy of some form fields for quick access/search
  fullName: { type: String },
  goal: { type: String },
  age: { type: Number },
  dob: { type: Date },
  gender: { type: String },
  bloodType: { type: String },

  // body metrics
  weightKg: { type: Number },
  heightCm: { type: Number },
  fitnessLevel: { type: Number },

  // lifestyle
  sleepLevel: { type: String },
  smokeLevel: { type: String },
  mood: { type: String },
  eatingHours: { type: String },

  // medical background
  medications: { type: [String], default: [] },
  allergy: { type: String },
  condition: { type: String },
  checkupFrequency: { type: String },

  // free text notes, score and raw payload
  notes: { type: String },
  score: { type: Number },
  raw: { type: Object, default: {} },
  metadata: { type: Object, default: {} },
}, { timestamps: true });

// Indexes
// Compound index to efficiently query a user's assessments in reverse chronological order
assessmentSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('HealthAssessment', assessmentSchema);
