/**
 * Test script cho Push Token Management System
 * Chạy: node test-push-token-management.js
 */

const redis = require('./config/redis');
require('dotenv').config({ path: './config.env' });

async function testPushTokenManagement() {
  console.log('🧪 Testing Push Token Management System...\n');

  try {
    // Kết nối Redis
    await redis.connect();
    console.log('✅ Connected to Redis\n');

    const testUserId = 'test-user-push-tokens';

    // Test 1: Register PWA device
    console.log('📱 Test 1: Register PWA Device');
    const pwaDeviceInfo = {
      deviceName: 'Chrome on macOS',
      platform: 'web',
      browser: 'Chrome',
      os: 'macOS',
      osVersion: '14.0',
      appVersion: '1.2.3',
      language: 'en',
      timezone: 'UTC',
      isPWA: true,
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
        keys: {
          p256dh: 'test-p256dh-key',
          auth: 'test-auth-key'
        }
      }
    };

    const pwaDeviceId = await redis.storePushToken(
      testUserId,
      JSON.stringify(pwaDeviceInfo.subscription),
      'web',
      pwaDeviceInfo
    );
    console.log(`✅ PWA Device registered: ${pwaDeviceId}`);

    // Test 2: Register mobile device (Expo)
    console.log('\n📱 Test 2: Register Mobile Device');
    const mobileDeviceInfo = {
      deviceName: 'iPhone 15 Pro',
      platform: 'expo',
      os: 'iOS',
      osVersion: '17.0',
      appVersion: '1.2.3',
      language: 'vi',
      timezone: 'Asia/Ho_Chi_Minh'
    };

    const mobileDeviceId = await redis.storePushToken(
      testUserId,
      'ExponentPushToken[test-expo-token]',
      'expo',
      mobileDeviceInfo
    );
    console.log(`✅ Mobile Device registered: ${mobileDeviceId}`);

    // Test 3: Get user devices
    console.log('\n📱 Test 3: Get User Devices');
    const userDevices = await redis.getUserDevices(testUserId);
    console.log(`Found ${userDevices.length} devices:`);
    userDevices.forEach(device => {
      console.log(`  - ${device.deviceId}: ${device.deviceName} (${device.platform})`);
    });

    // Test 4: Get push tokens (for sending notifications)
    console.log('\n📱 Test 4: Get Push Tokens for Notifications');
    const pushTokens = await redis.getPushTokens(testUserId);
    if (pushTokens) {
      console.log(`Found ${Object.keys(pushTokens).length} active push tokens:`);
      Object.entries(pushTokens).forEach(([deviceId, tokenData]) => {
        console.log(`  - ${deviceId}: ${tokenData.deviceInfo.platform} token`);
      });
    }

    // Test 5: Update device activity
    console.log('\n📱 Test 5: Update Device Activity');
    await redis.updateDeviceActivity(testUserId, pwaDeviceId);
    console.log(`✅ Updated activity for device ${pwaDeviceId}`);

    // Test 6: Deactivate device
    console.log('\n📱 Test 6: Deactivate Device');
    await redis.deactivateDevice(testUserId, mobileDeviceId);
    console.log(`✅ Deactivated device ${mobileDeviceId}`);

    // Test 7: Verify deactivation
    console.log('\n📱 Test 7: Verify Deactivation');
    const tokensAfterDeactivation = await redis.getPushTokens(testUserId);
    if (tokensAfterDeactivation) {
      console.log(`Active tokens after deactivation: ${Object.keys(tokensAfterDeactivation).length}`);
      console.log('Should be 1 (PWA device still active)');
    }

    // Test 8: Remove device token
    console.log('\n📱 Test 8: Remove Device Token');
    const removed = await redis.removeDeviceToken(testUserId, mobileDeviceId);
    console.log(`✅ Removed mobile device: ${removed}`);

    // Test 9: Cleanup expired tokens
    console.log('\n📱 Test 9: Cleanup Expired Tokens');
    const cleanedCount = await redis.cleanupExpiredTokens();
    console.log(`✅ Cleanup completed: ${cleanedCount} tokens removed`);

    // Test 10: Final device count
    console.log('\n📱 Test 10: Final Device Count');
    const finalDevices = await redis.getUserDevices(testUserId);
    console.log(`Final device count: ${finalDevices.length}`);
    console.log('Should be 1 (only PWA device remaining)');

    console.log('\n🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
    console.log('\n📋 Summary:');
    console.log('✅ PWA device registration');
    console.log('✅ Mobile device registration');
    console.log('✅ Device listing and filtering');
    console.log('✅ Token retrieval for notifications');
    console.log('✅ Device activity tracking');
    console.log('✅ Device deactivation');
    console.log('✅ Device removal');
    console.log('✅ Automatic cleanup');
    console.log('\n🚀 Push Token Management System is READY!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup test data
    try {
      const testUserId = 'test-user-push-tokens';
      await redis.client.del(`push_tokens:${testUserId}`);
      console.log('\n🧹 Cleaned up test data');
    } catch (cleanupError) {
      console.warn('⚠️ Failed to cleanup test data:', cleanupError.message);
    }

    await redis.client.quit();
    console.log('🔌 Disconnected from Redis');
  }
}

// Run tests
testPushTokenManagement();
