const express = require("express");
const Prescription = require("../models/Prescription");
const { notifyUser } = require('../utils/notifyUser');

const router = express.Router();

router.post("/save", async (req, res) => {
  try {
    const { analysis, requiresPharmacistReview, title, owner, imageUrl } = req.body;

    if (!analysis) {
      return res.status(400).json({ error: "Missing analysis data" });
    }

    const prescription = await Prescription.create({
      analysis,
      requiresPharmacistReview,
      title,
      owner,
      imageUrl,
      source: "uploaded",
    });

    try {
      if (owner) {
        await notifyUser({
          userId: owner,
          type: 'health_record_added',
          title: 'New medical record added',
          body: 'A new record is available in your health records.',
          balancedTitle: 'Health record added',
          balancedBody: 'A new medical record was added to your account.',
          genericTitle: 'You have a new update in Qureo',
          genericBody: 'Open Qureo to view your latest health record.',
          route: '/my-health-records',
          data: {
            prescriptionId: String(prescription._id),
            requiresPharmacistReview: String(Boolean(requiresPharmacistReview)),
          },
        });
      }
    } catch (notifyError) {
      console.warn('[prescription] push failed after record save:', notifyError?.message || notifyError);
    }


    console.log("Saved successfully")
    res.status(201).json({
      status: "saved",
      prescriptionId: prescription._id,
    });
  } catch (err) {
    console.error("Save failed:", err);
    res.status(500).json({ error: "Failed to save prescription" });
  }
});

router.get("/", async(req, res)=>{

    const all_data = await Prescription.find()
    res.json(all_data)

})

router.get("/patient/:patientId", async (req, res) => {
  try {
    const { patientId } = req.params;
    const records = await Prescription.find({
      $or: [
        { patientId },
        { owner: patientId },
      ],
    }).sort({ issuedDate: -1, createdAt: -1 });

    return res.json({
      success: true,
      prescriptions: records,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Failed to fetch patient prescriptions" });
  }
});

router.post("/")

module.exports = router;
