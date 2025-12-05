const mongoose = require('mongoose');

const healthcareProviderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['pharmacy', 'lab', 'clinic', 'hospital', 'transport', 'telemedicine'],
    required: true 
  },
  address: String,
  contactPhone: String,
  contactEmail: String,
  rating: Number,
  isVerified: { type: Boolean, default: false },
  services: [String],
  icon: String,
  color: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('HealthcareProvider', healthcareProviderSchema);