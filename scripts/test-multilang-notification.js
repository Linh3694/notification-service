/**
 * Script test gửi notification với multi-language support
 * Test attendance notification với title và message dạng object {vi, en}
 */

const axios = require('axios');

// Configuration
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5001';
const TEST_GUARDIAN_ID = process.env.TEST_GUARDIAN_ID || 'G001'; // Thay bằng guardian ID thật để test

async function testStructuredKeysNotification() {
  console.log('\n🧪 ========================================');
  console.log('🧪 Testing Structured Keys Notification (Current Implementation)');
  console.log('🧪 ========================================\n');

  try {
    // Test data - sử dụng structured keys như backend thực tế
    const notificationPayload = {
      title: 'attendance_notification_title', // Key để frontend translate
      message: 'attendance_notification_gate_pass', // Key template
      recipients: [`${TEST_GUARDIAN_ID}@parent.wellspring.edu.vn`],
      notification_type: 'attendance',
      priority: 'high',
      channel: 'push',
      data: {
        studentCode: 'WS12408014', // Sử dụng student code thật để test
        studentName: 'Bạch Đăng Khôi',
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        location: 'Gate 2',
        timestamp: new Date().toISOString(),
        notificationType: 'student_attendance'
      }
    };

    console.log('📤 Sending notification with payload:');
    console.log(JSON.stringify(notificationPayload, null, 2));
    console.log('');

    // Gửi notification
    const response = await axios.post(
      `${NOTIFICATION_SERVICE_URL}/api/notifications/send`,
      notificationPayload,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log('✅ Response:', response.status);
    console.log('📥 Result:', JSON.stringify(response.data, null, 2));
    
    if (response.data.success) {
      console.log('\n✅ SUCCESS! Notification sent successfully');
      console.log('📱 Push notification should appear on device with correct language');
      console.log('📋 Check notification list in app to verify translation');
    } else {
      console.log('\n❌ FAILED! Notification not sent');
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }

  console.log('\n🧪 ========================================\n');
}

async function testMultilangObjectNotification() {
  console.log('\n🧪 ========================================');
  console.log('🧪 Testing Multi-Language Object Notification (Future Implementation)');
  console.log('🧪 ========================================\n');

  try {
    // Test data - dạng object đa ngôn ngữ (có thể implement trong tương lai)
    const notificationPayload = {
      title: {
        vi: 'Điểm danh',
        en: 'Attendance'
      },
      message: {
        vi: `Bạch Đăng Khôi đã qua Gate 2 lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
        en: `Bach Dang Khoi passed Gate 2 at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
      },
      recipients: [`${TEST_GUARDIAN_ID}@parent.wellspring.edu.vn`],
      notification_type: 'attendance',
      priority: 'high',
      channel: 'push',
      data: {
        studentCode: 'WS12408014',
        studentName: 'Bạch Đăng Khôi',
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        location: 'Gate 2',
        timestamp: new Date().toISOString(),
        notificationType: 'student_attendance'
      }
    };

    console.log('📤 Sending notification with payload:');
    console.log(JSON.stringify(notificationPayload, null, 2));
    console.log('');

    // Gửi notification
    const response = await axios.post(
      `${NOTIFICATION_SERVICE_URL}/api/notifications/send`,
      notificationPayload,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log('✅ Response:', response.status);
    console.log('📥 Result:', JSON.stringify(response.data, null, 2));

    if (response.data.success) {
      console.log('\n✅ SUCCESS! Multi-language notification sent successfully');
      console.log('📱 Push notification should appear with localized content');
    } else {
      console.log('\n❌ FAILED! Notification not sent');
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }

  console.log('\n🧪 ========================================\n');
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Multi-Language Notification Tests...\n');

  // Test 1: Current implementation with structured keys
  await testStructuredKeysNotification();

  // Test 2: Future implementation with multi-language objects
  await testMultilangObjectNotification();

  console.log('🎉 All tests completed!');
  console.log('\n📝 Instructions:');
  console.log('1. Check notification appears on parent app');
  console.log('2. Switch language in app and verify translation');
  console.log('3. Check console logs for translation debug info');
}

// Run tests
runTests().catch(console.error);

