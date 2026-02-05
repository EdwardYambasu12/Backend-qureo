const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.DAILY_API_KEY,
});

module.exports =  openai;
