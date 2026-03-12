const express = require('express');
const auth = require('../middleware/auth');
const LinkedDevice = require('../models/LinkedDevice');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const devices = await LinkedDevice.find({ user: req.userId }).sort({ createdAt: -1 });
    return res.json({ devices });
  } catch (err) {
    console.error('linkedDevices/get error:', err);
    return res.status(500).json({ message: 'Failed to fetch linked devices' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { deviceName, deviceType, identifier } = req.body || {};

    if (!deviceName || !String(deviceName).trim()) {
      return res.status(400).json({ message: 'deviceName is required' });
    }

    const allowedTypes = new Set(['smartwatch', 'fitness-band', 'phone', 'glucose-monitor', 'blood-pressure-monitor', 'other']);

    const device = await LinkedDevice.create({
      user: req.userId,
      deviceName: String(deviceName).trim(),
      deviceType: allowedTypes.has(deviceType) ? deviceType : 'other',
      identifier: String(identifier || '').trim(),
      lastSyncedAt: new Date(),
    });

    return res.status(201).json({ device });
  } catch (err) {
    console.error('linkedDevices/post error:', err);
    return res.status(500).json({ message: 'Failed to link device' });
  }
});

router.patch('/:id/sync', auth, async (req, res) => {
  try {
    const device = await LinkedDevice.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { lastSyncedAt: new Date() },
      { new: true }
    );

    if (!device) return res.status(404).json({ message: 'Device not found' });

    return res.json({ device });
  } catch (err) {
    console.error('linkedDevices/sync error:', err);
    return res.status(500).json({ message: 'Failed to update sync time' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const deleted = await LinkedDevice.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!deleted) return res.status(404).json({ message: 'Device not found' });

    return res.json({ message: 'Device removed' });
  } catch (err) {
    console.error('linkedDevices/delete error:', err);
    return res.status(500).json({ message: 'Failed to remove device' });
  }
});

module.exports = router;
