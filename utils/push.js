const axios = require('axios');

async function sendPushToToken(token, title, body, data = {}, withMessage = false) {
  const serverKey = process.env.FIREBASE_SERVER_KEY;
  if (!serverKey) {
    return { success: false, skipped: true, reason: 'FIREBASE_SERVER_KEY not configured' };
  }

  if (!token) {
    return { success: false, skipped: true, reason: 'No device token provided' };
  }

  const payload = {
    to: token,
    priority: 'high',
  };

  if (withMessage) {
    payload.message = {
      token,
      notification: { title, body },
      data,
      android: { notification: { sound: 'default', channelId: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
    };
  } else {
    payload.notification = { title, body, sound: 'default' };
    payload.data = data;
    payload.android = { notification: { sound: 'default', channelId: 'default' } };
    payload.apns = { payload: { aps: { sound: 'default' } } };
  }

  try {
    const response = await axios.post(
      'https://fcm.googleapis.com/fcm/send',
      payload,
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
      raw: error.response?.data,
    };
  }
}

module.exports = { sendPushToToken };