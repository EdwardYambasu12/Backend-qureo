const mongoose = require("mongoose");

const consultationSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true },
  mode: { type: String, enum: ["video", "in-person", "phone"], required: true },
  appointmentTime: { type: Date, required: true },
  reason: { type: String, required: true },
  roomId: { type: String, required: true, unique: true },
  status: { type: String, enum: ["scheduled", "completed", "cancelled"], default: "scheduled" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Consultation", consultationSchema);
