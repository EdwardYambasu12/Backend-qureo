const mongoose = require("mongoose");

const consultationSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  patient_ : {type : Object, required : true},
  doctor_ : {type : Object, required : true},
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true },
  mode: { type: String, enum: ["video", "in-person", "audio", "phone"], required: true },
  appointmentTime: { type: Date, required: true },
  durationMinutes: { type: Number, min: 1, default: 30 },
  reason: { type: String, required: true },
  roomId: { type: String, required: true, unique: true },
  status: { type: String, enum: ["scheduled", "completed", "ongoing", "cancelled"], default: "scheduled" },
  notifiedBefore: { type: Boolean, default: false },
  notifiedStart: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
   timezone: { type: String, default: "Africa/Liberia" },
   patientEmail : {type : String, require : true},
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Consultation", consultationSchema);
