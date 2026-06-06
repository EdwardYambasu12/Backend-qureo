const express = require('express');
const bcrypt = require('bcryptjs');
const Doctor = require('../models/Doctor');

const router = express.Router();

// POST /api/doctor/auth/register
router.post('/register', async (req, res) => {
  try {
    const {
      // Step 1
      name, email, password, specialty, phone, city,
      // Step 2
      clinicName, consultationFeeRemote, consultationFeeInPerson,
      licenseNumber, experience, qualifications,
      // Step 3
      availability,
    } = req.body;

    if (!email || !password || !name) return res.status(400).json({ message: 'Missing required fields' });

    const existing = await Doctor.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);

    const doctorData = {
      name,
      email,
      specialty: specialty || 'General Practitioner',
      passwordHash: hash,
    };

    if (phone) doctorData.phone = phone;
    if (city) doctorData.city = city;
    if (clinicName) doctorData.clinicName = clinicName;
    if (licenseNumber) doctorData.licenseNumber = licenseNumber;
    if (Number.isFinite(Number(experience))) doctorData.experience = Number(experience);
    if (Number.isFinite(Number(consultationFeeRemote))) doctorData.consultationFeeRemote = Number(consultationFeeRemote);
    if (Number.isFinite(Number(consultationFeeInPerson))) doctorData.consultationFeeInPerson = Number(consultationFeeInPerson);
    if (Array.isArray(qualifications) && qualifications.length) doctorData.qualifications = qualifications;
    if (availability && typeof availability === 'object') doctorData.availability = availability;

    const doctor = await Doctor.create(doctorData);
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

    return res.json({
      doctor: {
        id: doc._id,
        name: doc.name,
        email: doc.email,
        specialty: doc.specialty,
      },
    });
  } catch (err) {
    console.error('doctor login error', err);
    return res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

module.exports = router;
