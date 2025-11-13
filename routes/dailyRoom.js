const express = require("express");
const router = express.Router();
const axios = require("axios");
require("dotenv").config();

const DAILY_API_KEY = process.env.DAILY_API_KEY;

// Create or return existing room
router.post("/create-or-get", async (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: "roomId is required" });

  try {
    // 1️⃣ Try to get room (optional: Daily will return 404 if not exist)
    let roomUrl = `https://qureo.daily.co/${roomId}`;

    // 2️⃣ Try to create room
    const response = await axios.post(
      "https://api.daily.co/v1/rooms",
      { name: roomId, properties: { enable_chat: true } },
      { headers: { Authorization: `Bearer ${DAILY_API_KEY}` } }
    );

    roomUrl = response.data.url;
    res.json({ roomUrl });
  } catch (err) {
    // Room might already exist, return the URL
    if (err.response?.status === 409) {
      return res.json({ roomUrl: `https://qureo.daily.co/${roomId}` });
    }
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Failed to create/get room" });
  }
});

module.exports = router;
