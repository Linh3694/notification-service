/**
 * Test script để test thông báo điểm danh học sinh với structured data
 * Test với học sinh Bạch Đăng Khôi - WS12408014
 * Chạy: node scripts/test-student-attendance-notification.js
 */

require('dotenv').config({ path: '../config.env' });
const database = require('../config/database');
const mysqlConnection = require('../config/mysqlConnection');
const redisClient = require('../config/redis');
const notificationController = require('../controllers/notificationController');

async function testStudentAttendanceNotification() {
  console.log('🧪 Testing Student Attendance Notification với Structured Data...\n');

  try {
    // Test với học sinh Bạch Đăng Khôi - WS12408014
    const testData = {
      employeeCode: 'WS12408014',
      employeeName: 'Bạch Đăng Khôi',
      timestamp: new Date().toISOString(),
      deviceId: 'TEST-DEVICE-001',
      deviceName: 'Gate 2 - Check In', // Test location parsing
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
    };

    console.log('📤 Test data:', JSON.stringify(testData, null, 2));
    console.log('');

    // Gọi hàm sendStudentAttendanceNotification
    await notificationController.sendStudentAttendanceNotification(testData);

    console.log('\n✅ Test completed!');
    console.log('📋 Expected structured data sent to frontend:');
    console.log('- title: "attendance.notification.title"');
    console.log('- message: "attendance.notification.gatePass"');
    console.log('- data.location: "Gate 2" (parsed from "Gate 2 - Check In")');
    console.log('- data.time: "HH:mm" format');
    console.log('- data.studentName: "Bạch Đăng Khôi"');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Test với các device name khác nhau
async function testMultipleDeviceNames() {
  console.log('\n🔄 Testing với các device names khác nhau...\n');

  const testCases = [
    { deviceName: 'Gate 2 - Check In', expectedLocation: 'Gate 2' },
    { deviceName: 'Gate 5 - Check Out', expectedLocation: 'Gate 5' },
    { deviceName: 'Main Gate - Check In', expectedLocation: 'Main Gate' },
    { deviceName: 'Cổng 2 - Vào', expectedLocation: 'Cổng 2' },
    { deviceName: 'School Entrance', expectedLocation: 'School Entrance' }
  ];

  for (const testCase of testCases) {
    console.log(`Testing: "${testCase.deviceName}" → expected location: "${testCase.expectedLocation}"`);

    const testData = {
      employeeCode: 'WS12408014',
      employeeName: 'Bạch Đăng Khôi',
      timestamp: new Date().toISOString(),
      deviceId: 'TEST-DEVICE-001',
      deviceName: testCase.deviceName,
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
    };

    try {
      await notificationController.sendStudentAttendanceNotification(testData);
      console.log('✅ Success\n');
    } catch (error) {
      console.error('❌ Failed:', error.message, '\n');
    }

    // Wait 1 second between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Initialize connections
async function initializeConnections() {
  console.log('🔗 Initializing connections...\n');

  try {
    // Initialize MongoDB connection
    await database.connect();
    console.log('✅ MongoDB connection initialized');

    // Initialize MySQL connection pool
    await mysqlConnection.connect();
    console.log('✅ MySQL connection pool initialized');

    // Initialize Redis connection
    await redisClient.connect();
    console.log('✅ Redis connection initialized\n');

  } catch (error) {
    console.error('❌ Failed to initialize connections:', error);
    process.exit(1);
  }
}

// Run tests
async function runTests() {
  console.log('🚀 Starting Student Attendance Notification Tests...\n');

  // Initialize connections first
  await initializeConnections();

  // Test với học sinh cụ thể
  await testStudentAttendanceNotification();

  // Test với các device names khác nhau
  await testMultipleDeviceNames();

  console.log('\n🎉 All tests completed!');
  console.log('\n📝 Frontend cần thêm vào locales:');
  console.log('vi.json:');
  console.log('  "attendance": {');
  console.log('    "notification": {');
  console.log('      "title": "Điểm danh",');
  console.log('      "gatePass": "{{studentName}} đã qua {{location}} lúc {{time}}"');
  console.log('    }');
  console.log('  }');

  console.log('\nen.json:');
  console.log('  "attendance": {');
  console.log('    "notification": {');
  console.log('      "title": "Attendance",');
  console.log('      "gatePass": "{{studentName}} passed {{location}} at {{time}}"');
  console.log('    }');
  console.log('  }');

  process.exit(0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

// Run the tests
runTests();
