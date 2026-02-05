const express = require("express");
const { uploadPrescription }  = require("../middleware/prescription.js");

const  analyzePrescriptionImage = require( "../services/analyzePrescription.js");
const uuid = require("uuid");
const uuidv4 = uuid.v4;


const router = express.Router();

router.post(
  "/upload",
  uploadPrescription.single("prescription"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image uploaded" });
      }

      const analysis = await analyzePrescriptionImage(
        req.file.buffer,
        req.file.mimetype
      );

      return res.status(200).json({
        status: "processed",
        analysis,
        requiresPharmacistReview: true,
      });
    } catch (err) {
      console.error("AI analysis failed:", err);
      return res.status(500).json({
        error: "Failed to analyze prescription",
      });
    }
  }
);

module.exports = router;