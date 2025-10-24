const mongoose = require('mongoose');

const assessmentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  symptoms: { type: [String], default: [] },
  score: { type: Number },
  notes: { type: String },
  metadata: { type: Object, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('HealthAssessment', assessmentSchema);
