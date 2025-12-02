const express = require("express");
const router = express.Router();
const LabTest = require("../models/LabTest"); // make sure path is correct

// CREATE a new lab test
router.post("/", async (req, res) => {
  try {
    const {
      name,
      category,
      description,
      price,
      image,
      laboratory,
      ratings,
      reviews,
      preparation,
      sampleType,
      estimatedTime
    } = req.body;

    if (!name || !category || !price) {
      return res.status(400).json({ error: "Name, category, and price are required." });
    }

    const labTest = new LabTest({
      name,
      category,
      description,
      price,
      image,
      laboratory,
      ratings: ratings || 0,
      reviews: reviews || [],
      preparation,
      sampleType,
      estimatedTime
    });

    const savedTest = await labTest.save();
    res.status(201).json({ success: true, test: savedTest });
  } catch (err) {
    console.error("LabTest create error:", err);
    res.status(500).json({ error: "Failed to create lab test", details: err.message });
  }
});

// GET all lab tests
router.get("/", async (req, res) => {
  try {
    const tests = await LabTest.find().sort({ createdAt: -1 });
    res.json({ success: true, tests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch lab tests" });
  }
});

// GET a single lab test by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const test = await LabTest.findById(id);
    if (!test) {
      return res.status(404).json({ error: "Lab test not found" });
    }
    res.json({ success: true, test });
  } catch (err) {
    console.error("LabTest fetch error:", err);
    res.status(500).json({ error: "Failed to fetch lab test", details: err.message });
  }
});

// DELETE a lab test by ID
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deletedTest = await LabTest.findByIdAndDelete(id);
    if (!deletedTest) {
      return res.status(404).json({ error: "Lab test not found" });
    }
    res.json({ success: true, message: "Lab test deleted successfully" });
  } catch (err) {
    console.error("LabTest delete error:", err);
    res.status(500).json({ error: "Failed to delete lab test", details: err.message });
  }
});

module.exports = router;
