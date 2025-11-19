const mongoose = require("mongoose");

const notificationTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true, // each user has one latest token
  },
  token: {
    type: String,
    required: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports =  mongoose.model("NotificationToken", notificationTokenSchema);
