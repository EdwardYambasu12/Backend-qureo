const twilio = require('twilio');

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID || '';

const hasTwilioConfig = Boolean(ACCOUNT_SID && AUTH_TOKEN && VERIFY_SERVICE_SID);
const devOtpStore = new Map();
const DEV_OTP_TTL_MS = 10 * 60 * 1000;

let twilioClient = null;
if (hasTwilioConfig) {
  twilioClient = twilio(ACCOUNT_SID, AUTH_TOKEN);
}

function sanitizePhone(phone) {
  return String(phone || '').trim();
}

function isValidE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

function getDevKey(phone, userId) {
  return `${String(userId || 'anonymous')}::${phone}`;
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendOtp({ phone, userId, channel = 'sms' }) {
  const normalizedPhone = sanitizePhone(phone);
  if (!isValidE164(normalizedPhone)) {
    const err = new Error('Phone number must be in international format, e.g. +233XXXXXXXXX');
    err.code = 'INVALID_PHONE';
    throw err;
  }

  if (hasTwilioConfig && twilioClient) {
    const verification = await twilioClient.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verifications.create({
        to: normalizedPhone,
        channel,
      });

    return {
      provider: 'twilio',
      sid: verification.sid,
      status: verification.status,
      channel: verification.channel,
      to: verification.to,
    };
  }

  // Development fallback so local flow is still testable without Twilio credentials.
  const code = generateOtpCode();
  const key = getDevKey(normalizedPhone, userId);
  devOtpStore.set(key, {
    code,
    expiresAt: Date.now() + DEV_OTP_TTL_MS,
  });
  console.warn(`[DEV OTP] ${normalizedPhone} => ${code}`);

  return {
    provider: 'dev-fallback',
    sid: `dev-${Date.now()}`,
    status: 'pending',
    channel,
    to: normalizedPhone,
  };
}

async function verifyOtp({ phone, userId, code }) {
  const normalizedPhone = sanitizePhone(phone);
  const normalizedCode = String(code || '').trim();

  if (!isValidE164(normalizedPhone)) {
    const err = new Error('Phone number must be in international format, e.g. +233XXXXXXXXX');
    err.code = 'INVALID_PHONE';
    throw err;
  }

  if (!/^\d{4,8}$/.test(normalizedCode)) {
    const err = new Error('OTP code format is invalid.');
    err.code = 'INVALID_OTP';
    throw err;
  }

  if (hasTwilioConfig && twilioClient) {
    const check = await twilioClient.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to: normalizedPhone,
        code: normalizedCode,
      });

    return {
      provider: 'twilio',
      approved: check.status === 'approved',
      status: check.status,
    };
  }

  const key = getDevKey(normalizedPhone, userId);
  const record = devOtpStore.get(key);
  if (!record) {
    return {
      provider: 'dev-fallback',
      approved: false,
      status: 'not_found',
    };
  }

  if (Date.now() > record.expiresAt) {
    devOtpStore.delete(key);
    return {
      provider: 'dev-fallback',
      approved: false,
      status: 'expired',
    };
  }

  const approved = record.code === normalizedCode;
  if (approved) {
    devOtpStore.delete(key);
  }

  return {
    provider: 'dev-fallback',
    approved,
    status: approved ? 'approved' : 'pending',
  };
}

module.exports = {
  hasTwilioConfig,
  sendOtp,
  verifyOtp,
};
