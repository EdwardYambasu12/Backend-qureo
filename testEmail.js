require("dotenv").config();
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function testEmail() {
  try {
    await transporter.sendMail({
      from: `"Test Nodemailer" <${process.env.EMAIL_USER}>`,
      to: "yambasuedward4@gmail.com",
      subject: "SMTP Test Successful 🎉",
      text: "Your Gmail SMTP setup is working perfectly!",
    });
    console.log("✅ Email sent successfully!");
  } catch (err) {
    console.error("❌ Email failed:", err.message);
  }
}

testEmail();
