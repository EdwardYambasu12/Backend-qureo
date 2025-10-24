const express = require('express');
const router = express.Router();
const Profile = require('../models/Profile');
const auth = require('../middleware/auth');

// GET /api/profile - get current user's profile
router.get('/', auth, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.userId });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    res.json({ profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/profile - create or update profile
router.post('/', auth, async (req, res) => {
  try {
    const data = req.body;
    let profile = await Profile.findOne({ user: req.userId });
    if (!profile) {
      profile = new Profile({ user: req.userId, ...data });
    } else {
      Object.assign(profile, data);
    }
    await profile.save();
    res.json({ profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
