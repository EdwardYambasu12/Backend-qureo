const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    userName: { type: String, default: "Anonymous" },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

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
  enum: [
    "Medical Basics",
    "Women's Health",
    "Men's Health",
    "Mental Health",
    "Nutrition",
    "Lab Tests",
    "Telemedicine",
    "AI & Health",
    "Education", 
  ],
  default: "Education",
},
    author: {
      type: String,
      required: true,
    },
    tags: [String],
    likes: [{ type: String }],
    shares: { type: Number, default: 0 },
    saves: [{ type: String }],
    comments: [commentSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Blog", blogSchema);
