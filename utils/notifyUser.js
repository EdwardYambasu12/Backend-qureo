const Profile = require('../models/Profile');
const NotificationToken = require('../models/NotificationToken');
const { sendPushToToken } = require('./pushService');
const { getNotificationTypeConfig } = require('./notificationCatalog');

const PRIVACY_MODES = {
  MAXIMUM_PRIVACY: 'maximum_privacy',
  BALANCED: 'balanced',
  DETAILED: 'detailed',
};

const DEFAULT_GENERIC_TITLE = 'You have a new update in Qureo';
const DEFAULT_GENERIC_BODY = 'Open Qureo to view your next health step.';

function selectNotificationContent({
  privacyMode,
  title,
  body,
  balancedTitle,
  balancedBody,
  genericTitle,
  genericBody,
}) {
  if (privacyMode === PRIVACY_MODES.MAXIMUM_PRIVACY) {
    return {
      title: genericTitle || DEFAULT_GENERIC_TITLE,
      body: genericBody || DEFAULT_GENERIC_BODY,
    };
  }

  if (privacyMode === PRIVACY_MODES.BALANCED) {
    return {
      title: balancedTitle || genericTitle || title || DEFAULT_GENERIC_TITLE,
      body: balancedBody || genericBody || body || DEFAULT_GENERIC_BODY,
    };
  }

  return {
    title: title || DEFAULT_GENERIC_TITLE,
    body: body || DEFAULT_GENERIC_BODY,
  };
}

async function notifyUser({
  userId,
  type,
  title,
  body,
  data = {},
  route = '/notification',
  balancedTitle,
  balancedBody,
  genericTitle,
  genericBody,
}) {
  if (!userId) {
    return { success: false, reason: 'Missing userId' };
  }

  const typeConfig = getNotificationTypeConfig(type);
  const category = typeConfig.category;

  const [profile, tokenDoc] = await Promise.all([
    Profile.findOne({ user: userId }).lean(),
    NotificationToken.findOne({ userId }).lean(),
  ]);

  if (!tokenDoc?.token) {
    return { success: false, reason: 'No device token registered' };
  }

  const notifications = profile?.notifications || {};
  if (notifications.push === false) {
    return { success: false, reason: 'Push notifications disabled by user' };
  }

  const categoryPreferences = notifications.categoryPreferences || {};
  if (Object.prototype.hasOwnProperty.call(categoryPreferences, category) && categoryPreferences[category] === false) {
    return { success: false, reason: `Category ${category} is disabled by user` };
  }

  const privacyMode = notifications.privacyMode || PRIVACY_MODES.BALANCED;
  const content = selectNotificationContent({
    privacyMode,
    title,
    body,
    balancedTitle,
    balancedBody,
    genericTitle,
    genericBody,
  });

  return sendPushToToken(tokenDoc.token, content.title, content.body, {
    ...data,
    type,
    category,
    privacyMode,
    route: data.route || route,
  });
}

module.exports = {
  notifyUser,
  PRIVACY_MODES,
};
