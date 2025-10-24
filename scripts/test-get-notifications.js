/**
 * Test script to check if notifications are returned for a user
 */

const axios = require('axios');

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5001';
const TEST_USER_ID = process.env.TEST_USER_ID || 'G001@parent.wellspring.edu.vn';

async function testGetNotifications() {
  console.log('\n🧪 ========================================');
  console.log('🧪 Testing GET Notifications API');
  console.log('🧪 ========================================\n');

  try {
    const url = `${NOTIFICATION_SERVICE_URL}/api/notifications/user/${TEST_USER_ID}`;
    
    console.log(`📤 Calling: ${url}`);
    console.log(`📤 Query params: page=1, limit=20`);
    console.log('');

    const response = await axios.get(url, {
      params: {
        page: 1,
        limit: 20
      },
      timeout: 10000
    });

    console.log('✅ Response status:', response.status);
    console.log('📥 Response data:');
    console.log(JSON.stringify(response.data, null, 2));

    const data = response.data;
    
    if (data.success) {
      const notificationCount = data.data?.length || 0;
      const unreadCount = data.unreadCount || 0;
      
      console.log('\n📊 Summary:');
      console.log(`  - Total notifications: ${notificationCount}`);
      console.log(`  - Unread count: ${unreadCount}`);
      console.log(`  - Pagination:`, data.pagination);
      
      if (notificationCount > 0) {
        console.log('\n📋 First notification:');
        console.log('  - ID:', data.data[0]._id);
        console.log('  - Title:', JSON.stringify(data.data[0].title));
        console.log('  - Message:', JSON.stringify(data.data[0].message));
        console.log('  - Type:', data.data[0].type);
        console.log('  - Created:', data.data[0].createdAt);
      } else {
        console.log('\n⚠️ No notifications found for this user');
        console.log('   This could mean:');
        console.log('   1. User ID is different in MongoDB');
        console.log('   2. Notifications were saved with different recipient ID');
        console.log('   3. Database connection issue');
      }
    } else {
      console.log('\n❌ API returned success=false');
      console.log('   Message:', data.message || 'No message');
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }

  console.log('\n🧪 ========================================\n');
}

// Run test
testGetNotifications().catch(console.error);

