const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

module.exports = async function authMiddleware(req, res, next) {
  try {
    // Dev override: disable auth checks in development or when DISABLE_AUTH=true
    if (process.env.DISABLE_AUTH === 'true' || process.env.NODE_ENV !== 'production') {
      // find or create a dev user to attach to req
      const devEmail = process.env.DEV_USER_EMAIL || 'dev@local';
      let user = await User.findOne({ email: devEmail });
      if (!user) {
        // create a minimal dev user
        const pwd = process.env.DEV_USER_PASSWORD || 'devpass';
        const hash = await bcrypt.hash(pwd, 10);
        user = new User({ fullName: 'Dev User', email: devEmail, passwordHash: hash });
        await user.save();
        if (process.env.NODE_ENV !== 'production') console.log('Created dev user for DISABLE_AUTH:', devEmail);
      }
      // attach sanitized user
      req.user = user;
      req.userId = user._id;
      return next();
    }

    const token = req.cookies && req.cookies.access_token;
    if (!token) return res.status(401).json({ message: 'Not authenticated' });
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    } catch (e) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    const user = await User.findById(payload.id).select('-passwordHash -refreshToken');
    if (!user) return res.status(401).json({ message: 'Not authenticated' });
    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    console.error('authMiddleware error', err);
    res.status(500).json({ message: 'Server error' });
  }
};
