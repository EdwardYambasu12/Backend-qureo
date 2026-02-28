const express = require('express');
const axios = require('axios');

const router = express.Router();

// Simple in-memory rate limiter per IP (small projects only)
const rateMap = new Map(); // ip -> { count, firstTs }
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30; // per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, firstTs: now };
  if (now - entry.firstTs > WINDOW_MS) {
    entry.count = 1;
    entry.firstTs = now;
    rateMap.set(ip, entry);
    return true;
  }
  entry.count += 1;
  rateMap.set(ip, entry);
  return entry.count <= MAX_REQUESTS;
}

// placeholder for persistent logging (e.g. database or analytics service)
function logSymptomCheck(entry) {
  // entry: { ip, messages, triage, rulesFired? }
  // TODO: replace with real DB insert or telemetry event
  console.log('📥 Persisting symptom check log', JSON.stringify(entry));
}

// Helper function to generate contextual options based on AI response
function generateOptions(aiResponse) {
  const lowerResponse = aiResponse.toLowerCase();
  let options = [];

  // Detect question type and provide appropriate options
  if (lowerResponse.includes('severity') || lowerResponse.includes('how severe') || lowerResponse.includes('intense')) {
    options = ['Mild', 'Moderate', 'Severe', 'Very Severe'];
  } else if (lowerResponse.includes('duration') || lowerResponse.includes('how long') || lowerResponse.includes('for how')) {
    options = ['Less than 24 hours', '1-3 days', '3-7 days', 'More than a week'];
  } else if (lowerResponse.includes('when') || lowerResponse.includes('started') || lowerResponse.includes('began')) {
    options = ['Just started', 'This morning', 'Yesterday', 'A few days ago'];
  } else if (lowerResponse.includes('treatment') || lowerResponse.includes('medication') || lowerResponse.includes('taking')) {
    options = ['Yes, already taking', 'No, nothing yet', 'Tried home remedies', 'Need recommendations'];
  } else if (lowerResponse.includes('fever') || lowerResponse.includes('temperature')) {
    options = ['I don\'t know', 'Under 38°C (100.4°F)', '38 to 39°C (100.4-102.2°F)', 'Over 39°C (102.2°F)'];
  } else if (lowerResponse.includes('pain location') || lowerResponse.includes('where is the pain') || lowerResponse.includes('abdomen') || lowerResponse.includes('back') || lowerResponse.includes('side')) {
    options = [
      'Lower right abdomen',
      'Lower left abdomen',
      'Upper right abdomen',
      'Upper left abdomen',
      'Middle abdomen',
      'All over',
    ];
  } else if (lowerResponse.includes('urination') || lowerResponse.includes('pee') || lowerResponse.includes('urine')) {
    options = [
      'Burning when urinating',
      'Frequent urination',
      'Blood in urine',
      'Flank pain (side or back)',
      'None of these',
    ];
  } else if (lowerResponse.includes('vaginal') || lowerResponse.includes('discharge') || lowerResponse.includes('itch') || lowerResponse.includes('smell')) {
    options = [
      'No discharge',
      'White, thick, itchy',
      'Gray, thin, fishy smell',
      'Yellow, green, or frothy',
      'Bloody or after sex',
    ];
  } else if (lowerResponse.includes('cough') || lowerResponse.includes('sore throat') || lowerResponse.includes('congestion')) {
    options = ['Dry cough', 'Wet cough', 'Intermittent', 'Constant'];
  } else if (lowerResponse.includes('based on your symptoms')) {
    options = ['Get more details', 'Save this result', 'Start new assessment', 'Share result'];
  } else if (lowerResponse.includes('other symptoms') || lowerResponse.includes('anything else')) {
    options = ['Yes, more symptoms', 'No, that\'s all', 'Not sure', 'Back to main'];
  } else {
    // Default fallback options
    options = [];
  }

  return options;
}

router.post('/', async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ message: 'Too many requests, slow down.', options: [] });
    }

    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ message: "Missing or invalid 'messages' array in request body.", options: [] });
    }

    // log incoming conversation for audit/debugging
    console.log('📩 New symptom-check request from', ip);
    messages.forEach((m, idx) => {
      console.log(`   ${idx + 1}. [${m.role}] ${m.content}`);
    });
    // also push record to persistent log (stub)
    logSymptomCheck({ ip, messages });

    const systemPrompt = {
      role: 'system',
      content:
        "You are a structured symptom checker. Always start by screening for serious red flags (e.g. chest pain, difficulty breathing, altered mental status, high fever, uncontrolled bleeding) before proceeding with further questions. " +
        "Ask one question at a time, and always base your next question on the user's previous answer. " +
        "CRITICAL: For every assistant reply, you MUST return a short human-readable message followed by a JSON block (marked as ```json ... ```). " +
        "The JSON must contain exactly these keys: `message` (the assistant text), `options` (array of selectable answers), and `type` ('question' or 'recommendation'). " +
        "Do NOT include formatted option lists in the message text when returning JSON options—just put the options in the `options` array. " +
        "When you have gathered enough information to make a recommendation, begin your response with: 'Based on your symptoms,' and include: `triage` (one of \"Emergency now\", \"Urgent today\", \"Routine, book soon\", \"Self care, monitor\"), `conditionClusters` (object with `mostConsistent`, `alsoPossible`, `lessLikely` arrays), and `actionPlan` (object with `doNow`, `avoid`, `monitor`, `escalate`, `whereToGo` keys). " +
        "Always keep replies concise. If unsure, escalate appropriately.",
    };

    const payload = {
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [systemPrompt, ...messages],
      max_tokens: 800,
      temperature: 0.2,
    };

    const apiKey = process.env.DAILY_API_KEY;
    console.log('Using OpenAI API Key:', apiKey ? 'configured' : 'NOT configured');
    if (!apiKey) return res.status(500).json({ message: 'OpenAI API key not configured on server.', options: [] });
    
    const response = await axios.post('https://api.openai.com/v1/chat/completions', payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30 * 1000,
    });

    const data = response.data;
    const aiReply = data?.choices?.[0]?.message?.content || 'I couldn\'t process your input, please try again.';

    // Logging incoming conversation for debugging
    console.log('🤖 AI reply raw:', aiReply);

    // Try to extract a JSON block from the model's reply. Support fenced ```json blocks or a trailing JSON object.
    let parsedOptions = [];
    let messageText = aiReply;
    let messageType = aiReply.toLowerCase().includes('based on your symptoms') ? 'recommendation' : 'question';
    let triage;
    let conditionClusters;
    let actionPlan;

    try {
      const jsonFenceMatch = aiReply.match(/```json\s*([\s\S]*?)\s*```/i);
      const trailingObjectMatch = !jsonFenceMatch && aiReply.match(/(\{[\s\S]*\})\s*$/);
      const jsonText = jsonFenceMatch ? jsonFenceMatch[1] : (trailingObjectMatch ? trailingObjectMatch[1] : null);

      if (jsonText) {
        const obj = JSON.parse(jsonText);
        if (obj && typeof obj === 'object') {
          if (typeof obj.message === 'string') messageText = obj.message;
          if (Array.isArray(obj.options)) parsedOptions = obj.options;
          if (typeof obj.type === 'string') messageType = obj.type;
          if (typeof obj.triage === 'string') triage = obj.triage;
          if (obj.conditionClusters && typeof obj.conditionClusters === 'object') {
            conditionClusters = obj.conditionClusters;
          }
          if (obj.actionPlan && typeof obj.actionPlan === 'object') {
            actionPlan = obj.actionPlan;
          }
        }
      } else {
        // Fallback: use heuristic generator when model didn't return JSON
        parsedOptions = generateOptions(aiReply);
      }
    } catch (parseErr) {
      console.warn('Failed to parse JSON from model reply, falling back to heuristic options.', parseErr);
      parsedOptions = generateOptions(aiReply);
    }

    // log triage outcome when available
    if (triage) {
      console.log('➡️ Triage outcome:', triage);
      logSymptomCheck({ ip, triage });
    }

    return res.json({
      message: messageText,
      options: parsedOptions,
      type: messageType,
      triage,
      conditionClusters,
      actionPlan,
      raw: process.env.NODE_ENV !== 'production' ? data : undefined,
    });
  } catch (err) {
    console.error('❌ /api/gpt/chat error:', err?.response?.data || err.message || err);
    return res.status(500).json({ message: 'Server error processing chat request.', options: ['Retry', 'Start Over'] });
  }
});

module.exports = router;

// also export helpers for unit tests (and rateMap for cleanup)
module.exports.generateOptions = generateOptions;
module.exports.checkRateLimit = checkRateLimit;
module.exports.rateMap = rateMap;
