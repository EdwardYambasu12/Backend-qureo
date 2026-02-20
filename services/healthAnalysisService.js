const OpenAI = require('openai');
const dotenv = require('dotenv');

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-default-key',
});

/**
 * Analyze health data using OpenAI and generate signals/reports
 * @param {Object} healthData - Health metrics and status
 * @returns {Promise<Object>} Analysis results with signals and recommendations
 */
async function analyzeHealthData(healthData) {
  try {
    const {
      vitals = {},
      medications = [],
      symptoms = [],
      hydration = {},
      bloodPressureHistory = [],
      heartRateHistory = [],
      temperatureHistory = [],
    } = healthData;

    // Prepare the health context for GPT
    const healthContext = {
      vitals: {
        bloodPressure: vitals.bp || 'Not recorded',
        heartRate: vitals.heart || 'Not recorded',
        temperature: vitals.temp || 'Not recorded',
        oxygenLevel: vitals.oxygen || 'Not recorded',
      },
      medications: medications.map(m => ({
        name: m.name || m,
        dosage: m.dosage || 'Unknown',
        frequency: m.frequency || 'Unknown',
        adhesion: (m.adherencePercentage || 0).toFixed(1) + '%',
      })) || [],
      symptoms: symptoms || [],
      hydration: {
        current: hydration.current || 0,
        daily_goal: hydration.goal || 2000,
        status: hydration.current >= hydration.goal ? 'Met' : 'Below goal',
      },
      recentHistory: {
        bloodPressure: bloodPressureHistory.slice(-7) || [],
        heartRate: heartRateHistory.slice(-7) || [],
        temperature: temperatureHistory.slice(-7) || [],
      },
      timestamp: new Date().toISOString(),
    };

    // Create a comprehensive prompt for health analysis
    const analysisPrompt = `
You are a medical health advisor analyzing patient health data. Provide a comprehensive health analysis based on the following health metrics:

HEALTH DATA:
${JSON.stringify(healthContext, null, 2)}

Please provide your analysis in the following structured format:

1. HEALTH SIGNALS (Critical issues to address):
   - List any concerning health signals based on the data
   - Highlight any values outside normal ranges
   - Flag any medication adherence issues

2. HEALTH RISK ASSESSMENT:
   - Overall risk level (Low, Moderate, High, Critical)
   - Key risk factors identified
   - Specific health concerns

3. RECOMMENDATIONS:
   - Immediate actions to take
   - Lifestyle modifications
   - Medication reminders
   - When to seek professional help

4. HYDRATION STATUS:
   - Current hydration level analysis
   - Recommendations for today

5. MEDICATION ADHERENCE:
   - Current adherence rates
   - Impact on health outcomes
   - Tips for better adherence

6. TREND ANALYSIS:
   - Observable trends in the health data
   - Improvements or deteriorations
   - Pattern insights

Please be specific, actionable, and focus on health optimization.
`;

    // Call OpenAI API
    const message = await openai.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: analysisPrompt,
        },
      ],
    });

    const analysisText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse the response
    const analysis = {
      timestamp: new Date(),
      rawAnalysis: analysisText,
      healthData: healthContext,
      status: 'success',
      signals: extractSignals(analysisText),
      recommendations: extractRecommendations(analysisText),
      riskLevel: extractRiskLevel(analysisText),
    };

    return analysis;
  } catch (error) {
    console.error('Error analyzing health data:', error);
    return {
      status: 'error',
      message: error.message || 'Failed to analyze health data',
      healthData,
    };
  }
}

/**
 * Generate a health report based on recent health data
 * @param {Object} healthData - Health metrics
 * @returns {Promise<Object>} Health report
 */
async function generateHealthReport(healthData) {
  try {
    const reportPrompt = `
Generate a comprehensive daily health report for a patient monitoring their health at home. Use this data:

${JSON.stringify(healthData, null, 2)}

Format the report as follows:

DAILY HEALTH REPORT
==================
Date: ${new Date().toLocaleDateString()}

SUMMARY:
- Brief 2-3 sentence overview of today's health status

VITAL SIGNS OVERVIEW:
- Analysis of current vital signs
- Comparison to baseline if available

MEDICATION UPDATE:
- Medications to take today
- Reminder for missed doses

ACTIVITY RECOMMENDATIONS:
- Suggested activities
- Exercise recommendations
- Rest periods if needed

ALERTS:
- Any urgent health concerns
- When to contact healthcare provider

FOLLOW-UP:
- What to monitor
- When to take next readings

Be encouraging but honest. Focus on patient empowerment and self-care.
`;

    const message = await openai.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: reportPrompt,
        },
      ],
    });

    return {
      timestamp: new Date(),
      report: message.content[0].type === 'text' ? message.content[0].text : '',
      style: 'health_report',
      status: 'success',
    };
  } catch (error) {
    console.error('Error generating health report:', error);
    return {
      status: 'error',
      message: error.message || 'Failed to generate health report',
    };
  }
}

// Helper functions to parse AI responses
function extractSignals(text) {
  const signals = [];
  const signalSection = text.match(/HEALTH SIGNALS.*?(?=\d\.|$)/i);
  if (signalSection) {
    const lines = signalSection[0].split('\n');
    lines.forEach(line => {
      if (line.match(/^[\s-*•]/)) {
        signals.push(line.trim());
      }
    });
  }
  return signals;
}

function extractRecommendations(text) {
  const recommendations = [];
  const recSection = text.match(/RECOMMENDATIONS.*?(?=\d\.|$)/i);
  if (recSection) {
    const lines = recSection[0].split('\n');
    lines.forEach(line => {
      if (line.match(/^[\s-*•]/)) {
        recommendations.push(line.trim());
      }
    });
  }
  return recommendations;
}

function extractRiskLevel(text) {
  const match = text.match(/risk level.*?:(.*?)(?:\n|$)/i);
  if (match) {
    const level = match[1].trim().toLowerCase();
    if (level.includes('critical')) return 'CRITICAL';
    if (level.includes('high')) return 'HIGH';
    if (level.includes('moderate')) return 'MODERATE';
    if (level.includes('low')) return 'LOW';
  }
  return 'UNKNOWN';
}

module.exports = {
  analyzeHealthData,
  generateHealthReport,
};
