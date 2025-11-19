const express = require("express");
const NotificationToken  = require("../models/NotificationToken.js");

const router = express.Router();

// 🔹 Save or update user's FCM token
router.post("/save-token", async (req, res) => {
  try {
    const { userId, token } = req.body;
    if (!userId || !token) {
      return res.status(400).json({ message: "userId and token are required" });
    }

    console.log("Saving token for userId:", userId);

    const existing = await NotificationToken.findOne({ userId });

    if (existing) {
      existing.token = token;
      existing.updatedAt = Date.now();
      await existing.save();
      return res.json({ message: "Token updated", token });
    }

    const newToken = new NotificationToken({ userId, token });
    await newToken.save();

    res.json({ message: "Token saved successfully", token });
  } catch (err) {
    console.error("Error saving token:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// 🔹 Get token by userId
router.get("/:userId", async (req, res) => {
  try {
    const tokenData = await NotificationToken.findOne({ userId: req.params.userId });
    if (!tokenData) return res.status(404).json({ message: "No token found" });
    res.json(tokenData);
  } catch (err) {
    console.error("Error fetching token:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
