const express = require('express');
const router = express.Router();
const Benefit = require('../models/Benefits');
const HealthcareProvider = require('../models/HealthcareProvider');

// Get all active benefits
router.get('/', async (req, res) => {
  try {
    const benefits = await Benefit.find({ 
      isActive: true,
      validUntil: { $gte: new Date() }
    })
    .populate('provider', 'name type icon color')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      benefits
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get benefits by provider
router.get('/provider/:providerId', async (req, res) => {
  try {
    const benefits = await Benefit.find({
      provider: req.params.providerId,
      isActive: true,
      validUntil: { $gte: new Date() }
    });

    res.json({
      success: true,
      benefits
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get benefit details
router.get('/:id', async (req, res) => {
  try {
    const benefit = await Benefit.findById(req.params.id)
      .populate('provider', 'name type contactPhone address');

    if (!benefit) {
      return res.status(404).json({ error: 'Benefit not found' });
    }

    res.json({
      success: true,
      benefit
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Apply benefit (simulate)
router.post('/apply', async (req, res) => {
  try {
    const { benefitId, amount } = req.body;

    const benefit = await Benefit.findById(benefitId);
    
    if (!benefit || !benefit.isActive) {
      return res.status(404).json({ error: 'Benefit not found or inactive' });
    }

    if (benefit.validUntil && benefit.validUntil < new Date()) {
      return res.status(400).json({ error: 'Benefit has expired' });
    }

    if (benefit.usageLimit && benefit.usedCount >= benefit.usageLimit) {
      return res.status(400).json({ error: 'Benefit usage limit reached' });
    }

    // Simulate applying discount
    let discountAmount = 0;
    if (benefit.discountValue.includes('$')) {
      discountAmount = parseFloat(benefit.discountValue.replace('$', ''));
    } else if (benefit.discountValue.includes('%')) {
      const percentage = parseFloat(benefit.discountValue.replace('%', ''));
      discountAmount = amount * (percentage / 100);
    }

    // Update usage count
    benefit.usedCount += 1;
    await benefit.save();

    res.json({
      success: true,
      message: 'Benefit applied successfully',
      discountAmount,
      finalAmount: amount - discountAmount,
      benefit: {
        title: benefit.title,
        discountValue: benefit.discountValue
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active partners
router.get('/partners/active', async (req, res) => {
  try {
    const partners = await HealthcareProvider.aggregate([
      {
        $lookup: {
          from: 'benefits',
          localField: '_id',
          foreignField: 'provider',
          as: 'benefits'
        }
      },
      {
        $match: {
          'benefits': { $ne: [] },
          'benefits.isActive': true,
          'benefits.validUntil': { $gte: new Date() }
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          type: 1,
          icon: 1,
          color: 1,
          benefitCount: { $size: '$benefits' }
        }
      }
    ]);

    res.json({
      success: true,
      partners
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;