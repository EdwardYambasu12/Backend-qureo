const express = require('express');
const router = express.Router();
const Profile = require('../models/Profile');
const auth = require('../middleware/auth');

// GET /api/profile - get current user's profile
router.get('/', auth, async (req, res) => {
  try {
    const uid = await req.userId;
    const profile = await Profile.findOne({ user: uid });
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
    const uid = req.userId;
    let profile = await Profile.findOne({ user: uid });
    if (!profile) {
      profile = new Profile({ user: uid, ...data });
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

// PATCH /api/profile/avatar - update only the avatar field (accepts URL/base64)
router.patch('/avatar', auth, async (req, res) => {
  try {
    const { avatar } = req.body;
    if (!avatar) return res.status(400).json({ message: 'avatar is required' });
    const uid = req.userId;
    let profile = await Profile.findOne({ user: uid });
    if (!profile) {
      profile = new Profile({ user: uid, avatar });
    } else {
      profile.avatar = avatar;
    }
    await profile.save();
    res.json({ profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
