/**
 * Test script để simulate student attendance event
 * Chạy: node test-student-attendance.js
 */

const redis = require('redis');
require('dotenv').config({ path: './config.env' });

async function testStudentAttendance() {
  console.log('🧪 Testing Student Attendance Notification...\n');

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

    // Tạo test event với thông tin học sinh thực
    const testEvent = {
      service: 'attendance-service',
      type: 'attendance_recorded',
      data: {
        employeeCode: 'WS12310116',  // Mã học sinh Nguyễn Gia Bảo
        employeeName: 'Nguyễn Phúc Thế Bảo',
        timestamp: new Date().toISOString(),
        deviceId: 'TEST-DEVICE-001',
        deviceName: 'Cổng trường - Test',
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
      timestamp: new Date().toISOString()
    };

    console.log('📤 Publishing test event to Redis channel: notification_events');
    console.log('Event data:', JSON.stringify(testEvent, null, 2));
    console.log('');

    // Publish event vào channel notification_events
    await redisClient.publish('notification_events', JSON.stringify(testEvent));
    
    console.log('✅ Event published successfully!');
    console.log('');
    console.log('👀 Check notification-service logs to see the notification being sent...');
    console.log('Expected flow:');
    console.log('  1. ✅ Found student: Nguyễn Gia Bảo (WS11510189)');
    console.log('  2. ✅ Found guardians for student');
    console.log('  3. 📤 Sending notification to guardians');
    console.log('  4. ✅ Notification sent successfully');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await redisClient.quit();
    console.log('\n🔌 Disconnected from Redis');
  }
}

// Run test
testStudentAttendance();

