const database = require('../config/database');
const redisClient = require('../config/redis');
const { Expo } = require('expo-server-sdk');
const nodemailer = require('nodemailer');

class NotificationController {
  constructor() {
    this.expo = new Expo();
    this.emailTransporter = null;
    this.initEmailTransporter();
  }

  initEmailTransporter() {
    if (process.env.SMTP_HOST) {
      this.emailTransporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
  }

  // Create notification (Frappe compatible)
  async createNotification(req, res) {
    try {
      const { title, message, recipients, notification_type = 'system', priority = 'medium', data = null, channel = 'push' } = req.body;

      if (!title || !message) {
        return res.status(400).json({
          error: 'Missing required fields',
          message: 'title and message are required'
        });
      }

      // Create notification record
      const notificationData = {
        name: `NOTIF-${Date.now()}`,
        title,
        message,
        notification_type,
        priority,
        recipients: JSON.stringify(recipients),
        status: 'draft',
        channel,
        data: data ? JSON.stringify(data) : null,
        sender: req.user?.name || 'Administrator',
        creation: new Date().toISOString(),
        modified: new Date().toISOString(),
        owner: 'Administrator',
        modified_by: 'Administrator',
        docstatus: 0,
        idx: 0
      };

      await database.insert('ERP Notification', notificationData);

      // Send notification
      await this.sendNotification(notificationData);

      res.json({
        message: notificationData,
        status: 'success'
      });

    } catch (error) {
      console.error('Error in createNotification:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  // Send notification to recipients
  async sendNotification(notification) {
    try {
      let recipients = [];
      
      if (typeof notification.recipients === 'string') {
        recipients = JSON.parse(notification.recipients);
      } else {
        recipients = notification.recipients || [];
      }

      // Process different recipient types
      if (notification.recipient_type === 'all') {
        // Get all users
        const allUsers = await database.getAll('User', { enabled: 1 }, ['name']);
        recipients = allUsers.map(user => user.name);
      } else if (notification.recipient_type === 'role') {
        // Get users by role
        const roleUsers = [];
        for (const role of recipients) {
          const users = await database.getAll('Has Role', 
            { role: role, parenttype: 'User' }, 
            ['parent']
          );
          roleUsers.push(...users.map(u => u.parent));
        }
        recipients = [...new Set(roleUsers)];
      }

      // Send based on channel
      switch (notification.channel) {
        case 'push':
          await this.sendPushNotifications(recipients, notification);
          break;
        case 'email':
          await this.sendEmailNotifications(recipients, notification);
          break;
        case 'system':
          await this.createSystemNotifications(recipients, notification);
          break;
        default:
          await this.createSystemNotifications(recipients, notification);
      }

      // Update notification status
      await database.update('ERP Notification', notification.name, {
        status: 'sent',
        sent_at: new Date().toISOString(),
        modified: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error sending notification:', error);
      
      // Update notification status to failed
      await database.update('ERP Notification', notification.name, {
        status: 'failed',
        modified: new Date().toISOString()
      });
    }
  }

  // Send push notifications
  async sendPushNotifications(recipients, notification) {
    const messages = [];

    for (const recipient of recipients) {
      // Get push tokens for user
      const tokens = await redisClient.getPushTokens(recipient);
      
      for (const [platform, token] of Object.entries(tokens)) {
        if (platform === 'expo' && Expo.isExpoPushToken(token)) {
          messages.push({
            to: token,
            sound: 'default',
            title: notification.title,
            body: notification.message,
            data: notification.data ? JSON.parse(notification.data) : {},
          });
        }
      }
    }

    if (messages.length > 0) {
      const chunks = this.expo.chunkPushNotifications(messages);
      
      for (const chunk of chunks) {
        try {
          const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          console.log('Push notifications sent:', ticketChunk.length);
        } catch (error) {
          console.error('Error sending push notification chunk:', error);
        }
      }
    }
  }

  // Send email notifications
  async sendEmailNotifications(recipients, notification) {
    if (!this.emailTransporter) {
      console.warn('Email transporter not configured');
      return;
    }

    for (const recipient of recipients) {
      try {
        // Get user email
        const user = await database.get('User', recipient, ['email']);
        
        if (user && user.email) {
          await this.emailTransporter.sendMail({
            from: process.env.SMTP_FROM,
            to: user.email,
            subject: notification.title,
            html: notification.message,
          });
        }
      } catch (error) {
        console.error(`Error sending email to ${recipient}:`, error);
      }
    }
  }

  // Create system notifications (Frappe Notification Log)
  async createSystemNotifications(recipients, notification) {
    for (const recipient of recipients) {
      try {
        const logData = {
          name: `NLOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          subject: notification.title,
          email_content: notification.message,
          for_user: recipient,
          from_user: notification.sender,
          type: notification.notification_type.charAt(0).toUpperCase() + notification.notification_type.slice(1),
          document_type: notification.reference_doctype || null,
          document_name: notification.reference_name || null,
          read: 0,
          creation: new Date().toISOString(),
          modified: new Date().toISOString(),
          owner: 'Administrator',
          modified_by: 'Administrator'
        };

        await database.insert('Notification Log', logData);

        // Invalidate user notifications cache
        await redisClient.invalidateUserNotificationsCache(recipient);

        // Emit real-time notification
        const io = req.app?.get('io');
        if (io) {
          io.to(recipient).emit('notification', {
            title: notification.title,
            message: notification.message,
            type: notification.notification_type,
            timestamp: new Date().toISOString()
          });
        }

      } catch (error) {
        console.error(`Error creating system notification for ${recipient}:`, error);
      }
    }
  }

  // Get user notifications
  async getUserNotifications(req, res) {
    try {
      const { user = req.user?.name, limit = 50, unread_only = false } = req.query;

      if (!user) {
        return res.status(400).json({
          error: 'User parameter required'
        });
      }

      // Check cache first
      const cacheKey = `${user}:${limit}:${unread_only}`;
      let notifications = await redisClient.getCachedUserNotifications(cacheKey);

      if (!notifications) {
        const filters = { for_user: user };
        
        if (unread_only === 'true') {
          filters.read = 0;
        }

        notifications = await database.getAll('Notification Log',
          filters,
          ['name', 'subject', 'email_content', 'type', 'read', 'creation', 'from_user'],
          'creation DESC',
          parseInt(limit)
        );

        // Cache the results
        await redisClient.cacheUserNotifications(cacheKey, notifications);
      }

      res.json({
        message: notifications,
        status: 'success',
        total: notifications.length
      });

    } catch (error) {
      console.error('Error in getUserNotifications:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  // Mark notification as read
  async markAsRead(req, res) {
    try {
      const { notification_name } = req.params;
      const user = req.user?.name || req.body.user;

      // Update notification log
      await database.update('Notification Log', notification_name, {
        read: 1,
        modified: new Date().toISOString()
      });

      // Invalidate cache
      await redisClient.invalidateUserNotificationsCache(user);

      res.json({
        message: 'Notification marked as read',
        status: 'success'
      });

    } catch (error) {
      console.error('Error in markAsRead:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  // Register push token
  async registerPushToken(req, res) {
    try {
      const { user_id, token, platform = 'expo' } = req.body;

      if (!user_id || !token) {
        return res.status(400).json({
          error: 'Missing required fields',
          message: 'user_id and token are required'
        });
      }

      await redisClient.storePushToken(user_id, token, platform);

      res.json({
        message: 'Push token registered successfully',
        status: 'success'
      });

    } catch (error) {
      console.error('Error in registerPushToken:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  // Bulk send notifications
  async bulkSendNotifications(req, res) {
    try {
      const { notifications } = req.body;

      if (!Array.isArray(notifications)) {
        return res.status(400).json({
          error: 'Invalid input',
          message: 'notifications must be an array'
        });
      }

      const results = [];
      const errors = [];

      for (const notificationData of notifications) {
        try {
          // Queue notification for processing
          await redisClient.queueNotification(notificationData);
          results.push({ notification: notificationData, status: 'queued' });
        } catch (error) {
          errors.push({ notification: notificationData, error: error.message });
        }
      }

      res.json({
        message: 'Bulk notifications queued',
        status: 'success',
        queued: results.length,
        errors: errors.length,
        results,
        errors
      });

    } catch (error) {
      console.error('Error in bulkSendNotifications:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  // Get notification statistics
  async getNotificationStats(req, res) {
    try {
      const { start_date, end_date, user } = req.query;

      let filters = {};
      
      if (start_date && end_date) {
        filters.creation = ['between', start_date, end_date];
      }
      
      if (user) {
        filters.for_user = user;
      }

      const notifications = await database.getAll('Notification Log', filters);

      const stats = {
        total: notifications.length,
        read: notifications.filter(n => n.read === 1).length,
        unread: notifications.filter(n => n.read === 0).length,
        by_type: {},
        by_sender: {},
        recent: notifications.slice(0, 10)
      };

      // Group by type
      notifications.forEach(n => {
        stats.by_type[n.type] = (stats.by_type[n.type] || 0) + 1;
        stats.by_sender[n.from_user] = (stats.by_sender[n.from_user] || 0) + 1;
      });

      res.json({
        message: stats,
        status: 'success'
      });

    } catch (error) {
      console.error('Error in getNotificationStats:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
}

module.exports = new NotificationController();