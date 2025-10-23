/**
 * Test script để verify duplicate notification fix
 * Chạy: node test-duplicate-fix.js
 */

const redis = require('redis');
require('dotenv').config({ path: './config.env' });

async function testDuplicateFix() {
  console.log('🧪 Testing Duplicate Notification Fix...\n');

  // Kết nối Redis
  const redisClient = redis.createClient({
    socket: {
      host: process.env.REDIS_HOST || '172.16.20.120',
      port: process.env.REDIS_PORT || 6379
    },
    password: process.env.REDIS_PASSWORD || 'breakpoint'
  });

  try {
    await redisClient.connect();
    console.log('✅ Connected to Redis\n');

    // Test event data
    const testEvent = {
      service: 'attendance-service',
      type: 'attendance_recorded',
      data: {
        employeeCode: 'TEST123456', // Use test code to avoid real notifications
        employeeName: 'Test Student',
        timestamp: new Date().toISOString(),
        deviceId: 'TEST-DEVICE-DUPLICATE-FIX',
        deviceName: 'Test Device - Duplicate Fix',
        eventType: 'check_in',
        checkInTime: new Date().toISOString(),
        checkOutTime: null,
        totalCheckIns: 1,
        date: new Date().toISOString().split('T')[0],
        displayTime: new Date().toLocaleString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      },
      timestamp: new Date().toISOString(),
      testId: `test-${Date.now()}` // Unique test identifier
    };

    console.log('📤 Publishing test event to Redis channel: notification_events');
    console.log(`Test ID: ${testEvent.testId}`);
    console.log('Event data:', JSON.stringify(testEvent, null, 2));
    console.log('');

    // Publish event
    await redisClient.publish('notification_events', JSON.stringify(testEvent));

    console.log('✅ Test event published successfully!');
    console.log('');
    console.log('👀 Now check notification-service logs...');
    console.log('');
    console.log('🔍 Expected behavior:');
    console.log('  ✅ Only ONE instance should process this event');
    console.log('  ✅ Only ONE notification should be sent');
    console.log('  ✅ No duplicate processing logs');
    console.log('');
    console.log('📋 Check logs with: pm2 logs notification-service');
    console.log('   Look for processing logs with testId:', testEvent.testId);

    // Wait a bit for processing
    console.log('');
    console.log('⏳ Waiting 5 seconds for processing...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('🎉 Test completed! Check the logs above for results.');

  } catch (error) {
    console.error('❌ Error during test:', error.message);
  } finally {
    await redisClient.quit();
    console.log('\n🔌 Disconnected from Redis');
  }
}

// Run test
testDuplicateFix();
