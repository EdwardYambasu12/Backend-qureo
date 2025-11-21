const jwt = require('jsonwebtoken');
const Doctor = require('../models/Doctor');

module.exports = async function doctorAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    const doc = await Doctor.findById(decoded.id).select('-passwordHash');
    if (!doc) return res.status(401).json({ message: 'Invalid token' });
    req.doctor = doc;
    next();
  } catch (err) {
    console.error('doctorAuth error', err.message);
    return res.status(401).json({ message: 'Unauthorized' });
  }
};