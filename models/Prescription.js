const mongoose = require("mongoose");

const MedicineSchema = new mongoose.Schema({
  name: String,
  strength: String,
  frequency: String,
  duration: String,
});

const PrescriptionSchema = new mongoose.Schema(
  {
    imageUrl: String, // optional (S3 / local later)
    title: { type: String },
    analysis: {
      doctor: String,
      clinic: String,
      date: String,
      medicines: [MedicineSchema],
      warnings: [String],
    },
    source: {
      type: String,
      enum: ["uploaded", "doctor_consultation"],
      default: "uploaded",
    },
    consultationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Consultation",
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
    },
    doctorName: String,
    medicineName: String,
    dosage: String,
    frequency: String,
    duration: String,
    instructions: String,
    followUpDate: Date,
    diagnosis: String,
    doctorNotes: String,
    labTests: [String],
    issuedDate: {
      type: Date,
      default: Date.now,
    },
    requiresPharmacistReview: {
      type: Boolean,
      default: true,
    },
    owner: String,
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Prescription", PrescriptionSchema);
