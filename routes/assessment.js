const express = require('express');
const router = express.Router();
const HealthAssessment = require('../models/HealthAssessment');
const auth = require('../middleware/auth');

// GET /api/assessment - list assessments for the current user
router.get('/', auth, async (req, res) => {
  try {
    const items = await HealthAssessment.find({ user: req.userId }).sort({ createdAt: -1 }).limit(50);
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/assessment - create new assessment
router.post('/', auth, async (req, res) => {
  try {
    const data = req.body;
    const a = new HealthAssessment({ user: req.userId, ...data });
    await a.save();
    res.status(201).json({ assessment: a });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
