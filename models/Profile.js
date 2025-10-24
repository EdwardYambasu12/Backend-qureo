const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  // basic identity
  fullName: { type: String },
  dob: { type: Date },
  gender: { type: String },

  // contact & address
  phone: { type: String },
  address: { type: String },
  city: { type: String },
  province: { type: String },

  // avatar / id images (stored as URL or base64 reference)
  avatar: { type: String },
  idImage: { type: String },

  // security questions
  securityQ1: { type: String },
  securityQ2: { type: String },

  // optional physical metrics
  heightCm: { type: Number },
  weightKg: { type: Number },
  bloodType: { type: String },

  // medical
  allergies: { type: [String], default: [] },
  medications: { type: [String], default: [] },

  // emergency contact
  emergencyContact: {
    name: { type: String },
    phone: { type: String },
    relation: { type: String },
  },
}, { timestamps: true });

// Indexes
// ensure fast lookup by user (unique constraint already enforces this)
profileSchema.index({ user: 1 });

module.exports = mongoose.model('Profile', profileSchema);
