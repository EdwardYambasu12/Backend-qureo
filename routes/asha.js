const express = require('express');
const axios = require('axios');
const actionMap = require('../utils/ashaActionMap');
const Ajv = require('ajv');
const ajv = new Ajv();
const fs = require('fs');
const path = require('path');

const actionsSchema = {
  type: 'object',
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          name: { type: 'string' },
          path: { type: 'string' },
          label: { type: 'string' },
          meta: { type: 'object' }
        },
        required: ['type']
      }
    }
  },
  required: ['actions']
};
const validateActionsWrapper = ajv.compile(actionsSchema);

const router = express.Router();

function redactText(text) {
  if (!text) return text;
  text = text.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+)\.([a-zA-Z]{2,})/g, '[REDACTED_EMAIL]');
  text = text.replace(/\+?\d[\d ()-]{6,}\d/g, '[REDACTED_PHONE]');
  text = text.replace(/\b\d{6,}\b/g, '[REDACTED_ID]');
  return text;
}

function detectActions(replyText) {
  const actions = [];
  const t = (replyText || '').toLowerCase();
  if (t.includes('book') && t.includes('appointment')) {
    actions.push({ type: 'book_appointment', label: 'Book appointment' });
  }
  if (t.includes('schedule') && t.includes('test')) {
    actions.push({ type: 'book_lab_test', label: 'Schedule lab test' });
  }
  if (t.includes('call emergency') || t.includes('call ambulance') || t.includes('seek immediate')) {
    actions.push({ type: 'seek_emergency_care', label: 'Seek emergency care' });
  }
  if (t.includes('profile')) actions.push({ type: 'navigate', label: 'Open profile', path: '/profile' });
  if (t.includes('cart')) actions.push({ type: 'navigate', label: 'Open cart', path: '/cart' });
  if (t.includes('order') || t.includes('orders')) actions.push({ type: 'navigate', label: 'View orders', path: '/orders' });
  if (t.includes('pharmacy') || t.includes('medicine') || t.includes('prescription')) actions.push({ type: 'navigate', label: 'Open pharmacy', path: '/pharmacy' });
  if (t.includes('consultation') || (t.includes('appointment') && t.includes('doctor'))) {
    if (!actions.find(a => a.type === 'book_appointment')) actions.push({ type: 'navigate', label: 'Open consultations', path: '/consultations' });
  }
  if (t.includes('lab')) actions.push({ type: 'navigate', label: 'Open lab tests', path: '/lab-tests' });
  if (t.includes('blog')) actions.push({ type: 'navigate', label: 'Open blogs', path: '/blogs' });
  if (t.includes('wallet') || t.includes('balance')) actions.push({ type: 'navigate', label: 'Open wallet', path: '/wallet' });
  if (t.includes('insurance') || t.includes('claims')) actions.push({ type: 'navigate', label: 'Open insurance', path: '/insurance' });
  if (t.includes('settings') || t.includes('preferences')) actions.push({ type: 'navigate', label: 'Open settings', path: '/settings' });
  if (t.includes('symptom checker') || t.includes('symptom-checker')) actions.push({ type: 'navigate', label: 'Open symptom checker', path: '/symptom-checker' });
  return actions;
}

function isSymptomConversation(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  const lastUser = [...messages].reverse().find((m) => m && m.role === 'user' && typeof m.content === 'string');
  if (!lastUser) return false;
  const text = (lastUser.content || '').toLowerCase();

  const symptomKeywords = [
    'symptom', 'symptoms', 'pain', 'ache', 'fever', 'cough', 'cold', 'flu', 'headache', 'migraine',
    'sore throat', 'throat pain', 'chest pain', 'breathing', 'shortness of breath', 'wheezing',
    'vomit', 'vomiting', 'nausea', 'diarrhea', 'constipation', 'stomach pain', 'abdominal pain',
    'dizziness', 'faint', 'fatigue', 'weakness', 'rash', 'itching', 'swelling', 'infection',
    'bleeding', 'high temperature', 'body pain', 'runny nose', 'sinus', 'allergy', 'allergic',
    'bp high', 'blood pressure high', 'oxygen low', 'heart racing', 'palpitation', 'injury',
    'xray', 'x-ray', 'scan report', 'what is wrong with me', 'diagnose me', 'diagnosis'
  ];

  return symptomKeywords.some((keyword) => text.includes(keyword));
}

const rateMap = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 40;
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, firstTs: now };
  if (now - entry.firstTs > WINDOW_MS) {
    entry.count = 1; entry.firstTs = now; rateMap.set(ip, entry); return true;
  }
  entry.count += 1; rateMap.set(ip, entry); return entry.count <= MAX_REQUESTS;
}

router.post('/chat', async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) return res.status(429).json({ message: 'Too many requests' });
    const { messages, userProfile } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ message: "Missing 'messages' array" });

    if (isSymptomConversation(messages)) {
      return res.json({
        reply: "I can’t analyze or diagnose symptoms here. Please use the Symptom Checker for symptom-focused assessment and next steps.",
        actions: [{ type: 'navigate', label: 'Open Symptom Checker', path: '/symptom-checker' }],
      });
    }

    try { const logsDir = path.resolve(__dirname, '..', 'logs'); if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true }); const preview = redactText((messages.slice(-1)[0]?.content || '').slice(0,120)).replace(/\n/g,' '); fs.appendFileSync(path.join(logsDir, 'asha.log'), `${new Date().toISOString()} | IP:${ip} | userPreview:${preview}\n`); } catch (e) { console.warn('Log fail', e.message||e); }

    const systemPrompt = { role: 'system', content: "You are Asha, a friendly, concise, and safety-aware healthcare app assistant. You must NOT diagnose or analyze symptoms. If a user asks about symptoms, illness, diagnosis, pain, or medical interpretation, instruct them to use the Symptom Checker and provide a navigation action to /symptom-checker. Keep responses brief and practical. Include a short disclaimer at the end: 'This is informational and not a substitute for professional medical advice.'\n\nWhen you want the app to present actions (for example navigation, booking, or emergency guidance), append a JSON object labeled 'ACTIONS' after your text. The JSON must be valid and contain an 'actions' array. Each action should follow this schema: { \"type\": (\"navigate\"|\"book_appointment\"|\"seek_emergency_care\"|\"book_lab_test\"), \"name\": optional_short_action_name, \"path\": optional_explicit_path, \"meta\": optional_object }. Use short action names the backend can map, e.g. 'profile','cart','orders','pharmacy','consultations','lab_tests','blogs','wallet','insurance','settings','symptom_checker'." };
    const profilePrompt = userProfile ? { role: 'system', content: `User profile: ${JSON.stringify(userProfile)}. Use this info to personalize, but do not reveal private identifiers.` } : null;
    const safeMessages = (profilePrompt ? [systemPrompt, profilePrompt, ...messages] : [systemPrompt, ...messages]).map(m=>({ role: m.role, content: redactText(m.content) }));

    const payload = { model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: safeMessages, max_tokens: 800, temperature: 0.2 };
    const apiKey = process.env.DAILY_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!apiKey) return res.status(500).json({ message: 'OpenAI API key not configured.' });
    const response = await axios.post('https://api.openai.com/v1/chat/completions', payload, { headers: { 'Content-Type':'application/json', Authorization: `Bearer ${apiKey}` }, timeout: 30*1000 });

    const data = response.data; let aiText = data?.choices?.[0]?.message?.content || 'Sorry, I could not process that.';

    function extractActionsFromText(text){ if(!text) return null; const codeBlock = text.match(/```json\s*([\s\S]*?)```/i); let jsonStr = codeBlock ? codeBlock[1] : null; if(!jsonStr){ const idx = text.indexOf('ACTIONS:'); if(idx!==-1) jsonStr = text.slice(idx+'ACTIONS:'.length).trim(); } if(!jsonStr){ const b = text.indexOf('{'); if(b!==-1) jsonStr = text.slice(b); } if(!jsonStr) return null; try{ const last = jsonStr.lastIndexOf('}'); if(last!==-1) jsonStr = jsonStr.slice(0,last+1); const parsed = JSON.parse(jsonStr); return parsed.actions||null; }catch(e){ return null; } }

    let parsedActions = extractActionsFromText(aiText);
    if(parsedActions){ const wrapped={actions:parsedActions}; const valid = validateActionsWrapper(wrapped); if(!valid){ console.warn('ACTIONS validation failed', validateActionsWrapper.errors); parsedActions=null; } else parsedActions = wrapped.actions; }
    if(parsedActions) aiText = aiText.replace(/```json[\s\S]*?```/gi,'').replace(/ACTIONS:\s*[\s\S]*/i,'').trim();

    let finalActions=[]; const allowed = new Set(['navigate','book_appointment','seek_emergency_care','book_lab_test']);
    if(Array.isArray(parsedActions)&&parsedActions.length>0){ for(const a of parsedActions){ if(!a||typeof a!=='object') continue; if(!a.type||!allowed.has(a.type)) continue; if(a.type==='navigate'){ if(a.name&&actionMap[a.name]) finalActions.push({ type:'navigate', label:actionMap[a.name].label, path:actionMap[a.name].path, name:a.name }); else if(a.path) finalActions.push({ type:'navigate', label:a.label||'Open page', path:a.path }); } else if(a.type==='book_appointment'){ const meta=a.meta||{}; const safeMeta={}; if(meta.doctorId&&typeof meta.doctorId==='string') safeMeta.doctorId=meta.doctorId; if(Array.isArray(meta.times)) safeMeta.times=meta.times.filter(t=>typeof t==='string'); finalActions.push({ type:'book_appointment', label:a.label||'Book appointment', meta:safeMeta }); } else if(a.type==='seek_emergency_care'){ finalActions.push({ type:'seek_emergency_care', label:a.label||'Seek emergency care' }); } else if(a.type==='book_lab_test'){ finalActions.push({ type:'book_lab_test', label:a.label||'Schedule lab test' }); } } } else { finalActions = detectActions(aiText); }

    try{ const logsDir = path.resolve(__dirname,'..','logs'); if(!fs.existsSync(logsDir)) fs.mkdirSync(logsDir,{ recursive:true }); fs.appendFileSync(path.join(logsDir,'asha_actions.log'), `${new Date().toISOString()} | ACTIONS_EMITTED: ${JSON.stringify(finalActions)}\n`); }catch(e){ console.warn('Telem write failed', e.message||e); }

    return res.json({ reply: aiText, actions: finalActions, raw: process.env.NODE_ENV!=='production' ? data : undefined });
  }catch(err){ console.error('/api/asha/chat error', err?.response?.data||err.message||err); return res.status(500).json({ message:'Server error processing Asha chat.' }); }
});

router.post('/stream', async (req,res)=>{
  try{
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    if(!checkRateLimit(ip)) return res.status(429).json({ message:'Too many requests' });
    const { messages, userProfile } = req.body; if(!messages||!Array.isArray(messages)) return res.status(400).json({ message:"Missing 'messages' array" });

    if (isSymptomConversation(messages)) {
      const redirectText = "I can’t analyze or diagnose symptoms here. Please use the Symptom Checker for symptom-focused assessment and next steps.";
      const actions = [{ type: 'navigate', label: 'Open Symptom Checker', path: '/symptom-checker' }];
      res.setHeader('Content-Type','application/x-ndjson'); res.setHeader('Cache-Control','no-cache'); res.flushHeaders && res.flushHeaders();
      const chunkSize = 80;
      for (let i = 0; i < redirectText.length; i += chunkSize) {
        const piece = redirectText.slice(i, i + chunkSize);
        res.write(JSON.stringify({ chunk: piece }) + '\n');
      }
      res.write(JSON.stringify({ done: true, actions }) + '\n');
      return res.end();
    }

    const systemPrompt = { role:'system', content: "You are Asha, a friendly, concise, and safety-aware healthcare app assistant. Do NOT diagnose or analyze symptoms. For any symptom-related request, direct user to Symptom Checker and include a navigate action to /symptom-checker." };
    const profilePrompt = userProfile ? { role:'system', content:`User profile: ${JSON.stringify(userProfile)}. Use this info to personalize, but do not reveal private identifiers.` } : null;
    const safeMessages = (profilePrompt ? [systemPrompt, profilePrompt, ...messages] : [systemPrompt, ...messages]).map(m=>({ role:m.role, content:redactText(m.content) }));
    const apiKey = process.env.DAILY_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENAI_KEY; if(!apiKey) return res.status(500).json({ message:'OpenAI API key not configured.' });
    const payload = { model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: safeMessages, max_tokens:800, temperature:0.2 };
    const response = await axios.post('https://api.openai.com/v1/chat/completions', payload, { headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${apiKey}` }, timeout:30*1000 });
    const aiText = response.data?.choices?.[0]?.message?.content || 'Sorry, I could not process that.';
    const actions = detectActions(aiText);
    res.setHeader('Content-Type','application/x-ndjson'); res.setHeader('Cache-Control','no-cache'); res.flushHeaders && res.flushHeaders();
    const chunkSize=80; for(let i=0;i<aiText.length;i+=chunkSize){ const piece=aiText.slice(i,i+chunkSize); res.write(JSON.stringify({ chunk: piece })+'\n'); await new Promise(r=>setTimeout(r,25)); }
    res.write(JSON.stringify({ done:true, actions })+'\n'); res.end();
  }catch(err){ console.error('/api/asha/stream', err?.response?.data||err.message||err); return res.status(500).json({ message:'Server error processing Asha stream.' }); }
});

router.post('/telemetry', async (req,res)=>{ try{ const { action, userId, timestamp } = req.body; const logsDir = path.resolve(__dirname,'..','logs'); if(!fs.existsSync(logsDir)) fs.mkdirSync(logsDir,{ recursive:true }); const entry={ ts: timestamp||new Date().toISOString(), userId: userId||null, action }; fs.appendFileSync(path.join(logsDir,'asha_action_usage.log'), JSON.stringify(entry)+'\n'); return res.json({ ok:true }); }catch(err){ console.error('Telemetry save failed', err); return res.status(500).json({ ok:false }); } });

router.get('/analytics', async (req,res)=>{ try{ const logsFile = path.resolve(__dirname,'..','logs','asha_action_usage.log'); if(!fs.existsSync(logsFile)) return res.json({ counts:{} }); const lines = fs.readFileSync(logsFile,'utf8').split('\n').filter(Boolean); const counts={}; for(const line of lines){ try{ const obj=JSON.parse(line); const type = obj.action?.type||'unknown'; counts[type]=(counts[type]||0)+1; }catch(e){} } return res.json({ counts }); }catch(err){ console.error('Analytics failed', err); return res.status(500).json({ message:'Failed to get analytics' }); } });

module.exports = router;
