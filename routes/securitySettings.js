const express = require('express');
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const SecuritySettings = require('../models/SecuritySettings');
const User = require('../models/User');

const router = express.Router();

async function getOrCreateSettings(userId) {
  let settings = await SecuritySettings.findOne({ user: userId });
  if (!settings) {
    settings = await SecuritySettings.create({ user: userId });
  }
  return settings;
}

router.get('/', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user?._id;
    const settings = await getOrCreateSettings(userId);

    res.json({
      settings: {
        bioLock: settings.bioLock,
        reminderLogin: settings.reminderLogin,
        dataSharing: settings.dataSharing,
        hasPasscode: Boolean(settings.passcodeHash),
      },
    });
  } catch (err) {
    console.error('securitySettings/get error:', err);
    res.status(500).json({ message: 'Failed to fetch security settings' });
  }
});

router.put('/', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user?._id;
    const { bioLock, reminderLogin, dataSharing } = req.body || {};

    if (
      typeof bioLock !== 'boolean' ||
      typeof reminderLogin !== 'boolean' ||
      typeof dataSharing !== 'boolean'
    ) {
      return res.status(400).json({ message: 'bioLock, reminderLogin, and dataSharing must be boolean values' });
    }

    const settings = await SecuritySettings.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        bioLock,
        reminderLogin,
        dataSharing,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({
      message: 'Security settings updated',
      settings: {
        bioLock: settings.bioLock,
        reminderLogin: settings.reminderLogin,
        dataSharing: settings.dataSharing,
        hasPasscode: Boolean(settings.passcodeHash),
      },
    });
  } catch (err) {
    console.error('securitySettings/put error:', err);
    res.status(500).json({ message: 'Failed to update security settings' });
  }
});

router.post('/change-password', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user?._id;
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'currentPassword and newPassword are required' });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters long' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const valid = await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!valid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(String(newPassword), 10);
    user.passwordHash = hash;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('securitySettings/change-password error:', err);
    res.status(500).json({ message: 'Failed to change password' });
  }
});

router.post('/passcode', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user?._id;
    const { passcode } = req.body || {};

    if (!/^\d{4,8}$/.test(String(passcode || ''))) {
      return res.status(400).json({ message: 'Passcode must be 4 to 8 digits' });
    }

    const hash = await bcrypt.hash(String(passcode), 10);
    const settings = await SecuritySettings.findOneAndUpdate(
      { user: userId },
      { user: userId, passcodeHash: hash },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({
      message: 'Passcode updated successfully',
      hasPasscode: Boolean(settings.passcodeHash),
    });
  } catch (err) {
    console.error('securitySettings/passcode error:', err);
    res.status(500).json({ message: 'Failed to update passcode' });
  }
});

router.post('/reset', auth, async (req, res) => {
  try {
    const userId = req.userId || req.user?._id;
    const settings = await SecuritySettings.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        bioLock: true,
        reminderLogin: false,
        dataSharing: true,
        passcodeHash: '',
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({
      message: 'Security settings reset',
      settings: {
        bioLock: settings.bioLock,
        reminderLogin: settings.reminderLogin,
        dataSharing: settings.dataSharing,
        hasPasscode: false,
      },
    });
  } catch (err) {
    console.error('securitySettings/reset error:', err);
    res.status(500).json({ message: 'Failed to reset settings' });
  }
});

module.exports = router;
