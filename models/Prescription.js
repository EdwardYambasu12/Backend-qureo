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
    title : {type : String, required : true},
    analysis: {
      doctor: String,
      clinic: String,
      date: String,
      medicines: [MedicineSchema],
      warnings: [String],
    },
    requiresPharmacistReview: {
      type: Boolean,
      default: true,
    },
    owner : String,
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Prescription", PrescriptionSchema);
