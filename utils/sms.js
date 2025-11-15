const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const sendSMS = async (to, message) => {
  try {
    if (!to) return;
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    console.log(`📱 SMS sent to ${to}`);
  } catch (err) {
    console.error("SMS Error:", err.message);
  }
};

module.exports = sendSMS;
