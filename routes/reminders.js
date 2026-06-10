const express = require('express');
const router = express.Router();
const Medication = require('../models/Medication');
const HealthAlert = require('../models/HealthAlert');
const Vitals = require('../models/Vitals');
const Consultation = require('../models/Consultations');
const Booking = require('../models/BookingLabtest');
const Profile = require('../models/Profile');
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

const getDoseScheduledDate = (time, baseDate = new Date()) => {
  const [hours = '00', minutes = '00'] = String(time || '00:00').split(':');
  const doseDate = new Date(baseDate);
  doseDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  return doseDate;
};

const getDoseEffectiveDate = (dose, now = new Date()) => {
  const snoozedUntil = dose?.snoozedUntil ? new Date(dose.snoozedUntil) : null;
  if (snoozedUntil && !Number.isNaN(snoozedUntil.getTime()) && snoozedUntil > now && isSameDay(snoozedUntil, now)) {
    return snoozedUntil;
  }

  return getDoseScheduledDate(dose?.time, now);
};

const formatTime = (date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

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
          const effectiveDate = getDoseEffectiveDate(dose, now);
          const effectiveTime = formatTime(effectiveDate);
          const isUpcoming = effectiveTime > currentTime || effectiveTime === currentTime;
          const alreadyTaken = isDoseTakenToday(dose, now);
          const skippedToday = isDoseSkippedToday(dose, now);
          
          if (isUpcoming && !alreadyTaken && !skippedToday) {
            reminders.push({
              id: `med-${med._id}-${idx}`,
              medicationId: med._id,
              type: 'medication',
              title: `Take ${med.name}`,
              message: `${med.dosage} • ${med.frequency}`,
              time: effectiveTime,
              priority: 'medium',
              icon: '💊',
              metadata: {
                medicationName: med.name,
                dosage: med.dosage,
                frequency: med.frequency,
                prescribedBy: med.prescribedBy,
                reason: med.reason,
                timeIndex: idx,
                scheduledTime: dose.time,
                snoozedUntil: dose.snoozedUntil || null,
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

    // 3. Appointment follow-up reminders
    const upcomingConsultations = await Consultation.find({
      patient: userId,
      status: { $in: ['scheduled', 'confirmed', 'pending'] },
      appointmentTime: { $gte: now },
    })
      .sort({ appointmentTime: 1 })
      .limit(3)
      .lean();

    upcomingConsultations.forEach((consultation) => {
      const appointmentDate = new Date(consultation.appointmentTime);
      const minutesUntil = Math.round((appointmentDate.getTime() - now.getTime()) / 60000);
      reminders.push({
        id: `appointment-${consultation._id}`,
        type: 'appointment',
        title: 'Upcoming follow-up appointment',
        message: `${consultation.mode || 'Consultation'} on ${appointmentDate.toLocaleString()}`,
        time: formatTime(appointmentDate),
        priority: minutesUntil <= 24 * 60 ? 'high' : 'medium',
        icon: '📅',
        metadata: {
          consultationId: consultation._id,
          status: consultation.status,
          appointmentTime: consultation.appointmentTime,
          doctorId: consultation.doctor,
          roomId: consultation.roomId,
        },
        createdAt: consultation.updatedAt || consultation.createdAt || consultation.appointmentTime,
      });
    });

    // 4. Lab test follow-up reminders
    const activeLabBookings = await Booking.find({
      user: userId,
      status: { $in: ['sample_collected', 'in_progress', 'pending'] },
    })
      .sort({ updatedAt: -1 })
      .limit(3)
      .lean();

    activeLabBookings.forEach((booking) => {
      const testCount = Array.isArray(booking.tests) ? booking.tests.length : 0;
      reminders.push({
        id: `lab-${booking._id}`,
        type: 'lab',
        title: 'Lab test follow-up',
        message: `${testCount} test${testCount === 1 ? '' : 's'} currently ${booking.status.replace('_', ' ')}`,
        priority: booking.status === 'in_progress' ? 'medium' : 'low',
        icon: '🧪',
        metadata: {
          bookingId: booking._id,
          status: booking.status,
          preferredDate: booking.preferredDate,
          testCount,
        },
        createdAt: booking.updatedAt || booking.createdAt,
      });
    });

    // 5. Vitals check reminders (BP + blood sugar)
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const todaysVitals = await Vitals.find({
      user: userId,
      createdAt: { $gte: dayStart, $lte: dayEnd },
    })
      .select('bloodPressure bloodSugar createdAt')
      .lean();

    const bpLoggedToday = todaysVitals.some((v) => Boolean(v?.bloodPressure?.raw || (v?.bloodPressure?.systolic && v?.bloodPressure?.diastolic)));
    const bloodSugarLoggedToday = todaysVitals.some((v) => typeof v?.bloodSugar?.value === 'number');

    if (!bpLoggedToday) {
      reminders.push({
        id: `vitals-bp-${dayStart.toISOString().slice(0, 10)}`,
        type: 'vitals',
        title: 'Blood pressure check due',
        message: 'Log your BP reading today to keep your trend accurate.',
        priority: 'medium',
        icon: '🫀',
        metadata: {
          vitalType: 'bloodPressure',
        },
        createdAt: now,
      });
    }

    if (!bloodSugarLoggedToday) {
      reminders.push({
        id: `vitals-sugar-${dayStart.toISOString().slice(0, 10)}`,
        type: 'blood_sugar',
        title: 'Blood sugar check due',
        message: 'Add a blood sugar reading to track your glucose trend.',
        priority: 'medium',
        icon: '🩸',
        metadata: {
          vitalType: 'bloodSugar',
        },
        createdAt: now,
      });
    }

    // 6. Sort reminders by time/priority
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
        appointmentReminders: reminders.filter(r => r.type === 'appointment').length,
        labReminders: reminders.filter(r => r.type === 'lab').length,
        vitalsReminders: reminders.filter(r => r.type === 'vitals' || r.type === 'blood_sugar').length,
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
          const doseDate = getDoseEffectiveDate(dose, now);

          // Check if dose is today and upcoming
          if (doseDate >= now && doseDate <= futureTime) {
            const alreadyTaken = isDoseTakenToday(dose, now);
            const skippedToday = isDoseSkippedToday(dose, now);
            if (!alreadyTaken && !skippedToday) {
              upcomingReminders.push({
                id: `med-${med._id}-${idx}`,
                medicationId: med._id,
                type: 'medication',
                title: `Take ${med.name}`,
                message: `${med.dosage} • Due at ${formatTime(doseDate)}`,
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
    const additionalReminders = [];
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

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
          return isDoseTakenToday(dose, now);
        });
        const skippedToday = med.scheduledTimes.filter(dose => isDoseSkippedToday(dose, now));

        const scheduledCount = med.scheduledTimes.length;
        const takenCount = takenToday.length;
        const skippedCount = skippedToday.length;

        todayReminders.push({
          id: `med-${med._id}`,
          medicationId: med._id,
          type: 'medication',
          name: med.name,
          dosage: med.dosage,
          frequency: med.frequency,
          scheduledTimes: med.scheduledTimes.map((dose) => ({
            time: dose.time,
            taken: isDoseTakenToday(dose, now),
            takenAt: dose.takenAt || null,
            skippedToday: isDoseSkippedToday(dose, now),
            skippedAt: dose.skippedAt || null,
            snoozedUntil: dose.snoozedUntil || null,
            effectiveTime: formatTime(getDoseEffectiveDate(dose, now)),
          })),
          takenCount,
          scheduledCount,
          skippedCount,
          adherence: Math.round((takenCount / scheduledCount) * 100),
          reason: med.reason,
          prescribedBy: med.prescribedBy,
        });
      }
    });

    // Today's consultations as appointment reminders
    const todaysConsultations = await Consultation.find({
      patient: userId,
      status: { $in: ['scheduled', 'confirmed', 'pending', 'ongoing'] },
      appointmentTime: { $gte: dayStart, $lte: dayEnd },
    })
      .sort({ appointmentTime: 1 })
      .limit(5)
      .lean();

    todaysConsultations.forEach((consultation) => {
      const appointmentDate = new Date(consultation.appointmentTime);
      additionalReminders.push({
        id: `appointment-${consultation._id}`,
        type: 'appointment',
        title: 'Appointment today',
        message: `${consultation.mode || 'Consultation'} at ${appointmentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        time: formatTime(appointmentDate),
        priority: consultation.status === 'ongoing' ? 'high' : 'medium',
        metadata: {
          consultationId: consultation._id,
          status: consultation.status,
          appointmentTime: consultation.appointmentTime,
        },
      });
    });

    // Active lab bookings as follow-up reminders
    const activeLabBookings = await Booking.find({
      user: userId,
      status: { $in: ['sample_collected', 'in_progress', 'pending'] },
    })
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean();

    activeLabBookings.forEach((booking) => {
      const testCount = Array.isArray(booking.tests) ? booking.tests.length : 0;
      additionalReminders.push({
        id: `lab-${booking._id}`,
        type: 'lab',
        title: 'Lab follow-up pending',
        message: `${testCount} test${testCount === 1 ? '' : 's'} status: ${String(booking.status || '').replace('_', ' ')}`,
        priority: booking.status === 'in_progress' ? 'medium' : 'low',
        metadata: {
          bookingId: booking._id,
          status: booking.status,
          testCount,
        },
      });
    });

    // Check if BP and blood sugar are logged today
    const todaysVitals = await Vitals.find({
      user: userId,
      createdAt: { $gte: dayStart, $lte: dayEnd },
    })
      .select('bloodPressure bloodSugar')
      .lean();

    const bpLoggedToday = todaysVitals.some((v) => Boolean(v?.bloodPressure?.raw || (v?.bloodPressure?.systolic && v?.bloodPressure?.diastolic)));
    const bloodSugarLoggedToday = todaysVitals.some((v) => typeof v?.bloodSugar?.value === 'number');

    if (!bpLoggedToday) {
      additionalReminders.push({
        id: `vitals-bp-${dayStart.toISOString().slice(0, 10)}`,
        type: 'vitals',
        title: 'Blood pressure check due',
        message: 'No blood pressure reading logged yet today.',
        priority: 'medium',
        metadata: { vitalType: 'bloodPressure' },
      });
    }

    if (!bloodSugarLoggedToday) {
      additionalReminders.push({
        id: `vitals-sugar-${dayStart.toISOString().slice(0, 10)}`,
        type: 'blood_sugar',
        title: 'Blood sugar check due',
        message: 'No blood sugar reading logged yet today.',
        priority: 'medium',
        metadata: { vitalType: 'bloodSugar' },
      });
    }

    res.json({
      success: true,
      reminders: todayReminders,
      count: todayReminders.length,
      additionalReminders,
      totalCount: todayReminders.length + additionalReminders.length,
      summary: {
        totalScheduled: todayReminders.reduce((sum, r) => sum + r.scheduledCount, 0),
        totalTaken: todayReminders.reduce((sum, r) => sum + r.takenCount, 0),
        appointmentsToday: additionalReminders.filter((r) => r.type === 'appointment').length,
        activeLabFollowUps: additionalReminders.filter((r) => r.type === 'lab').length,
        vitalsChecksDue: additionalReminders.filter((r) => r.type === 'vitals' || r.type === 'blood_sugar').length,
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
    medication.scheduledTimes[timeIndex].skippedAt = null;
    medication.scheduledTimes[timeIndex].snoozedUntil = null;
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

// POST /api/reminders/skip - Skip a medication reminder for today
router.post('/skip', auth, async (req, res) => {
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

    medication.scheduledTimes[timeIndex].taken = false;
    medication.scheduledTimes[timeIndex].takenAt = null;
    medication.scheduledTimes[timeIndex].skippedAt = new Date();
    medication.scheduledTimes[timeIndex].snoozedUntil = null;
    await medication.save();

    res.json({
      success: true,
      message: 'Reminder skipped for today',
      medication,
    });
  } catch (error) {
    console.error('Error skipping reminder:', error);
    res.status(500).json({
      success: false,
      message: 'Error skipping reminder',
      error: error.message,
    });
  }
});

// POST /api/reminders/snooze - Snooze a medication reminder for a few minutes
router.post('/snooze', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { medicationId, timeIndex, minutes = 15 } = req.body;
    const now = new Date();
    const snoozeMinutes = Math.min(Math.max(parseInt(minutes, 10) || 15, 5), 180);
    const snoozedUntil = new Date(now.getTime() + snoozeMinutes * 60000);

    if (snoozedUntil.toDateString() !== now.toDateString()) {
      return res.status(400).json({
        success: false,
        message: 'Snooze must stay within the same day',
      });
    }

    if (!medicationId || timeIndex === undefined) {
      return res.status(400).json({
        success: false,
        message: 'medicationId and timeIndex are required',
      });
    }

    const medication = await Medication.findOne({
      _id: medicationId,
      user: userId,
      ...buildNotExpiredFilter(now),
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

    medication.scheduledTimes[timeIndex].skippedAt = null;
    medication.scheduledTimes[timeIndex].snoozedUntil = snoozedUntil;
    await medication.save();

    res.json({
      success: true,
      message: `Reminder snoozed for ${snoozeMinutes} minutes`,
      snoozedUntil,
      medication,
    });
  } catch (error) {
    console.error('Error snoozing reminder:', error);
    res.status(500).json({
      success: false,
      message: 'Error snoozing reminder',
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
          if (isDoseTakenToday(dose, now)) {
            totalTaken++;
          } else if (!isDoseSkippedToday(dose, now)) {
            const doseDate = getDoseEffectiveDate(dose, now);
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

    const abnormalAlerts = await HealthAlert.countDocuments({
      user: userId,
      read: false,
      severity: { $in: ['warning', 'critical'] },
    });

    const upcomingConsultationsCount = await Consultation.countDocuments({
      patient: userId,
      status: { $in: ['scheduled', 'confirmed', 'pending'] },
      appointmentTime: { $gte: now },
    });

    const activeLabFollowUpsCount = await Booking.countDocuments({
      user: userId,
      status: { $in: ['sample_collected', 'in_progress', 'pending'] },
    });

    const todaysVitals = await Vitals.find({
      user: userId,
      createdAt: { $gte: todayStart, $lte: todayEnd },
    })
      .select('bloodPressure bloodSugar')
      .lean();

    const bpLoggedToday = todaysVitals.some((v) => Boolean(v?.bloodPressure?.raw || (v?.bloodPressure?.systolic && v?.bloodPressure?.diastolic)));
    const bloodSugarLoggedToday = todaysVitals.some((v) => typeof v?.bloodSugar?.value === 'number');

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
          abnormal: abnormalAlerts,
        },
        reminders: {
          appointmentsUpcoming: upcomingConsultationsCount,
          labFollowUpsActive: activeLabFollowUpsCount,
          bloodPressureDue: bpLoggedToday ? 0 : 1,
          bloodSugarDue: bloodSugarLoggedToday ? 0 : 1,
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
