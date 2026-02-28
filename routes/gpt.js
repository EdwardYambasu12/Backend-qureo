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
  model: "gpt-4.1-mini",

  input: [
    {
      role: "system",
      content: systemPrompt.content
    },
    ...messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  ],

  text: {
    format: {
      type: "json_schema",
      name: "symptom_checker",

     schema: {
  type: "object",
  additionalProperties: false,

  properties: {
    message: { type: "string" },

    options: {
      type: "array",
      items: { type: "string" }
    },

    type: {
      type: "string",
      enum: ["question", "recommendation"]
    },

    triage: { type: "string" },

    conditionClusters: {
      type: "object",
      additionalProperties: false,
      properties: {
        mostConsistent: {
          type: "array",
          items: { type: "string" }
        },
        alsoPossible: {
          type: "array",
          items: { type: "string" }
        },
        lessLikely: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["mostConsistent", "alsoPossible", "lessLikely"]
    },

    actionPlan: {
      type: "object",
      additionalProperties: false,
      properties: {
        doNow: {
          type: "array",
          items: { type: "string" }
        },
        avoid: {
          type: "array",
          items: { type: "string" }
        },
        monitor: {
          type: "array",
          items: { type: "string" }
        },
        escalate: {
          type: "array",
          items: { type: "string" }
        },
        whereToGo: { type: "string" }
      },
      required: ["doNow", "avoid", "monitor", "escalate", "whereToGo"]
    }
  },

  // 🔥 MUST include ALL property keys
  required: [
    "message",
    "options",
    "type",
    "triage",
    "conditionClusters",
    "actionPlan"
  ]
}
    }
  },

  temperature: 0.2,
  max_output_tokens: 800
};
    const apiKey = process.env.DAILY_API_KEY;
 
    if (!apiKey) return res.status(500).json({ message: 'OpenAI API key not configured on server.', options: [] });
    
    const response = await axios.post('https://api.openai.com/v1/responses', payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30 * 1000,
    });

    const data = response.data;
    const aiReply = data?.output?.[0]?.content?.[0]?.text || 'I couldn\'t process your input, please try again.';

    // Logging incoming conversation for debugging
    

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

module.exports.checkRateLimit = checkRateLimit;
module.exports.rateMap = rateMap;
