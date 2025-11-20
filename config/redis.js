const { createClient } = require('redis');
require('dotenv').config({ path: './config.env' });

class RedisClient {
  constructor() {
    this.client = null;
    this.pubClient = null;
    this.subClient = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    this.reconnectDelay = 5000; // 5 seconds
  }

  async connect() {
    if (this.isConnecting) {
      console.log('[Notification Service] Redis connection already in progress');
      return;
    }

    this.isConnecting = true;

    try {
      // Main Redis client với reconnection strategy
      this.client = createClient({
        socket: {
          host: process.env.REDIS_HOST,
          port: process.env.REDIS_PORT,
          connectTimeout: 10000,
          lazyConnect: true,
          reconnectStrategy: (retries) => {
            const delay = Math.min(retries * 100, 3000);
            console.log(`🔄 [Notification Service] Redis retry #${retries}, delay ${delay}ms`);
            if (retries > 10) {
              console.error('[Notification Service] Redis max retries reached');
              return new Error('Redis max retries reached');
            }
            return delay;
          }
        },
        password: process.env.REDIS_PASSWORD,
      });

      // Publisher client cho Socket.IO
      this.pubClient = createClient({
        socket: {
          host: process.env.REDIS_HOST,
          port: process.env.REDIS_PORT,
          connectTimeout: 10000,
          lazyConnect: true,
          reconnectStrategy: (retries) => {
            const delay = Math.min(retries * 100, 3000);
            console.log(`🔄 [Notification Service] Redis PubClient retry #${retries}, delay ${delay}ms`);
            if (retries > 10) {
              console.error('[Notification Service] Redis PubClient max retries reached');
              return new Error('Redis PubClient max retries reached');
            }
            return delay;
          }
        },
        password: process.env.REDIS_PASSWORD,
      });

      // Subscriber client cho Socket.IO
      this.subClient = createClient({
        socket: {
          host: process.env.REDIS_HOST,
          port: process.env.REDIS_PORT,
          connectTimeout: 10000,
          lazyConnect: true,
          reconnectStrategy: (retries) => {
            const delay = Math.min(retries * 100, 3000);
            console.log(`🔄 [Notification Service] Redis SubClient retry #${retries}, delay ${delay}ms`);
            if (retries > 10) {
              console.error('[Notification Service] Redis SubClient max retries reached');
              return new Error('Redis SubClient max retries reached');
            }
            return delay;
          }
        },
        password: process.env.REDIS_PASSWORD,
      });

      // Error handling
      this.client.on('error', (err) => {
        console.error('❌ [Notification Service] Redis Client Error:', err);
        this.isConnected = false;
      });

      this.pubClient.on('error', (err) => {
        console.error('❌ [Notification Service] Redis PubClient Error:', err);
        this.isConnected = false;
      });

      this.subClient.on('error', (err) => {
        console.error('❌ [Notification Service] Redis SubClient Error:', err);
        this.isConnected = false;
      });

      this.client.on('ready', () => {
        console.log('[Notification Service] Redis client ready');
        this.isConnected = true;
      });
      this.pubClient.on('ready', () => {
        console.log('[Notification Service] Redis pub ready');
        this.isConnected = true;
      });
      this.subClient.on('ready', () => {
        console.log('[Notification Service] Redis sub ready');
        this.isConnected = true;
      });

      // Connect all clients
      await this.client.connect();
      await this.pubClient.connect();
      await this.subClient.connect();

      // Test connection
      await this.client.ping();

      this.isConnected = true;
      console.log('✅ [Notification Service] Redis connected successfully');
    } catch (error) {
      this.isConnected = false;
      console.warn('⚠️ [Notification Service] Redis connection failed, service will continue without Redis:', error.message);
      // Don't throw error - Redis is optional
    } finally {
      this.isConnecting = false;
    }
  }

  // Helper method để stringify an toàn
  _safeStringify(data, methodName = 'unknown') {
    if (data === undefined || data === null) {
      console.warn(`[Notification Service][${methodName}] data is ${data}, cannot stringify`);
      return null;
    }
    try {
      return JSON.stringify(data);
    } catch (error) {
      try {
        const seen = new WeakSet();
        const result = JSON.stringify(data, (key, val) => {
          if (val != null && typeof val === "object") {
            if (seen.has(val)) {
              return {};
            }
            seen.add(val);
          }
          return val;
        });
        console.warn(`[Notification Service][${methodName}] stringify succeeded with circular reference handling`);
        return result;
      } catch (secondError) {
        console.error(`[Notification Service][${methodName}] stringify error even with circular reference handling: ${secondError.message}`);
        return null;
      }
    }
  }

  // Helper method để convert userId to string an toàn
  _safeUserIdToString(userId, methodName = 'unknown') {
    if (userId == null) {
      throw new Error(`userId is undefined or null in ${methodName}`);
    }
    if (typeof userId === 'string') {
      return userId;
    }
    if (typeof userId === 'object' && typeof userId.toHexString === 'function') {
      return userId.toHexString();
    }
    if (typeof userId === 'object' && '_id' in userId) {
      return String(userId._id);
    }
    try {
      if (userId != null && typeof userId.toString === 'function') {
        return userId.toString();
      }
      return String(userId);
    } catch (error) {
      console.error(`[Notification Service][_safeUserIdToString] Error converting userId to string in ${methodName}: ${error.message}, type: ${typeof userId}`);
      throw new Error(`Cannot convert userId to string in ${methodName}: ${error.message}`);
    }
  }

  async set(key, value, ttl = null) {
    if (!this.isConnected || !this.client) {
      console.warn('[Notification Service] Redis not available, skipping set operation');
      return;
    }

    try {
      const stringValue = this._safeStringify(value, 'set');
      if (stringValue === null) {
        console.warn(`[Notification Service] Cannot stringify value for key: ${key}`);
        return;
      }

      if (ttl) {
        await this.client.setEx(key, ttl, stringValue);
      } else {
        await this.client.set(key, stringValue);
      }
    } catch (error) {
      console.error(`[Notification Service] Error setting key ${key}:`, error);
    }
  }

  async get(key) {
    if (!this.isConnected || !this.client) {
      console.warn('[Notification Service] Redis not available, skipping get operation');
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (value === null) return null;

      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      console.error(`[Notification Service] Error getting key ${key}:`, error);
      return null;
    }
  }

  async del(key) {
    if (!this.isConnected || !this.client) {
      console.warn('[Notification Service] Redis not available, skipping del operation');
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      console.error(`[Notification Service] Error deleting key ${key}:`, error);
    }
  }

  async publish(channel, message) {
    if (!this.isConnected || !this.pubClient) {
      console.warn('[Notification Service] Redis not available, skipping publish operation');
      return;
    }

    try {
      const stringMessage = this._safeStringify(message, 'publish');
      if (stringMessage === null) {
        console.warn(`[Notification Service] Cannot stringify message for channel: ${channel}`);
        return;
      }
      await this.pubClient.publish(channel, stringMessage);
    } catch (error) {
      console.error(`[Notification Service] Error publishing to channel ${channel}:`, error);
    }
  }

  async subscribe(channel, callback) {
    if (!this.isConnected || !this.subClient) {
      console.warn('[Notification Service] Redis not available, skipping subscribe operation');
      return;
    }

    try {
      await this.subClient.subscribe(channel, (message) => {
        try {
          const parsedMessage = JSON.parse(message);
          callback(parsedMessage);
        } catch {
          callback(message);
        }
      });
    } catch (error) {
      console.error(`[Notification Service] Error subscribing to channel ${channel}:`, error);
    }
  }

  // === User events subscription (feature-flagged) ===
  async subscribeUserEvents() {
    if (process.env.ENABLE_USER_EVENTS !== 'true') {
      console.log('[Notification Service] User events disabled by ENABLE_USER_EVENTS');
      return;
    }
    const userChannel = process.env.REDIS_USER_CHANNEL || 'user_events';
    console.log(`[Notification Service] Subscribing user events on channel: ${userChannel}`);
    await this.subscribe(userChannel, async (msg) => {
      try {
        const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
        if (!data || !data.type) return;
        switch (data.type) {
          case 'user_events_ping':
            console.log('[Notification Service] user_events_ping received');
            break;
          case 'user_created':
          case 'user_updated':
            // Upsert user info into own storage if needed in future
            console.log('[Notification Service] user upsert event received:', data.user?.email || data.user_id);
            break;
          case 'user_deleted':
            console.log('[Notification Service] user deleted event received:', data.user?.email || data.user_id);
            break;
          default:
            break;
        }
      } catch (e) {
        console.warn('[Notification Service] Failed handling user event:', e.message);
      }
    });
  }

  // Multi-channel subscription
  async subscribeToChannels(channels, callback) {
    try {
      for (const channel of channels) {
        await this.subscribe(channel, callback);
      }
    } catch (error) {
      console.error(`[Notification Service] Error subscribing to channels:`, error);
      throw error;
    }
  }

  // Notification-specific cache methods
  async cacheUserNotifications(userId, notifications) {
    const key = `notifications:user:${this._safeUserIdToString(userId, 'cacheUserNotifications')}`;
    await this.set(key, notifications, 1800); // Cache for 30 minutes
  }

  async getCachedUserNotifications(userId) {
    const key = `notifications:user:${this._safeUserIdToString(userId, 'getCachedUserNotifications')}`;
    return await this.get(key);
  }

  async invalidateUserNotificationsCache(userId) {
    const key = `notifications:user:${this._safeUserIdToString(userId, 'invalidateUserNotificationsCache')}`;
    await this.del(key);
  }

  // Push token management - Enhanced for PWA & device tracking
  async storePushToken(userId, token, platform = 'web', deviceInfo = {}) {
    if (!this.isConnected || !this.client) {
      console.warn('[Notification Service] Redis not available, skipping storePushToken operation');
      return null;
    }

    try {
      const userIdStr = this._safeUserIdToString(userId, 'storePushToken');
      const key = `push_tokens:${userIdStr}`;

      // Generate device ID if not provided
      const deviceId = deviceInfo.deviceId || this._generateDeviceId();

      // Create structured token data
      const tokenData = {
        token: token,
        platform: platform,
        deviceId: deviceId,
        deviceName: deviceInfo.deviceName || `Device ${deviceId.slice(-4)}`,
        userAgent: deviceInfo.userAgent || '',
        browser: deviceInfo.browser || 'Unknown',
        os: deviceInfo.os || 'Unknown',
        osVersion: deviceInfo.osVersion || '',
        appVersion: deviceInfo.appVersion || '1.0.0',
        language: deviceInfo.language || 'en',
        timezone: deviceInfo.timezone || 'UTC',
        isPWA: deviceInfo.isPWA || false,
        isActive: true,
        created: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        pushSuccessCount: 0,
        pushFailureCount: 0,
        // For web push subscriptions
        subscription: deviceInfo.subscription || null
      };

      console.log(`📱 [storePushToken] Storing token for user ${userIdStr}, device ${deviceId}, platform ${platform}`);
      await this.client.hSet(key, deviceId, JSON.stringify(tokenData));

      // Set expiration for the entire user key (30 days)
      await this.client.expire(key, 30 * 24 * 60 * 60);

      return deviceId;
    } catch (error) {
      console.error('[Notification Service] Error in storePushToken:', error.message);
      return null;
    }
  }

  async getPushTokens(userId) {
    if (!this.isConnected || !this.client) {
      console.warn('[Notification Service] Redis not available, returning empty push tokens');
      return null;
    }

    try {
      const key = `push_tokens:${this._safeUserIdToString(userId, 'getPushTokens')}`;
      const rawTokens = await this.client.hGetAll(key);

      if (!rawTokens || Object.keys(rawTokens).length === 0) {
        return null;
      }

      // Parse structured token data
      const parsedTokens = {};
      for (const [deviceId, tokenData] of Object.entries(rawTokens)) {
        try {
          let token, deviceInfo;

          if (tokenData.startsWith('ExponentPushToken[')) {
            // Legacy raw token format (backward compatibility)
            token = tokenData;
            deviceInfo = {
              platform: 'expo',
              isActive: true,
              deviceId: deviceId,
              deviceName: `Legacy Device ${deviceId.slice(-4)}`
            };
            console.log(`📱 [getPushTokens] Device ${deviceId} using legacy raw token format for user ${userId}`);
          } else {
            // New structured JSON format
            const parsedData = JSON.parse(tokenData);
            token = parsedData.subscription ? JSON.stringify(parsedData.subscription) : parsedData.token;
            deviceInfo = parsedData;
            console.log(`📱 [getPushTokens] Device ${deviceId} using structured format for user ${userId} (${parsedData.platform})`);
          }

          // Only include active tokens
          if (deviceInfo.isActive !== false) {
            parsedTokens[deviceId] = {
              token: token,
              deviceInfo: deviceInfo
            };
          }

        } catch (parseError) {
          console.warn(`⚠️ [getPushTokens] Failed to parse token data for device ${deviceId} (user: ${userId}):`, parseError.message);
          console.warn(`📄 Raw token data: ${tokenData.substring(0, 50)}...`);
          continue;
        }
      }

      if (Object.keys(parsedTokens).length === 0) {
        console.log(`📱 [getPushTokens] No valid active push tokens found for user: ${userId}`);
        return null;
      }

      console.log(`📱 [getPushTokens] Found ${Object.keys(parsedTokens).length} valid active push token(s) for user: ${userId}`);
      return parsedTokens;
    } catch (error) {
      console.error('[Notification Service] Error in getPushTokens:', error.message);
      return null;
    }
  }

  // Enhanced device management methods
  async removePushToken(userId, platform = 'expo') {
    const key = `push_tokens:${this._safeUserIdToString(userId, 'removePushToken')}`;
    await this.client.hDel(key, platform);
  }

  async removeDeviceToken(userId, deviceId) {
    const key = `push_tokens:${this._safeUserIdToString(userId, 'removeDeviceToken')}`;
    const result = await this.client.hDel(key, deviceId);
    console.log(`🗑️ [removeDeviceToken] Removed device ${deviceId} for user ${userId}:`, result);
    return result > 0;
  }

  async updateDeviceActivity(userId, deviceId) {
    const key = `push_tokens:${this._safeUserIdToString(userId, 'updateDeviceActivity')}`;
    const deviceData = await this.client.hGet(key, deviceId);

    if (deviceData) {
      try {
        const parsedData = JSON.parse(deviceData);
        parsedData.lastActive = new Date().toISOString();
        await this.client.hSet(key, deviceId, JSON.stringify(parsedData));
        console.log(`📱 [updateDeviceActivity] Updated activity for device ${deviceId}, user ${userId}`);
      } catch (error) {
        console.warn(`⚠️ [updateDeviceActivity] Failed to parse device data for ${deviceId}:`, error.message);
      }
    }
  }

  async deactivateDevice(userId, deviceId) {
    const key = `push_tokens:${this._safeUserIdToString(userId, 'deactivateDevice')}`;
    const deviceData = await this.client.hGet(key, deviceId);

    if (deviceData) {
      try {
        const parsedData = JSON.parse(deviceData);
        parsedData.isActive = false;
        parsedData.deactivatedAt = new Date().toISOString();
        await this.client.hSet(key, deviceId, JSON.stringify(parsedData));
        console.log(`🚫 [deactivateDevice] Deactivated device ${deviceId} for user ${userId}`);
        return true;
      } catch (error) {
        console.warn(`⚠️ [deactivateDevice] Failed to parse device data for ${deviceId}:`, error.message);
      }
    }
    return false;
  }

  async getUserDevices(userId) {
    const key = `push_tokens:${this._safeUserIdToString(userId, 'getUserDevices')}`;
    const rawTokens = await this.client.hGetAll(key);

    if (!rawTokens || Object.keys(rawTokens).length === 0) {
      return [];
    }

    const devices = [];
    for (const [deviceId, tokenData] of Object.entries(rawTokens)) {
      try {
        if (tokenData.startsWith('ExponentPushToken[')) {
          // Legacy format
          devices.push({
            deviceId: deviceId,
            platform: 'expo',
            deviceName: `Legacy Device ${deviceId.slice(-4)}`,
            isActive: true,
            created: null,
            lastActive: null
          });
        } else {
          const parsedData = JSON.parse(tokenData);
          devices.push({
            deviceId: deviceId,
            platform: parsedData.platform,
            deviceName: parsedData.deviceName,
            browser: parsedData.browser,
            os: parsedData.os,
            isPWA: parsedData.isPWA,
            isActive: parsedData.isActive !== false,
            created: parsedData.created,
            lastActive: parsedData.lastActive
          });
        }
      } catch (error) {
        console.warn(`⚠️ [getUserDevices] Failed to parse device ${deviceId}:`, error.message);
      }
    }

    return devices.sort((a, b) => new Date(b.lastActive || 0) - new Date(a.lastActive || 0));
  }

  async cleanupExpiredTokens() {
    console.log('🧹 [cleanupExpiredTokens] Starting cleanup of expired push tokens...');

    let cleanedCount = 0;
    const keys = await this.client.keys('push_tokens:*');

    for (const key of keys) {
      const userId = key.replace('push_tokens:', '');
      const devices = await this.client.hGetAll(key);

      for (const [deviceId, tokenData] of Object.entries(devices)) {
        try {
          let shouldRemove = false;
          let lastActive;

          if (tokenData.startsWith('ExponentPushToken[')) {
            // Legacy tokens - remove if older than 90 days
            const keyTTL = await this.client.ttl(key);
            if (keyTTL === -1) { // No TTL set
              shouldRemove = true;
            }
          } else {
            const parsedData = JSON.parse(tokenData);
            lastActive = new Date(parsedData.lastActive || parsedData.created);
            const daysSinceActive = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24);

            // Remove inactive devices after 30 days
            if (!parsedData.isActive || daysSinceActive > 30) {
              shouldRemove = true;
            }
          }

          if (shouldRemove) {
            await this.client.hDel(key, deviceId);
            cleanedCount++;
            console.log(`🗑️ [cleanupExpiredTokens] Removed expired device ${deviceId} for user ${userId}`);
          }
        } catch (error) {
          console.warn(`⚠️ [cleanupExpiredTokens] Error processing device ${deviceId}:`, error.message);
        }
      }

      // Remove empty user keys
      const remainingDevices = await this.client.hLen(key);
      if (remainingDevices === 0) {
        await this.client.del(key);
        console.log(`🗑️ [cleanupExpiredTokens] Removed empty key for user ${userId}`);
      }
    }

    console.log(`✅ [cleanupExpiredTokens] Cleanup completed. Removed ${cleanedCount} expired tokens.`);
    return cleanedCount;
  }

  // Helper method to generate unique device ID
  _generateDeviceId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `device_${timestamp}_${random}`;
  }

  // Notification queue
  async queueNotification(notification) {
    const stringNotification = this._safeStringify(notification, 'queueNotification');
    if (stringNotification) {
      await this.client.lPush('notification_queue', stringNotification);
    }
  }

  async dequeueNotification() {
    const notification = await this.client.rPop('notification_queue');
    return notification ? JSON.parse(notification) : null;
  }

  async getQueueLength() {
    return await this.client.lLen('notification_queue');
  }

  // Cross-service communication channels
  async publishToTicketService(event, data) {
    const message = {
      service: 'notification-service',
      event,
      data,
      timestamp: new Date().toISOString()
    };
    await this.publish('ticket-service', message);
  }

  async publishToFrappe(event, data) {
    const message = {
      service: 'notification-service',
      event,
      data,
      timestamp: new Date().toISOString()
    };
    await this.publish('frappe', message);
  }

  async publishToAllServices(event, data) {
    const message = {
      service: 'notification-service',
      event,
      data,
      timestamp: new Date().toISOString()
    };
    await this.publish('broadcast', message);
  }

  // User presence tracking
  async setUserOnline(userId, socketId) {
    const key = `user:online:${this._safeUserIdToString(userId, 'setUserOnline')}`;
    await this.set(key, { socketId, timestamp: new Date().toISOString() }, 3600); // 1 hour TTL
  }

  async setUserOffline(userId) {
    const key = `user:online:${this._safeUserIdToString(userId, 'setUserOffline')}`;
    await this.del(key);
  }

  async isUserOnline(userId) {
    const key = `user:online:${this._safeUserIdToString(userId, 'isUserOnline')}`;
    const data = await this.get(key);
    return !!data;
  }

  // Notification delivery tracking
  async trackNotificationDelivery(notificationId, userId, status = 'sent') {
    const key = `notification:delivery:${notificationId}`;
    await this.client.hSet(key, this._safeUserIdToString(userId, 'trackNotificationDelivery'), JSON.stringify({
      status,
      timestamp: new Date().toISOString()
    }));
    await this.client.expire(key, 86400); // 24 hours TTL
  }

  async getNotificationDeliveryStatus(notificationId) {
    const key = `notification:delivery:${notificationId}`;
    return await this.client.hGetAll(key);
  }

  // Health check
  async ping() {
    try {
      return await this.client.ping();
    } catch (error) {
      console.error('[Notification Service] Redis ping failed:', error);
      return false;
    }
  }

  // Reconnection
  async checkAndReconnect() {
    if (!this.isConnected) {
      console.log('[Notification Service] Attempting to reconnect to Redis...');
      try {
        await this.connect();
      } catch (error) {
        console.error('[Notification Service] Reconnection failed:', error);
      }
    }
  }

  getPubClient() {
    return this.pubClient;
  }

  getSubClient() {
    return this.subClient;
  }
}

module.exports = new RedisClient();