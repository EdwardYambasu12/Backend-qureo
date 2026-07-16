const mongoose = require("mongoose");

const notificationEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: { type: String, default: "general" },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    icon: { type: String, default: "🔔" },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
  }
);

notificationEventSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("NotificationEvent", notificationEventSchema);
