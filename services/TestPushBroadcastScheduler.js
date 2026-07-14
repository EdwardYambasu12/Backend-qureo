const NotificationToken = require('../models/NotificationToken');
const { sendPushToMultipleTokens } = require('../utils/pushService');

class TestPushBroadcastScheduler {
  constructor() {
    this.interval = null;
    this.isRunning = false;
    this.lastRun = null;
    this.stats = {
      runs: 0,
      tokensTargeted: 0,
      successCount: 0,
      failureCount: 0,
      failures: 0,
    };
  }

  async runTick() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastRun = new Date();
    this.stats.runs += 1;

    try {
      const tokenDocs = await NotificationToken.find({}, { token: 1 }).lean();
      const tokens = tokenDocs
        .map((doc) => doc?.token)
        .filter((token) => typeof token === 'string' && token.trim().length > 0);

      this.stats.tokensTargeted += tokens.length;

      if (!tokens.length) {
        console.log('[test-push-broadcast] No notification tokens found; skipping tick');
        return;
      }

      const nowIso = new Date().toISOString();
      const response = await sendPushToMultipleTokens(
        tokens,
        'Test notification',
        `Automated test broadcast sent at ${nowIso}`,
        {
          type: 'test_broadcast',
          route: '/notification',
          testSent: nowIso,
          source: 'TestPushBroadcastScheduler',
        }
      );

      this.stats.successCount += response.successCount || 0;
      this.stats.failureCount += response.failureCount || 0;

      console.log(
        `[test-push-broadcast] Sent test broadcast to ${tokens.length} tokens (${response.successCount || 0} success, ${response.failureCount || 0} failed)`
      );

      if (Array.isArray(response.reasons) && response.reasons.length) {
        console.warn('[test-push-broadcast] Failure reasons:', response.reasons);
      }
    } catch (error) {
      this.stats.failures += 1;
      console.error('[test-push-broadcast] Tick failed:', error?.message || error);
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    if (process.env.TEST_PUSH_BROADCAST_ENABLED !== 'true') {
      console.log('⏸️ Test Push Broadcast Scheduler is disabled (TEST_PUSH_BROADCAST_ENABLED!=true)');
      return;
    }

    if (this.interval) return;

    const intervalMs = Number(process.env.TEST_PUSH_BROADCAST_INTERVAL_MS || 60000);

    console.log('🧪 Starting Test Push Broadcast Scheduler...');
    console.log(`⏰ Broadcasting test notification every ${Math.round(intervalMs / 1000)} seconds`);

    this.runTick();
    this.interval = setInterval(() => this.runTick(), intervalMs);
  }

  stop() {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = null;
    console.log('🛑 Test Push Broadcast Scheduler stopped');
  }

  getStatus() {
    return {
      running: Boolean(this.interval),
      enabled: process.env.TEST_PUSH_BROADCAST_ENABLED === 'true',
      intervalMs: Number(process.env.TEST_PUSH_BROADCAST_INTERVAL_MS || 60000),
      isProcessing: this.isRunning,
      lastRun: this.lastRun,
      stats: this.stats,
    };
  }
}

module.exports = new TestPushBroadcastScheduler();