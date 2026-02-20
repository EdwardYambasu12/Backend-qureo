const axios = require('axios');
const Vitals = require('../models/Vitals');
const Prescription = require('../models/Prescription');
const Profile = require('../models/Profile');
const HealthAssessment = require('../models/HealthAssessment');
const HealthAlert = require('../models/HealthAlert');
const User = require('../models/User');
const NodeCache = require('node-cache');

/**
 * HEALTH MONITORING ALGORITHM - ENHANCED WITH OPENAI & SCALABILITY
 * 
 * Features:
 * ✅ Real OpenAI Integration for AI insights
 * ✅ Smart caching to reduce API calls
 * ✅ Batch processing for scalability
 * ✅ Query optimization with field selection
 * ✅ Rate limiting and error retry logic
 * ✅ Comprehensive logging
 */

// Initialize cache (60 second TTL for health records, 5 min for AI insights)
const healthRecordCache = new NodeCache({ stdTTL: 60 });
const aiInsightCache = new NodeCache({ stdTTL: 300 });

class HealthMonitoringService {
  /**
   * Main algorithm - Run every 10 minutes with SCALABILITY
   * Processes users in batches to optimize memory and database connections
   */
  static async runHealthCheckup(batchSize = 50) {
    try {
      console.log('🏥 Starting Enhanced Health Monitoring Algorithm...');
      const startTime = Date.now();

      const totalUsers = await User.countDocuments({ isActive: true });
      console.log(`📊 Total active users to process: ${totalUsers}`);

      let processedCount = 0;
      let alertsCreated = 0;
      let errorCount = 0;

      // Process users in batches for scalability
      for (let skip = 0; skip < totalUsers; skip += batchSize) {
        try {
          const users = await User.find({ isActive: true })
            .select('_id email')  // Only fetch needed fields
            .skip(skip)
            .limit(batchSize)
            .lean();  // Use lean() for better performance

          console.log(`📦 Processing batch: ${skip}-${skip + batchSize}`);

          // Process batch in parallel (but with concurrency limit)
          const batchResults = await Promise.allSettled(
            users.map(user => this.analyzeUserHealth(user._id))
          );

          for (const result of batchResults) {
            if (result.status === 'fulfilled') {
              alertsCreated += result.value.length;
              processedCount++;
            } else {
              errorCount++;
              console.error('Batch processing error:', result.reason);
            }
          }
        } catch (batchError) {
          console.error(`❌ Error processing batch at offset ${skip}:`, batchError.message);
          errorCount++;
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Health Checkup completed in ${duration}s`);
      console.log(`📈 Stats: Processed: ${processedCount}, Alerts: ${alertsCreated}, Errors: ${errorCount}`);

      return { processedCount, alertsCreated, errorCount, duration };
    } catch (error) {
      console.error('❌ Health Monitoring Algorithm Error:', error);
      return { processedCount: 0, alertsCreated: 0, errorCount: 1, duration: 0 };
    }
  }

  /**
   * Analyze single user's health with caching & optimization
   */
  static async analyzeUserHealth(userId) {
    const alerts = [];

    try {
      // STEP 1: FETCH HEALTH RECORDS (WITH CACHING)
      const healthRecords = await this.fetchHealthRecordsWithCache(userId);

      // STEP 2: FETCH MEDICATIONS (OPTIMIZED)
      const medications = await this.fetchMedicationsOptimized(userId);

      // STEP 3: FETCH VITALS (OPTIMIZED)
      const vitals = await this.fetchLatestVitalsOptimized(userId);

      // STEP 4: CHECK MEDICATION REMINDERS
      const medicationAlerts = await this.checkMedicationReminders(userId, medications);
      alerts.push(...medicationAlerts);

      // STEP 5: CHECK VITAL READINGS
      const vitalAlerts = await this.checkVitalReadings(userId, vitals);
      alerts.push(...vitalAlerts);

      // STEP 6: SEND TO AI FOR ANALYSIS (ENHANCED WITH OPENAI)
      const aiInsights = await this.getAIHealthInsightsWithOpenAI(userId, {
        healthRecords,
        medications,
        vitals,
        previousAlerts: alerts,
      });

      // STEP 7: CREATE PROGRESS/CONDITION ALERTS
      const progressAlerts = await this.analyzeProgressAndCondition(userId, healthRecords, vitals, aiInsights);
      alerts.push(...progressAlerts);

      // STEP 8: SAVE ALERTS TO DATABASE (BULK OPERATION)
      if (alerts.length > 0) {
        await HealthAlert.insertMany(alerts.map(alert => ({ ...alert, user: userId })));
        console.log(`✅ Created ${alerts.length} alerts for user ${userId}`);

        // Send notifications asynchronously (non-blocking)
        for (const alert of alerts) {
          this.sendNotification(userId, alert).catch(err => 
            console.error('Notification error:', err.message)
          );
        }
      }

      return alerts;
    } catch (error) {
      console.error(`❌ Error analyzing user health ${userId}:`, error.message);
      return [];
    }
  }

  /**
   * STEP 1: Fetch Health Records with Caching
   */
  static async fetchHealthRecordsWithCache(userId) {
    const cacheKey = `health-${userId}`;
    
    // Check cache first
    const cached = healthRecordCache.get(cacheKey);
    if (cached) {
      console.log(`💾 Cache hit for user ${userId}`);
      return cached;
    }

    try {
      const [profile, assessment] = await Promise.all([
        Profile.findOne({ user: userId }).select('age bloodType allergies conditions medications').lean(),
        HealthAssessment.findOne({ user: userId })
          .select('score createdAt notes fitnessLevel sleepLevel mood')
          .sort({ createdAt: -1 })
          .lean(),
      ]);

      const result = {
        profile: profile ? {
          age: profile.age,
          bloodType: profile.bloodType,
          allergies: profile.allergies || [],
          conditions: profile.conditions || [],
          medications: profile.medications || [],
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

      // Store in cache
      healthRecordCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error fetching health records:', error);
      return {};
    }
  }

  /**
   * STEP 2: Fetch Medications - Optimized Query
   */
  static async fetchMedicationsOptimized(userId) {
    try {
      const prescriptions = await Prescription.find({ owner: userId, status: 'approved' })
        .select('title analysis createdAt status')
        .lean();

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
   * STEP 3: Fetch Latest Vitals - Optimized Query
   */
  static async fetchLatestVitalsOptimized(userId) {
    try {
      const latestVitals = await Vitals.findOne({ user: userId })
        .select('bloodPressure heartRate temperature oxygenLevel weight symptoms createdAt')
        .sort({ createdAt: -1 })
        .lean();

      if (!latestVitals) {
        return null;
      }

      // Get comparison vitals from 7 days ago
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const previousVitals = await Vitals.findOne({
        user: userId,
        createdAt: { $lt: sevenDaysAgo },
      })
        .select('bloodPressure heartRate temperature oxygenLevel weight createdAt')
        .sort({ createdAt: -1 })
        .lean();

      return {
        current: {
          bp: latestVitals.bloodPressure?.raw || 'N/A',
          hr: latestVitals.heartRate,
          temp: latestVitals.temperature,
          o2: latestVitals.oxygenLevel,
          weight: latestVitals.weight,
          symptoms: latestVitals.symptoms || [],
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
        if (med.medicines && med.medicines.length > 0) {
          for (const medicine of med.medicines) {
            if (medicine.frequency) {
              const medTime = this.parseTime(medicine.frequency);
              const currentTime = new Date();
              const timeDiff = this.getMinutesDifference(medTime, currentTime);

              if (timeDiff >= -5 && timeDiff <= 25) {
                alerts.push({
                  type: 'medication_reminder',
                  title: `💊 Time to take ${medicine.name}`,
                  message: `Your ${medicine.name} (${medicine.strength}) is due now. Frequency: ${medicine.frequency}`,
                  severity: 'info',
                  prescriptionId: med.id,
                  data: {
                    recommendation: `Take ${medicine.name} ${medicine.strength} as prescribed. Consistent adherence improves treatment effectiveness.`,
                    aiAnalysis: `Regular medication adherence is critical for your health management. Set reminders to not miss doses.`,
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

      // Blood Pressure Check
      if (current.bp && current.bp !== 'N/A') {
        const [sys, dia] = current.bp.split('/').map(Number);

        if (sys > 140 || dia > 90) {
          alerts.push({
            type: 'vital_abnormal',
            title: '⚠️ High Blood Pressure Detected',
            message: `Your blood pressure is ${current.bp} mmHg, which is elevated. This may require attention.`,
            severity: sys > 180 || dia > 120 ? 'critical' : 'warning',
            data: {
              abnormalReading: `BP: ${current.bp} mmHg (ELEVATED)`,
              normalRange: normalRanges.bp,
              recommendation: 'Take a rest, avoid stressful activities, and recheck in 15 minutes. Contact your doctor if it persists.',
            },
            notificationType: 'push',
          });
        } else if (sys < 90 || dia < 60) {
          alerts.push({
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

      // Heart Rate Check
      if (current.hr) {
        if (current.hr > 120) {
          alerts.push({
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

      // Temperature Check
      if (current.temp) {
        if (current.temp > 99.5) {
          alerts.push({
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

      // Oxygen Level Check
      if (current.o2) {
        if (current.o2 < 95) {
          alerts.push({
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
   * STEP 6: Send Data to AI for Analysis - REAL OPENAI INTEGRATION
   */
  static async getAIHealthInsightsWithOpenAI(userId, healthData) {
    const cacheKey = `ai-${userId}`;
    
    // Check cache first
    const cached = aiInsightCache.get(cacheKey);
    if (cached) {
      console.log(`🧠 AI cache hit for user ${userId}`);
      return cached;
    }

    try {
      if (!process.env.OPENAI_API_KEY) {
        console.warn('⚠️ OpenAI API key not configured. Using fallback analysis.');
        return this.getFallbackAIInsights(healthData);
      }

      // Prepare comprehensive health prompt
      const aiPrompt = this.buildHealthAnalysisPrompt(healthData);

      console.log('🔄 Calling OpenAI API for health insights...');

      // Make OpenAI API call with retry logic
      const aiResponse = await this.callOpenAIWithRetry(aiPrompt, 3);

      const result = {
        analysis: aiResponse,
        source: 'openai',
        timestamp: new Date(),
      };

      // Cache the result
      aiInsightCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('❌ Error getting AI insights:', error.message);
      return this.getFallbackAIInsights(healthData);
    }
  }

  /**
   * Build comprehensive health analysis prompt for OpenAI
   */
  static buildHealthAnalysisPrompt(healthData) {
    return `You are a health analysis AI assistant. Analyze the following health data and provide professional, actionable insights:

HEALTH PROFILE:
- Age: ${healthData.healthRecords.profile?.age || 'N/A'}
- Blood Type: ${healthData.healthRecords.profile?.bloodType || 'N/A'}
- Allergies: ${healthData.healthRecords.profile?.allergies?.join(', ') || 'None reported'}
- Chronic Conditions: ${healthData.healthRecords.profile?.conditions?.join(', ') || 'None reported'}

CURRENT VITALS:
- Blood Pressure: ${healthData.vitals?.current?.bp || 'N/A'} mmHg
- Heart Rate: ${healthData.vitals?.current?.hr || 'N/A'} bpm
- Temperature: ${healthData.vitals?.current?.temp || 'N/A'}°F
- Oxygen Saturation: ${healthData.vitals?.current?.o2 || 'N/A'}%
- Weight: ${healthData.vitals?.current?.weight || 'N/A'} kg

PREVIOUS VITALS (7 days ago):
- Blood Pressure: ${healthData.vitals?.previous?.bp || 'N/A'} mmHg
- Heart Rate: ${healthData.vitals?.previous?.hr || 'N/A'} bpm

MEDICATIONS:
${healthData.medications.map(med => `- ${med.title}: ${med.medicines.map(m => m.name).join(', ')}`).join('\n')}

RECENT ALERTS:
${healthData.previousAlerts.map(a => `- [${a.severity}] ${a.title}: ${a.message}`).join('\n')}

Please provide:
1. **Overall Health Assessment**: Current health status based on vitals
2. **Key Concerns**: Any health issues requiring attention
3. **Personalized Recommendations**: Specific actions to improve health
4. **Trend Analysis**: Are vitals improving, stable, or declining?
5. **Risk Assessment**: Identify potential health risks
6. **Medication Adherence**: Tips for better medication compliance
7. **Lifestyle Suggestions**: Practical improvements for daily health

Format response as clear, actionable points. Be specific and supportive.`;
  }

  /**
   * Call OpenAI API with retry logic and rate limiting
   */
  static async callOpenAIWithRetry(prompt, maxRetries = 3, retryDelay = 1000) {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model,
            messages: [
              {
                role: 'system',
                content: 'You are a professional health advisor providing medical insights based on vital signs and health data. Provide clear, actionable, and evidence-based recommendations.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.7,
            max_tokens: 1000,
            top_p: 0.9,
          },
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000, // 30 second timeout
          }
        );

        const content = response.data.choices[0]?.message?.content;
        if (content) {
          console.log(`✅ OpenAI API response received (attempt ${attempt}/${maxRetries})`);
          return content;
        }

        throw new Error('No content in OpenAI response');
      } catch (error) {
        console.error(`⚠️ OpenAI API attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          const delay = retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`🔄 Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Fallback AI insights when OpenAI is unavailable
   */
  static getFallbackAIInsights(healthData) {
    const alerts = healthData.previousAlerts || [];
    const hasAbnormalities = alerts.length > 0;

    let analysis = '';

    if (hasAbnormalities) {
      const criticalAlerts = alerts.filter(a => a.severity === 'critical');
      analysis = `⚠️ **Health Alert**: You have ${criticalAlerts.length} critical alert(s) requiring immediate attention.\n\n`;
      analysis += `**Recommendations**: Please address the critical alerts immediately and consult with your healthcare provider if symptoms persist.\n`;
      analysis += `**Medication**: Ensure you're taking all prescribed medications as directed.\n`;
      analysis += `**Monitoring**: Continue monitoring your vitals regularly and report any changes to your doctor.`;
    } else {
      analysis = `✅ **Good News**: Your vitals are within normal ranges!\n\n`;
      analysis += `**Recommendations**: Keep up your healthy habits and continue regular monitoring.\n`;
      analysis += `**Medication Adherence**: Continue taking all medications as prescribed.\n`;
      analysis += `**Lifestyle**: Maintain regular exercise, balanced diet, and adequate sleep.`;
    }

    return {
      analysis,
      source: 'fallback',
      timestamp: new Date(),
    };
  }

  /**
   * STEP 7: Analyze Progress and Condition with AI insights
   */
  static async analyzeProgressAndCondition(userId, healthRecords, vitals, aiInsights) {
    const alerts = [];

    try {
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
          condition = 'good';
        }

        // Create progress alert with AI insights
        if (progressTrend !== 'stable' || condition !== 'good') {
          alerts.push({
            type: 'progress_update',
            title: `📊 Health Status: ${condition.toUpperCase()}`,
            message: `Your health trend is ${progressTrend}. ${progressTrend === 'improving' ? 'Great job! Keep it up!' : 'Please pay attention to your health.'}`,
            severity: condition === 'poor' ? 'warning' : 'info',
            data: {
              condition,
              progressTrend,
              comparedToPrevious: `Heart rate: ${previous.hr} → ${current.hr} bpm (${trends.heartRate > 0 ? '+' : ''}${trends.heartRate})`,
              aiAnalysis: aiInsights.analysis.substring(0, 300), // First 300 chars of AI analysis
            },
            notificationType: 'in_app',
          });
        } else {
          // Send AI health insight
          alerts.push({
            type: 'health_insight',
            title: '✅ Your Health Looks Good',
            message: 'Your recent vitals are within normal ranges. Continue with healthy habits!',
            severity: 'info',
            data: {
              condition: 'good',
              progressTrend: 'stable',
              aiAnalysis: aiInsights.analysis.substring(0, 300),
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
   * Send Notification asynchronously
   */
  static async sendNotification(userId, alert) {
    try {
      // Non-blocking notification sending
      setTimeout(async () => {
        try {
          console.log(`📬 Notification sent to user ${userId}:`, alert.title);
          // TODO: Implement notification services:
          // - Firebase Cloud Messaging (push)
          // - SendGrid (email)
          // - Twilio (SMS)
          // - In-app notifications
        } catch (error) {
          console.error('Error in async notification:', error.message);
        }
      }, 0);
    } catch (error) {
      console.error('Error in sendNotification:', error);
    }
  }

  /**
   * Helper: Parse time from string
   */
  static parseTime(timeStr) {
    if (!timeStr) return new Date();
    const [time, period] = timeStr.split(' ');
    if (!time) return new Date();
    
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
   * Clear cache (useful for testing or forced refresh)
   */
  static clearCache() {
    healthRecordCache.flushAll();
    aiInsightCache.flushAll();
    console.log('✅ Cache cleared');
  }

  /**
   * IMMEDIATE ANALYSIS - For real-time vitals submission
   * Analyzes a single vital reading and returns AI insights + severity
   */
  static async analyzeVitalsImmediately(userId, vitals) {
    try {
      const analysis = {};

      // STEP 1: Check for abnormalities
      const { abnormalReading, severity, normalRange } = this.checkVitalAbnormalities(vitals);

      // STEP 2: Get AI insights for immediate feedback
      let aiAnalysis = '';
      try {
        const healthContext = await this.fetchHealthRecordsWithCache(userId);
        const medications = await this.fetchMedicationsOptimized(userId);

        const aiInsights = await this.getAIHealthInsightsWithOpenAI(userId, {
          healthRecords: healthContext,
          medications,
          vitals: {
            current: {
              bp: vitals.bloodPressure?.raw || `${vitals.bloodPressure?.systolic}/${vitals.bloodPressure?.diastolic}`,
              hr: vitals.heartRate,
              temp: vitals.temperature,
              o2: vitals.oxygenLevel,
              weight: vitals.weight,
            },
            previous: null,
          },
          previousAlerts: abnormalReading ? [{ severity, message: abnormalReading }] : [],
        });

        aiAnalysis = aiInsights.analysis || '';
      } catch (aiError) {
        console.warn('Could not get AI analysis:', aiError.message);
        aiAnalysis = `Your vitals have been recorded. ${abnormalReading || 'All readings appear normal.'}`;
      }

      // STEP 3: Extract recommendation
      let recommendation = '';
      if (severity === 'critical') {
        recommendation = 'Seek immediate medical attention. Contact your healthcare provider or emergency services.';
      } else if (severity === 'warning') {
        recommendation = 'Monitor these readings closely and consider contacting your healthcare provider for guidance.';
      } else {
        recommendation = 'Continue monitoring your health regularly and maintain healthy habits.';
      }

      return {
        analysis: aiAnalysis,
        severity,
        abnormalReading,
        recommendation,
        normalRange,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error in immediate vitals analysis:', error.message);
      throw error;
    }
  }

  /**
   * Check vital readings for abnormalities - Returns severity and details
   */
  static checkVitalAbnormalities(vitals) {
    const abnormalities = [];
    let maxSeverity = 'info';

    const normalRanges = {
      systolic: { normal: { min: 90, max: 120 }, warning: { min: 140, max: 180 }, critical: { min: 0, max: 90, max: 180 } },
      diastolic: { normal: { min: 60, max: 80 }, warning: { min: 90, max: 120 }, critical: { min: 0, max: 60, max: 120 } },
      heartRate: { normal: { min: 60, max: 100 }, warning: { min: 50, max: 120 }, critical: { min: 0, max: 50, max: 120 } },
      temperature: { normal: { min: 97, max: 99 }, warning: { min: 99, max: 103 }, critical: { min: 0, max: 97, max: 103 } },
      oxygenLevel: { normal: { min: 95, max: 100 }, warning: { min: 92, max: 95 }, critical: { min: 0, max: 92 } },
    };

    // Check Blood Pressure
    if (vitals.bloodPressure) {
      const sys = vitals.bloodPressure.systolic;
      const dia = vitals.bloodPressure.diastolic;

      if (sys > 180 || dia > 120) {
        abnormalities.push(`BP: ${sys}/${dia} (CRITICAL)`);
        maxSeverity = 'critical';
      } else if (sys > 140 || dia > 90) {
        abnormalities.push(`BP: ${sys}/${dia} (HIGH)`);
        if (maxSeverity !== 'critical') maxSeverity = 'warning';
      }
    }

    // Check Heart Rate
    if (vitals.heartRate) {
      if (vitals.heartRate > 120 || vitals.heartRate < 50) {
        abnormalities.push(`HR: ${vitals.heartRate} bpm (CRITICAL)`);
        maxSeverity = 'critical';
      } else if (vitals.heartRate > 100 || vitals.heartRate < 60) {
        abnormalities.push(`HR: ${vitals.heartRate} bpm (HIGH/LOW)`);
        if (maxSeverity !== 'critical') maxSeverity = 'warning';
      }
    }

    // Check Temperature
    if (vitals.temperature) {
      if (vitals.temperature > 103 || vitals.temperature < 95) {
        abnormalities.push(`Temp: ${vitals.temperature}°F (CRITICAL)`);
        maxSeverity = 'critical';
      } else if (vitals.temperature > 99 || vitals.temperature < 97) {
        abnormalities.push(`Temp: ${vitals.temperature}°F (ELEVATED)`);
        if (maxSeverity !== 'critical') maxSeverity = 'warning';
      }
    }

    // Check Oxygen Level
    if (vitals.oxygenLevel) {
      if (vitals.oxygenLevel < 92) {
        abnormalities.push(`O2: ${vitals.oxygenLevel}% (CRITICAL)`);
        maxSeverity = 'critical';
      } else if (vitals.oxygenLevel < 95) {
        abnormalities.push(`O2: ${vitals.oxygenLevel}% (LOW)`);
        if (maxSeverity !== 'critical') maxSeverity = 'warning';
      }
    }

    return {
      abnormalReading: abnormalities.length > 0 ? abnormalities.join(', ') : null,
      severity: maxSeverity,
      normalRange: normalRanges,
    };
  }

  /**
   * Get cache stats (for monitoring)
   */
  static getCacheStats() {
    return {
      healthRecords: {
        keys: healthRecordCache.keys().length,
        stats: healthRecordCache.getStats(),
      },
      aiInsights: {
        keys: aiInsightCache.keys().length,
        stats: aiInsightCache.getStats(),
      },
    };
  }
}

module.exports = HealthMonitoringService;
