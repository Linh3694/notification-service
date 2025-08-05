const { createClient } = require('redis');
require('dotenv').config({ path: './config.env' });

class RedisClient {
  constructor() {
    this.client = null;
    this.pubClient = null;
    this.subClient = null;
  }

  async connect() {
    try {
      this.client = createClient({
        socket: {
          host: process.env.REDIS_HOST,
          port: process.env.REDIS_PORT,
        },
        password: process.env.REDIS_PASSWORD,
      });

      this.pubClient = createClient({
        socket: {
          host: process.env.REDIS_HOST,
          port: process.env.REDIS_PORT,
        },
        password: process.env.REDIS_PASSWORD,
      });

      this.subClient = this.pubClient.duplicate();

      await this.client.connect();
      await this.pubClient.connect();
      await this.subClient.connect();

      console.log('✅ [Notification Service] Redis connected successfully');
    } catch (error) {
      console.error('❌ [Notification Service] Redis connection failed:', error.message);
      throw error;
    }
  }

  async set(key, value, ttl = null) {
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
    if (ttl) {
      await this.client.setEx(key, ttl, stringValue);
    } else {
      await this.client.set(key, stringValue);
    }
  }

  async get(key) {
    const value = await this.client.get(key);
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  async del(key) {
    await this.client.del(key);
  }

  async publish(channel, message) {
    const stringMessage = typeof message === 'object' ? JSON.stringify(message) : message;
    await this.pubClient.publish(channel, stringMessage);
  }

  async subscribe(channel, callback) {
    await this.subClient.subscribe(channel, (message) => {
      try {
        const parsedMessage = JSON.parse(message);
        callback(parsedMessage);
      } catch {
        callback(message);
      }
    });
  }

  // Multi-channel subscription
  async subscribeToChannels(channels, callback) {
    for (const channel of channels) {
      await this.subscribe(channel, callback);
    }
  }

  // Notification-specific cache methods
  async cacheUserNotifications(userId, notifications) {
    const key = `notifications:user:${userId}`;
    await this.set(key, notifications, 1800); // Cache for 30 minutes
  }

  async getCachedUserNotifications(userId) {
    const key = `notifications:user:${userId}`;
    return await this.get(key);
  }

  async invalidateUserNotificationsCache(userId) {
    const key = `notifications:user:${userId}`;
    await this.del(key);
  }

  // Push token management
  async storePushToken(userId, token, platform = 'expo') {
    const key = `push_tokens:${userId}`;
    await this.client.hSet(key, platform, token);
  }

  async getPushTokens(userId) {
    const key = `push_tokens:${userId}`;
    return await this.client.hGetAll(key);
  }

  async removePushToken(userId, platform = 'expo') {
    const key = `push_tokens:${userId}`;
    await this.client.hDel(key, platform);
  }

  // Notification queue
  async queueNotification(notification) {
    await this.client.lPush('notification_queue', JSON.stringify(notification));
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
    const key = `user:online:${userId}`;
    await this.set(key, { socketId, timestamp: new Date().toISOString() }, 3600); // 1 hour TTL
  }

  async setUserOffline(userId) {
    const key = `user:online:${userId}`;
    await this.del(key);
  }

  async isUserOnline(userId) {
    const key = `user:online:${userId}`;
    const data = await this.get(key);
    return !!data;
  }

  // Notification delivery tracking
  async trackNotificationDelivery(notificationId, userId, status = 'sent') {
    const key = `notification:delivery:${notificationId}`;
    await this.client.hSet(key, userId, JSON.stringify({
      status,
      timestamp: new Date().toISOString()
    }));
    await this.client.expire(key, 86400); // 24 hours TTL
  }

  async getNotificationDeliveryStatus(notificationId) {
    const key = `notification:delivery:${notificationId}`;
    return await this.client.hGetAll(key);
  }

  getPubClient() {
    return this.pubClient;
  }

  getSubClient() {
    return this.subClient;
  }
}

module.exports = new RedisClient();