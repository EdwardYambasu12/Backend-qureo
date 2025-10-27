const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const router = express.Router();

const ACCESS_EXPIRES = '15m';
const REFRESH_EXPIRES = '7d';

// Helper: cookie settings
const cookieSettings = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/'
};

// 🧩 SIGNIN
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    // generate tokens
    const accessToken = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
    const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });

    // store refresh in DB
    user.refreshToken = refreshToken;
    await user.save();

    // send tokens as cookies
    res.cookie('access_token', accessToken, cookieSettings);
    res.cookie('refresh_token', refreshToken, cookieSettings);

    res.json({
      message: 'Login successful',
      user: { id: user._id, email: user.email, fullName: user.fullName }
    });
  } catch (err) {
    console.error('Signin error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 🧩 REFRESH TOKEN
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.cookies;

    if (!refresh_token) return res.status(401).json({ message: 'No refresh token found' });

    // verify and find user
    const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findOne({ _id: decoded.id, refreshToken: refresh_token });

    if (!user) return res.status(401).json({ message: 'Invalid refresh token' });

    // generate new access token
    const accessToken = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRES });

    res.cookie('access_token', accessToken, cookieSettings);
    res.json({ message: 'Token refreshed successfully' });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
});

// 🧩 LOGOUT
router.post('/logout', async (req, res) => {
  try {
    const { refresh_token } = req.cookies;

    if (refresh_token) {
      await User.updateOne({ refreshToken: refresh_token }, { $unset: { refreshToken: '' } });
    }

    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
