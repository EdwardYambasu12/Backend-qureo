const express = require('express');
const axios = require('axios');
const multer = require('multer');
const mongoose = require('mongoose');
const openai = require('../lib/openai');
const SymptomChat = require('../models/SymptomChat');

const router = express.Router();
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are supported for this endpoint.'));
    }
    cb(null, true);
  },
});

function safeJsonParse(text) {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (_e) {
    return null;
  }
}

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

router.post('/chat/save', async (req, res) => {
  try {
    const {
      sessionId,
      title,
      messages,
      userId,
      lastSaveTime,
      metadata,
    } = req.body || {};

    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      return res.status(400).json({ message: 'sessionId is required.' });
    }

    if (!Array.isArray(messages)) {
      return res.status(400).json({ message: 'messages must be an array.' });
    }

    const safeMessages = messages
      .slice(-300)
      .map((msg) => ({
        role: msg?.role === 'assistant' ? 'assistant' : 'user',
        content: typeof msg?.content === 'string' ? msg.content : '',
        type: typeof msg?.type === 'string' ? msg.type : 'question',
        options: Array.isArray(msg?.options)
          ? msg.options.filter((item) => typeof item === 'string').slice(0, 12)
          : [],
        selectedOptions: Array.isArray(msg?.selectedOptions)
          ? msg.selectedOptions.filter((item) => typeof item === 'string').slice(0, 12)
          : [],
        imageUrl: typeof msg?.imageUrl === 'string' ? msg.imageUrl : '',
        triage: msg?.triage ?? null,
        conditionClusters: msg?.conditionClusters ?? null,
        actionPlan: msg?.actionPlan ?? null,
      }));

    const ownerId =
      userId && mongoose.Types.ObjectId.isValid(String(userId))
        ? new mongoose.Types.ObjectId(String(userId))
        : null;

    const query = ownerId
      ? { user: ownerId, sessionId: sessionId.trim() }
      : { sessionId: sessionId.trim() };

    const update = {
      $set: {
        user: ownerId,
        title: typeof title === 'string' && title.trim() ? title.trim() : 'Symptom Check Session',
        messages: safeMessages,
        lastSaveTime: lastSaveTime ? new Date(lastSaveTime) : new Date(),
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
      },
    };

    const saved = await SymptomChat.findOneAndUpdate(query, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });

    return res.json({
      ok: true,
      id: saved?._id,
      updatedAt: saved?.updatedAt,
      savedCount: Array.isArray(saved?.messages) ? saved.messages.length : 0,
    });
  } catch (err) {
    console.error('❌ /api/gpt/chat/save error:', err?.message || err);
    return res.status(500).json({ message: 'Failed to save symptom chat.' });
  }
});

router.post('/analyze-image', uploadImage.single('image'), async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ message: 'Too many requests, slow down.', options: [] });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'No image uploaded.', options: [] });
    }

    const { originalname, mimetype, buffer } = req.file;
    const base64Image = buffer.toString('base64');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a clinical image triage assistant. Analyze medical images including X-rays, skin photos, wounds, swelling, throat/eye photos, and health document screenshots. ' +
            'Never ask user to upload again. The image is already provided. ' +
            'Return ONLY valid JSON with keys: message, options, type, triage, conditionClusters, actionPlan. ' +
            'Use careful language: observations, possible interpretations, and safety-focused next steps. If uncertain, say so clearly and escalate appropriately.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `Analyze this uploaded image (${originalname || 'medical image'}) and explain what you see in plain language. ` +
                'If this is an X-ray, describe visible structures and any obvious abnormal patterns. ' +
                'If this is a skin or symptom photo, describe location/pattern/severity clues. ' +
                'If this is a medical document screenshot, extract key findings and values. ' +
                'Then provide urgency triage and actionable next steps.'
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimetype};base64,${base64Image}` }
            }
          ]
        }
      ]
    });

    const rawContent = response?.choices?.[0]?.message?.content || '';
    const parsed = safeJsonParse(rawContent);

    if (!parsed) {
      return res.json({
        message: typeof rawContent === 'string' && rawContent.trim()
          ? rawContent
          : 'I reviewed the image but could not structure the findings. Please consult a clinician for formal interpretation.',
        options: [
          'What findings look concerning?',
          'Should I seek urgent care?',
          'Explain the image in simple terms'
        ],
        type: 'recommendation',
        triage: 'Routine, book soon',
        conditionClusters: {
          mostConsistent: ['Image-based symptom review'],
          alsoPossible: ['Needs clinician confirmation'],
          lessLikely: []
        },
        actionPlan: {
          doNow: ['Share this image with a licensed clinician for confirmation'],
          avoid: ['Do not self-diagnose based only on this image'],
          monitor: ['Track changes in pain, swelling, fever, breathing, or function'],
          escalate: ['Go to emergency care for severe pain, breathing trouble, chest pain, neurological changes, or rapidly worsening symptoms'],
          whereToGo: 'Primary care, urgent care, or emergency department depending on symptom severity'
        }
      });
    }

    return res.json({
      message: parsed.message || 'I analyzed the image and shared findings above.',
      options: Array.isArray(parsed.options) ? parsed.options : [],
      type: parsed.type || 'recommendation',
      triage: parsed.triage,
      conditionClusters: parsed.conditionClusters,
      actionPlan: parsed.actionPlan,
    });
  } catch (err) {
    console.error('❌ /api/gpt/analyze-image error:', err?.response?.data || err.message || err);
    return res.status(500).json({
      message: 'Unable to analyze this image right now. Please try again.',
      options: ['Retry', 'Start Over'],
    });
  }
});



router.post('/', async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ message: 'Too many requests, slow down.', options: [] });
    }

    const { messages } = req.body;
    console.log("message", messages)
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ message: "Missing or invalid 'messages' array in request body.", options: [] });
    }

    // Check if any message contains an image
    const hasImages = messages.some(m => m.imageUrl);
    
    // log incoming conversation for audit/debugging
    console.log('📩 New symptom-check request from', ip, hasImages ? '(with images)' : '');
    messages.forEach((m, idx) => {
      console.log(`   ${idx + 1}. [${m.role}] ${m.content}${m.imageUrl ? ` [IMAGE: ${m.imageUrl}]` : ''}`);
    });
    // also push record to persistent log (stub)
    logSymptomCheck({ ip, messages });

    const systemPrompt = {
      role: 'system',
      content: hasImages 
        ? "You are an expert medical image analysis assistant. CRITICAL: You MUST analyze every image provided and give detailed findings. DO NOT ask the user to upload an image again - YOU HAVE RECEIVED AN IMAGE. Analyze it now. For every medical image/document: 1) DESCRIBE exactly what you see (all visible text, numbers, findings, abnormalities), 2) IDENTIFY the type of image (lab result, X-ray, prescription, blood test, scan, etc.), 3) EXPLAIN any abnormalities in detail, 4) State what medical condition(s) this might indicate, 5) Provide urgency level and next steps. Return detailed analysis followed by JSON in ```json ... ``` with keys: message, options, type, triage, conditionClusters, actionPlan"
        : "You are a structured symptom checker. Always start by screening for serious red flags (e.g. chest pain, difficulty breathing, altered mental status, high fever, uncontrolled bleeding) before proceeding with further questions. Ask one question at a time, and always base your next question on the user's previous answer. Return ONLY valid JSON in ```json ... ``` block with keys: message, options, type, triage, conditionClusters, actionPlan",
    };

    // Format messages for API - handle both text-only and vision messages
    const formattedMessages = messages.map(m => {
      if (m.imageUrl) {
        // Vision message format
        console.log('📸 Processing image message with URL:', m.imageUrl);
        return {
          role: m.role,
          content: [
            { type: "text", text: m.content || "Please analyze this medical image in detail and explain what you see and what it indicates." },
            { type: "image_url", image_url: { url: m.imageUrl } }
          ]
        };
      } else {
        // Text-only message format
        return {
          role: m.role,
          content: m.content
        };
      }
    });

const payload = {
  model: hasImages ? "gpt-4o" : "gpt-4.1-mini",  // gpt-4o has vision capabilities

  messages: [
    {
      role: "system",
      content: systemPrompt.content
    },
    ...formattedMessages
  ],

  response_format: {
    type: "json_schema",
    json_schema: {
      name: "symptom_checker",
      strict: true,
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
  temperature: 0.7,
  max_tokens: 1200
};
    const apiKey = process.env.OPENAI_API_KEY || process.env.DAILY_API_KEY;
 
    if (!apiKey) return res.status(500).json({ message: 'OpenAI API key not configured on server.', options: [] });
    
    const response = await axios.post('https://api.openai.com/v1/chat/completions', payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30 * 1000,
    });

    const data = response.data;
    // Extract JSON from structured output (gpt-4o returns JSON directly in content)
    const aiReply = data?.choices?.[0]?.message?.content || 'I couldn\'t process your input, please try again.';

    console.log('✅ API Response received');
    console.log('   Model used:', data?.model);
    console.log('   Reply length:', aiReply.length, 'chars');
    if (hasImages) console.log('   (Vision analysis) First 300 chars:', aiReply.substring(0, 300));

    // Try to extract JSON from the model's reply
    let parsedOptions = [];
    let messageText = aiReply;
    let messageType = 'question';
    let triage;
    let conditionClusters;
    let actionPlan;

    try {
      // First try to parse as direct JSON (from structured output)
      let obj;
      try {
        obj = JSON.parse(aiReply);
      } catch (e) {
        // Fallback: try to extract JSON block from text
        const jsonFenceMatch = aiReply.match(/```json\s*([\s\S]*?)\s*```/i);
        const trailingObjectMatch = !jsonFenceMatch && aiReply.match(/(\{[\s\S]*\})\s*$/);
        const jsonText = jsonFenceMatch ? jsonFenceMatch[1] : (trailingObjectMatch ? trailingObjectMatch[1] : null);
        
        if (jsonText) {
          obj = JSON.parse(jsonText);
        }
      }

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
