const mongoose = require("mongoose");

const consultationSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  patient_ : {type : Object, required : true},
  doctor_ : {type : Object, required : true},
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true },
  mode: { type: String, enum: ["video", "in-person", "audio", "phone"], required: true },
  consultationType: { type: String, enum: ["online", "in-person"], default: "online" },
  appointmentTime: { type: Date, required: true },
  durationMinutes: { type: Number, min: 1, default: 30 },
  reason: { type: String, required: true },
  roomId: { type: String, required: true, unique: true },
  status: {
    type: String,
    enum: ["scheduled", "ongoing", "pending", "confirmed", "cancelled", "completed", "no_show"],
    default: "scheduled",
  },
  notifiedBefore: { type: Boolean, default: false },
  notifiedStart: { type: Boolean, default: false },
  patientName: { type: String, default: "" },
  patientAge: { type: Number, min: 0, max: 130, default: null },
  patientPhone: { type: String, default: "" },
  reasonForVisit: { type: String, default: "" },
  familyMemberName: { type: String, default: "" },
  familyMemberRelation: { type: String, default: "" },
  reports: [
    {
      name: { type: String, default: "" },
      size: { type: Number, default: 0 },
      mimeType: { type: String, default: "" },
      url: { type: String, default: "" },
      uploadedAt: { type: Date, default: Date.now },
    },
  ],
  clinicDetails: {
    clinicName: { type: String, default: "" },
    address: { type: String, default: "" },
  },
  confirmedByDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", default: null },
  confirmedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
   timezone: { type: String, default: "Africa/Liberia" },
   patientEmail : {type : String, require : true},
  updatedAt: { type: Date, default: Date.now },
});

consultationSchema.index({ doctor: 1, appointmentTime: 1, status: 1 });

module.exports = mongoose.model("Consultation", consultationSchema);
