const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    medicine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    userName: {
      type: String,
      default: 'Anonymous',
    },
    text: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Comment', commentSchema);
