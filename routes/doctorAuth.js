const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Doctor = require('../models/Doctor');

const router = express.Router();

// POST /api/doctor/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, specialty } = req.body;
    if (!email || !password || !name) return res.status(400).json({ message: 'Missing required fields' });

    const existing = await Doctor.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const doctor = await Doctor.create({ name, email, specialty: specialty || 'General Practitioner', passwordHash: hash });
    return res.status(201).json({ message: 'Doctor registered', id: doctor._id });
  } catch (err) {
    console.error('doctor register error', err);
    return res.status(500).json({ message: 'Registration failed', error: err.message });
  }
});

// POST /api/doctor/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing credentials' });

    const doc = await Doctor.findOne({ email });
    if (!doc || !doc.passwordHash) return res.status(401).json({ message: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, doc.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: doc._id, email: doc.email }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
    return res.json({ token });
  } catch (err) {
    console.error('doctor login error', err);
    return res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

module.exports = router;
