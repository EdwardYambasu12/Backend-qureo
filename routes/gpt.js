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
    options = ['Below 100.4°F', '100.4-101.5°F', '101.6-102.5°F', 'Above 102.5°F'];
  } else if (lowerResponse.includes('cough') || lowerResponse.includes('sore throat') || lowerResponse.includes('congestion')) {
    options = ['Dry cough', 'Wet cough', 'Intermittent', 'Constant'];
  } else if (lowerResponse.includes('based on your symptoms')) {
    options = ['Get more details', 'Save this result', 'Start new assessment', 'Share result'];
  } else if (lowerResponse.includes('other symptoms') || lowerResponse.includes('anything else')) {
    options = ['Yes, more symptoms', 'No, that\'s all', 'Not sure', 'Back to main'];
  } else {
    // Default fallback options
    options = ['Yes', 'No', 'Maybe', 'Skip this'];
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

    const systemPrompt = {
      role: 'system',
      content:
        "You are a structured symptom checker. Ask one question at a time, and always base your next question on the user's previous answer. " +
        "When you have gathered enough information, begin your final response with the phrase: 'Based on your symptoms,' followed by your analysis and recommendations also severity. " +
        "Keep responses concise and medically relevant. If unsure, advise the user to consult a healthcare professional. " +
        "IMPORTANT: For every assistant reply, return a short human-readable reply followed by a JSON block (marked as ```json ... ```). The JSON must contain exactly these keys: `message` (string) = the assistant's reply text, `options` (array of strings) = suggested clickable options for the user, and `type` (either 'question' or 'recommendation'). Example:\n```json\n{\n  \"message\": \"When did the pain start?\",\n  \"options\": [\"Just started\", \"This morning\", \"Yesterday\", \"A few days ago\"],\n  \"type\": \"question\"\n}\n```\nIf you cannot provide options for any reason, return an empty array for `options`. Always ensure the JSON is valid and parseable."
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

    // Try to extract a JSON block from the model's reply. Support fenced ```json blocks or a trailing JSON object.
    let parsedOptions = [];
    let messageText = aiReply;
    let messageType = aiReply.toLowerCase().includes('based on your symptoms') ? 'recommendation' : 'question';

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
        }
      } else {
        // Fallback: use heuristic generator when model didn't return JSON
        parsedOptions = generateOptions(aiReply);
      }
    } catch (parseErr) {
      console.warn('Failed to parse JSON from model reply, falling back to heuristic options.', parseErr);
      parsedOptions = generateOptions(aiReply);
    }

    return res.json({
      message: messageText,
      options: parsedOptions,
      type: messageType,
      raw: process.env.NODE_ENV !== 'production' ? data : undefined,
    });
  } catch (err) {
    console.error('❌ /api/gpt/chat error:', err?.response?.data || err.message || err);
    return res.status(500).json({ message: 'Server error processing chat request.', options: ['Retry', 'Start Over'] });
  }
});

module.exports = router;
