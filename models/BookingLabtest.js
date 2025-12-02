const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  // 🧍 USER INFO
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  assignedAttendant: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // lab staff

  // 🧾 BOOKING DETAILS
  bookingDate: { type: Date, default: Date.now },
  preferredDate: { type: Date },
  collectionMethod: {
    type: String,
    enum: ["home_pickup", "walk_in"],
    default: "walk_in",
  },
  totalAmount: { type: Number, required: true },

  // 💳 PAYMENT INFO
  paymentStatus: {
    type: String,
    enum: ["unpaid", "paid", "refunded"],
    default: "unpaid",
  },

  // 🔄 BOOKING STATUS
  status: {
    type: String,
    enum: [
      "pending",           // booked but no specimen yet
      "sample_collected",  // specimen collected
      "in_progress",       // analysis ongoing
      "completed",         // all results uploaded
      "cancelled"          // booking cancelled
    ],
    default: "pending",
  },

  // 🧪 LAB TESTS (like cart items)
  tests: [
    {
      testId: { type: mongoose.Schema.Types.ObjectId, ref: "LabTest" },
      name: { type: String, required: true },
      category: {
        type: String,
        enum: [
          "Blood Test",
          "Urine Test",
          "Stool Test",
          "Imaging",
          "DNA Test",
          "Other",
        ],
      },
      price: { type: Number, required: true },
      sampleType: { type: String },
      instructions: { type: String },

      // 🧫 SPECIMEN INFO
      specimen: {
        collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        collectedAt: { type: Date },
        specimenType: { type: String },
        condition: {
          type: String,
          enum: ["good", "damaged", "leaked"],
          default: "good",
        },
        notes: { type: String },
      },

      // 📄 RESULT INFO
      result: {
        resultFile: { type: String }, // PDF/Image URL
        resultData: { type: Object }, // structured JSON (optional)
        remarks: { type: String },
        status: {
          type: String,
          enum: ["pending", "ready", "delivered"],
          default: "pending",
        },
        releasedAt: { type: Date },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model("Booking", bookingSchema);
