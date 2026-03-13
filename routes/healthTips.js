const express = require('express');
const auth = require('../middleware/auth');
const DailyHealthTipService = require('../services/DailyHealthTipService');
const DailyHealthTip = require('../models/DailyHealthTip');

const router = express.Router();

router.get('/today', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user?._id;
    const result = await DailyHealthTipService.ensureTodayTipForUser(userId);

    res.json({
      success: true,
      created: result.created,
      tip: result.tip,
    });
  } catch (err) {
    console.error('healthTips/today error:', err);
    res.status(500).json({ success: false, message: 'Failed to get today health tip' });
  }
});

router.get('/recent', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user?._id;
    const { limit = 7 } = req.query;

    const tips = await DailyHealthTip.find({ user: userId })
      .sort({ tipDate: -1 })
      .limit(Math.max(1, Math.min(31, Number(limit) || 7)));

    res.json({ success: true, tips });
  } catch (err) {
    console.error('healthTips/recent error:', err);
    res.status(500).json({ success: false, message: 'Failed to get recent tips' });
  }
});

module.exports = router;
