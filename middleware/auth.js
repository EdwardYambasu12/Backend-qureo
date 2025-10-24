const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function authMiddleware(req, res, next) {
  try {
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
