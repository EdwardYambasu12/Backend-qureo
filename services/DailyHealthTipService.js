const openai = require('../lib/openai');
const DailyHealthTip = require('../models/DailyHealthTip');
const HealthGoal = require('../models/HealthGoal');
const Profile = require('../models/Profile');
const User = require('../models/User');
const NotificationToken = require('../models/NotificationToken');
const HealthAlert = require('../models/HealthAlert');
const sendEmail = require('../utils/email');
const { sendPushToToken } = require('../utils/pushService');

const DEFAULT_GOAL = {
  primaryGoal: 'Improve Sleep',
  weeklyTarget: 5,
  reminderTime: '08:00',
};

const GOAL_FALLBACK_TIPS = {
  'Improve Sleep': [
    'Set a wind-down alarm 60 minutes before bedtime and keep lights dim to improve sleep quality.',
    'Avoid caffeine after midday and keep your bedroom cool to help you fall asleep faster.',
    'Try a fixed sleep/wake schedule today to strengthen your body clock and reduce night wake-ups.',
  ],
  'Lose Weight': [
    'Build today’s plate with protein and vegetables first, then add carbs in a measured portion.',
    'Take a 20-minute brisk walk after a meal to improve calorie balance and blood sugar control.',
    'Hydrate before meals today; it helps appetite control and supports your weight goal.',
  ],
  'Build Muscle': [
    'Prioritize one strength session today with progressive overload and controlled form.',
    'Include protein in your next meal and stay hydrated to support recovery and muscle growth.',
    'Sleep at least 7 hours tonight to maximize muscle repair from training.',
  ],
  'Reduce Stress': [
    'Take a 5-minute breathing reset today: inhale 4 seconds, exhale 6 seconds for 10 rounds.',
    'Schedule one short walk break today to lower stress hormones and clear mental fatigue.',
    'Limit news/social input for one hour and do a calming activity to reduce stress load.',
  ],
  'Increase Energy': [
    'Start your day with water and light movement to boost alertness naturally.',
    'Use a 25-minute focus block plus a 5-minute movement break to sustain energy.',
    'Plan a balanced lunch with protein + fiber to prevent afternoon energy crashes.',
  ],
};

const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const getFallbackTip = (goal, date = new Date()) => {
  const primary = goal?.primaryGoal || DEFAULT_GOAL.primaryGoal;
  const list = GOAL_FALLBACK_TIPS[primary] || GOAL_FALLBACK_TIPS[DEFAULT_GOAL.primaryGoal];
  const day = startOfDay(date).getDate();
  return list[day % list.length];
};

const sanitizeTip = (text = '') => String(text || '').replace(/\s+/g, ' ').trim();

class DailyHealthTipService {
  async getTodayTip(userId) {
    const now = new Date();
    return DailyHealthTip.findOne({
      user: userId,
      tipDate: { $gte: startOfDay(now), $lte: endOfDay(now) },
    }).lean();
  }

  async generateTipWithAI(goal, currentDate = new Date()) {
    const primaryGoal = goal?.primaryGoal || DEFAULT_GOAL.primaryGoal;
    const weeklyTarget = Number(goal?.weeklyTarget || DEFAULT_GOAL.weeklyTarget);
    const reminderTime = goal?.reminderTime || DEFAULT_GOAL.reminderTime;

    // Use fallback if OpenAI is not configured
    if (!openai) {
      return { content: getFallbackTip(goal, currentDate), source: 'fallback' };
    }

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content:
              'You are a concise healthcare coaching assistant. Produce one safe, practical daily tip. ' +
              'Do not diagnose or prescribe drugs. Keep it under 30 words and user-friendly.',
          },
          {
            role: 'user',
            content:
              `Create exactly one daily health tip for today (${startOfDay(currentDate).toDateString()}). ` +
              `User primary goal: ${primaryGoal}. Weekly target: ${weeklyTarget}. Reminder time: ${reminderTime}. ` +
              'Return plain text only, no bullets, no labels.',
          },
        ],
      });

      const tip = sanitizeTip(response?.choices?.[0]?.message?.content || '');
      if (!tip) return { content: getFallbackTip(goal, currentDate), source: 'fallback' };
      return { content: tip, source: 'ai' };
    } catch (error) {
      console.warn('DailyHealthTipService AI generation failed, using fallback:', error?.message || error);
      return { content: getFallbackTip(goal, currentDate), source: 'fallback' };
    }
  }

  async sendNewTipNotifications(userId, tipDoc) {
    const profile = await Profile.findOne({ user: userId }).lean();
    const notifications = profile?.notifications || {};

    const title = '💡 New Daily Health Tip';
    const body = tipDoc.content;

    await HealthAlert.create({
      user: userId,
      type: 'health_insight',
      title,
      message: body,
      severity: 'info',
      data: {
        aiAnalysis: body,
        recommendation: `Goal focus: ${tipDoc.primaryGoal}`,
      },
      notificationType: 'in_app',
      notificationSent: false,
    });

    if (notifications.reminders === false) {
      return;
    }

    if (notifications.push !== false) {
      const tokenDoc = await NotificationToken.findOne({ userId }).lean();
      if (tokenDoc?.token) {
        await sendPushToToken(tokenDoc.token, title, body, {
          type: 'daily_health_tip',
          tipDate: tipDoc.tipDate.toISOString(),
        });
      }
    }

    if (notifications.email === true) {
      const user = await User.findById(userId).lean();
      if (user?.email) {
        await sendEmail(
          user.email,
          'Qureo Daily Health Tip',
          body,
          `<p><strong>Your daily health tip:</strong></p><p>${body}</p><p>Goal: ${tipDoc.primaryGoal}</p>`
        );
      }
    }
  }

  async ensureTodayTipForUser(userId, goalInput = null) {
    const now = new Date();
    const dayStart = startOfDay(now);

    const existing = await this.getTodayTip(userId);
    if (existing) {
      return { created: false, tip: existing };
    }

    const goalDoc = goalInput || (await HealthGoal.findOne({ user: userId }).lean()) || DEFAULT_GOAL;
    const goal = {
      primaryGoal: goalDoc.primaryGoal || DEFAULT_GOAL.primaryGoal,
      weeklyTarget: Number(goalDoc.weeklyTarget || DEFAULT_GOAL.weeklyTarget),
      reminderTime: goalDoc.reminderTime || DEFAULT_GOAL.reminderTime,
    };

    const generated = await this.generateTipWithAI(goal, now);

    try {
      const tip = await DailyHealthTip.create({
        user: userId,
        tipDate: dayStart,
        primaryGoal: goal.primaryGoal,
        weeklyTarget: goal.weeklyTarget,
        reminderTime: goal.reminderTime,
        content: generated.content,
        source: generated.source,
      });

      await this.sendNewTipNotifications(userId, tip);

      return { created: true, tip: tip.toObject() };
    } catch (error) {
      if (error?.code === 11000) {
        const tip = await this.getTodayTip(userId);
        return { created: false, tip };
      }
      throw error;
    }
  }
}

module.exports = new DailyHealthTipService();
