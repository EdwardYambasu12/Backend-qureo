const express = require('express');
const router = express.Router();
const { analyzeHealthData, generateHealthReport } = require('../services/healthAnalysisService');
const auth = require('../middleware/auth');

/**
 * POST /api/health-analysis/analyze
 * Analyze user's health data using AI
 */
router.post('/analyze', auth, async (req, res) => {
  try {
    const { vitals, medications, symptoms, hydration, history } = req.body;

    // Validate input
    if (!vitals && !medications && !symptoms && !hydration) {
      return res.status(400).json({
        error: 'At least one health data type is required',
      });
    }

    // Perform analysis
    const analysis = await analyzeHealthData({
      vitals: vitals || {},
      medications: medications || [],
      symptoms: symptoms || [],
      hydration: hydration || {},
      bloodPressureHistory: history?.bp || [],
      heartRateHistory: history?.hr || [],
      temperatureHistory: history?.temp || [],
    });

    res.json(analysis);
  } catch (error) {
    console.error('Health analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze health data',
      message: error.message,
    });
  }
});

/**
 * POST /api/health-analysis/report
 * Generate daily health report
 */
router.post('/report', auth, async (req, res) => {
  try {
    const { vitals, medications, symptoms, hydration } = req.body;

    const report = await generateHealthReport({
      vitals: vitals || {},
      medications: medications || [],
      symptoms: symptoms || [],
      hydration: hydration || {},
      timestamp: new Date(),
    });

    res.json(report);
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({
      error: 'Failed to generate report',
      message: error.message,
    });
  }
});

/**
 * GET /api/health-analysis/signals
 * Get quick health signals/alerts
 */
router.get('/signals', auth, async (req, res) => {
  try {
    const { vitals, medications, symptoms } = req.query;

    // Parse JSON parameters from query strings
    const healthData = {
      vitals: vitals ? JSON.parse(vitals) : {},
      medications: medications ? JSON.parse(medications) : [],
      symptoms: symptoms ? JSON.parse(symptoms) : [],
    };

    const analysis = await analyzeHealthData(healthData);

    res.json({
      signals: analysis.signals || [],
      riskLevel: analysis.riskLevel || 'UNKNOWN',
      timestamp: analysis.timestamp,
    });
  } catch (error) {
    console.error('Signals retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve health signals',
      message: error.message,
    });
  }
});

module.exports = router;
