const express = require('express');
const router = express.Router();
const Vitals = require('../models/Vitals');
const HealthAlert = require('../models/HealthAlert');
const HealthMonitoringServiceEnhanced = require('../services/HealthMonitoringServiceEnhanced');
const auth = require('../middleware/auth');

// GET /api/vitals - Get all vitals for current user with pagination
router.get('/', auth, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    const userId = req.userId;

    const vitals = await Vitals.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Vitals.countDocuments({ user: userId });

    res.json({
      vitals,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
      },
    });
  } catch (err) {
    console.error('Error fetching vitals:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/vitals/latest - Get latest vitals reading for current user
router.get('/latest', auth, async (req, res) => {
  try {
    const userId = req.userId;

    const vitals = await Vitals.findOne({ user: userId }).sort({ createdAt: -1 });

    if (!vitals) {
      return res.status(404).json({ message: 'No vitals found' });
    }

    res.json({ vitals });
  } catch (err) {
    console.error('Error fetching latest vitals:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/vitals - Create new vitals reading with AI analysis
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { bloodPressure, heartRate, temperature, oxygenLevel, weight, symptoms, hydration, notes, source, deviceName } = req.body;

    // Validate required fields
    if (!heartRate && !bloodPressure && !temperature && !oxygenLevel) {
      return res.status(400).json({ message: 'At least one vital measurement is required' });
    }

    // Parse blood pressure if provided as string (e.g., "120/80")
    let bpData = {};
    if (typeof bloodPressure === 'string') {
      const [systolic, diastolic] = bloodPressure.split('/').map(Number);
      bpData = { systolic, diastolic, raw: bloodPressure };
    } else if (typeof bloodPressure === 'object') {
      bpData = bloodPressure;
    }

    const vitals = new Vitals({
      user: userId,
      bloodPressure: Object.keys(bpData).length > 0 ? bpData : undefined,
      heartRate,
      temperature,
      oxygenLevel,
      weight,
      symptoms: symptoms || [],
      hydration,
      notes,
      source: source || 'manual',
      deviceName,
    });

    await vitals.save();

    // IMMEDIATE AI ANALYSIS (NEW)
    let aiAnalysis = null;
    let alertData = null;
    let severity = 'info';

    try {
      // Check for abnormalities and get AI insights
      const analysisResult = await HealthMonitoringServiceEnhanced.analyzeVitalsImmediately(userId, vitals);

      aiAnalysis = analysisResult.analysis;
      severity = analysisResult.severity;

      // Check for vital abnormalities
      const abnormalReading = analysisResult.abnormalReading;
      const recommendation = analysisResult.recommendation;

      // Create health alert
      const alertPayload = {
        user: userId,
        vitalId: vitals._id,
        type: 'health_insight',
        title: severity === 'critical' ? '🚨 Critical Health Alert' : severity === 'warning' ? '⚠️ Health Warning' : '💡 Health Insight',
        message: severity === 'critical'
          ? 'Your latest vitals show critical readings requiring immediate attention'
          : severity === 'warning'
          ? 'Your latest vitals show some abnormal readings'
          : 'Your vitals have been analyzed for insights',
        severity,
        data: {
          aiAnalysis: aiAnalysis,
          abnormalReading: abnormalReading,
          recommendation: recommendation,
          normalRange: analysisResult.normalRange,
          readingDetails: {
            bp: vitals.bloodPressure?.raw || `${vitals.bloodPressure?.systolic}/${vitals.bloodPressure?.diastolic}`,
            hr: vitals.heartRate,
            temp: vitals.temperature,
            o2: vitals.oxygenLevel,
          }
        },
        notificationType: 'in_app',
      };

      alertData = await HealthAlert.create(alertPayload);
      console.log(`✅ Health alert created for user ${userId}`);
    } catch (aiError) {
      console.warn('⚠️ Skipping AI analysis due to error:', aiError.message);
      // Continue without AI analysis if it fails - don't block vitals submission
    }

    res.status(201).json({
      message: 'Vitals recorded successfully',
      vitals,
      aiAnalysis,
      alert: alertData,
      severity,
    });
  } catch (err) {
    console.error('Error creating vitals:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/vitals/share - Share vitals with doctor/care team
router.post('/share', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { vitalId, doctorId } = req.body;

    if (!vitalId || !doctorId) {
      return res.status(400).json({ message: 'vitalId and doctorId are required' });
    }

    const vitals = await Vitals.findById(vitalId);

    if (!vitals) {
      return res.status(404).json({ message: 'Vitals not found' });
    }

    if (vitals.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Add doctor to sharedWith if not already there
    if (!vitals.sharedWith.includes(doctorId)) {
      vitals.sharedWith.push(doctorId);
      await vitals.save();
    }

    res.json({
      message: 'Vitals shared with doctor',
      vitals,
    });
  } catch (err) {
    console.error('Error sharing vitals:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/vitals/daily-summary - Get daily summary for current user
router.post('/daily-summary', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { date = new Date() } = req.body;

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const vitals = await Vitals.find({
      user: userId,
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ createdAt: -1 });

    // Calculate daily averages
    let summary = {
      date,
      count: vitals.length,
      readings: vitals,
      averages: {},
    };

    if (vitals.length > 0) {
      const avgHeartRate = vitals
        .filter(v => v.heartRate)
        .reduce((sum, v) => sum + v.heartRate, 0) / vitals.filter(v => v.heartRate).length;

      const avgOxygen = vitals
        .filter(v => v.oxygenLevel)
        .reduce((sum, v) => sum + v.oxygenLevel, 0) / vitals.filter(v => v.oxygenLevel).length;

      const avgTemp = vitals
        .filter(v => v.temperature)
        .reduce((sum, v) => sum + v.temperature, 0) / vitals.filter(v => v.temperature).length;

      summary.averages = {
        heartRate: avgHeartRate || null,
        oxygenLevel: avgOxygen || null,
        temperature: avgTemp || null,
      };
    }

    res.json(summary);
  } catch (err) {
    console.error('Error fetching daily summary:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT /api/vitals/:id - Update vitals reading
router.put('/:id', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const vitalId = req.params.id;
    const updateData = req.body;

    const vitals = await Vitals.findById(vitalId);

    if (!vitals) {
      return res.status(404).json({ message: 'Vitals not found' });
    }

    if (vitals.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Update allowed fields
    const allowedFields = ['bloodPressure', 'heartRate', 'temperature', 'oxygenLevel', 'weight', 'symptoms', 'hydration', 'notes'];
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        vitals[field] = updateData[field];
      }
    });

    await vitals.save();

    res.json({
      message: 'Vitals updated successfully',
      vitals,
    });
  } catch (err) {
    console.error('Error updating vitals:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE /api/vitals/:id - Delete vitals reading
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const vitalId = req.params.id;

    const vitals = await Vitals.findById(vitalId);

    if (!vitals) {
      return res.status(404).json({ message: 'Vitals not found' });
    }

    if (vitals.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await Vitals.findByIdAndDelete(vitalId);

    res.json({ message: 'Vitals deleted successfully' });
  } catch (err) {
    console.error('Error deleting vitals:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
