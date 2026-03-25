const express = require("express");
const Campaign = require("../models/Campaign");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "50", 10)));
    const q = (req.query.q || "").trim();
    const category = (req.query.category || "").trim();
    const status = (req.query.status || "").trim();

    const filter = { isPublished: true };

    if (category && category !== "all") filter.category = category;
    if (status && status !== "all") filter.status = status;

    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(escaped, "i");
      filter.$or = [
        { title: re },
        { description: re },
        { organization: re },
        { location: re },
      ];
    }

    const total = await Campaign.countDocuments(filter);
    const campaigns = await Campaign.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      campaigns,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching campaigns", error: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      title,
      category,
      organization,
      description,
      date,
      location,
      participants,
      target,
      progress,
      urgency,
      status,
      bannerColor,
      icon,
      benefits,
      highlights,
      image,
      isPublished,
    } = req.body;

    const campaign = await Campaign.create({
      title,
      category,
      organization,
      description,
      date,
      location,
      participants,
      target,
      progress,
      urgency,
      status,
      bannerColor,
      icon,
      benefits: Array.isArray(benefits) ? benefits : [],
      highlights: Array.isArray(highlights) ? highlights : [],
      image,
      isPublished: typeof isPublished === "boolean" ? isPublished : true,
    });

    res.status(201).json({ message: "Campaign created successfully", campaign });
  } catch (error) {
    res.status(500).json({ message: "Error creating campaign", error: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const updated = await Campaign.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    res.json({ message: "Campaign updated successfully", campaign: updated });
  } catch (error) {
    res.status(500).json({ message: "Error updating campaign", error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Campaign.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    res.json({ message: "Campaign deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting campaign", error: error.message });
  }
});

module.exports = router;
