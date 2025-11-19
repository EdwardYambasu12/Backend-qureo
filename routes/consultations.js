const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Consultation = require("../models/Consultations");
const Doctor = require("../models/Doctor");
const Profile = require("../models/Profile");
const auth = require("../middleware/auth");
const moment = require("moment-timezone");
const sendEmail = require("../utils/email");
const sendSMS = require("../utils/sms");

  const router = express.Router();
  // start background checker once
  if (!global.__consultationCheckerStarted) {
    global.__consultationCheckerStarted = true;

    const CHECK_INTERVAL_MS = 10 * 1000; // 10 seconds

    async function checkConsultations() {

      console.log("[consultation-check] Running consultation status check...");
      try {
        const now = new Date();
        // fetch scheduled consultations that are near (within next 16 minutes) or already due
        const windowAhead = new Date(now.getTime() + 16 * 60 * 1000);
        const candidates = await Consultation.find({ status: 'scheduled', appointmentTime: { $lte: windowAhead } });

        for (const c of candidates) {
          const diffMs = c.appointmentTime.getTime() - now.getTime();
          const diffMinutes = Math.floor(diffMs / 60000);

          // 15 minutes before
          if (diffMs <= 15 * 60 * 1000 && diffMs > 0 && !c.notifiedBefore) {
            console.log(`[consultation-check] Consultation ${c._id} for patient ${c.patient} scheduled in ${diffMinutes} minutes — sending pre-start notification`);
            // mark as notifiedBefore to avoid duplicate notifications
            await Consultation.findByIdAndUpdate(c._id, { notifiedBefore: true, updatedAt: new Date() });
          }

          // time to start (or already started)
          if (diffMs <= 0 && c.status === 'scheduled') {
            console.log(`[consultation-check] Consultation ${c._id} is starting now. Updating status -> ongoing`);
            await Consultation.findByIdAndUpdate(c._id, { status: 'ongoing', notifiedStart: true, updatedAt: new Date() });
            // optionally emit socket event if io provided
            try { if (io && io.emit) io.emit('consultation_started', { consultationId: c._id }); } catch (e) { /* ignore */ }
          }
        }

        // COMPLETE: mark consultations as completed when now is 2 hours after appointmentTime
        try {
          const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
          // find consultations that are still scheduled or ongoing but are at least 2 hours past their appointmentTime
          const toComplete = await Consultation.find({ status: { $in: ['scheduled', 'ongoing'] }, appointmentTime: { $lte: twoHoursAgo } });
          for (const tc of toComplete) {
            console.log(`[consultation-check] Consultation ${tc._id} appointment was at ${tc.appointmentTime}. Marking as completed.`);
            await Consultation.findByIdAndUpdate(tc._id, { status: 'completed', updatedAt: new Date() });
            try { if (io && io.emit) io.emit('consultation_completed', { consultationId: tc._id }); } catch (e) { /* ignore */ }
          }
        } catch (errComplete) {
          console.error('[consultation-check] Error while marking consultations completed:', errComplete);
        }
      } catch (err) {
        console.error('[consultation-check] Error during checkConsultations:', err);
      }
    }

    // run immediately then every interval
   checkConsultations();
    setInterval(checkConsultations, CHECK_INTERVAL_MS);
  }

  // ------------------ Routes ------------------
  router.get("/", async (req, res) => {
    const result = await Consultation.find();
    res.json(result);
  });

  // Create a new consultation
  router.post("/", async (req, res) => {
    try {
      const { patient, doctor, mode, appointmentTime, reason, patient_, patientEmail, doctor_ } = req.body;
      console.log(patient, doctor, mode, appointmentTime, reason, patient_, patientEmail, doctor_ )
      const roomId = `room-${uuidv4()}`;

      const consultation = await Consultation.create({
        patient,
        doctor,
        mode,
        appointmentTime,
        reason,
        roomId,
        patientEmail,
        patient_,
        doctor_

      });

      res.status(201).json(consultation);
    } catch (err) {
      console.log(err.message);
      res.status(500).json({ message: "Failed to create consultation", error: err.message });
    }
  });

  router.get("/delete", async(req, res)=>{

  await Consultation.deleteMany();
  res.json("deleted every thing")
})
// Create a new consultation
router.post("/", async (req, res) => {
  try {
    const { patient, doctor, mode, appointmentTime, reason, patient_, patientEmail, doctor_ } = req.body;
    console.log(patient, doctor, mode, appointmentTime, reason, patient_, patientEmail, doctor_ )
    const roomId = `room-${uuidv4()}`;

    const consultation = await Consultation.create({
      patient,
      doctor,
      mode,
      appointmentTime,
      reason,
      roomId,
      patientEmail,
      patient_,
      doctor_

    });

    res.status(201).json(consultation);
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ message: "Failed to create consultation", error: err.message });
  }
});

// Get consultations for a doctor
router.get("/doctor/:doctorId", auth, async (req, res) => {
  try {
    const consultations = await Consultation.find({ doctor: req.params.doctorId }).sort({ appointmentTime: 1 });
    res.json(consultations);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch consultations", error: err.message });
  }
});

// Get consultations for a patient
router.get("/patient/:patientId", auth, async (req, res) => {
  try {
    const consultations = await Consultation.find({ patient: req.params.patientId }).sort({ appointmentTime: 1 });
    res.json(consultations);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch consultations", error: err.message });
  }
});

// Cancel consultation
router.put("/:id/cancel", auth, async (req, res) => {
  try {
    const consultation = await Consultation.findByIdAndUpdate(
      req.params.id,
      { status: "cancelled", updatedAt: new Date() },
      { new: true }
    );
    res.json(consultation);
  } catch (err) {
    res.status(500).json({ message: "Failed to cancel consultation", error: err.message });
  }
});

// Reschedule consultation
router.put("/:id/reschedule", auth, async (req, res) => {
  try {
    const { appointmentTime } = req.body;
    const consultation = await Consultation.findByIdAndUpdate(
      req.params.id,
      { appointmentTime, status: "scheduled", updatedAt: new Date(), notifiedBefore: false, notifiedStart: false },
      { new: true }
    );
    res.json(consultation);
  } catch (err) {
    res.status(500).json({ message: "Failed to reschedule consultation", error: err.message });
  }
});

// Delete consultation
router.delete("/:id", auth, async (req, res) => {
  try {
    await Consultation.findByIdAndDelete(req.params.id);
    res.json({ message: "Consultation deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete consultation", error: err.message });
  }
});

  // Add other routes as needed...

 


module.exports = router;

