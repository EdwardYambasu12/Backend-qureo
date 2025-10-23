const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: { type: String, default: '' },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  refreshToken: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
