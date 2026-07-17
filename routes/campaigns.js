const express = require("express");
const Campaign = require("../models/Campaign");
const User = require('../models/User');
const { notifyUser } = require('../utils/notifyUser');

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

    try {
      const users = await User.find({}).select('_id').limit(50).lean();
      await Promise.allSettled(users.map((user) => notifyUser({
        userId: user._id,
        type: 'campaign_available',
        title: 'New health campaign available',
        body: `${campaign.title} is now available in Qureo.`,
        balancedTitle: 'Campaign available',
        balancedBody: 'A new health campaign is available near you.',
        genericTitle: 'You have a new update in Qureo',
        genericBody: 'Open Qureo to view a new campaign.',
        route: '/campaigns',
        data: {
          campaignId: String(campaign._id),
          category: String(campaign.category || ''),
          event: 'campaign_available',
        },
      })));
    } catch (notifyError) {
      console.warn('[campaigns] push failed after create:', notifyError?.message || notifyError);
    }

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

    try {
      const users = await User.find({}).select('_id').limit(50).lean();
      await Promise.allSettled(users.map((user) => notifyUser({
        userId: user._id,
        type: 'campaign_follow_up',
        title: 'Campaign updated',
        body: `${updated.title} has been updated in Qureo.`,
        balancedTitle: 'Campaign follow-up',
        balancedBody: 'A campaign you may be interested in changed.',
        genericTitle: 'You have a new update in Qureo',
        genericBody: 'Open Qureo to view the update.',
        route: '/campaigns',
        data: {
          campaignId: String(updated._id),
          event: 'campaign_follow_up',
        },
      })));
    } catch (notifyError) {
      console.warn('[campaigns] push failed after update:', notifyError?.message || notifyError);
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
