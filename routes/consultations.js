const express = require("express");
const router = express.Router();
const axios = require("axios");
const Appointment = require("../models/Consultations");
require("dotenv").config();

const DAILY_API_KEY = process.env.DAILY_API_KEY;

// Create Daily room for an existing appointment
router.post("/create-room/:appointmentId", async (req, res) => {
  const { appointmentId } = req.params;

  try {
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });

    // Generate roomId if not already
    if (!appointment.roomId) {
      appointment.roomId = `room-${appointment._id.toString()}`;
    }

    // Create Daily room if not created
    if (!appointment.roomUrl) {
      const response = await axios.post(
        "https://api.daily.co/v1/rooms",
        {
          name: appointment.roomId,
          properties: { enable_chat: true, exp: Math.round(Date.now()/1000) + 3600 }
        },
        { headers: { Authorization: `Bearer ${DAILY_API_KEY}` } }
      );

      appointment.roomUrl = response.data.url;
      await appointment.save();
    }

    res.json({ roomId: appointment.roomId, roomUrl: appointment.roomUrl });
  } catch (err) {
    console.error("Error creating room:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to create consultation room" });
  }
});

// Join appointment room
router.get("/join/:roomId/:userId", async (req, res) => {
  const { roomId, userId } = req.params;

  try {
    const appointment = await Appointment.findOne({ roomId });
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });

    if (![appointment.doctorId.toString(), appointment.patientId.toString()].includes(userId)) {
      return res.status(403).json({ error: "Not authorized to join this room" });
    }

    res.json({ roomUrl: appointment.roomUrl });
  } catch (err) {
    res.status(500).json({ error: "Error fetching appointment room" });
  }
});

module.exports = router;
