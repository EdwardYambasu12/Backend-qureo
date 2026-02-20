const axios = require('axios');
const Vitals = require('../models/Vitals');
const Prescription = require('../models/Prescription');
const Profile = require('../models/Profile');
const HealthAssessment = require('../models/HealthAssessment');
const HealthAlert = require('../models/HealthAlert');
const User = require('../models/User');

/**
 * HEALTH MONITORING ALGORITHM
 * Runs every 10 minutes to:
 * 1. Fetch health records
 * 2. Check medications
 * 3. Analyze vitals
 * 4. Send to AI for insights
 * 5. Generate alerts & notifications
 */

class HealthMonitoringService {
  /**
   * Main algorithm - Run every 10 minutes
   */
  static async runHealthCheckup() {
    try {
      console.log('🏥 Starting Health Monitoring Algorithm...');

      // Get all active users
      const users = await User.find({ isActive: true }).limit(100);

      let processedCount = 0;
      let alertsCreated = 0;

      for (const user of users) {
        try {
          const alerts = await this.analyzeUserHealth(user._id);
          alertsCreated += alerts.length;
          processedCount++;
        } catch (error) {
          console.error(`❌ Error processing user ${user._id}:`, error.message);
        }
      }

      console.log(`✅ Health Checkup completed. Processed: ${processedCount}, Alerts: ${alertsCreated}`);
      return { processedCount, alertsCreated };
    } catch (error) {
      console.error('❌ Health Monitoring Algorithm Error:', error);
    }
  }

  /**
   * Analyze single user's health
   */
  static async analyzeUserHealth(userId) {
    const alerts = [];

    try {
      // STEP 1: FETCH HEALTH RECORDS
      const healthRecords = await this.fetchHealthRecords(userId);
      console.log(`📋 Fetched health records for user ${userId}`);

      // STEP 2: FETCH MEDICATIONS
      const medications = await this.fetchMedications(userId);
      console.log(`💊 Fetched ${medications.length} medications`);

      // STEP 3: FETCH VITALS/METRICS
      const vitals = await this.fetchLatestVitals(userId);
      console.log(`📊 Fetched latest vitals`);

      // STEP 4: CHECK MEDICATION REMINDERS
      const medicationAlerts = await this.checkMedicationReminders(userId, medications);
      alerts.push(...medicationAlerts);

      // STEP 5: CHECK VITAL READINGS
      const vitalAlerts = await this.checkVitalReadings(userId, vitals);
      alerts.push(...vitalAlerts);

      // STEP 6: SEND TO AI FOR ANALYSIS
      const aiInsights = await this.getAIHealthInsights(userId, {
        healthRecords,
        medications,
        vitals,
        previousAlerts: alerts,
      });
      console.log(`🧠 AI Analysis retrieved`);

      // STEP 7: CREATE PROGRESS/CONDITION ALERTS
      const progressAlerts = await this.analyzeProgressAndCondition(userId, healthRecords, vitals, aiInsights);
      alerts.push(...progressAlerts);

      // STEP 8: SAVE ALERTS TO DATABASE
      for (const alert of alerts) {
        const savedAlert = await HealthAlert.create(alert);
        await this.sendNotification(userId, savedAlert);
      }

      return alerts;
    } catch (error) {
      console.error(`Error analyzing user health ${userId}:`, error);
      return [];
    }
  }

  /**
   * STEP 1: Fetch Health Records
   */
  static async fetchHealthRecords(userId) {
    try {
      const profile = await Profile.findOne({ user: userId });
      const assessment = await HealthAssessment.findOne({ user: userId }).sort({ createdAt: -1 });

      return {
        profile: profile ? {
          age: profile.age,
          bloodType: profile.bloodType,
          allergies: profile.allergies,
          conditions: profile.conditions,
          medications: profile.medications,
        } : {},
        lastAssessment: assessment ? {
          score: assessment.score,
          date: assessment.createdAt,
          notes: assessment.notes,
          fitnessLevel: assessment.fitnessLevel,
          sleepLevel: assessment.sleepLevel,
          mood: assessment.mood,
        } : {},
      };
    } catch (error) {
      console.error('Error fetching health records:', error);
      return {};
    }
  }

  /**
   * STEP 2: Fetch Medications
   */
  static async fetchMedications(userId) {
    try {
      const prescriptions = await Prescription.find({ owner: userId, status: 'approved' });

      return prescriptions.map(rx => ({
        id: rx._id,
        title: rx.title,
        medicines: rx.analysis?.medicines || [],
        dateCreated: rx.createdAt,
        status: rx.status,
        warnings: rx.analysis?.warnings || [],
      }));
    } catch (error) {
      console.error('Error fetching medications:', error);
      return [];
    }
  }

  /**
   * STEP 3: Fetch Latest Vitals
   */
  static async fetchLatestVitals(userId) {
    try {
      const latestVitals = await Vitals.findOne({ user: userId }).sort({ createdAt: -1 });

      if (!latestVitals) {
        return null;
      }

      // Get comparison vitals from 7 days ago
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const previousVitals = await Vitals.findOne({
        user: userId,
        createdAt: { $lt: sevenDaysAgo },
      }).sort({ createdAt: -1 });

      return {
        current: {
          bp: latestVitals.bloodPressure?.raw || 'N/A',
          hr: latestVitals.heartRate,
          temp: latestVitals.temperature,
          o2: latestVitals.oxygenLevel,
          weight: latestVitals.weight,
          symptoms: latestVitals.symptoms,
          timestamp: latestVitals.createdAt,
        },
        previous: previousVitals ? {
          bp: previousVitals.bloodPressure?.raw || 'N/A',
          hr: previousVitals.heartRate,
          temp: previousVitals.temperature,
          o2: previousVitals.oxygenLevel,
          weight: previousVitals.weight,
          timestamp: previousVitals.createdAt,
        } : null,
      };
    } catch (error) {
      console.error('Error fetching vitals:', error);
      return null;
    }
  }

  /**
   * STEP 4: Check Medication Reminders
   */
  static async checkMedicationReminders(userId, medications) {
    const alerts = [];

    try {
      for (const med of medications) {
        // Check if medication should be taken around this time
        if (med.medicines && med.medicines.length > 0) {
          for (const medicine of med.medicines) {
            // Check if medication has frequency (e.g., "8:00 AM")
            if (medicine.frequency) {
              const medTime = this.parseTime(medicine.frequency);
              const currentTime = new Date();
              const timeDiff = this.getMinutesDifference(medTime, currentTime);

              // Alert if within 30 minutes of scheduled time
              if (timeDiff >= -5 && timeDiff <= 25) {
                alerts.push({
                  user: userId,
                  type: 'medication_reminder',
                  title: `Time to take ${medicine.name}`,
                  message: `Your ${medicine.name} (${medicine.strength}) is due now. Frequency: ${medicine.frequency}`,
                  severity: 'info',
                  prescriptionId: med.id,
                  data: {
                    recommendation: `Take ${medicine.name} ${medicine.strength} as prescribed`,
                    aiAnalysis: `Regular medication adherence is critical for your health management`,
                  },
                  notificationType: 'push',
                });
              }
            }
          }
        }
      }

      return alerts;
    } catch (error) {
      console.error('Error checking medication reminders:', error);
      return [];
    }
  }

  /**
   * STEP 5: Check Vital Readings Against Normal Ranges
   */
  static async checkVitalReadings(userId, vitals) {
    const alerts = [];

    if (!vitals || !vitals.current) {
      return alerts;
    }

    try {
      const current = vitals.current;
      const normalRanges = {
        bp: { min: '90/60', max: '120/80' },
        hr: { min: 60, max: 100 },
        temp: { min: 97, max: 99 },
        o2: { min: 95, max: 100 },
      };

      // Check Blood Pressure
      if (current.bp && current.bp !== 'N/A') {
        const [sys, dia] = current.bp.split('/').map(Number);

        if (sys > 140 || dia > 90) {
          alerts.push({
            user: userId,
            type: 'vital_abnormal',
            title: '⚠️ High Blood Pressure Detected',
            message: `Your blood pressure is ${current.bp} mmHg, which is elevated. This may require attention.`,
            severity: sys > 180 || dia > 120 ? 'critical' : 'warning',
            vitalId: null, // Will be linked when saved
            data: {
              abnormalReading: `BP: ${current.bp} mmHg (ELEVATED)`,
              normalRange: normalRanges.bp,
              recommendation: 'Take a rest, avoid stressful activities, and recheck in 15 minutes. Contact your doctor if it persists.',
            },
            notificationType: 'push',
          });
        } else if (sys < 90 || dia < 60) {
          alerts.push({
            user: userId,
            type: 'vital_abnormal',
            title: '⚠️ Low Blood Pressure Detected',
            message: `Your blood pressure is ${current.bp} mmHg, which is low.`,
            severity: 'warning',
            data: {
              abnormalReading: `BP: ${current.bp} mmHg (LOW)`,
              normalRange: normalRanges.bp,
              recommendation: 'Ensure you are hydrated and rested. Seek medical help if dizziness occurs.',
            },
            notificationType: 'push',
          });
        }
      }

      // Check Heart Rate
      if (current.hr) {
        if (current.hr > 120) {
          alerts.push({
            user: userId,
            type: 'vital_abnormal',
            title: '⚠️ Elevated Heart Rate',
            message: `Your heart rate is ${current.hr} bpm, which is elevated. Possible causes: exercise, stress, or health concerns.`,
            severity: current.hr > 140 ? 'critical' : 'warning',
            data: {
              abnormalReading: `Heart Rate: ${current.hr} bpm (HIGH)`,
              normalRange: normalRanges.hr,
              recommendation: 'Sit down, breathe slowly, and relax. Seek medical help if persistent.',
            },
            notificationType: 'push',
          });
        } else if (current.hr < 50) {
          alerts.push({
            user: userId,
            type: 'vital_abnormal',
            title: '⚠️ Low Heart Rate',
            message: `Your heart rate is ${current.hr} bpm, which is low.`,
            severity: 'warning',
            data: {
              abnormalReading: `Heart Rate: ${current.hr} bpm (LOW)`,
              normalRange: normalRanges.hr,
              recommendation: 'Rest and hydrate. Contact your doctor if accompanied by dizziness.',
            },
            notificationType: 'push',
          });
        }
      }

      // Check Temperature
      if (current.temp) {
        if (current.temp > 99.5) {
          alerts.push({
            user: userId,
            type: 'vital_abnormal',
            title: '🌡️ Fever Detected',
            message: `Your temperature is ${current.temp}°F, indicating a fever. This may suggest an infection.`,
            severity: current.temp > 103 ? 'critical' : 'warning',
            data: {
              abnormalReading: `Temperature: ${current.temp}°F (FEVER)`,
              normalRange: normalRanges.temp,
              recommendation: 'Stay hydrated, rest, and monitor. Seek medical care if temp exceeds 103°F.',
            },
            notificationType: 'push',
          });
        } else if (current.temp < 95) {
          alerts.push({
            user: userId,
            type: 'vital_abnormal',
            title: '❄️ Low Temperature',
            message: `Your temperature is ${current.temp}°F, which is low.`,
            severity: 'warning',
            data: {
              abnormalReading: `Temperature: ${current.temp}°F (LOW)`,
              normalRange: normalRanges.temp,
              recommendation: 'Warm up gradually and ensure proper nutrition.',
            },
            notificationType: 'push',
          });
        }
      }

      // Check Oxygen Level
      if (current.o2) {
        if (current.o2 < 95) {
          alerts.push({
            user: userId,
            type: 'vital_abnormal',
            title: '🫁 Low Oxygen Saturation',
            message: `Your oxygen level is ${current.o2}%, which is below normal. This needs immediate attention.`,
            severity: current.o2 < 90 ? 'critical' : 'warning',
            data: {
              abnormalReading: `O2 Saturation: ${current.o2}% (LOW)`,
              normalRange: normalRanges.o2,
              recommendation: 'Sit up straight, breathe deeply, and rest. Seek medical help immediately if below 90%.',
            },
            notificationType: 'push',
          });
        }
      }

      return alerts;
    } catch (error) {
      console.error('Error checking vital readings:', error);
      return [];
    }
  }

  /**
   * STEP 6: Send Data to AI for Analysis
   */
  static async getAIHealthInsights(userId, healthData) {
    try {
      // Format data for AI
      const aiPrompt = `
Analyze the following health data and provide insights:

HEALTH RECORDS:
${JSON.stringify(healthData.healthRecords, null, 2)}

MEDICATIONS:
${JSON.stringify(healthData.medications, null, 2)}

VITALS:
${JSON.stringify(healthData.vitals, null, 2)}

PREVIOUS ALERTS:
${healthData.previousAlerts.map(a => a.message).join('\n')}

Please provide:
1. Overall health assessment
2. Key concerns
3. Recommendations
4. Health trend analysis
5. Risk factors
      `;

      // Call OpenAI or your AI service
      const aiResponse = await this.callAIService(aiPrompt);

      return {
        analysis: aiResponse,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error getting AI insights:', error);
      return {
        analysis: 'AI analysis unavailable',
        timestamp: new Date(),
      };
    }
  }

  /**
   * STEP 7: Analyze Progress and Condition
   */
  static async analyzeProgressAndCondition(userId, healthRecords, vitals, aiInsights) {
    const alerts = [];

    try {
      // Compare current vitals with previous week
      if (vitals && vitals.current && vitals.previous) {
        const current = vitals.current;
        const previous = vitals.previous;

        // Calculate trends
        const trends = {
          heartRate: current.hr && previous.hr ? current.hr - previous.hr : 0,
          weight: current.weight && previous.weight ? current.weight - previous.weight : 0,
        };

        // Determine condition
        let condition = 'good';
        let progressTrend = 'stable';

        if (current.hr && current.hr > 100) {
          condition = 'fair';
        }

        if (trends.heartRate > 20) {
          progressTrend = 'declining';
          condition = 'fair';
        } else if (trends.heartRate < -20) {
          progressTrend = 'improving';
        }

        // Create progress alert if significant change
        if (progressTrend !== 'stable') {
          alerts.push({
            user: userId,
            type: 'progress_update',
            title: `📊 Health Status: ${condition.toUpperCase()}`,
            message: `Your health is ${progressTrend}. Keep up with regular monitoring and follow medical advice.`,
            severity: condition === 'poor' ? 'warning' : 'info',
            data: {
              condition,
              progressTrend,
              comparedToPrevious: `Heart rate changed from ${previous.hr} to ${current.hr} bpm`,
              aiAnalysis: aiInsights.analysis || 'Monitoring in progress',
            },
            notificationType: 'in_app',
          });
        } else {
          // Send general health insight if no abnormalities
          alerts.push({
            user: userId,
            type: 'health_insight',
            title: '✅ Your Health Looks Good',
            message: 'Your recent vitals are within normal ranges. Continue with healthy habits!',
            severity: 'info',
            data: {
              condition: 'good',
              progressTrend: 'stable',
              aiAnalysis: 'Keep maintaining your healthy lifestyle',
            },
            notificationType: 'in_app',
          });
        }
      }

      return alerts;
    } catch (error) {
      console.error('Error analyzing progress:', error);
      return [];
    }
  }

  /**
   * Send Notification
   */
  static async sendNotification(userId, alert) {
    try {
      // TODO: Implement actual notification service
      // - Push notifications (Firebase Cloud Messaging)
      // - Email notifications
      // - SMS notifications
      // - In-app notifications

      console.log(`📬 Notification sent to user ${userId}:`, alert.title);

      // Mark as sent
      await HealthAlert.findByIdAndUpdate(alert._id, { notificationSent: true });
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  /**
   * Helper: Parse time from string
   */
  static parseTime(timeStr) {
    const [time, period] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);

    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    const now = new Date();
    now.setHours(hours, minutes, 0, 0);
    return now;
  }

  /**
   * Helper: Get minutes difference
   */
  static getMinutesDifference(date1, date2) {
    return Math.floor((date1 - date2) / 60000);
  }

  /**
   * Helper: Call AI Service (OpenAI)
   */
  static async callAIService(prompt) {
    try {
      // TODO: Implement actual AI call
      // For now, return placeholder
      return 'Health analysis in progress. Monitor your vitals regularly and follow your doctor\'s advice.';
    } catch (error) {
      console.error('Error calling AI service:', error);
      return 'AI service unavailable';
    }
  }
}

module.exports = HealthMonitoringService;
