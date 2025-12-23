# Asha — Health Assistant (backend)

Endpoints:

- POST /api/asha/chat
  - Body: { messages: [{ role: 'user'|'assistant'|'system', content: string }], userProfile?: { id, name, age, gender } }
  - Returns: { reply: string, raw?: object }

Quick start (backend folder):

1. Install deps

```bash
npm install
```

2. Ensure your OpenAI key is set in `.env` as `DAILY_API_KEY` (the repo already uses this variable).

3. Run server

```bash
npm start
```

Run tests:

```bash
npm test
```

Notes:
- The route uses a system prompt to enforce medical safety and adds a short disclaimer to responses.
- Logging is appended to `backend/logs/asha.log` for basic debugging. Avoid logging sensitive PII in production.
- For streaming responses, further work is required (server-sent events / websockets)."}]}]