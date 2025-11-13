// models/Appointment.js
const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: Date, required: true },
  status: { type: String, enum: ["pending","active","completed","cancelled"], default: "pending" },
  roomId: { type: String, unique: true },    // generated when booking
  roomUrl: { type: String },                 // set when Daily room is created
});

module.exports = mongoose.model("Appointment", appointmentSchema);
