const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');

// ✅ Add new medicine
router.post('/', async (req, res) => {
  try {
    const medicine = new Medicine(req.body);
    await medicine.save();
    res.status(201).json({ message: 'Medicine added successfully', medicine });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to add medicine', error });
  }
});

// ✅ Get all medicines
router.get('/', async (req, res) => {
  try {
    const medicines = await Medicine.find().sort({ createdAt: -1 });
    res.json({ medicines });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Get medicine by category
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const medicines = await Medicine.find({ category });
    res.json({ medicines });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Search by name or brand
router.get('/search/:query', async (req, res) => {
  try {
    const query = req.params.query;
    const medicines = await Medicine.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { brandName: { $regex: query, $options: 'i' } },
      ],
    });
    res.json({ medicines });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});
router.patch('/:id/review', async (req, res) => {
  try {
    const { newRating } = req.body; // e.g. 5, 4, 3

    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) return res.status(404).json({ message: 'Medicine not found' });

    // compute new average
    const totalReviews = medicine.reviews + 1;
    const newAverage = ((medicine.rating * medicine.reviews) + newRating) / totalReviews;

    medicine.rating = parseFloat(newAverage.toFixed(1));
    medicine.reviews = totalReviews;

    await medicine.save();
    res.json({ message: 'Review added', medicine });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update rating', error: err.message });
  }
});

// ✅ Get featured products
router.get('/featured', async (req, res) => {
  try {
    const featured = await Medicine.find({ featured: true }).limit(10);
    res.json({ featured });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch featured products', error: err.message });
  }
});

// ✅ Get best sellers (top 10 by reviews and rating)
router.get('/best-sellers', async (req, res) => {
  try {
    const bestSellers = await Medicine.find()
      .sort({ reviews: -1, rating: -1 }) // highest reviews first, then highest rating
      .limit(10);
    res.json({ bestSellers });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch best sellers', error: err.message });
  }
});

// ✅ Get low stock medicines
router.get('/low-stock', async (req, res) => {
  try {
    const medicines = await Medicine.find();
    const lowStock = medicines.filter(med => {
      const totalStock = Array.from(med.stock.values()).reduce((a, b) => a + b, 0);
      return totalStock <= 5;
    });
    res.json({ lowStock });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch low stock medicines', error: err.message });
  }
});

module.exports = router;
