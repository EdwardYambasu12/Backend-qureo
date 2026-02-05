const express = require("express");
const Prescription = require("../models/Prescription");

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
      imageUrl
    });


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

router.post("/")

module.exports = router;
