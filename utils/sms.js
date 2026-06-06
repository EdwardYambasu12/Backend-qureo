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

const toWhatsAppAddress = (to) => {
  if (!to) return "";
  return String(to).startsWith("whatsapp:") ? String(to) : `whatsapp:${to}`;
};

const sendWhatsApp = async (to, message) => {
  try {
    if (!to) return;
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER;
    if (!fromNumber) return;

    await client.messages.create({
      body: message,
      from: toWhatsAppAddress(fromNumber),
      to: toWhatsAppAddress(to),
    });
    console.log(`WhatsApp sent to ${to}`);
  } catch (err) {
    console.error("WhatsApp Error:", err.message);
  }
};

sendSMS.sendWhatsApp = sendWhatsApp;
module.exports = sendSMS;
