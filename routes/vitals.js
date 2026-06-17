const express = require('express');
const router = express.Router();
const Vitals = require('../models/Vitals');
const HealthAlert = require('../models/HealthAlert');
const HealthMonitoringServiceEnhanced = require('../services/HealthMonitoringServiceEnhanced');
const auth = require('../middleware/auth');

const toDayKey = (date) => new Date(date).toISOString().slice(0, 10);

const getDynamicAiSignal = (vitals = []) => {
  if (!Array.isArray(vitals) || vitals.length === 0) {
    return {
      severity: 'info',
      insight: 'No readings yet. Add your first vitals to unlock personalized insights.',
      status: 'Awaiting data',
      statusDetails: 'Start by logging BP, blood sugar, and medication adherence.',
      recommendation: 'Log at least one set of vitals today.',
    };
  }

  const latest = vitals[vitals.length - 1];

  const latestSys = latest?.bloodPressure?.systolic;
  const latestDia = latest?.bloodPressure?.diastolic;
  const latestHr = latest?.heartRate;
  const latestTemp = latest?.temperature;
  const latestO2 = latest?.oxygenLevel;

  // Critical immediate checks.
  if ((latestSys && latestDia && (latestSys >= 180 || latestDia >= 120)) || (latestO2 && latestO2 < 90) || (latestTemp && latestTemp >= 103) || (latestHr && latestHr >= 130)) {
    return {
      severity: 'critical',
      insight: 'Your latest readings show a critical value that needs urgent attention.',
      status: 'Critical alert',
      statusDetails: 'Retake the reading now and contact a clinician or emergency services if it stays abnormal.',
      recommendation: 'Seek immediate medical attention.',
    };
  }

  // BP high for 3 consecutive recorded days.
  const dailyBp = {};
  vitals.forEach((entry) => {
    const key = toDayKey(entry.createdAt || Date.now());
    if (!dailyBp[key]) {
      dailyBp[key] = { high: false };
    }

    const sys = entry?.bloodPressure?.systolic;
    const dia = entry?.bloodPressure?.diastolic;
    if (typeof sys === 'number' && typeof dia === 'number' && (sys >= 140 || dia >= 90)) {
      dailyBp[key].high = true;
    }
  });

  const dayKeys = Object.keys(dailyBp).sort();
  const last3Days = dayKeys.slice(-3);
  const bpHighThreeDays = last3Days.length === 3 && last3Days.every((day) => dailyBp[day].high);
  if (bpHighThreeDays) {
    return {
      severity: 'warning',
      insight: 'Your blood pressure has been high for 3 days in a row.',
      status: 'BP trend warning',
      statusDetails: 'This pattern may require treatment adjustment. Continue logging BP twice daily.',
      recommendation: 'Schedule a follow-up with your doctor.',
    };
  }

  // Missed/Skipped medication adherence events in last 7 days.
  let missedDoseCount = 0;
  vitals.forEach((entry) => {
    (entry.adherenceEvents || []).forEach((event) => {
      if (event.status === 'missed' || event.status === 'skipped') {
        missedDoseCount += 1;
      }
    });
  });

  if (missedDoseCount >= 2) {
    return {
      severity: 'warning',
      insight: `You missed medication ${missedDoseCount} times this week.`,
      status: 'Adherence warning',
      statusDetails: 'Missed doses can reduce treatment effectiveness. Use reminders and log each dose.',
      recommendation: 'Talk to your care team if side effects or schedule issues are causing missed doses.',
    };
  }

  // Blood sugar trend worsening.
  const sugars = vitals
    .filter((entry) => entry?.bloodSugar && typeof entry.bloodSugar.value === 'number')
    .map((entry) => entry.bloodSugar.value);

  if (sugars.length >= 4) {
    const firstHalf = sugars.slice(0, Math.floor(sugars.length / 2));
    const secondHalf = sugars.slice(Math.floor(sugars.length / 2));
    const avg = (arr) => arr.reduce((sum, value) => sum + value, 0) / arr.length;
    const delta = avg(secondHalf) - avg(firstHalf);
    if (delta >= 15) {
      return {
        severity: 'warning',
        insight: 'Your blood sugar trend is rising this week.',
        status: 'Glucose trend warning',
        statusDetails: 'Keep checking fasting/post-meal values and review meals, activity, and medications.',
        recommendation: 'Consider speaking with your clinician for a diabetes follow-up.',
      };
    }
  }

  return {
    severity: 'info',
    insight: 'Everything looks stable right now. Keep logging daily to maintain momentum.',
    status: 'No issues detected',
    statusDetails: 'Your recent readings do not show critical or warning patterns.',
    recommendation: 'Continue your current care plan and daily check-ins.',
  };
};

const normalizeBloodSugar = (bloodSugar) => {
  if (bloodSugar === undefined || bloodSugar === null || bloodSugar === '') {
    return undefined;
  }

  if (typeof bloodSugar === 'number') {
    return {
      value: bloodSugar,
      unit: 'mg/dL',
      readingType: 'other',
      measuredAt: new Date(),
    };
  }

  if (typeof bloodSugar === 'object') {
    if (bloodSugar.value === undefined || bloodSugar.value === null || bloodSugar.value === '') {
      return undefined;
    }

    return {
      value: Number(bloodSugar.value),
      unit: bloodSugar.unit === 'mmol/L' ? 'mmol/L' : 'mg/dL',
      readingType: bloodSugar.readingType || 'other',
      measuredAt: bloodSugar.measuredAt ? new Date(bloodSugar.measuredAt) : new Date(),
    };
  }

  return undefined;
};

const normalizeAdherenceEvents = (adherenceEvents) => {
  if (!Array.isArray(adherenceEvents)) {
    return [];
  }

  return adherenceEvents
    .filter((event) => event && typeof event === 'object')
    .map((event) => ({
      medicationName: event.medicationName || undefined,
      scheduledTime: event.scheduledTime || undefined,
      status: event.status || 'taken',
      notes: event.notes || undefined,
      recordedAt: event.recordedAt ? new Date(event.recordedAt) : new Date(),
    }));
};

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

// GET /api/vitals/ai-signal - Trend-based AI signal for remote monitoring card
router.get('/ai-signal', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentVitals = await Vitals.find({
      user: userId,
      createdAt: { $gte: sevenDaysAgo },
    })
      .sort({ createdAt: 1 })
      .select('bloodPressure heartRate temperature oxygenLevel bloodSugar adherenceEvents createdAt');

    const signal = getDynamicAiSignal(recentVitals);

    res.json({
      success: true,
      signal,
      sampleSize: recentVitals.length,
      windowDays: 7,
    });
  } catch (err) {
    console.error('Error generating AI signal:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/vitals - Create new vitals reading with AI analysis
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const {
      bloodPressure,
      heartRate,
      temperature,
      oxygenLevel,
      bloodSugar,
      weight,
      symptoms,
      adherenceEvents,
      hydration,
      notes,
      source,
      deviceName,
    } = req.body;

    const latestVitals = await Vitals.findOne({ user: userId }).sort({ createdAt: -1 });

    const hasField = (field) => Object.prototype.hasOwnProperty.call(req.body, field);

    // Validate required fields
    const hasPrimaryReading = [
      heartRate,
      bloodPressure,
      temperature,
      oxygenLevel,
      bloodSugar,
      weight,
      hydration,
      Array.isArray(symptoms) ? symptoms.length : 0,
      Array.isArray(adherenceEvents) ? adherenceEvents.length : 0,
    ].some((value) => Boolean(value));

    if (!hasPrimaryReading) {
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

    const normalizedBloodSugar = normalizeBloodSugar(bloodSugar);
    const normalizedAdherenceEvents = normalizeAdherenceEvents(adherenceEvents);

    const mergedBloodPressure = hasField('bloodPressure')
      ? (Object.keys(bpData).length > 0 ? bpData : undefined)
      : latestVitals?.bloodPressure;

    const mergedHeartRate = hasField('heartRate') ? heartRate : latestVitals?.heartRate;
    const mergedTemperature = hasField('temperature') ? temperature : latestVitals?.temperature;
    const mergedOxygenLevel = hasField('oxygenLevel') ? oxygenLevel : latestVitals?.oxygenLevel;
    const mergedBloodSugar = hasField('bloodSugar') ? normalizedBloodSugar : latestVitals?.bloodSugar;
    const mergedWeight = hasField('weight') ? weight : latestVitals?.weight;
    const mergedHydration = hasField('hydration') ? hydration : latestVitals?.hydration;
    const mergedSymptoms = hasField('symptoms') ? (symptoms || []) : (latestVitals?.symptoms || []);
    const mergedAdherenceEvents = hasField('adherenceEvents') ? normalizedAdherenceEvents : (latestVitals?.adherenceEvents || []);
    const mergedNotes = hasField('notes') ? notes : latestVitals?.notes;

    const vitals = new Vitals({
      user: userId,
      bloodPressure: mergedBloodPressure,
      heartRate: mergedHeartRate,
      temperature: mergedTemperature,
      oxygenLevel: mergedOxygenLevel,
      bloodSugar: mergedBloodSugar,
      weight: mergedWeight,
      symptoms: mergedSymptoms,
      adherenceEvents: mergedAdherenceEvents,
      hydration: mergedHydration,
      notes: mergedNotes,
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
            glucose: vitals.bloodSugar?.value,
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

      const avgBloodSugar = vitals
        .filter(v => v.bloodSugar && typeof v.bloodSugar.value === 'number')
        .reduce((sum, v) => sum + v.bloodSugar.value, 0) / vitals.filter(v => v.bloodSugar && typeof v.bloodSugar.value === 'number').length;

      const adherenceSummary = vitals.reduce((acc, v) => {
        (v.adherenceEvents || []).forEach((event) => {
          acc.total += 1;
          if (event.status === 'taken') acc.taken += 1;
          if (event.status === 'missed') acc.missed += 1;
        });
        return acc;
      }, { total: 0, taken: 0, missed: 0 });

      summary.averages = {
        heartRate: avgHeartRate || null,
        oxygenLevel: avgOxygen || null,
        temperature: avgTemp || null,
        bloodSugar: avgBloodSugar || null,
        adherence: adherenceSummary,
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
    const allowedFields = [
      'bloodPressure',
      'heartRate',
      'temperature',
      'oxygenLevel',
      'bloodSugar',
      'weight',
      'symptoms',
      'adherenceEvents',
      'hydration',
      'notes',
    ];
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        if (field === 'bloodSugar') {
          vitals[field] = normalizeBloodSugar(updateData[field]);
          return;
        }

        if (field === 'adherenceEvents') {
          vitals[field] = normalizeAdherenceEvents(updateData[field]);
          return;
        }

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
