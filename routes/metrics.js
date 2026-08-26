const express = require('express');
const router = express.Router();
const Vitals = require('../models/Vitals');
const Medication = require('../models/UserMedication');
const HealthAlert = require('../models/HealthAlert');
const HealthAssessment = require('../models/HealthAssessment');
const Consultation = require('../models/Consultations');
const auth = require('../middleware/auth');

const buildNotExpiredFilter = (now = new Date()) => ({
  $or: [
    { endDate: { $exists: false } },
    { endDate: null },
    { endDate: { $gt: now } },
  ],
});

const isSameDay = (value, now = new Date()) => {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toDateString() === now.toDateString();
};

const isDoseTakenToday = (dose, now = new Date()) => Boolean(dose?.taken && isSameDay(dose?.takenAt, now));

const isDoseSkippedToday = (dose, now = new Date()) => isSameDay(dose?.skippedAt, now);

const getDoseEffectiveDate = (dose, now = new Date()) => {
  const snoozedUntil = dose?.snoozedUntil ? new Date(dose.snoozedUntil) : null;
  if (snoozedUntil && !Number.isNaN(snoozedUntil.getTime()) && snoozedUntil > now && snoozedUntil.toDateString() === now.toDateString()) {
    return snoozedUntil;
  }

  const [hours = '00', minutes = '00'] = String(dose?.time || '00:00').split(':');
  const doseDate = new Date(now);
  doseDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  return doseDate;
};

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const mapMoodScore = (mood = '') => {
  const m = String(mood || '').toLowerCase();
  if (!m) return null;
  if (m.includes('excellent') || m.includes('great') || m.includes('happy')) return 90;
  if (m.includes('good') || m.includes('ok')) return 75;
  if (m.includes('fair') || m.includes('moderate')) return 60;
  if (m.includes('bad') || m.includes('sad') || m.includes('anxious')) return 35;
  if (m.includes('poor') || m.includes('terrible')) return 20;
  return 55;
};

const mapSleepScore = (sleepLevel = '') => {
  const s = String(sleepLevel || '').toLowerCase();
  if (!s) return null;
  if (s.includes('excellent') || s.includes('great')) return 90;
  if (s.includes('good')) return 78;
  if (s.includes('fair') || s.includes('moderate') || s.includes('ok')) return 58;
  if (s.includes('poor') || s.includes('bad') || s.includes('insomniac')) return 25;
  return 55;
};

const mapSmokeScore = (smokeLevel = '') => {
  const s = String(smokeLevel || '').toLowerCase();
  if (!s) return null;
  if (s.includes('never') || s.includes('no')) return 95;
  if (s.includes('rare')) return 70;
  if (s.includes('sometimes') || s.includes('occasion')) return 50;
  if (s.includes('often') || s.includes('daily') || s.includes('yes')) return 20;
  return 60;
};

const mapHeartRateScore = (heartRate) => {
  if (typeof heartRate !== 'number') return null;
  if (heartRate >= 60 && heartRate <= 100) return 90;
  if (heartRate >= 50 && heartRate <= 110) return 70;
  return 40;
};

const mapTemperatureScore = (temperature) => {
  if (typeof temperature !== 'number') return null;
  if (temperature >= 97 && temperature <= 99.5) return 90;
  if ((temperature >= 95 && temperature < 97) || (temperature > 99.5 && temperature <= 100.4)) return 65;
  return 40;
};

const mapOxygenScore = (oxygenLevel) => {
  if (typeof oxygenLevel !== 'number') return null;
  if (oxygenLevel >= 95) return 90;
  if (oxygenLevel >= 92) return 65;
  return 35;
};

const mapBloodPressureScore = (bloodPressure) => {
  const raw = bloodPressure?.raw || '';
  const parts = String(raw).split('/').map((value) => parseInt(value, 10));
  const [systolic, diastolic] = parts;
  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) return null;
  if (systolic < 120 && diastolic < 80) return 90;
  if (systolic < 130 && diastolic < 85) return 75;
  if (systolic < 140 && diastolic < 90) return 55;
  return 35;
};

const scoreBand = (score) => {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Fair';
  if (score >= 40) return 'Needs Work';
  return 'Poor';
};

const avg = (items) => {
  const valid = items.filter((value) => typeof value === 'number');
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
};

const hasNumericValue = (value) => typeof value === 'number' && !Number.isNaN(value);

const computeHealthScore = ({ latestVitals, latestAssessment, medicationSummary, alertsSummary, consultationSummary, weekReadings }) => {
  const vitalScore = avg([
    mapHeartRateScore(latestVitals?.heartRate),
    mapTemperatureScore(latestVitals?.temperature),
    mapOxygenScore(latestVitals?.oxygenLevel),
    mapBloodPressureScore(latestVitals?.bloodPressure),
  ]);

  const lifestyleScore = avg([
    typeof latestAssessment?.fitnessLevel === 'number' ? clamp((latestAssessment.fitnessLevel / 10) * 100) : null,
    mapSleepScore(latestAssessment?.sleepLevel),
    mapMoodScore(latestAssessment?.mood),
    mapSmokeScore(latestAssessment?.smokeLevel),
  ]);

  const medicationScore = medicationSummary?.today?.scheduled > 0
    ? clamp(medicationSummary.today.adherence)
    : null;

  const alertPenalty = clamp((alertsSummary?.unread || 0) * 3 + (alertsSummary?.critical || 0) * 10, 0, 40);
  const alertScore = 100 - alertPenalty;

  const engagementScore = avg([
    weekReadings > 0 ? clamp(40 + Math.min(weekReadings, 7) * 8) : null,
    consultationSummary?.completedLast90Days > 0 ? clamp(60 + Math.min(consultationSummary.completedLast90Days, 5) * 8) : null,
  ]);

  const weightedTotal =
    (typeof vitalScore === 'number' ? vitalScore * 0.35 : 0) +
    (typeof lifestyleScore === 'number' ? lifestyleScore * 0.25 : 0) +
    (typeof medicationScore === 'number' ? medicationScore * 0.20 : 0) +
    (typeof alertScore === 'number' ? alertScore * 0.15 : 0) +
    (typeof engagementScore === 'number' ? engagementScore * 0.05 : 0);

  const availableWeight =
    (typeof vitalScore === 'number' ? 0.35 : 0) +
    (typeof lifestyleScore === 'number' ? 0.25 : 0) +
    (typeof medicationScore === 'number' ? 0.20 : 0) +
    (typeof alertScore === 'number' ? 0.15 : 0) +
    (typeof engagementScore === 'number' ? 0.05 : 0);

  const total = availableWeight > 0 ? Math.round(clamp(weightedTotal / availableWeight)) : 0;

  return {
    total,
    label: scoreBand(total),
    components: {
      vitals: vitalScore != null ? Math.round(vitalScore) : null,
      lifestyle: lifestyleScore != null ? Math.round(lifestyleScore) : null,
      medicationAdherence: medicationScore != null ? Math.round(medicationScore) : null,
      alerts: alertScore != null ? Math.round(alertScore) : null,
      engagement: engagementScore != null ? Math.round(engagementScore) : null,
    },
    methodology: 'Composite of vitals, lifestyle, medication adherence, alerts, and engagement. Higher is better.',
  };
};

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
          bloodSugar: hasNumericValue(v.bloodSugar?.value) ? {
            value: v.bloodSugar.value,
            unit: v.bloodSugar.unit,
            readingType: v.bloodSugar.readingType,
          } : null,
          weight: v.weight,
          adherenceEventsCount: Array.isArray(v.adherenceEvents) ? v.adherenceEvents.length : 0,
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
          if (isDoseTakenToday(dose, now)) {
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
            bloodSugar: hasNumericValue(latestVitals.bloodSugar?.value) ? {
              value: latestVitals.bloodSugar.value,
              unit: latestVitals.bloodSugar.unit,
              readingType: latestVitals.bloodSugar.readingType,
            } : null,
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
    const validReadings = vitals.filter(v => (
      hasNumericValue(v.heartRate) ||
      Boolean(v.bloodPressure) ||
      hasNumericValue(v.temperature) ||
      hasNumericValue(v.oxygenLevel) ||
      hasNumericValue(v.weight) ||
      hasNumericValue(v.bloodSugar?.value)
    ));
    
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
      bloodSugar: {
        readings: validReadings
          .filter(v => hasNumericValue(v.bloodSugar?.value))
          .map(v => ({
            value: v.bloodSugar.value,
            unit: v.bloodSugar.unit || 'mg/dL',
            readingType: v.bloodSugar.readingType || 'other',
            measuredAt: v.bloodSugar.measuredAt || v.createdAt,
          })),
        average: (() => {
          const sugarReadings = validReadings
            .filter(v => hasNumericValue(v.bloodSugar?.value))
            .map(v => v.bloodSugar.value);
          if (!sugarReadings.length) return null;
          return Math.round(sugarReadings.reduce((sum, reading) => sum + reading, 0) / sugarReadings.length);
        })(),
      },
      adherence: {
        totalEvents: validReadings.reduce((sum, v) => sum + ((v.adherenceEvents || []).length), 0),
        takenEvents: validReadings.reduce((sum, v) => sum + ((v.adherenceEvents || []).filter((event) => event.status === 'taken').length), 0),
        missedEvents: validReadings.reduce((sum, v) => sum + ((v.adherenceEvents || []).filter((event) => event.status === 'missed').length), 0),
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
        bloodSugar: v.bloodSugar,
        weight: v.weight,
        adherenceEvents: v.adherenceEvents || [],
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
          const doseDate = getDoseEffectiveDate(dose, now);

          scheduled++;
          totalScheduledToday++;

          if (isDoseTakenToday(dose, now)) {
            taken++;
            totalTakenToday++;
          } else if (!isDoseSkippedToday(dose, now) && doseDate < now) {
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
          skippedAt: dose.skippedAt,
          snoozedUntil: dose.snoozedUntil,
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

    const medications = await Medication.find({
      user: userId,
      isActive: true,
      ...buildNotExpiredFilter(now),
    });

    let totalScheduledToday = 0;
    let totalTakenToday = 0;
    medications.forEach((med) => {
      (med.scheduledTimes || []).forEach((dose) => {
        totalScheduledToday++;
        if (isDoseTakenToday(dose, now)) totalTakenToday++;
      });
    });

    const medicationSummary = {
      today: {
        scheduled: totalScheduledToday,
        taken: totalTakenToday,
        adherence: totalScheduledToday > 0 ? Math.round((totalTakenToday / totalScheduledToday) * 100) : 0,
      },
    };

    // Alerts
    const unreadAlertsCount = await HealthAlert.countDocuments({
      user: userId,
      read: false,
    });

    const criticalAlertsCount = await HealthAlert.countDocuments({
      user: userId,
      read: false,
      severity: 'critical',
    });

    const latestAssessment = await HealthAssessment.findOne({ user: userId }).sort({ createdAt: -1 });

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [upcomingAppointments, completedLast90Days] = await Promise.all([
      Consultation.countDocuments({
        patient: userId,
        status: { $in: ['scheduled', 'ongoing'] },
      }),
      Consultation.countDocuments({
        patient: userId,
        status: 'completed',
        appointmentTime: { $gte: ninetyDaysAgo },
      }),
    ]);

    const healthScore = computeHealthScore({
      latestVitals,
      latestAssessment,
      medicationSummary,
      alertsSummary: { unread: unreadAlertsCount, critical: criticalAlertsCount },
      consultationSummary: { upcoming: upcomingAppointments, completedLast90Days },
      weekReadings: weekVitals.length,
    });

    res.json({
      success: true,
      summary: {
        healthScore,
        lastUpdated: latestVitals?.createdAt || null,
        vitals: latestVitals ? {
          bloodPressure: latestVitals.bloodPressure?.raw || (latestVitals.bloodPressure?.systolic && latestVitals.bloodPressure?.diastolic ? `${latestVitals.bloodPressure.systolic}/${latestVitals.bloodPressure.diastolic}` : null),
          heartRate: latestVitals.heartRate,
          heartRateTrend: hrTrend,
          temperature: latestVitals.temperature,
          oxygenLevel: latestVitals.oxygenLevel,
          weight: latestVitals.weight,
        } : null,
        latestAssessment: latestAssessment ? {
          score: latestAssessment.score,
          fitnessLevel: latestAssessment.fitnessLevel,
          sleepLevel: latestAssessment.sleepLevel,
          mood: latestAssessment.mood,
          smokeLevel: latestAssessment.smokeLevel,
          updatedAt: latestAssessment.updatedAt,
        } : null,
        medicationCount: activeMeds,
        medication: medicationSummary.today,
        unreadAlerts: unreadAlertsCount,
        criticalAlerts: criticalAlertsCount,
        appointments: {
          upcoming: upcomingAppointments,
          completedLast90Days,
        },
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
