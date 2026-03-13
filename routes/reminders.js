const express = require('express');
const router = express.Router();
const Medication = require('../models/Medication');
const HealthAlert = require('../models/HealthAlert');
const Vitals = require('../models/Vitals');
const Profile = require('../models/Profile');
const auth = require('../middleware/auth');

const buildNotExpiredFilter = (now = new Date()) => ({
  $or: [
    { endDate: { $exists: false } },
    { endDate: null },
    { endDate: { $gt: now } },
  ],
});

/**
 * REMINDERS API
 * Manages medication reminders, health check reminders, and alert-based reminders
 */

// GET /api/reminders - Get all active reminders for current user
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const profile = await Profile.findOne({ user: userId }).select('notifications').lean();
    const remindersEnabled = profile?.notifications?.reminders !== false;
    if (!remindersEnabled) {
      return res.json({
        success: true,
        reminders: [],
        count: 0,
        metadata: { medicationReminders: 0, alertReminders: 0 },
      });
    }
    const reminders = [];
    const now = new Date();

    // 1. Get active medications with scheduled times
    const medications = await Medication.find({
      user: userId,
      isActive: true,
      remindMe: true,
      ...buildNotExpiredFilter(now),
    });

    const currentHour = now.getHours().toString().padStart(2, '0');
    const currentMinute = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${currentHour}:${currentMinute}`;

    medications.forEach(med => {
      if (med.scheduledTimes && med.scheduledTimes.length > 0) {
        med.scheduledTimes.forEach((dose, idx) => {
          const isUpcoming = dose.time > currentTime || (dose.time === currentTime);
          const alreadyTaken = dose.taken && new Date(dose.takenAt).toDateString() === now.toDateString();
          
          if (isUpcoming && !alreadyTaken) {
            reminders.push({
              id: `med-${med._id}-${idx}`,
              medicationId: med._id,
              type: 'medication',
              title: `Take ${med.name}`,
              message: `${med.dosage} • ${med.frequency}`,
              time: dose.time,
              priority: 'medium',
              icon: '💊',
              metadata: {
                medicationName: med.name,
                dosage: med.dosage,
                frequency: med.frequency,
                prescribedBy: med.prescribedBy,
                reason: med.reason,
                timeIndex: idx,
              },
              createdAt: med.createdAt,
            });
          }
        });
      }
    });

    // 2. Get unread health alerts as reminders
    const alerts = await HealthAlert.find({
      user: userId,
      read: false,
      severity: { $in: ['warning', 'critical'] },
    }).sort({ createdAt: -1 });

    alerts.forEach(alert => {
      reminders.push({
        id: `alert-${alert._id}`,
        alertId: alert._id,
        type: 'alert',
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        priority: alert.severity === 'critical' ? 'high' : 'medium',
        icon: alert.severity === 'critical' ? '🚨' : '⚠️',
        metadata: {
          alertType: alert.type,
          data: alert.data,
        },
        createdAt: alert.createdAt,
      });
    });

    // 3. Sort reminders by time/priority
    reminders.sort((a, b) => {
      // Prioritize by priority first
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      // Then by time for medications
      if (a.time && b.time) {
        return a.time.localeCompare(b.time);
      }
      // Then by creation date
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json({
      success: true,
      reminders,
      count: reminders.length,
      metadata: {
        medicationReminders: reminders.filter(r => r.type === 'medication').length,
        alertReminders: reminders.filter(r => r.type === 'alert').length,
      },
    });
  } catch (error) {
    console.error('Error fetching reminders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reminders',
      error: error.message,
    });
  }
});

// GET /api/reminders/upcoming - Get reminders due within next N minutes
router.get('/upcoming', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const profile = await Profile.findOne({ user: userId }).select('notifications').lean();
    const remindersEnabled = profile?.notifications?.reminders !== false;
    if (!remindersEnabled) {
      return res.json({ success: true, reminders: [], count: 0 });
    }
    const { minutes = 30 } = req.query;
    const minutesAhead = parseInt(minutes);

    const upcomingReminders = [];
    const now = new Date();
    const futureTime = new Date(now.getTime() + minutesAhead * 60000);

    const medications = await Medication.find({
      user: userId,
      isActive: true,
      remindMe: true,
      ...buildNotExpiredFilter(now),
    });

    medications.forEach(med => {
      if (med.scheduledTimes && med.scheduledTimes.length > 0) {
        med.scheduledTimes.forEach((dose, idx) => {
          const todayDate = now.toDateString();
          const timeStr = dose.time.split(':');
          const doseDate = new Date(now);
          doseDate.setHours(parseInt(timeStr[0]), parseInt(timeStr[1]), 0, 0);

          // Check if dose is today and upcoming
          if (doseDate >= now && doseDate <= futureTime) {
            const alreadyTaken = dose.taken && new Date(dose.takenAt).toDateString() === todayDate;
            if (!alreadyTaken) {
              upcomingReminders.push({
                id: `med-${med._id}-${idx}`,
                medicationId: med._id,
                type: 'medication',
                title: `Take ${med.name}`,
                message: `${med.dosage} • Due at ${dose.time}`,
                dueTime: doseDate,
                minutesUntilDue: Math.round((doseDate - now) / 60000),
                timeIndex: idx,
              });
            }
          }
        });
      }
    });

    // Sort by minutes until due
    upcomingReminders.sort((a, b) => a.minutesUntilDue - b.minutesUntilDue);

    res.json({
      success: true,
      reminders: upcomingReminders,
      count: upcomingReminders.length,
    });
  } catch (error) {
    console.error('Error fetching upcoming reminders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching upcoming reminders',
      error: error.message,
    });
  }
});

// GET /api/reminders/today - Get all reminders for today
router.get('/today', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const profile = await Profile.findOne({ user: userId }).select('notifications').lean();
    const remindersEnabled = profile?.notifications?.reminders !== false;
    if (!remindersEnabled) {
      return res.json({
        success: true,
        reminders: [],
        count: 0,
        summary: { totalScheduled: 0, totalTaken: 0 },
      });
    }
    const todayReminders = [];
    const now = new Date();

    // Get today's medications
    const medications = await Medication.find({
      user: userId,
      isActive: true,
      remindMe: true,
      ...buildNotExpiredFilter(now),
    });

    medications.forEach(med => {
      if (med.scheduledTimes && med.scheduledTimes.length > 0) {
        const takenToday = med.scheduledTimes.filter(dose => {
          return dose.taken && new Date(dose.takenAt).toDateString() === now.toDateString();
        });

        const scheduledCount = med.scheduledTimes.length;
        const takenCount = takenToday.length;

        todayReminders.push({
          id: `med-${med._id}`,
          medicationId: med._id,
          type: 'medication',
          name: med.name,
          dosage: med.dosage,
          frequency: med.frequency,
          scheduledTimes: med.scheduledTimes,
          takenCount,
          scheduledCount,
          adherence: Math.round((takenCount / scheduledCount) * 100),
          reason: med.reason,
          prescribedBy: med.prescribedBy,
        });
      }
    });

    res.json({
      success: true,
      reminders: todayReminders,
      count: todayReminders.length,
      summary: {
        totalScheduled: todayReminders.reduce((sum, r) => sum + r.scheduledCount, 0),
        totalTaken: todayReminders.reduce((sum, r) => sum + r.takenCount, 0),
      },
    });
  } catch (error) {
    console.error('Error fetching today reminders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching today reminders',
      error: error.message,
    });
  }
});

// POST /api/reminders/mark-taken - Mark a medication reminder as taken
router.post('/mark-taken', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { medicationId, timeIndex } = req.body;

    if (!medicationId || timeIndex === undefined) {
      return res.status(400).json({
        success: false,
        message: 'medicationId and timeIndex are required',
      });
    }

    const medication = await Medication.findOne({
      _id: medicationId,
      user: userId,
      ...buildNotExpiredFilter(new Date()),
    });

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found',
      });
    }

    if (!medication.scheduledTimes[timeIndex]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid time index',
      });
    }

    medication.scheduledTimes[timeIndex].taken = true;
    medication.scheduledTimes[timeIndex].takenAt = new Date();
    await medication.save();

    res.json({
      success: true,
      message: 'Reminder marked as taken',
      medication,
    });
  } catch (error) {
    console.error('Error marking reminder as taken:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking reminder',
      error: error.message,
    });
  }
});

// POST /api/reminders/dismiss - Dismiss a reminder/alert
router.post('/dismiss', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { reminderId, type } = req.body;

    if (!reminderId || !type) {
      return res.status(400).json({
        success: false,
        message: 'reminderId and type are required',
      });
    }

    if (type === 'alert') {
      // Mark alert as read
      const alert = await HealthAlert.findByIdAndUpdate(
        reminderId,
        { read: true },
        { new: true }
      );

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: 'Alert not found',
        });
      }

      return res.json({
        success: true,
        message: 'Alert dismissed',
        alert,
      });
    }

    res.json({
      success: true,
      message: 'Reminder dismissed',
    });
  } catch (error) {
    console.error('Error dismissing reminder:', error);
    res.status(500).json({
      success: false,
      message: 'Error dismissing reminder',
      error: error.message,
    });
  }
});

// GET /api/reminders/statistics - Get reminder statistics
router.get('/statistics', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Get today's medications
    const medications = await Medication.find({
      user: userId,
      isActive: true,
      ...buildNotExpiredFilter(now),
    });

    let totalScheduled = 0;
    let totalTaken = 0;
    let totalMissed = 0;

    medications.forEach(med => {
      if (med.scheduledTimes && med.scheduledTimes.length > 0) {
        med.scheduledTimes.forEach(dose => {
          totalScheduled++;
          if (dose.taken && new Date(dose.takenAt) >= todayStart && new Date(dose.takenAt) < todayEnd) {
            totalTaken++;
          } else if (!dose.taken) {
            const doseTime = dose.time.split(':');
            const doseDate = new Date();
            doseDate.setHours(parseInt(doseTime[0]), parseInt(doseTime[1]), 0, 0);
            if (doseDate < now) {
              totalMissed++;
            }
          }
        });
      }
    });

    const adherencePercentage = totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : 0;

    // Get today's active alerts
    const activeAlerts = await HealthAlert.countDocuments({
      user: userId,
      read: false,
    });

    res.json({
      success: true,
      statistics: {
        today: {
          totalScheduled,
          totalTaken,
          totalMissed,
          adherencePercentage,
        },
        alerts: {
          active: activeAlerts,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching reminder statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message,
    });
  }
});

module.exports = router;
