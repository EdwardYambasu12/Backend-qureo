const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

module.exports = async function authMiddleware(req, res, next) {
  try {
    // Dev override: disable auth checks only when explicitly enabled.
    // Using NODE_ENV alone makes every dev request impersonate one shared user.
    if (process.env.DISABLE_AUTH === 'true') {
      const devEmail = process.env.DEV_USER_EMAIL || 'dev@local';
      let user = await User.findOne({ email: devEmail });
      if (!user) {
        const pwd = process.env.DEV_USER_PASSWORD || 'devpass';
        const hash = await bcrypt.hash(pwd, 10);
        user = new User({ fullName: 'Dev User', email: devEmail, passwordHash: hash });
        await user.save();
        console.log('✅ Created dev user for DISABLE_AUTH:', devEmail);
      }
      req.user = user;
      req.userId = user._id;
      return next();
    }

    // ✅ Extract token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;

    if (!token) return res.status(401).json({ message: 'Not authenticated' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    } catch (e) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const user = await User.findById(payload.id).select('-passwordHash -refreshToken');
    if (!user) return res.status(401).json({ message: 'User not found' });

    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    console.error('authMiddleware error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};