const express = require("express");
const NotificationToken  = require("../models/NotificationToken.js");
const auth = require('../middleware/auth');

const router = express.Router();

// 🔹 Save or update user's FCM token
router.post("/save-token", auth, async (req, res) => {
  try {
    const { token } = req.body || {};
    const userId = req.userId;

    if (!token) {
      return res.status(400).json({ message: "token is required" });
    }

    const existing = await NotificationToken.findOne({ userId });

    if (existing) {
      existing.token = token;
      existing.updatedAt = Date.now();
      await existing.save();
      return res.json({ message: "Token updated", token });
    }

    const newToken = new NotificationToken({ userId, token });
    await newToken.save();

    res.json({ message: "Token saved successfully", token, userId });
  } catch (err) {
    console.error("Error saving token:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// 🔹 Get current user's token status
router.get('/token', auth, async (req, res) => {
  try {
    const tokenData = await NotificationToken.findOne({ userId: req.userId });
    if (!tokenData) return res.status(404).json({ message: "No token found" });
    res.json(tokenData);
  } catch (err) {
    console.error("Error fetching token:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// 🔹 Remove current user's token (disable push)
router.delete('/token', auth, async (req, res) => {
  try {
    await NotificationToken.deleteOne({ userId: req.userId });
    res.json({ message: 'Token removed' });
  } catch (err) {
    console.error('Error deleting token:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
