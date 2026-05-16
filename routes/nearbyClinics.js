const express = require("express");
const NearbyClinic = require("../models/NearbyClinic");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || "false").toLowerCase() === "true";
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "50", 10)));

    const filter = includeInactive ? {} : { isActive: true };

    const clinics = await NearbyClinic.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ clinics });
  } catch (error) {
    res.status(500).json({ message: "Error fetching nearby clinics", error: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, area, eta, image, address, phone, isActive } = req.body;

    if (!name || !area || !eta) {
      return res.status(400).json({ message: "name, area and eta are required" });
    }

    const clinic = await NearbyClinic.create({
      name,
      area,
      eta,
      image,
      address,
      phone,
      isActive: typeof isActive === "boolean" ? isActive : true,
    });

    res.status(201).json({ message: "Nearby clinic created", clinic });
  } catch (error) {
    res.status(500).json({ message: "Error creating nearby clinic", error: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const updated = await NearbyClinic.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ message: "Nearby clinic not found" });
    }

    res.json({ message: "Nearby clinic updated", clinic: updated });
  } catch (error) {
    res.status(500).json({ message: "Error updating nearby clinic", error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await NearbyClinic.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Nearby clinic not found" });
    }

    res.json({ message: "Nearby clinic deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting nearby clinic", error: error.message });
  }
});

module.exports = router;
