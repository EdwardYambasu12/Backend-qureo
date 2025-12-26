const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Pharmacy = require('../models/Pharmacy');
const Medicine = require('../models/Medicine');
const LabTest = require('../models/LabTest');
const Blog = require('../models/Blog');
const Provider = require('../models/Provider');

// General search across several collections
exports.search = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Missing query parameter `q`' });

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, ''), 'i');

    // Run searches in parallel, limit results per collection
    const [users, doctors, pharmacies, medicines, labtests, blogs, providers] = await Promise.all([
      User.find({ $or: [{ name: regex }, { email: regex }] }).limit(6).lean(),
      Doctor.find({ $or: [{ name: regex }, { specialization: regex }, { clinicName: regex }, { bio: regex }] }).limit(8).lean(),
      Pharmacy.find({ $or: [{ name: regex }, { address: regex }] }).limit(8).lean(),
      Medicine.find({ $or: [{ name: regex }, { brand: regex }, { description: regex }] }).limit(12).lean(),
      LabTest.find({ $or: [{ name: regex }, { description: regex }] }).limit(8).lean(),
      Blog.find({ $or: [{ title: regex }, { content: regex }] }).limit(8).lean(),
      Provider.find({ $or: [{ name: regex }, { description: regex }] }).limit(8).lean(),
    ]);

    return res.json({
      results: {
        users,
        doctors,
        pharmacies,
        medicines,
        labtests,
        blogs,
        providers,
      },
    });
  } catch (err) {
    console.error('Search error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
