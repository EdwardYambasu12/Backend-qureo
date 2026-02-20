const cron = require('node-cron');
const HealthMonitoringService = require('./HealthMonitoringService');

/**
 * SCHEDULED HEALTH MONITORING SYSTEM
 * 
 * Runs the health algorithm every 10 minutes
 * Can be controlled via environment variables
 */

class HealthMonitoringScheduler {
  static scheduledJob = null;

  /**
   * Start the scheduler
   */
  static start() {
    try {
      // Check if scheduler disabled
      if (process.env.HEALTH_MONITORING_ENABLED === 'false') {
        console.log('⏸️  Health Monitoring Scheduler is disabled (HEALTH_MONITORING_ENABLED=false)');
        return;
      }

      // Get interval from env or default to 10 minutes
      const intervalMinutes = process.env.HEALTH_CHECK_INTERVAL || 10;

      // Cron expression: every X minutes
      // Format: minute hour day month day-of-week
      // * * * * * means every minute
      // */10 * * * * means every 10 minutes
      const cronExpression = `*/${intervalMinutes} * * * *`;

      console.log(`🚀 Starting Health Monitoring Scheduler...`);
      console.log(`⏰ Running every ${intervalMinutes} minutes`);
      console.log(`📅 Cron: ${cronExpression}`);

      // Schedule the job
      this.scheduledJob = cron.schedule(cronExpression, async () => {
        console.log('\n' + '='.repeat(80));
        console.log(`🏥 HEALTH MONITORING CYCLE STARTED at ${new Date().toLocaleString()}`);
        console.log('='.repeat(80));

        try {
          const result = await HealthMonitoringService.runHealthCheckup();
          console.log('\n' + '='.repeat(80));
          console.log(`✅ CYCLE COMPLETED`);
          console.log(`📊 Result:`, result);
          console.log('='.repeat(80) + '\n');
        } catch (error) {
          console.error('\n' + '='.repeat(80));
          console.error(`❌ CYCLE FAILED`);
          console.error('Error:', error);
          console.error('='.repeat(80) + '\n');
        }
      });

      // Run immediately on startup (optional)
      if (process.env.RUN_HEALTH_CHECK_ON_STARTUP === 'true') {
        console.log('🚀 Running health check on startup...');
        HealthMonitoringService.runHealthCheckup().catch(err => {
          console.error('Error in startup health check:', err);
        });
      }

      console.log('✅ Health Monitoring Scheduler started successfully\n');
    } catch (error) {
      console.error('❌ Failed to start Health Monitoring Scheduler:', error);
    }
  }

  /**
   * Stop the scheduler
   */
  static stop() {
    if (this.scheduledJob) {
      this.scheduledJob.stop();
      console.log('⏹️  Health Monitoring Scheduler stopped');
    }
  }

  /**
   * Get scheduler status
   */
  static getStatus() {
    return {
      running: this.scheduledJob !== null,
      enabled: process.env.HEALTH_MONITORING_ENABLED !== 'false',
      interval: `${process.env.HEALTH_CHECK_INTERVAL || 10} minutes`,
    };
  }

  /**
   * Manually trigger health check
   */
  static async runManually() {
    console.log('🔧 Manually triggering health check...');
    try {
      const result = await HealthMonitoringService.runHealthCheckup();
      console.log('✅ Manual health check completed:', result);
      return result;
    } catch (error) {
      console.error('❌ Manual health check failed:', error);
      throw error;
    }
  }
}

module.exports = HealthMonitoringScheduler;
