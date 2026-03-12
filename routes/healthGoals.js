const express = require('express');
const auth = require('../middleware/auth');
const HealthGoal = require('../models/HealthGoal');

const router = express.Router();

const GOALS = new Set(['Improve Sleep', 'Lose Weight', 'Build Muscle', 'Reduce Stress', 'Increase Energy']);

router.get('/', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user?._id;
    let goal = await HealthGoal.findOne({ user: userId });

    if (!goal) {
      goal = await HealthGoal.create({ user: userId });
    }

    res.json({ goal });
  } catch (err) {
    console.error('healthGoals/get error:', err);
    res.status(500).json({ message: 'Failed to fetch health goal' });
  }
});

router.put('/', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user?._id;
    const { primaryGoal, weeklyTarget, reminderTime } = req.body || {};

    if (!GOALS.has(primaryGoal)) {
      return res.status(400).json({ message: 'Invalid primaryGoal' });
    }

    const wt = Number(weeklyTarget);
    if (!Number.isInteger(wt) || wt < 1 || wt > 14) {
      return res.status(400).json({ message: 'weeklyTarget must be an integer between 1 and 14' });
    }

    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(String(reminderTime || ''))) {
      return res.status(400).json({ message: 'reminderTime must be HH:mm format' });
    }

    const goal = await HealthGoal.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        primaryGoal,
        weeklyTarget: wt,
        reminderTime,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ goal, message: 'Health goals updated' });
  } catch (err) {
    console.error('healthGoals/put error:', err);
    res.status(500).json({ message: 'Failed to update health goal' });
  }
});

module.exports = router;
