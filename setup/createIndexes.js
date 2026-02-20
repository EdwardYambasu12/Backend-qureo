const mongoose = require('mongoose');

/**
 * DATABASE INDEXES FOR SCALABILITY & PERFORMANCE
 * 
 * Run this file once during database setup to create optimal indexes
 * Usage: node backend/setup/createIndexes.js
 * 
 * This significantly improves query performance when handling 1000+ users
 */

async function createIndexes() {
  try {
    console.log('🔧 Creating database indexes for optimal performance...\n');

    const startTime = Date.now();

    // Import models
    const User = require('../models/User');
    const Vitals = require('../models/Vitals');
    const Prescription = require('../models/Prescription');
    const Profile = require('../models/Profile');
    const HealthAssessment = require('../models/HealthAssessment');
    const HealthAlert = require('../models/HealthAlert');

    // ========================================
    // USER INDEXES
    // ========================================
    console.log('📌 Creating User indexes...');
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await User.collection.createIndex({ isActive: 1, createdAt: -1 });
    console.log('   ✅ User indexes created');

    // ========================================
    // VITALS INDEXES (MOST CRITICAL)
    // ========================================
    console.log('📌 Creating Vitals indexes...');
    // Most common query: find latest vitals for a user
    await Vitals.collection.createIndex({ user: 1, createdAt: -1 });
    // For range queries (vitals from last 7 days)
    await Vitals.collection.createIndex({ user: 1, createdAt: 1 });
    // For date range queries
    await Vitals.collection.createIndex({ createdAt: -1 });
    // For searching by user and date
    await Vitals.collection.createIndex({ user: 1, createdAt: -1 });
    console.log('   ✅ Vitals indexes created');

    // ========================================
    // PRESCRIPTION INDEXES
    // ========================================
    console.log('📌 Creating Prescription indexes...');
    // Find active medications for a user
    await Prescription.collection.createIndex({ owner: 1, status: 1, createdAt: -1 });
    // For status queries
    await Prescription.collection.createIndex({ status: 1 });
    console.log('   ✅ Prescription indexes created');

    // ========================================
    // PROFILE INDEXES
    // ========================================
    console.log('📌 Creating Profile indexes...');
    // One profile per user
    await Profile.collection.createIndex({ user: 1 }, { unique: true });
    console.log('   ✅ Profile indexes created');

    // ========================================
    // HEALTH ASSESSMENT INDEXES
    // ========================================
    console.log('📌 Creating HealthAssessment indexes...');
    // Find latest assessment for a user
    await HealthAssessment.collection.createIndex({ user: 1, createdAt: -1 });
    // For date range queries
    await HealthAssessment.collection.createIndex({ createdAt: -1 });
    console.log('   ✅ HealthAssessment indexes created');

    // ========================================
    // HEALTH ALERT INDEXES (CRITICAL FOR QUERYING)
    // ========================================
    console.log('📌 Creating HealthAlert indexes...');
    // Most common query: get all unread alerts for a user
    await HealthAlert.collection.createIndex({ user: 1, read: 1, createdAt: -1 });
    // For getting unread count
    await HealthAlert.collection.createIndex({ user: 1, read: 1 });
    // For alert type filtering
    await HealthAlert.collection.createIndex({ user: 1, type: 1, createdAt: -1 });
    // For severity filtering
    await HealthAlert.collection.createIndex({ user: 1, severity: 1, createdAt: -1 });
    // For date range queries (cleanup old alerts)
    await HealthAlert.collection.createIndex({ createdAt: -1 });
    // For action tracking
    await HealthAlert.collection.createIndex({ user: 1, actionTaken: 1, createdAt: -1 });
    // Compound index for common user queries
    await HealthAlert.collection.createIndex({ user: 1, createdAt: -1, severity: 1 });
    console.log('   ✅ HealthAlert indexes created');

    const duration = Date.now() - startTime;
    console.log(`\n✅ All indexes created successfully in ${duration}ms!\n`);

    // Display index statistics
    console.log('📊 Index Statistics:');
    try {
      const alertIndexes = await HealthAlert.collection.getIndexes();
      const vitalsIndexes = await Vitals.collection.getIndexes();
      console.log(`   - HealthAlert indexes: ${Object.keys(alertIndexes).length}`);
      console.log(`   - Vitals indexes: ${Object.keys(vitalsIndexes).length}`);
    } catch (err) {
      console.log('   (Index stats unavailable)');
    }

    console.log('\n💡 Tips for best performance:');
    console.log('   1. These indexes primarily improve READ performance');
    console.log('   2. Writes will be slightly slower due to index updates');
    console.log('   3. Index size is typically 5-15% of collection size');
    console.log('   4. Remember to backup before reindexing in production');

  } catch (error) {
    console.error('❌ Error creating indexes:', error.message);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  console.log('='.repeat(60));
  console.log('DATABASE INDEX CREATION');
  console.log('='.repeat(60) + '\n');

  createIndexes().then(() => {
    console.log('\n✅ Index creation complete!');
    process.exit(0);
  }).catch(err => {
    console.error('\n❌ Index creation failed:', err);
    process.exit(1);
  });
}

module.exports = { createIndexes };
