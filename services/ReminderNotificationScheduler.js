const Medication = require('../models/Medication');
const Profile = require('../models/Profile');
const User = require('../models/User');
const NotificationToken = require('../models/NotificationToken');
const ReminderDispatch = require('../models/ReminderDispatch');
const sendEmail = require('../utils/email');
const { sendPushToToken } = require('../utils/push');

class ReminderNotificationScheduler {
  constructor() {
    this.interval = null;
    this.isRunning = false;
    this.lastRun = null;
    this.stats = {
      runs: 0,
      pushSent: 0,
      emailSent: 0,
      pushFailed: 0,
      emailFailed: 0,
      skipped: 0,
    };
  }

  getDateKey(now) {
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  isDoseTakenToday(dose, now) {
    if (!dose?.taken || !dose?.takenAt) return false;
    return new Date(dose.takenAt).toDateString() === now.toDateString();
  }

  async alreadyDispatched({ userId, medicationId, reminderDate, reminderTime, channel }) {
    const found = await ReminderDispatch.findOne({
      user: userId,
      medication: medicationId,
      reminderDate,
      reminderTime,
      channel,
    }).lean();

    return Boolean(found);
  }

  async recordDispatch({ userId, medicationId, reminderDate, reminderTime, channel, success, reason = '' }) {
    try {
      await ReminderDispatch.create({
        user: userId,
        medication: medicationId,
        reminderDate,
        reminderTime,
        channel,
        success,
        reason,
      });
    } catch (err) {
      if (err?.code !== 11000) {
        console.error('Reminder dispatch log error:', err.message || err);
      }
    }
  }

  async processDueReminders() {
    const now = new Date();
    const timeKey = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dateKey = this.getDateKey(now);

    const medications = await Medication.find({ isActive: true, remindMe: true }).lean();
    if (!medications.length) return;

    for (const med of medications) {
      const userId = String(med.user);
      const dueDoses = (med.scheduledTimes || []).filter((dose) => String(dose?.time || '') === timeKey);
      if (!dueDoses.length) continue;

      const profile = await Profile.findOne({ user: userId }).lean();
      const notifications = profile?.notifications || {};

      if (notifications.reminders === false) {
        this.stats.skipped += 1;
        continue;
      }

      const user = await User.findById(userId).lean();
      const tokenDoc = await NotificationToken.findOne({ userId }).lean();

      for (const dose of dueDoses) {
        if (this.isDoseTakenToday(dose, now)) continue;

        const title = `Medication Reminder: ${med.name}`;
        const body = `${med.dosage} • ${med.frequency} • Due now (${timeKey})`;

        if (notifications.push !== false) {
          const alreadyPush = await this.alreadyDispatched({
            userId,
            medicationId: med._id,
            reminderDate: dateKey,
            reminderTime: timeKey,
            channel: 'push',
          });

          if (!alreadyPush) {
            const pushResult = await sendPushToToken(tokenDoc?.token, title, body, {
              type: 'medication_reminder',
              medicationId: String(med._id),
              dueTime: timeKey,
            });

            await this.recordDispatch({
              userId,
              medicationId: med._id,
              reminderDate: dateKey,
              reminderTime: timeKey,
              channel: 'push',
              success: Boolean(pushResult.success),
              reason: pushResult.reason || '',
            });

            if (pushResult.success) this.stats.pushSent += 1;
            else this.stats.pushFailed += 1;
          }
        }

        if (notifications.email === true && user?.email) {
          const alreadyEmail = await this.alreadyDispatched({
            userId,
            medicationId: med._id,
            reminderDate: dateKey,
            reminderTime: timeKey,
            channel: 'email',
          });

          if (!alreadyEmail) {
            const sent = await sendEmail(
              user.email,
              `Qureo Reminder: ${med.name}`,
              `It's time to take ${med.name} (${med.dosage}). Scheduled for ${timeKey}.`,
              `<p>It is time to take <strong>${med.name}</strong> (${med.dosage}).</p><p>Scheduled time: <strong>${timeKey}</strong></p>`
            );

            await this.recordDispatch({
              userId,
              medicationId: med._id,
              reminderDate: dateKey,
              reminderTime: timeKey,
              channel: 'email',
              success: Boolean(sent),
              reason: sent ? '' : 'Email send failed',
            });

            if (sent) this.stats.emailSent += 1;
            else this.stats.emailFailed += 1;
          }
        }
      }
    }
  }

  async runTick() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      this.lastRun = new Date();
      this.stats.runs += 1;
      await this.processDueReminders();
    } catch (err) {
      console.error('ReminderNotificationScheduler tick error:', err);
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    if (this.interval) return;
    console.log('⏰ Starting Reminder Notification Scheduler...');
    this.runTick();
    this.interval = setInterval(() => this.runTick(), 60 * 1000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('🛑 Reminder Notification Scheduler stopped');
    }
  }

  getStatus() {
    return {
      running: Boolean(this.interval),
      isProcessing: this.isRunning,
      lastRun: this.lastRun,
      stats: this.stats,
    };
  }
}

module.exports = new ReminderNotificationScheduler();
