/**
 * Cache Service for Database Performance Optimization
 * Implements multi-level caching với Redis
 */

const redisClient = require('../config/redis');

class CacheService {
  constructor() {
    this.defaultTTL = {
      userNotifications: 300,    // 5 minutes
      unreadCount: 60,          // 1 minute
      notificationDetail: 600,  // 10 minutes
      analytics: 1800          // 30 minutes
    };
  }

  // Cache key generators
  _getUserNotificationsKey(userId, page, limit) {
    return `cache:notifications:user:${userId}:page${page}:limit${limit}`;
  }

  _getUnreadCountKey(userId) {
    return `cache:unread:${userId}`;
  }

  _getNotificationDetailKey(notificationId) {
    return `cache:notification:${notificationId}`;
  }

  _getAnalyticsKey(type, params = {}) {
    const paramStr = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(':');
    return `cache:analytics:${type}:${paramStr || 'all'}`;
  }

  // User notifications cache
  async getUserNotifications(userId, page = 1, limit = 20) {
    const key = this._getUserNotificationsKey(userId, page, limit);
    return await redisClient.get(key);
  }

  async setUserNotifications(userId, page, limit, data) {
    const key = this._getUserNotificationsKey(userId, page, limit);
    await redisClient.set(key, data, this.defaultTTL.userNotifications);
  }

  async invalidateUserNotifications(userId) {
    // Invalidate all pages for this user
    const pattern = `cache:notifications:user:${userId}:*`;
    const keys = await redisClient.client.keys(pattern);
    if (keys.length > 0) {
      await redisClient.client.del(keys);
    }
  }

  // Unread count cache
  async getUnreadCount(userId) {
    const key = this._getUnreadCountKey(userId);
    return await redisClient.get(key);
  }

  async setUnreadCount(userId, count) {
    const key = this._getUnreadCountKey(userId);
    await redisClient.set(key, count, this.defaultTTL.unreadCount);
  }

  async invalidateUnreadCount(userId) {
    const key = this._getUnreadCountKey(userId);
    await redisClient.del(key);
  }

  // Notification detail cache
  async getNotificationDetail(notificationId) {
    const key = this._getNotificationDetailKey(notificationId);
    return await redisClient.get(key);
  }

  async setNotificationDetail(notificationId, data) {
    const key = this._getNotificationDetailKey(notificationId);
    await redisClient.set(key, data, this.defaultTTL.notificationDetail);
  }

  async invalidateNotificationDetail(notificationId) {
    const key = this._getNotificationDetailKey(notificationId);
    await redisClient.del(key);
  }

  // Analytics cache
  async getAnalytics(type, params = {}) {
    const key = this._getAnalyticsKey(type, params);
    return await redisClient.get(key);
  }

  async setAnalytics(type, params, data) {
    const key = this._getAnalyticsKey(type, params);
    await redisClient.set(key, data, this.defaultTTL.analytics);
  }

  async invalidateAnalytics(type, params = {}) {
    const key = this._getAnalyticsKey(type, params);
    await redisClient.del(key);
  }

  // Bulk invalidation methods
  async invalidateUserCache(userId) {
    await Promise.all([
      this.invalidateUserNotifications(userId),
      this.invalidateUnreadCount(userId)
    ]);
  }

  async invalidateNotificationCache(notificationId) {
    await Promise.all([
      this.invalidateNotificationDetail(notificationId),
      // Invalidate related user caches (this would need notification recipients)
    ]);
  }

  // Cache warming for frequently accessed data
  async warmUserCache(userId) {
    try {
      const Notification = require('../models/Notification');

      // Warm unread count
      const unreadCount = await Notification.getUnreadCount(userId);
      await this.setUnreadCount(userId, unreadCount);

      // Warm first page of notifications
      const result = await Notification.getUserNotifications(userId, 1, 20);
      await this.setUserNotifications(userId, 1, 20, result);

      console.log(`✅ [CacheService] Warmed cache for user ${userId}`);
    } catch (error) {
      console.warn(`⚠️ [CacheService] Failed to warm cache for user ${userId}:`, error.message);
    }
  }

  // Cache statistics
  async getCacheStats() {
    try {
      const info = await redisClient.client.info('memory');
      const keys = await redisClient.client.keys('cache:*');

      return {
        cacheKeys: keys.length,
        memory: {
          used: info.match(/used_memory:(\d+)/)?.[1],
          peak: info.match(/used_memory_peak:(\d+)/)?.[1]
        },
        hitRate: 'N/A' // Would need additional tracking
      };
    } catch (error) {
      console.warn('⚠️ [CacheService] Failed to get cache stats:', error.message);
      return null;
    }
  }

  // Health check
  async healthCheck() {
    try {
      await redisClient.ping();
      return { status: 'healthy', service: 'cache-service' };
    } catch (error) {
      return { status: 'unhealthy', service: 'cache-service', error: error.message };
    }
  }
}

module.exports = new CacheService();
