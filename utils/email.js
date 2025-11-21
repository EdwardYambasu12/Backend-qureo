const nodemailer = require("nodemailer");

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false, // true if using 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // App password if 2FA enabled
  },
  tls: {
    rejectUnauthorized: false, // allows self-signed certs if needed
  },
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,   // 10 seconds
  socketTimeout: 10000,     // 10 seconds
});

// Verify connection
transporter.verify((err, success) => {
  if (err) {
    console.error("🚨 Email server connection failed:", err);
  } else {
    console.log("✅ Email server is ready to send messages");
  }
});

// Send email function
const sendEmail = async (to, subject, text) => {
  if (!to) return console.warn("⚠️ No recipient provided");

  try {
    const info = await transporter.sendMail({
      from: `"Consultation Reminder" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
    });
    console.log(`📧 Email sent successfully to ${to}`);
    console.log("Message ID:", info.messageId);
  } catch (err) {
    console.error("🚨 Email sending failed:", err);
  }
};

module.exports = sendEmail;
