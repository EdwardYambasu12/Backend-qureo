const express = require('express');
const router = express.Router();
const Vitals = require('../models/Vitals');
const Medication = require('../models/Medication');
const HealthAlert = require('../models/HealthAlert');
const auth = require('../middleware/auth');

const buildNotExpiredFilter = (now = new Date()) => ({
  $or: [
    { endDate: { $exists: false } },
    { endDate: null },
    { endDate: { $gt: now } },
  ],
});

/**
 * METRICS API
 * Fetches real health metrics data from the database for dashboard display
 */

// GET /api/metrics/dashboard - Get all dashboard metrics
router.get('/dashboard', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const now = new Date();

    // Get latest vitals
    const latestVitals = await Vitals.findOne({ user: userId }).sort({ createdAt: -1 });

    // Get today's vitals
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const todayVitals = await Vitals.find({
      user: userId,
      createdAt: { $gte: todayStart, $lt: todayEnd },
    }).sort({ createdAt: -1 });

    // Get vital statistics
    const vitalStats = {
      today: {
        count: todayVitals.length,
        readings: todayVitals.map(v => ({
          time: v.createdAt,
          bloodPressure: v.bloodPressure?.raw || (v.bloodPressure?.systolic && v.bloodPressure?.diastolic ? `${v.bloodPressure.systolic}/${v.bloodPressure.diastolic}` : null),
          heartRate: v.heartRate,
          temperature: v.temperature,
          oxygenLevel: v.oxygenLevel,
          weight: v.weight,
        })),
      },
    };

    // Get active medications count
    const activeMedications = await Medication.countDocuments({
      user: userId,
      isActive: true,
      ...buildNotExpiredFilter(now),
    });

    // Get today's medications adherence
    const allMedications = await Medication.find({
      user: userId,
      isActive: true,
      ...buildNotExpiredFilter(now),
    });

    let totalScheduledToday = 0;
    let totalTakenToday = 0;

    allMedications.forEach(med => {
      if (med.scheduledTimes && med.scheduledTimes.length > 0) {
        med.scheduledTimes.forEach(dose => {
          totalScheduledToday++;
          if (dose.taken && new Date(dose.takenAt) >= todayStart && new Date(dose.takenAt) < todayEnd) {
            totalTakenToday++;
          }
        });
      }
    });

    const medicationAdherence = totalScheduledToday > 0 ? Math.round((totalTakenToday / totalScheduledToday) * 100) : 0;

    // Get unread alerts
    const unreadAlerts = await HealthAlert.countDocuments({
      user: userId,
      read: false,
    });

    const criticalAlerts = await HealthAlert.countDocuments({
      user: userId,
      read: false,
      severity: 'critical',
    });

    res.json({
      success: true,
      metrics: {
        vitals: {
          latest: latestVitals ? {
            time: latestVitals.createdAt,
            bloodPressure: latestVitals.bloodPressure?.raw || (latestVitals.bloodPressure?.systolic && latestVitals.bloodPressure?.diastolic ? `${latestVitals.bloodPressure.systolic}/${latestVitals.bloodPressure.diastolic}` : null),
            heartRate: latestVitals.heartRate,
            temperature: latestVitals.temperature,
            oxygenLevel: latestVitals.oxygenLevel,
            weight: latestVitals.weight,
          } : null,
          today: vitalStats.today,
        },
        medications: {
          active: activeMedications,
          todayAdherence: medicationAdherence,
          todayScheduled: totalScheduledToday,
          todayTaken: totalTakenToday,
          todayMissed: totalScheduledToday - totalTakenToday,
        },
        alerts: {
          unread: unreadAlerts,
          critical: criticalAlerts,
        },
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching metrics',
      error: error.message,
    });
  }
});

// GET /api/metrics/vitals - Get vitals metrics
router.get('/vitals', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { days = 7, limit = 50 } = req.query;

    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days));

    const vitals = await Vitals.find({
      user: userId,
      createdAt: { $gte: daysAgo },
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Calculate statistics
    const validReadings = vitals.filter(v => v.heartRate || v.bloodPressure || v.temperature);
    
    const stats = {
      count: validReadings.length,
      heartRate: {
        readings: validReadings.filter(v => v.heartRate).map(v => v.heartRate),
        average: validReadings.length > 0 
          ? Math.round(validReadings.filter(v => v.heartRate).reduce((sum, v) => sum + v.heartRate, 0) / validReadings.filter(v => v.heartRate).length)
          : null,
      },
      temperature: {
        readings: validReadings.filter(v => v.temperature).map(v => v.temperature),
        average: validReadings.length > 0
          ? (validReadings.filter(v => v.temperature).reduce((sum, v) => sum + v.temperature, 0) / validReadings.filter(v => v.temperature).length).toFixed(1)
          : null,
      },
      bloodPressure: {
        readings: validReadings.filter(v => v.bloodPressure).map(v => ({
          raw: v.bloodPressure?.raw,
          systolic: v.bloodPressure?.systolic,
          diastolic: v.bloodPressure?.diastolic,
        })),
      },
      weight: {
        readings: validReadings.filter(v => v.weight).map(v => v.weight),
        latest: validReadings.find(v => v.weight)?.weight,
      },
      oxygenLevel: {
        readings: validReadings.filter(v => v.oxygenLevel).map(v => v.oxygenLevel),
        average: validReadings.length > 0
          ? Math.round(validReadings.filter(v => v.oxygenLevel).reduce((sum, v) => sum + v.oxygenLevel, 0) / validReadings.filter(v => v.oxygenLevel).length)
          : null,
      },
    };

    res.json({
      success: true,
      vitals: vitals.map(v => ({
        id: v._id,
        time: v.createdAt,
        bloodPressure: v.bloodPressure,
        heartRate: v.heartRate,
        temperature: v.temperature,
        oxygenLevel: v.oxygenLevel,
        weight: v.weight,
        source: v.source,
      })),
      statistics: stats,
      period: {
        days: parseInt(days),
        from: daysAgo,
        to: new Date(),
      },
    });
  } catch (error) {
    console.error('Error fetching vitals metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching vitals metrics',
      error: error.message,
    });
  }
});

// GET /api/metrics/medications - Get medications metrics
router.get('/medications', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const now = new Date();

    const medications = await Medication.find({
      user: userId,
      isActive: true,
      ...buildNotExpiredFilter(now),
    });

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    let totalScheduledToday = 0;
    let totalTakenToday = 0;
    let totalMissedToday = 0;

    const medicationMetrics = medications.map(med => {
      let scheduled = 0;
      let taken = 0;
      let missed = 0;

      if (med.scheduledTimes && med.scheduledTimes.length > 0) {
        med.scheduledTimes.forEach(dose => {
          const doseTime = dose.time.split(':');
          const doseDate = new Date();
          doseDate.setHours(parseInt(doseTime[0]), parseInt(doseTime[1]), 0, 0);

          scheduled++;
          totalScheduledToday++;

          if (dose.taken && new Date(dose.takenAt) >= todayStart && new Date(dose.takenAt) < todayEnd) {
            taken++;
            totalTakenToday++;
          } else if (!dose.taken && doseDate < now) {
            missed++;
            totalMissedToday++;
          }
        });
      }

      return {
        id: med._id,
        name: med.name,
        dosage: med.dosage,
        frequency: med.frequency,
        prescribedBy: med.prescribedBy,
        reason: med.reason,
        startDate: med.startDate,
        endDate: med.endDate,
        remindMe: med.remindMe,
        today: {
          scheduled,
          taken,
          missed,
          adherence: scheduled > 0 ? Math.round((taken / scheduled) * 100) : 0,
        },
        scheduledTimes: med.scheduledTimes.map(dose => ({
          time: dose.time,
          taken: dose.taken,
          takenAt: dose.takenAt,
        })),
      };
    });

    res.json({
      success: true,
      medications: medicationMetrics,
      summary: {
        active: medications.length,
        today: {
          scheduled: totalScheduledToday,
          taken: totalTakenToday,
          missed: totalMissedToday,
          adherence: totalScheduledToday > 0 ? Math.round((totalTakenToday / totalScheduledToday) * 100) : 0,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching medications metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching medications metrics',
      error: error.message,
    });
  }
});

// GET /api/metrics/alerts - Get alert metrics
router.get('/alerts', auth, async (req, res) => {
  try {
    const userId = req.userId;

    const totalAlerts = await HealthAlert.countDocuments({ user: userId });
    const unreadAlerts = await HealthAlert.countDocuments({ user: userId, read: false });
    const criticalAlerts = await HealthAlert.countDocuments({ user: userId, severity: 'critical', read: false });
    const warningAlerts = await HealthAlert.countDocuments({ user: userId, severity: 'warning', read: false });

    // Get alerts by type
    const alerts = await HealthAlert.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(50);

    const alertsByType = {};
    alerts.forEach(alert => {
      if (!alertsByType[alert.type]) {
        alertsByType[alert.type] = { count: 0, unread: 0 };
      }
      alertsByType[alert.type].count++;
      if (!alert.read) {
        alertsByType[alert.type].unread++;
      }
    });

    res.json({
      success: true,
      metrics: {
        total: totalAlerts,
        unread: unreadAlerts,
        critical: criticalAlerts,
        warning: warningAlerts,
        byType: alertsByType,
      },
      recentAlerts: alerts.slice(0, 10).map(a => ({
        id: a._id,
        type: a.type,
        title: a.title,
        severity: a.severity,
        read: a.read,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching alert metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching alert metrics',
      error: error.message,
    });
  }
});

// GET /api/metrics/summary - Get overall health summary metrics
router.get('/summary', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const now = new Date();

    // Get latest vitals
    const latestVitals = await Vitals.findOne({ user: userId }).sort({ createdAt: -1 });

    // Get this week's vitals
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weekVitals = await Vitals.find({
      user: userId,
      createdAt: { $gte: weekAgo },
    });

    // Calculate trends
    const getTrend = (values) => {
      if (values.length < 2) return 'stable';
      const sorted = [...values].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      if (sorted.length > 1) {
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const change = ((last - first) / first) * 100;
        if (change > 5) return 'increasing';
        if (change < -5) return 'decreasing';
      }
      return 'stable';
    };

    const hrTrend = getTrend(weekVitals.filter(v => v.heartRate).map(v => ({ createdAt: v.createdAt, value: v.heartRate })).map(v => v.value));

    // Medications
    const activeMeds = await Medication.countDocuments({
      user: userId,
      isActive: true,
      ...buildNotExpiredFilter(now),
    });

    // Alerts
    const unreadAlertsCount = await HealthAlert.countDocuments({
      user: userId,
      read: false,
    });

    res.json({
      success: true,
      summary: {
        lastUpdated: latestVitals?.createdAt || null,
        vitals: latestVitals ? {
          bloodPressure: latestVitals.bloodPressure?.raw || (latestVitals.bloodPressure?.systolic && latestVitals.bloodPressure?.diastolic ? `${latestVitals.bloodPressure.systolic}/${latestVitals.bloodPressure.diastolic}` : null),
          heartRate: latestVitals.heartRate,
          heartRateTrend: hrTrend,
          temperature: latestVitals.temperature,
          oxygenLevel: latestVitals.oxygenLevel,
          weight: latestVitals.weight,
        } : null,
        medicationCount: activeMeds,
        unreadAlerts: unreadAlertsCount,
        weekReadings: weekVitals.length,
      },
    });
  } catch (error) {
    console.error('Error fetching health summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching health summary',
      error: error.message,
    });
  }
});

module.exports = router;
