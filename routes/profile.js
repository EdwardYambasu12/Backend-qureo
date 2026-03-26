const express = require('express');
const router = express.Router();
const Profile = require('../models/Profile');

// GET /api/profile - get current user's profile
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query || req.body;
    if (!userId) return res.status(400).json({ message: 'userId required' });
    
    const profile = await Profile.findOne({ user: userId });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    res.json({ profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/profile - create or update profile
router.post('/', async (req, res) => {
  try {
    const { userId, ...data } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId required' });
    
    let profile = await Profile.findOne({ user: userId });
    if (!profile) {
      profile = new Profile({ user: userId, ...data });
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
router.patch('/avatar', async (req, res) => {
  try {
    const { userId, avatar } = req.body;
    if (!avatar) return res.status(400).json({ message: 'avatar is required' });
    if (!userId) return res.status(400).json({ message: 'userId required' });
    
    let profile = await Profile.findOne({ user: userId });
    if (!profile) {
      profile = new Profile({ user: userId, avatar });
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

// PATCH /api/profile/notifications - update notification preferences
router.patch('/notifications', async (req, res) => {
  try {
    const { userId, notifications } = req.body;
    if (!notifications || typeof notifications !== 'object') return res.status(400).json({ message: 'notifications object is required' });
    if (!userId) return res.status(400).json({ message: 'userId required' });
    let profile = await Profile.findOne({ user: userId });
    if (!profile) {
      profile = new Profile({ user: userId, notifications });
    } else {
      profile.notifications = { ...profile.notifications, ...notifications };
    }
    await profile.save();
    res.json({ profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
