const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    featured : {
      type: Boolean,
      default: false,
    },
    mediaType: {
      type: String,
      enum: ["image", "video", "none"],
      default: "none",
    },
    mediaUrl: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      default: "Education",
    },
    author: {
      type: String,
      required: true,
    },
    tags: [String],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Blog", blogSchema);
