const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const ACCESS_EXPIRES = '15m';
const REFRESH_EXPIRES_SEC = 60 * 60 * 24 * 30; // 30 days in seconds
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { fullName, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const user = new User({ fullName: fullName || '', email: email.toLowerCase(), passwordHash: hash });
    await user.save();

    // create access token and refresh token
    const accessToken = jwt.sign({ id: user._id.toString(), email: user.email }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: ACCESS_EXPIRES });
    const refreshToken = crypto.randomBytes(40).toString('hex');
    user.refreshToken = refreshToken;
    await user.save();

    // set cookies (HttpOnly)
    res.cookie('access_token', accessToken, { httpOnly: true, sameSite: 'lax' });
    res.cookie('refresh_token', refreshToken, { httpOnly: true, sameSite: 'lax', maxAge: REFRESH_EXPIRES_SEC * 1000 });

    res.status(201).json({ user: { id: user._id, fullName: user.fullName, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/signin
router.post('/signin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const accessToken = jwt.sign({ id: user._id.toString(), email: user.email }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: ACCESS_EXPIRES });
    const refreshToken = crypto.randomBytes(40).toString('hex');
    user.refreshToken = refreshToken;
    await user.save();

    res.cookie('access_token', accessToken, { httpOnly: true, sameSite: 'lax' });
    res.cookie('refresh_token', refreshToken, { httpOnly: true, sameSite: 'lax', maxAge: REFRESH_EXPIRES_SEC * 1000 });

    res.json({ user: { id: user._id, fullName: user.fullName, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.cookies || {};
    if (!refresh_token) return res.status(401).json({ message: 'No refresh token' });

    const user = await User.findOne({ refreshToken: refresh_token });
    if (!user) return res.status(401).json({ message: 'Invalid refresh token' });

    const accessToken = jwt.sign({ id: user._id.toString(), email: user.email }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: ACCESS_EXPIRES });
    res.cookie('access_token', accessToken, { httpOnly: true, sameSite: 'lax' });
    res.json({ user: { id: user._id, fullName: user.fullName, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Logout endpoint - clear cookies and remove refresh token
router.post('/logout', async (req, res) => {
  try {
    const { refresh_token } = req.cookies || {};
    if (refresh_token) {
      await User.updateOne({ refreshToken: refresh_token }, { $unset: { refreshToken: 1 } });
    }
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Me endpoint - validate access_token cookie
router.get('/me', async (req, res) => {
  try {
    const { access_token } = req.cookies || {};
    if (!access_token) return res.status(401).json({ message: 'Not authenticated' });

    try {
      const payload = jwt.verify(access_token, process.env.JWT_SECRET || 'dev-secret');
      const user = await User.findById(payload.id).select('-passwordHash -refreshToken');
      if (!user) return res.status(401).json({ message: 'Not authenticated' });
      res.json({ user });
    } catch (e) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

