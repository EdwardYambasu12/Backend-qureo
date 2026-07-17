const OpenAI = require("openai");

let openai;

try {
  if (!process.env.DAILY_API_KEY) {
    console.warn("⚠️ DAILY_API_KEY not set — OpenAI features will be disabled");
    openai = null;
  } else {
    openai = new OpenAI({
      apiKey: process.env.DAILY_API_KEY,
    });
  }
} catch (error) {
  console.error("❌ Failed to initialize OpenAI:", error.message);
  openai = null;
}

module.exports = openai;
