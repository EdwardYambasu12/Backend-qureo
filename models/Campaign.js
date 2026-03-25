const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["screening", "vaccination", "awareness", "donation", "prevention"],
      default: "awareness",
    },
    organization: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    date: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    participants: { type: Number, default: 0, min: 0 },
    target: { type: Number, default: 0, min: 0 },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    urgency: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["active", "upcoming", "completed"],
      default: "upcoming",
    },
    bannerColor: {
      type: String,
      default: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
    },
    icon: { type: String, default: "📢" },
    benefits: { type: [String], default: [] },
    highlights: { type: [String], default: [] },
    image: { type: String, default: "" },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Campaign", campaignSchema);
