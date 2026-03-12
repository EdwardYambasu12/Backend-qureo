const axios = require('axios');

async function sendPushToToken(token, title, body, data = {}) {
  const serverKey = process.env.FIREBASE_SERVER_KEY;
  if (!serverKey) {
    return { success: false, skipped: true, reason: 'FIREBASE_SERVER_KEY not configured' };
  }

  if (!token) {
    return { success: false, skipped: true, reason: 'No device token provided' };
  }

  try {
    const response = await axios.post(
      'https://fcm.googleapis.com/fcm/send',
      {
        to: token,
        notification: { title, body },
        data,
        priority: 'high',
      },
      {
        headers: {
          Authorization: `key=${serverKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const ok = Number(response?.data?.success || 0) > 0;
    return {
      success: ok,
      skipped: false,
      reason: ok ? '' : (response?.data?.results?.[0]?.error || 'FCM delivery failed'),
      raw: response.data,
    };
  } catch (error) {
    return {
      success: false,
      skipped: false,
      reason: error?.response?.data?.error || error.message || 'Push send error',
    };
  }
}

module.exports = { sendPushToToken };
