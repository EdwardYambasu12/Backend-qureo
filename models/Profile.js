const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  fullName: { type: String },
  dob: { type: Date },
  gender: { type: String },
  phone: { type: String },
  address: { type: String },
  heightCm: { type: Number },
  weightKg: { type: Number },
  bloodType: { type: String },
  allergies: { type: [String], default: [] },
  medications: { type: [String], default: [] },
  emergencyContact: {
    name: { type: String },
    phone: { type: String },
    relation: { type: String },
  },
}, { timestamps: true });

module.exports = mongoose.model('Profile', profileSchema);
