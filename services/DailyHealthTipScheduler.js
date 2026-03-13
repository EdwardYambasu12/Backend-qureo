const HealthGoal = require('../models/HealthGoal');
const DailyHealthTipService = require('./DailyHealthTipService');

class DailyHealthTipScheduler {
  constructor() {
    this.interval = null;
    this.isRunning = false;
    this.lastRun = null;
    this.stats = {
      runs: 0,
      tipsCreated: 0,
      usersChecked: 0,
      failures: 0,
    };
  }

  async runTick() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastRun = new Date();
    this.stats.runs += 1;

    try {
      const goals = await HealthGoal.find({}, { user: 1, primaryGoal: 1, weeklyTarget: 1, reminderTime: 1 }).lean();
      this.stats.usersChecked += goals.length;

      for (const goal of goals) {
        try {
          const result = await DailyHealthTipService.ensureTodayTipForUser(goal.user, goal);
          if (result?.created) this.stats.tipsCreated += 1;
        } catch (error) {
          this.stats.failures += 1;
          console.error('DailyHealthTipScheduler user run failed:', error?.message || error);
        }
      }
    } catch (error) {
      this.stats.failures += 1;
      console.error('DailyHealthTipScheduler tick failed:', error?.message || error);
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    if (this.interval) return;
    console.log('💡 Starting Daily Health Tip Scheduler...');
    this.runTick();
    this.interval = setInterval(() => this.runTick(), 60 * 60 * 1000);
  }

  stop() {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = null;
    console.log('🛑 Daily Health Tip Scheduler stopped');
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

module.exports = new DailyHealthTipScheduler();
