const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Consultation = require("../models/Consultations");
const Doctor = require("../models/Doctor");
const Profile = require("../models/Profile");
const auth = require("../middleware/auth");
const moment = require("moment-timezone");
const sendEmail = require("../utils/email");
const sendSMS = require("../utils/sms");


module.exports = (io) => {
  const router = express.Router();
/*
  // ------------------ Consultation Reminders ------------------
  const sendConsultationReminders = async () => {
    try {
      const consultations = await Consultation.find({ status: "scheduled" });

      for (const consult of consultations) {
        const patient = await Profile.findById(consult.patient);
        const doctor = await Doctor.findById(consult.doctor);

        if (!patient || !doctor) continue;

        const patientTZ = patient.timezone || "Africa/Liberia";
        const doctorTZ = doctor.timezone || "Africa/Liberia";

        const appointmentTimePatient = moment(consult.appointmentTime).tz(patientTZ);
        const appointmentTimeDoctor = moment(consult.appointmentTime).tz(doctorTZ);
        const nowPatient = moment().tz(patientTZ);
        const nowDoctor = moment().tz(doctorTZ);

        const diffPatient = appointmentTimePatient.diff(nowPatient, "minutes");
        const diffDoctor = appointmentTimeDoctor.diff(nowDoctor, "minutes");

        // 15-min reminders
        if (!consult.notifiedBefore && diffPatient <= 15 && diffPatient > 0) {
          const msgPatient = `Your consultation with Dr. ${doctor.name} is in 15 minutes.`;
          const msgDoctor = `You have a consultation with patient ${patient.name} in 15 minutes.`;

          io.to(patient._id.toString()).emit("consultationReminder", { message: msgPatient, consultation: consult });
          io.to(doctor._id.toString()).emit("consultationReminder", { message: msgDoctor, consultation: consult });

          if (patient.email) await sendEmail(patient.email, "Consultation Reminder (15 min)", msgPatient);
          if (doctor.email) await sendEmail(doctor.email, "Consultation Reminder (15 min)", msgDoctor);

          if (patient.phone) await sendSMS(patient.phone, msgPatient);
          if (doctor.phone) await sendSMS(doctor.phone, msgDoctor);

          consult.notifiedBefore = true;
          await consult.save();
        }

        // Start-time reminders & update status
        if (!consult.notifiedStart && (diffPatient <= 0 || diffDoctor <= 0)) {
          const msgPatient = `Your consultation with Dr. ${doctor.name} is starting now.`;
          const msgDoctor = `Your consultation with patient ${patient.name} is starting now.`;

          io.to(patient._id.toString()).emit("consultationReminder", { message: msgPatient, consultation: consult });
          io.to(doctor._id.toString()).emit("consultationReminder", { message: msgDoctor, consultation: consult });

          if (patient.email) await sendEmail(patient.email, "Consultation Starting Now", msgPatient);
          if (doctor.email) await sendEmail(doctor.email, "Consultation Starting Now", msgDoctor);

          if (patient.phone) await sendSMS(patient.phone, msgPatient);
          if (doctor.phone) await sendSMS(doctor.phone, msgDoctor);

          consult.status = "ongoing";
          consult.notifiedStart = true;
          await consult.save();
        }
      }
    } catch (err) {
      console.error("Error in sendConsultationReminders:", err);
    }
  };

  // Run every 30 seconds
  setInterval(sendConsultationReminders, 30 * 1000);
*/
  // ------------------ Routes ------------------
  router.get("/", async (req, res) => {
    const result = await Consultation.find();
    res.json(result);
  });

  router.post("/", async (req, res) => {
    try {
      const { patient, doctor, mode, appointmentTime, reason, patientEmail, doctor_ } = req.body;
      const roomId = `room-${uuidv4()}`;

      const consultation = await Consultation.create({
        patient,
        doctor,
        mode,
        appointmentTime,
        reason,
        roomId,
        patientEmail,
        doctor_,
      });

      res.status(201).json(consultation);
    } catch (err) {
      console.error(err);
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

  return router;
};




