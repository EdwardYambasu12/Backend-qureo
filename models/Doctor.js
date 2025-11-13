const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema({
  user: { type: String, required: true }, // username or user ID
  comment: { type: String, required: true },
  date: { type: Date, default: Date.now }
});

const DoctorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  password: { type: String, required: true },
  specialty: { type: String },
  experience: { type: String },
  certified: { type: Boolean, default: false },
  skills: [{ type: String }],
  moreOptions: { type: Map, of: String }, // flexible key-value pairs
  comments: [CommentSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Doctor", DoctorSchema);
