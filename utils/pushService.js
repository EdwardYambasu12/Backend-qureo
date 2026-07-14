const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin from service account key
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
let firebaseApp = null;
try {
  if (!serviceAccountPath) {
    console.warn('[Push Service] FIREBASE_SERVICE_ACCOUNT_KEY_PATH not set. Push notifications are disabled until this is configured.');
  } else {
    const resolvedServiceAccountPath = path.resolve(serviceAccountPath);
    if (!fs.existsSync(resolvedServiceAccountPath)) {
      console.warn(`[Push Service] Service account file not found at: ${resolvedServiceAccountPath}. Push notifications are disabled.`);
    } else {
      const serviceAccount = require(resolvedServiceAccountPath);
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
      });
      console.log(`[Push Service] Firebase Admin initialized (project: ${process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id || 'unknown'})`);
    }
  }
} catch (err) {
  console.error('[Push Service] Failed to initialize Firebase Admin:', err.message);
}

/**
 * Send a push notification to a device token using Firebase Cloud Messaging.
 * @param {string} token - Device FCM token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Custom data payload (e.g., route, type, roomId)
 * @returns {Promise<{success: boolean, reason: string, messageId?: string}>}
 */
async function sendPushToToken(token, title, body, data = {}) {
  if (!firebaseApp) {
    return {
      success: false,
      reason: 'Firebase Admin not initialized — check FIREBASE_SERVICE_ACCOUNT_KEY_PATH',
    };
  }

  if (!token) {
    return { success: false, reason: 'No device token provided' };
  }

  try {
    const messaging = getMessaging(firebaseApp);

    // Ensure route field is present for deep-linking
    const enrichedData = {
      ...data,
      route: data.route || '/notification', // fallback to notification page if no route specified
    };

    // Build the message payload
    const message = {
      token,
      notification: {
        title,
        body,
      },
      data: enrichedData,
      android: {
        ttl: 3600, // 1 hour
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'qureo-alerts', // Must match the channel created in the app
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            alert: {
              title,
              body,
            },
            badge: 1,
          },
        },
      },
    };

    const messageId = await messaging.send(message);

    console.log(`[Push Service] Message sent successfully (ID: ${messageId})`);
    return {
      success: true,
      messageId,
      reason: '',
    };
  } catch (error) {
    const reason = error?.message || 'FCM send failed';
    console.error('[Push Service] Error sending message:', reason);
    return {
      success: false,
      reason,
    };
  }
}

/**
 * Send multicast messages to multiple tokens at once.
 * @param {string[]} tokens - Array of device FCM tokens
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Custom data payload
 * @returns {Promise<{successCount: number, failureCount: number, reasons: string[]}>}
 */
async function sendPushToMultipleTokens(tokens, title, body, data = {}) {
  if (!firebaseApp) {
    return {
      successCount: 0,
      failureCount: Array.isArray(tokens) ? tokens.length : 0,
      reasons: ['Firebase Admin not initialized'],
    };
  }

  if (!tokens || tokens.length === 0) {
    return { successCount: 0, failureCount: 0, reasons: [] };
  }

  try {
    const messaging = getMessaging(firebaseApp);

    const enrichedData = {
      ...data,
      route: data.route || '/notification',
    };

    const message = {
      notification: {
        title,
        body,
      },
      data: enrichedData,
      android: {
        ttl: 3600,
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'qureo-alerts',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            alert: {
              title,
              body,
            },
            badge: 1,
          },
        },
      },
    };

    const response = await messaging.sendEachForMulticast({
      ...message,
      tokens,
    });

    console.log(
      `[Push Service] Multicast sent: ${response.successCount} succeeded, ${response.failureCount} failed`
    );

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      reasons: response.responses
        .filter((r) => !r.success)
        .map((r) => r.error?.message || 'Unknown error'),
    };
  } catch (error) {
    const reason = error?.message || 'Multicast send failed';
    console.error('[Push Service] Error in multicast:', reason);
    return {
      successCount: 0,
      failureCount: tokens.length,
      reasons: [reason],
    };
  }
}

module.exports = {
  sendPushToToken,
  sendPushToMultipleTokens,
};
