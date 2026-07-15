const CATEGORY_CATALOG = {
  health_journey: {
    label: 'Health journey',
  },
  ai_assistant: {
    label: 'AI Assistant',
  },
  doctor_consultations: {
    label: 'Doctor consultations',
  },
  pharmacy: {
    label: 'Pharmacy',
  },
  lab_services: {
    label: 'Lab services',
  },
  health_wallet: {
    label: 'Health Wallet',
  },
  remote_monitoring: {
    label: 'Remote monitoring',
  },
  health_records: {
    label: 'Health records',
  },
  health_campaigns: {
    label: 'Health campaigns',
  },
  preventive_care: {
    label: 'Preventive care',
  },
  womens_health: {
    label: "Women's health",
  },
  sexual_reproductive_health: {
    label: 'Sexual and reproductive health',
  },
  emergency_urgent_care: {
    label: 'Emergency and urgent care',
  },
  education: {
    label: 'Education',
  },
  community_engagement: {
    label: 'Community and engagement',
  },
  account_security: {
    label: 'Account and security',
  },
  payments_subscriptions: {
    label: 'Payments and subscriptions',
  },
};

const NOTIFICATION_TYPE_MAP = {
  consultation_starting_soon: { category: 'doctor_consultations' },
  consultation_started: { category: 'doctor_consultations' },
  in_person_pending: { category: 'doctor_consultations' },
  in_person_confirmed: { category: 'doctor_consultations' },

  medication_reminder: { category: 'pharmacy' },
  daily_health_tip: { category: 'education' },

  wallet_payment_completed: { category: 'health_wallet' },
  lab_booking_status_updated: { category: 'lab_services' },
  lab_result_status_updated: { category: 'lab_services' },

  test_push: { category: 'account_security' },
  test_broadcast: { category: 'account_security' },
};

function getNotificationTypeConfig(type) {
  const normalizedType = String(type || '').trim().toLowerCase();
  return NOTIFICATION_TYPE_MAP[normalizedType] || { category: 'health_journey' };
}

module.exports = {
  CATEGORY_CATALOG,
  NOTIFICATION_TYPE_MAP,
  getNotificationTypeConfig,
};
