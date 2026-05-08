const mongoose = require("mongoose");

const doctorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  specialty: { type: String, required: true },
  city: { type: String },
  avatar: { type: String },
  phone: { type: String },
  description: { type: String },
  certified: { type: Boolean, default: false },
  skills: [String],
  comments: [
    {
      user: String,
      comment: String,
      date: { type: Date, default: Date.now },
    },
  ],
  ratings: [
    {
      user: String,
      rating: Number,
      date: { type: Date, default: Date.now },
    },
  ],
  averageRating: { type: Number, default: 0 },

  // New Fields
  languagesSpoken: { type: [String], default: [] }, // e.g., ["English", "French"]
  availability: {
    // optional: days and time slots
    monday: { type: [String], default: [] }, // e.g., ["09:00-12:00", "14:00-17:00"]
    tuesday: { type: [String], default: [] },
    wednesday: { type: [String], default: [] },
    thursday: { type: [String], default: [] },
    friday: { type: [String], default: [] },
    saturday: { type: [String], default: [] },
    sunday: { type: [String], default: [] },
  },
  experience: { type: Number, default: 0 }, // in years
  education: { type: [String], default: [] }, // e.g., ["Harvard Medical School", "Residency at XYZ Hospital"]
  qualifications: { type: [String], default: [] }, // e.g., ["MBBS", "MD", "Cardiology Specialization"]

  // Professional Information
  licenseNumber: { type: String }, // BMDC or License number
  doctorCode: { type: String }, // Unique doctor code (e.g., DT8173)
  clinicName: { type: String }, // Name of clinic/hospital
  
  // Consultation Fees
  consultationFeeRemote: { type: Number, default: 170 }, // Online consultation fee
  consultationFeeInPerson: { type: Number, default: 65 }, // In-person/follow-up fee
  
  // Statistics
  patientsAttended: { type: Number, default: 0 }, // Number of patients attended
  joinDate: { type: Date, default: Date.now }, // When doctor joined the platform

  // Auth fields
  passwordHash: { type: String },
  isVerified: { type: Boolean, default: false },
  isSuspended: { type: Boolean, default: false },

  // GeoJSON location
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }, // [longitude, latitude]
  },

  //online
  isOnline: { type: Boolean, default: false },

  //last seen

  lastSeen: {
  type: Date,
},


});

// Create a 2dsphere index for geospatial queries
doctorSchema.index({ location: '2dsphere' });

module.exports = mongoose.model("Doctor", doctorSchema);
