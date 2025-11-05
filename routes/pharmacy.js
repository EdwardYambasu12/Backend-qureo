const express = require("express");
const router = express.Router();
const Pharmacy = require("../models/Pharmacy");
const auth = require("../middleware/auth");

// CREATE pharmacy with logo URL
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, address, city, description, logo } = req.body;
    const pharmacy = new Pharmacy({ name, email, phone, address, city, description, logo });
    await pharmacy.save();
    res.status(201).json({ message: "Pharmacy created", pharmacy });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create pharmacy", error: err.message });
  }
});

// UPDATE pharmacy (including logo)
router.patch("/:id", async (req, res) => {
  try {
    const updated = await Pharmacy.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: "Pharmacy not found" });
    res.json({ message: "Pharmacy updated", pharmacy: updated });
  } catch (err) {
    res.status(500).json({ message: "Failed to update pharmacy", error: err.message });
  }
});

// GET all pharmacies
router.get("/", async (req, res) => {
  try {
    const pharmacies = await Pharmacy.find();
    res.json(pharmacies);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch pharmacies", error: err.message });
  }
});

// GET single pharmacy
router.get("/:id", async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findById(req.params.id);
    if (!pharmacy) return res.status(404).json({ message: "Pharmacy not found" });
    res.json(pharmacy);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch pharmacy", error: err.message });
  }
});

// DELETE pharmacy
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Pharmacy.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Pharmacy not found" });
    res.json({ message: "Pharmacy deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete pharmacy", error: err.message });
  }
});

module.exports = router;
