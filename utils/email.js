// emailUtils.js
const sgMail = require("@sendgrid/mail");
const fs = require("fs");
const path = require("path");

// Set SendGrid API key from environment variable
sgMail.setApiKey(process.env.SENDGRID_API_KEY);


// Log errors to file
const logError = (error, to) => {
  const logFile = path.join(__dirname, "emailErrors.log");
  const logMessage = `[${new Date().toISOString()}] Failed to ${to}: ${error}\n`;
  fs.appendFile(logFile, logMessage, (err) => {
    if (err) console.error("Failed to write email error log:", err);
  });
};

// Send email function with retries
const sendEmail = async (to, subject, text, html, retries = 3, delay = 2000) => {
  if (!to) return console.warn("⚠️ No recipient provided");

  const msg = {
    to,
    from: process.env.EMAIL_USER, // must be VERIFIED in SendGrid
    subject,
    text,
    html: html || `<p>${text}</p>`,
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const [response] = await sgMail.send(msg);
      console.log(`📧 Email sent successfully to ${to}`);
      console.log("Status Code:", response.statusCode);
      return true;
    } catch (err) {
      const errorMessage = err.response?.body || err.message;
      console.error(`🚨 Attempt ${attempt} failed to send email to ${to}:`, errorMessage);
      logError(errorMessage, to);

      if (attempt < retries) {
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
      } else {
        console.error(`❌ All ${retries} attempts failed for ${to}`);
        return false;
      }
    }
  }
};

module.exports = sendEmail;
