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

function detectActionsFromUserIntent(userText) {
  const t = String(userText || '').toLowerCase();
  if (!t.trim()) return [];

  const actions = [];
  const push = (action) => {
    if (!actions.find((a) => a.type === action.type && a.path === action.path && a.label === action.label)) {
      actions.push(action);
    }
  };

  const hasAny = (keywords = []) => keywords.some((k) => t.includes(k));

  if (hasAny(['read', 'article', 'blog', 'learn', 'learn health', 'health education'])) {
    push({ type: 'navigate', label: 'Go to Learn Health', path: '/blogs' });
  }

  if (hasAny(['symptom', 'symptoms', 'symptom checker', 'check symptom', 'what disease'])) {
    push({ type: 'navigate', label: 'Open symptom checker', path: '/symptom-checker' });
  }

  if (hasAny(['pharmacy', 'medicine', 'drug', 'prescription', 'buy medicine'])) {
    push({ type: 'navigate', label: 'Open pharmacy', path: '/epharmacy' });
  }

  if (hasAny(['doctor', 'consult', 'consultation', 'appointment', 'book doctor'])) {
    push({ type: 'navigate', label: 'Open consultations', path: '/doctor-consult' });
  }

  if (hasAny(['lab', 'test', 'lab test', 'blood test', 'scan test'])) {
    push({ type: 'navigate', label: 'Open lab tests', path: '/lab-tests' });
  }

  if (hasAny(['wallet', 'balance', 'payment', 'pay', 'billing'])) {
    push({ type: 'navigate', label: 'Open wallet', path: '/health-wallet' });
  }

  if (hasAny(['insurance', 'claim', 'policy'])) {
    push({ type: 'navigate', label: 'Open insurance', path: '/insurance' });
  }

  if (hasAny(['record', 'health record', 'document', 'report'])) {
    push({ type: 'navigate', label: 'Open health records', path: '/my-health-records' });
  }

  if (hasAny(['remote', 'monitoring', 'track vitals', 'vitals tracking'])) {
    push({ type: 'navigate', label: 'Open remote monitoring', path: '/remote' });
  }

  if (hasAny(['tip', 'tips', 'health tip'])) {
    push({ type: 'navigate', label: 'Open health tips', path: '/health-tips' });
  }

  if (hasAny(['notification', 'notifications', 'alert'])) {
    push({ type: 'navigate', label: 'Open notifications', path: '/notification' });
  }

  if (hasAny(['order', 'orders', 'delivery'])) {
    push({ type: 'navigate', label: 'View orders', path: '/orders' });
  }

  if (hasAny(['service', 'nearby', 'clinic near me'])) {
    push({ type: 'navigate', label: 'Open nearby services', path: '/services' });
  }

  if (hasAny(['campaign', 'campaigns'])) {
    push({ type: 'navigate', label: 'Open campaigns', path: '/campaigns' });
  }

  if (hasAny(['emergency', 'urgent', 'help now'])) {
    push({ type: 'navigate', label: 'Open emergency response', path: '/emergency-response' });
  }

  if (hasAny(['profile', 'account'])) {
    push({ type: 'navigate', label: 'Open profile', path: '/profile' });
  }

  if (hasAny(['setting', 'settings', 'preference'])) {
    push({ type: 'navigate', label: 'Open settings', path: '/settings' });
  }

  if (hasAny(['apps', 'features', 'what can you do', 'take me around', 'guide me'])) {
    push({ type: 'navigate', label: 'Go to Home', path: '/home' });
    push({ type: 'navigate', label: 'Go to Learn Health', path: '/blogs' });
    push({ type: 'navigate', label: 'Open symptom checker', path: '/symptom-checker' });
    push({ type: 'navigate', label: 'Open consultations', path: '/doctor-consult' });
    push({ type: 'navigate', label: 'Open lab tests', path: '/lab-tests' });
    push({ type: 'navigate', label: 'Open pharmacy', path: '/epharmacy' });
  }

  return actions;
}

function removeInlineActionsBlock(text) {
  if (!text || typeof text !== 'string') return text || '';
  const marker = 'ACTIONS:';
  const markerIdx = text.indexOf(marker);
  if (markerIdx === -1) return text;

  const braceStart = text.indexOf('{', markerIdx);
  if (braceStart === -1) {
    return `${text.slice(0, markerIdx)}${text.slice(markerIdx + marker.length)}`;
  }

  let depth = 0;
  let endIdx = -1;
  for (let i = braceStart; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }

  if (endIdx === -1) return text;
  return `${text.slice(0, markerIdx)}${text.slice(endIdx)}`;
}

function extractActionsAndCleanText(text) {
  if (!text || typeof text !== 'string') {
    return { cleanedText: text || '', parsedActions: null };
  }

  const candidates = [];
  const codeBlockMatches = text.match(/```json\s*([\s\S]*?)```/gi) || [];
  codeBlockMatches.forEach((block) => {
    const stripped = block.replace(/```json/i, '').replace(/```/g, '').trim();
    if (stripped) candidates.push(stripped);
  });

  const actionsLabelIdx = text.indexOf('ACTIONS:');
  if (actionsLabelIdx !== -1) {
    const trailing = text.slice(actionsLabelIdx + 'ACTIONS:'.length).trim();
    if (trailing) candidates.push(trailing);
  }

  const firstBrace = text.indexOf('{');
  if (firstBrace !== -1) {
    const trailingObj = text.slice(firstBrace).trim();
    if (trailingObj) candidates.push(trailingObj);
  }

  let parsedActions = null;
  for (const candidate of candidates) {
    try {
      let jsonStr = candidate;
      const lastBrace = jsonStr.lastIndexOf('}');
      if (lastBrace !== -1) jsonStr = jsonStr.slice(0, lastBrace + 1);
      const parsed = JSON.parse(jsonStr);

      if (Array.isArray(parsed?.actions)) {
        parsedActions = parsed.actions;
        break;
      }
      if (Array.isArray(parsed?.ACTIONS?.actions)) {
        parsedActions = parsed.ACTIONS.actions;
        break;
      }
      if (Array.isArray(parsed?.ACTIONS)) {
        parsedActions = parsed.ACTIONS;
        break;
      }
    } catch (_e) {
      // try next candidate
    }
  }

  let cleanedText = text
    .replace(/```json[\s\S]*?```/gi, '')
    .replace(/\{\s*"ACTIONS"\s*:\s*\{[\s\S]*?\}\s*\}\s*$/i, '')
    .replace(/ACTIONS:\s*\{[\s\S]*\}\s*$/i, '')
    .trim();

  cleanedText = removeInlineActionsBlock(cleanedText)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleanedText) cleanedText = text;

  return { cleanedText, parsedActions };
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

    try { const logsDir = path.resolve(__dirname, '..', 'logs'); if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true }); const preview = redactText((messages.slice(-1)[0]?.content || '').slice(0,120)).replace(/\n/g,' '); fs.appendFileSync(path.join(logsDir, 'asha.log'), `${new Date().toISOString()} | IP:${ip} | userPreview:${preview}\n`); } catch (e) { console.warn('Log fail', e.message||e); }

    const systemPrompt = { role: 'system', content: "You are Asha, a concise in-app guide for Qureo. Primary goal: help users understand features and take them to the correct app page. Do not provide long medical analysis unless explicitly asked; prefer app navigation help first.\n\nBehavior rules:\n1) If a user asks to read/learn -> route to Learn Health (/blogs).\n2) If user asks to check symptoms -> route to Symptom Checker (/symptom-checker).\n3) For doctor help -> consultations (/doctor-consult).\n4) For medicines -> ePharmacy (/epharmacy).\n5) For tests -> lab tests (/lab-tests).\n6) For wallet/payments -> health wallet (/health-wallet).\n7) For records -> health records (/my-health-records).\n8) For remote tracking -> remote monitoring (/remote).\n9) For notifications -> notification page (/notification).\n\nAlways include short, practical text (1-4 lines), then provide actions.\nWhen you want the app to present actions, append a JSON object labeled 'ACTIONS' with an 'actions' array. Each action schema: { \"type\": (\"navigate\"|\"book_appointment\"|\"seek_emergency_care\"|\"book_lab_test\"), \"name\": optional_short_action_name, \"path\": optional_explicit_path, \"meta\": optional_object }." };
    const profilePrompt = userProfile ? { role: 'system', content: `User profile: ${JSON.stringify(userProfile)}. Use this info to personalize, but do not reveal private identifiers.` } : null;
    const safeMessages = (profilePrompt ? [systemPrompt, profilePrompt, ...messages] : [systemPrompt, ...messages]).map(m=>({ role: m.role, content: redactText(m.content) }));

    const payload = { model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: safeMessages, max_tokens: 800, temperature: 0.2 };
    const apiKey = process.env.DAILY_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!apiKey) return res.status(500).json({ message: 'OpenAI API key not configured.' });
    const response = await axios.post('https://api.openai.com/v1/chat/completions', payload, { headers: { 'Content-Type':'application/json', Authorization: `Bearer ${apiKey}` }, timeout: 30*1000 });

    const data = response.data; let aiText = data?.choices?.[0]?.message?.content || 'Sorry, I could not process that.';
    const extracted = extractActionsAndCleanText(aiText);
    aiText = extracted.cleanedText;
    let parsedActions = extracted.parsedActions;
    if(parsedActions){ const wrapped={actions:parsedActions}; const valid = validateActionsWrapper(wrapped); if(!valid){ console.warn('ACTIONS validation failed', validateActionsWrapper.errors); parsedActions=null; } else parsedActions = wrapped.actions; }

    const lastUserMessage = messages.slice().reverse().find((m) => m?.role === 'user' && typeof m?.content === 'string')?.content || '';
    const intentActions = detectActionsFromUserIntent(lastUserMessage);

    let finalActions=[]; const allowed = new Set(['navigate','book_appointment','seek_emergency_care','book_lab_test']);
    if(Array.isArray(parsedActions)&&parsedActions.length>0){ for(const a of parsedActions){ if(!a||typeof a!=='object') continue; if(!a.type||!allowed.has(a.type)) continue; if(a.type==='navigate'){ if(a.name&&actionMap[a.name]) finalActions.push({ type:'navigate', label:actionMap[a.name].label, path:actionMap[a.name].path, name:a.name }); else if(a.path) finalActions.push({ type:'navigate', label:a.label||'Open page', path:a.path }); } else if(a.type==='book_appointment'){ const meta=a.meta||{}; const safeMeta={}; if(meta.doctorId&&typeof meta.doctorId==='string') safeMeta.doctorId=meta.doctorId; if(Array.isArray(meta.times)) safeMeta.times=meta.times.filter(t=>typeof t==='string'); finalActions.push({ type:'book_appointment', label:a.label||'Book appointment', meta:safeMeta }); } else if(a.type==='seek_emergency_care'){ finalActions.push({ type:'seek_emergency_care', label:a.label||'Seek emergency care' }); } else if(a.type==='book_lab_test'){ finalActions.push({ type:'book_lab_test', label:a.label||'Schedule lab test' }); } } } else { finalActions = detectActions(aiText); }
    finalActions = [...intentActions, ...finalActions].filter((a, i, arr) => arr.findIndex((x) => x.type === a.type && x.path === a.path && x.label === a.label) === i);

    try{ const logsDir = path.resolve(__dirname,'..','logs'); if(!fs.existsSync(logsDir)) fs.mkdirSync(logsDir,{ recursive:true }); fs.appendFileSync(path.join(logsDir,'asha_actions.log'), `${new Date().toISOString()} | ACTIONS_EMITTED: ${JSON.stringify(finalActions)}\n`); }catch(e){ console.warn('Telem write failed', e.message||e); }

    return res.json({ reply: aiText, actions: finalActions, raw: process.env.NODE_ENV!=='production' ? data : undefined });
  }catch(err){ console.error('/api/asha/chat error', err?.response?.data||err.message||err); return res.status(500).json({ message:'Server error processing Asha chat.' }); }
});

router.post('/stream', async (req,res)=>{
  try{
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    if(!checkRateLimit(ip)) return res.status(429).json({ message:'Too many requests' });
    const { messages, userProfile } = req.body; if(!messages||!Array.isArray(messages)) return res.status(400).json({ message:"Missing 'messages' array" });

    const systemPrompt = { role:'system', content: "You are Asha, a concise in-app guide for Qureo. Primary goal: help users understand features and take them to the correct app page. Prefer navigation help over long medical explanations.\n\nRules:\n- Read/learn => /blogs\n- Check symptoms => /symptom-checker\n- Doctor consult => /doctor-consult\n- Medicines => /epharmacy\n- Lab tests => /lab-tests\n- Wallet => /health-wallet\n- Records => /my-health-records\n- Remote tracking => /remote\n- Notifications => /notification\n\nKeep response short, actionable, then provide actions." };
    const profilePrompt = userProfile ? { role:'system', content:`User profile: ${JSON.stringify(userProfile)}. Use this info to personalize, but do not reveal private identifiers.` } : null;
    const safeMessages = (profilePrompt ? [systemPrompt, profilePrompt, ...messages] : [systemPrompt, ...messages]).map(m=>({ role:m.role, content:redactText(m.content) }));
    const apiKey = process.env.DAILY_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENAI_KEY; if(!apiKey) return res.status(500).json({ message:'OpenAI API key not configured.' });
    const payload = { model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: safeMessages, max_tokens:800, temperature:0.2 };
    const response = await axios.post('https://api.openai.com/v1/chat/completions', payload, { headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${apiKey}` }, timeout:30*1000 });
    const rawText = response.data?.choices?.[0]?.message?.content || 'Sorry, I could not process that.';
    const extracted = extractActionsAndCleanText(rawText);
    const aiText = extracted.cleanedText;
    let actions = Array.isArray(extracted.parsedActions) ? extracted.parsedActions : [];
    if (actions.length > 0) {
      const wrapped = { actions };
      const valid = validateActionsWrapper(wrapped);
      actions = valid ? wrapped.actions : [];
    }
    const lastUserMessage = messages.slice().reverse().find((m) => m?.role === 'user' && typeof m?.content === 'string')?.content || '';
    const intentActions = detectActionsFromUserIntent(lastUserMessage);
    if (actions.length === 0) actions = detectActions(aiText);
    actions = [...intentActions, ...actions].filter((a, i, arr) => arr.findIndex((x) => x.type === a.type && x.path === a.path && x.label === a.label) === i);
    res.setHeader('Content-Type','application/x-ndjson'); res.setHeader('Cache-Control','no-cache'); res.flushHeaders && res.flushHeaders();
    const chunkSize=80; for(let i=0;i<aiText.length;i+=chunkSize){ const piece=aiText.slice(i,i+chunkSize); res.write(JSON.stringify({ chunk: piece })+'\n'); await new Promise(r=>setTimeout(r,25)); }
    res.write(JSON.stringify({ done:true, actions })+'\n'); res.end();
  }catch(err){ console.error('/api/asha/stream', err?.response?.data||err.message||err); return res.status(500).json({ message:'Server error processing Asha stream.' }); }
});

router.post('/telemetry', async (req,res)=>{ try{ const { action, userId, timestamp } = req.body; const logsDir = path.resolve(__dirname,'..','logs'); if(!fs.existsSync(logsDir)) fs.mkdirSync(logsDir,{ recursive:true }); const entry={ ts: timestamp||new Date().toISOString(), userId: userId||null, action }; fs.appendFileSync(path.join(logsDir,'asha_action_usage.log'), JSON.stringify(entry)+'\n'); return res.json({ ok:true }); }catch(err){ console.error('Telemetry save failed', err); return res.status(500).json({ ok:false }); } });

router.get('/analytics', async (req,res)=>{ try{ const logsFile = path.resolve(__dirname,'..','logs','asha_action_usage.log'); if(!fs.existsSync(logsFile)) return res.json({ counts:{} }); const lines = fs.readFileSync(logsFile,'utf8').split('\n').filter(Boolean); const counts={}; for(const line of lines){ try{ const obj=JSON.parse(line); const type = obj.action?.type||'unknown'; counts[type]=(counts[type]||0)+1; }catch(e){} } return res.json({ counts }); }catch(err){ console.error('Analytics failed', err); return res.status(500).json({ message:'Failed to get analytics' }); } });

module.exports = router;
