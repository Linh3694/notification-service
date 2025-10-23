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
    try {
      if (!redisClient.client) {
        console.warn('⚠️ [CacheService] Redis client not available');
        return null;
      }
      const key = this._getUserNotificationsKey(userId, page, limit);
      return await redisClient.get(key);
    } catch (error) {
      console.warn('⚠️ [CacheService] Failed to get user notifications:', error.message);
      return null;
    }
  }

  async setUserNotifications(userId, page, limit, data) {
    try {
      if (!redisClient.client) {
        console.warn('⚠️ [CacheService] Redis client not available');
        return;
      }
      const key = this._getUserNotificationsKey(userId, page, limit);
      const dataStr = JSON.stringify(data);
      await redisClient.set(key, dataStr, this.defaultTTL.userNotifications);
    } catch (error) {
      console.warn('⚠️ [CacheService] Failed to set user notifications:', error.message);
    }
  }

  async invalidateUserNotifications(userId) {
    try {
      if (!redisClient.client) {
        console.warn('⚠️ [CacheService] Redis client not available');
        return;
      }
      // Invalidate all pages for this user
      const pattern = `cache:notifications:user:${userId}:*`;
      const keys = await redisClient.client.keys(pattern);
      if (keys.length > 0) {
        await redisClient.client.del(keys);
      }
    } catch (error) {
      console.warn('⚠️ [CacheService] Failed to invalidate user notifications:', error.message);
    }
  }

  // Unread count cache
  async getUnreadCount(userId) {
    try {
      if (!redisClient.client) {
        console.warn('⚠️ [CacheService] Redis client not available');
        return null;
      }
      const key = this._getUnreadCountKey(userId);
      const result = await redisClient.get(key);
      return result ? parseInt(result) : null;
    } catch (error) {
      console.warn('⚠️ [CacheService] Failed to get unread count:', error.message);
      return null;
    }
  }

  async setUnreadCount(userId, count) {
    try {
      if (!redisClient.client) {
        console.warn('⚠️ [CacheService] Redis client not available');
        return;
      }
      const key = this._getUnreadCountKey(userId);
      await redisClient.set(key, count.toString(), this.defaultTTL.unreadCount);
    } catch (error) {
      console.warn('⚠️ [CacheService] Failed to set unread count:', error.message);
    }
  }

  async invalidateUnreadCount(userId) {
    try {
      if (!redisClient.client) {
        console.warn('⚠️ [CacheService] Redis client not available');
        return;
      }
      const key = this._getUnreadCountKey(userId);
      await redisClient.del(key);
    } catch (error) {
      console.warn('⚠️ [CacheService] Failed to invalidate unread count:', error.message);
    }
  }

  // Notification detail cache
  async getNotificationDetail(notificationId) {
    try {
      if (!redisClient.client) {
        console.warn('⚠️ [CacheService] Redis client not available');
        return null;
      }
      const key = this._getNotificationDetailKey(notificationId);
      return await redisClient.get(key);
    } catch (error) {
      console.warn('⚠️ [CacheService] Failed to get notification detail:', error.message);
      return null;
    }
  }

  async setNotificationDetail(notificationId, data) {
    try {
      if (!redisClient.client) {
        console.warn('⚠️ [CacheService] Redis client not available');
        return;
      }
      const key = this._getNotificationDetailKey(notificationId);
      const dataStr = JSON.stringify(data);
      await redisClient.set(key, dataStr, this.defaultTTL.notificationDetail);
    } catch (error) {
      console.warn('⚠️ [CacheService] Failed to set notification detail:', error.message);
    }
  }

  async invalidateNotificationDetail(notificationId) {
    try {
      if (!redisClient.client) {
        console.warn('⚠️ [CacheService] Redis client not available');
        return;
      }
      const key = this._getNotificationDetailKey(notificationId);
      await redisClient.del(key);
    } catch (error) {
      console.warn('⚠️ [CacheService] Failed to invalidate notification detail:', error.message);
    }
  }

  // Analytics cache
  async getAnalytics(type, params = {}) {
    try {
      if (!redisClient.client) {
        console.warn('⚠️ [CacheService] Redis client not available');
        return null;
      }
      const key = this._getAnalyticsKey(type, params);
      const result = await redisClient.get(key);
      return result ? JSON.parse(result) : null;
    } catch (error) {
      console.warn('⚠️ [CacheService] Failed to get analytics:', error.message);
      return null;
    }
  }

  async setAnalytics(type, params, data) {
    try {
      if (!redisClient.client) {
        console.warn('⚠️ [CacheService] Redis client not available');
        return;
      }
      const key = this._getAnalyticsKey(type, params);
      const dataStr = JSON.stringify(data);
      await redisClient.set(key, dataStr, this.defaultTTL.analytics);
    } catch (error) {
      console.warn('⚠️ [CacheService] Failed to set analytics:', error.message);
    }
  }

  async invalidateAnalytics(type, params = {}) {
    try {
      if (!redisClient.client) {
        console.warn('⚠️ [CacheService] Redis client not available');
        return;
      }
      const key = this._getAnalyticsKey(type, params);
      await redisClient.del(key);
    } catch (error) {
      console.warn('⚠️ [CacheService] Failed to invalidate analytics:', error.message);
    }
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
      if (!redisClient.client) {
        console.warn('⚠️ [CacheService] Redis client not available for cache warming');
        return;
      }

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
