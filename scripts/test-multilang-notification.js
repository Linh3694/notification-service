/**
 * Script test gửi notification với multi-language support
 * Test attendance notification với title và message dạng object {vi, en}
 */

const axios = require('axios');

// Configuration
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5020';
const TEST_GUARDIAN_ID = process.env.TEST_GUARDIAN_ID || 'G001'; // Thay bằng guardian ID thật để test

async function testMultilangNotification() {
  console.log('\n🧪 ========================================');
  console.log('🧪 Testing Multi-Language Notification');
  console.log('🧪 ========================================\n');

  try {
    // Test data - giống như backend sẽ gửi
    const notificationPayload = {
      title: {
        vi: 'Điểm danh',
        en: 'Attendance'
      },
      message: {
        vi: 'Nguyễn Văn A đã qua Gate 2 lúc 07:30',
        en: 'Nguyen Van A passed Gate 2 at 07:30'
      },
      recipients: [`${TEST_GUARDIAN_ID}@parent.wellspring.edu.vn`],
      notification_type: 'attendance',
      priority: 'high',
      channel: 'push',
      data: {
        studentCode: 'ST001',
        studentName: 'Nguyễn Văn A',
        time: '07:30',
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

// Run test
testMultilangNotification().catch(console.error);

