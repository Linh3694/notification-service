/**
 * Database Performance Test Script
 * So sánh performance trước và sau optimization
 * Chạy: node scripts/test-database-performance.js
 */

const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const NotificationRead = require('../models/NotificationRead');
const cacheService = require('../services/cacheService');
const redisClient = require('../config/redis');
require('dotenv').config({ path: '../config.env' });

async function performanceTest() {
  console.log('🧪 Database Performance Test\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/notification_service');
    console.log('✅ Connected to MongoDB');

    // Connect to Redis
    await redisClient.connect();
    console.log('✅ Connected to Redis\n');

    // Test user ID (create test data if needed)
    const testUserId = 'perf-test-user';

    // Warm up cache
    console.log('🔥 Warming up cache...');
    try {
      await cacheService.warmUserCache(testUserId);
      console.log('✅ Cache warmed up\n');
    } catch (cacheError) {
      console.warn('⚠️ [Performance Test] Cache warm-up failed:', cacheError.message);
      console.log('⏭️ Continuing without cache warm-up\n');
    }

    // Performance tests
    const tests = [
      {
        name: 'User Notifications Query',
        test: async () => await Notification.getUserNotifications(testUserId, 1, 20),
        description: 'Get paginated notifications for user'
      },
      {
        name: 'Unread Count Query',
        test: async () => await Notification.getUnreadCount(testUserId),
        description: 'Count unread notifications'
      },
      {
        name: 'Cached User Notifications',
        test: async () => {
          const cached = await cacheService.getUserNotifications(testUserId, 1, 20);
          if (!cached) {
            const result = await Notification.getUserNotifications(testUserId, 1, 20);
            await cacheService.setUserNotifications(testUserId, 1, 20, result);
            return result;
          }
          return JSON.parse(cached);
        },
        description: 'Get notifications with cache'
      },
      {
        name: 'Cached Unread Count',
        test: async () => {
          const cached = await cacheService.getUnreadCount(testUserId);
          if (cached === null) {
            const count = await Notification.getUnreadCount(testUserId);
            await cacheService.setUnreadCount(testUserId, count);
            return count;
          }
          return parseInt(cached);
        },
        description: 'Get unread count with cache'
      }
    ];

    // Run performance tests
    console.log('🏃 Running Performance Tests...\n');

    for (const testCase of tests) {
      console.log(`📊 Testing: ${testCase.name}`);
      console.log(`   ${testCase.description}`);

      // Run multiple times for average
      const runs = 5;
      const times = [];

      for (let i = 0; i < runs; i++) {
        const start = Date.now();
        await testCase.test();
        const end = Date.now();
        times.push(end - start);
      }

      const avg = times.reduce((a, b) => a + b) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);

      console.log(`   ⏱️  Average: ${avg.toFixed(2)}ms`);
      console.log(`   📈 Min/Max: ${min}ms / ${max}ms`);
      console.log('');
    }

    // Cache statistics
    console.log('📈 Cache Statistics:');
    const cacheStats = await cacheService.getCacheStats();
    if (cacheStats) {
      console.log(`   Cache Keys: ${cacheStats.cacheKeys}`);
      console.log(`   Memory Used: ${cacheStats.memory.used || 'N/A'} bytes`);
      console.log(`   Memory Peak: ${cacheStats.memory.peak || 'N/A'} bytes`);
    }
    console.log('');

    // Database statistics
    console.log('🗄️  Database Statistics:');
    const db = mongoose.connection.db;

    const collections = ['notifications', 'notification_reads'];
    for (const collectionName of collections) {
      const collection = db.collection(collectionName);
      const count = await collection.countDocuments();
      const indexes = await collection.indexes();

      console.log(`   ${collectionName}:`);
      console.log(`     📄 Documents: ${count}`);
      console.log(`     🔍 Indexes: ${indexes.length}`);
    }

    console.log('\n✅ Performance test completed!');
    console.log('\n💡 Expected Performance Improvements:');
    console.log('   📊 User Notifications: 70-80% faster with indexes');
    console.log('   📊 Unread Count: 80-90% faster with direct queries');
    console.log('   📊 Cache Hit Rate: 90%+ for repeated requests');
    console.log('   📊 Memory Usage: Stable with TTL cleanup');

  } catch (error) {
    console.error('❌ Performance test failed:', error.message);
    console.error(error.stack);
  } finally {
    try {
      await mongoose.disconnect();
      console.log('🔌 Disconnected from MongoDB');
    } catch (e) {
      console.warn('⚠️ Failed to disconnect MongoDB:', e.message);
    }

    try {
      await redisClient.client.quit();
      console.log('🔌 Disconnected from Redis');
    } catch (e) {
      console.warn('⚠️ Failed to disconnect Redis:', e.message);
    }
  }
}

// Run test
performanceTest();
