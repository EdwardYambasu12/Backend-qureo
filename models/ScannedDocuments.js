const  mongoose = require("mongoose");

const ScannedDocumentSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    fileUrl: {
      type: String,
      required: true, // The file's URL or path after upload
    },
    fileType: {
      type: String, // e.g., 'pdf', 'jpg', 'png'
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ScannedDocument", ScannedDocumentSchema);
