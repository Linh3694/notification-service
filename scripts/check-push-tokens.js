/**
 * Script kiểm tra push tokens trong Redis
 * Chạy: node check-push-tokens.js
 */

const redis = require('redis');
require('dotenv').config({ path: './config.env' });

async function checkPushTokens() {
  console.log('🔍 Checking Push Tokens in Redis...\n');

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

    // Guardian emails từ test
    const guardianEmails = [
      'nguyen-hai-linh-1743@parent.wellspring.edu.vn',
      'nguyen-duy-hieu-5170@parent.wellspring.edu.vn'
    ];

    console.log('📱 Checking push tokens for guardians:\n');

    for (const email of guardianEmails) {
      const key = `push_token:${email}`;
      const tokens = await redisClient.hGetAll(key);
      
      console.log(`👤 ${email}:`);
      
      if (tokens && Object.keys(tokens).length > 0) {
        console.log(`   ✅ Has ${Object.keys(tokens).length} token(s):`);
        for (const [deviceId, token] of Object.entries(tokens)) {
          console.log(`      - Device: ${deviceId}`);
          console.log(`        Token: ${token.substring(0, 40)}...`);
        }
      } else {
        console.log('   ❌ NO PUSH TOKENS FOUND');
        console.log('   💡 User needs to:');
        console.log('      1. Open mobile app (parent portal)');
        console.log('      2. Login with this email');
        console.log('      3. Allow notification permissions');
      }
      console.log('');
    }

    console.log('\n📊 Summary:');
    console.log('If no tokens found, guardians need to:');
    console.log('  1. Install and open mobile app (Expo Go or production app)');
    console.log('  2. Login to parent portal');
    console.log('  3. Accept notification permissions when prompted');
    console.log('  4. App will automatically register push token');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await redisClient.quit();
    console.log('\n🔌 Disconnected from Redis');
  }
}

checkPushTokens();

