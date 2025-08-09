const express = require("express");
const cors = require("cors");
const { Server } = require('socket.io');
const http = require('http');
const { createAdapter } = require('@socket.io/redis-adapter');
const cron = require('node-cron');
require("dotenv").config({ path: './config.env' });

// Import configurations
const database = require('./config/database');
const redisClient = require('./config/redis');
const crossServiceCommunication = require('./services/crossServiceCommunication');

// Import models for MongoDB
const mongoose = require('mongoose');
const Notification = require('./models/Notification');
const NotificationRead = require('./models/NotificationRead');

const app = express();
const server = http.createServer(app);

// Socket.IO setup with Redis adapter
const io = new Server(server, {
  cors: { origin: "*" },
  allowRequest: (req, callback) => {
    callback(null, true);
  },
});

// Setup Redis adapter for Socket.IO clustering
(async () => {
  try {
    console.log('🔗 [Notification Service] Setting up Redis adapter...');
    await redisClient.connect();
    
    io.adapter(createAdapter(redisClient.getPubClient(), redisClient.getSubClient()));
    console.log('✅ [Notification Service] Redis adapter setup complete');
    
    // Subscribe user events channel (feature-flagged by ENABLE_USER_EVENTS)
    try {
      await redisClient.subscribeUserEvents();
      console.log(`🔔 [Notification Service] Subscribed to user events channel: ${process.env.REDIS_USER_CHANNEL || 'user_events'}`);
    } catch (e) {
      console.warn('⚠️ [Notification Service] Failed to subscribe user events:', e.message);
    }

    // Initialize cross-service communication
    await crossServiceCommunication.initializeSubscriptions();
    
  } catch (error) {
    console.warn('⚠️ [Notification Service] Redis adapter setup failed:', error.message);
    console.warn('⚠️ [Notification Service] Continuing without Redis adapter (single instance)');
  }
})();

// Connect to databases
const connectDB = async () => {
  try {
    // Connect to MariaDB (existing functionality)
    await database.connect();
    
    // Connect to MongoDB for notifications
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/notification_service';
    await mongoose.connect(mongoUri);
    console.log('✅ [Notification Service] MongoDB connected for notifications');
    
  } catch (error) {
    console.error('❌ [Notification Service] Database connection failed:', error.message);
    process.exit(1);
  }
};

// Middleware
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Add service info to all responses
app.use((req, res, next) => {
  res.setHeader('X-Service', 'notification-service');
  res.setHeader('X-Service-Version', '1.0.0');
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await database.query('SELECT 1');
    
    // Check Redis connection
    const redisPing = await redisClient.ping();
    
    // Check notification queue length
    const queueLength = await redisClient.getQueueLength();
    
    // Check cross-service communication health
    const crossServiceHealth = await crossServiceCommunication.healthCheck();
    
    res.status(200).json({ 
      status: 'ok', 
      service: 'notification-service',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: 'connected',
      redis: redisPing ? 'connected' : 'disconnected',
      queue_length: queueLength,
      cross_service_communication: crossServiceHealth,
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      service: 'notification-service',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Import routes
const notificationRoutes = require('./routes/notificationRoutes');

// Use routes
app.use("/api/notification", notificationRoutes);
// Compatibility alias for clients expecting plural path
app.use("/api/notifications", notificationRoutes);

// Frappe-compatible API endpoints
app.use("/api/method", notificationRoutes);
app.use("/api/resource", notificationRoutes);

// Socket.IO event handlers
io.on('connection', (socket) => {
  console.log('🔌 [Notification Service] Client connected:', socket.id);
  
  // Join user to their personal room for targeted notifications
  socket.on('join_user_room', (data) => {
    const { userId } = data;
    if (userId) {
      socket.join(userId);
      // Track user online status
      redisClient.setUserOnline(userId, socket.id);
      console.log(`📱 [Notification Service] User ${userId} joined personal room`);
    }
  });
  
  // Leave user room
  socket.on('leave_user_room', (data) => {
    const { userId } = data;
    if (userId) {
      socket.leave(userId);
      // Track user offline status
      redisClient.setUserOffline(userId);
      console.log(`📱 [Notification Service] User ${userId} left personal room`);
    }
  });
  
  // Handle notification read status
  socket.on('mark_notification_read', async (data) => {
    try {
      const { notificationId, userId } = data;
      
      // Update in database
      await database.update('Notification Log', notificationId, {
        read: 1,
        modified: new Date().toISOString()
      });
      
      // Invalidate cache
      await redisClient.invalidateUserNotificationsCache(userId);
      
      // Track delivery status
      await redisClient.trackNotificationDelivery(notificationId, userId, 'read');
      
      // Broadcast to user's other devices
      socket.to(userId).emit('notification_read', { notificationId });
      
    } catch (error) {
      console.error('❌ [Notification Service] Error marking notification as read:', error);
      socket.emit('error', { message: 'Failed to mark notification as read' });
    }
  });
  
  // Handle push token registration
  socket.on('register_push_token', async (data) => {
    try {
      const { userId, token, platform = 'expo' } = data;
      
      await redisClient.storePushToken(userId, token, platform);
      
      socket.emit('push_token_registered', { status: 'success' });
      console.log(`📱 [Notification Service] Push token registered for user ${userId}`);
      
    } catch (error) {
      console.error('❌ [Notification Service] Error registering push token:', error);
      socket.emit('error', { message: 'Failed to register push token' });
    }
  });
  
  // Handle real-time notification sending
  socket.on('send_notification', async (data) => {
    try {
      const { title, message, recipients, type = 'system', priority = 'medium' } = data;
      
      // Create notification
      const notificationController = require('./controllers/notificationController');
      const notificationData = {
        title,
        message,
        recipients: JSON.stringify(recipients),
        notification_type: type,
        priority,
        channel: 'system',
        sender: 'Administrator'
      };
      
      // Send notification
      await notificationController.sendNotification(notificationData);
      
      socket.emit('notification_sent', { status: 'success' });
      
    } catch (error) {
      console.error('❌ [Notification Service] Error sending notification:', error);
      socket.emit('error', { message: 'Failed to send notification' });
    }
  });
  
  // Handle user presence
  socket.on('user_online', async (data) => {
    try {
      const { userId } = data;
      await redisClient.setUserOnline(userId, socket.id);
      console.log(`🟢 [Notification Service] User ${userId} is online`);
    } catch (error) {
      console.error('❌ [Notification Service] Error setting user online:', error);
    }
  });
  
  socket.on('user_offline', async (data) => {
    try {
      const { userId } = data;
      await redisClient.setUserOffline(userId);
      console.log(`🔴 [Notification Service] User ${userId} is offline`);
    } catch (error) {
      console.error('❌ [Notification Service] Error setting user offline:', error);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 [Notification Service] Client disconnected:', socket.id);
  });
});

// Notification queue processor
const processNotificationQueue = async () => {
  try {
    const notification = await redisClient.dequeueNotification();
    
    if (notification) {
      console.log('📨 [Notification Service] Processing queued notification:', notification.title);
      
      const notificationController = require('./controllers/notificationController');
      await notificationController.sendNotification(notification);
    }
  } catch (error) {
    console.error('❌ [Notification Service] Error processing notification queue:', error);
  }
};

// Schedule notification queue processing every 10 seconds
cron.schedule('*/10 * * * * *', processNotificationQueue);

// Cleanup old notifications every day at 2 AM
cron.schedule('0 2 * * *', async () => {
  try {
    console.log('🧹 [Notification Service] Cleaning up old notifications...');
    
    // Delete notifications older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    await database.query(
      'DELETE FROM `tabNotification Log` WHERE creation < ?',
      [thirtyDaysAgo.toISOString()]
    );
    
    console.log('✅ [Notification Service] Old notifications cleaned up');
  } catch (error) {
    console.error('❌ [Notification Service] Error cleaning up notifications:', error);
  }
});

// Redis health check every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    const ping = await redisClient.ping();
    if (!ping) {
      console.warn('⚠️ [Notification Service] Redis connection lost, attempting reconnect...');
      await redisClient.checkAndReconnect();
    }
  } catch (error) {
    console.error('❌ [Notification Service] Redis health check failed:', error);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ [Notification Service] Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message,
    service: 'notification-service',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    service: 'notification-service',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 [Notification Service] Received SIGTERM, shutting down gracefully...');
  
  try {
    // Close database connections
    if (database.pool) {
      await database.pool.end();
    }
    
    // Close Redis connections
    if (redisClient.client) {
      await redisClient.client.quit();
    }
    if (redisClient.pubClient) {
      await redisClient.pubClient.quit();
    }
    if (redisClient.subClient) {
      await redisClient.subClient.quit();
    }
    
    server.close(() => {
      console.log('🛑 [Notification Service] HTTP server closed');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ [Notification Service] Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log('🛑 [Notification Service] Received SIGINT, shutting down gracefully...');
  
  try {
    // Close database connections
    if (database.pool) {
      await database.pool.end();
    }
    
    // Close Redis connections
    if (redisClient.client) {
      await redisClient.client.quit();
    }
    if (redisClient.pubClient) {
      await redisClient.pubClient.quit();
    }
    if (redisClient.subClient) {
      await redisClient.subClient.quit();
    }
    
    server.close(() => {
      console.log('🛑 [Notification Service] HTTP server closed');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ [Notification Service] Error during shutdown:', error);
    process.exit(1);
  }
});

// Start server
const PORT = process.env.PORT || 5003;
server.listen(PORT, () => {
  console.log(`🚀 [Notification Service] Server running on port ${PORT}`);
  console.log(`🌐 [Notification Service] Health check: http://localhost:${PORT}/health`);
  console.log(`📡 [Notification Service] Socket.IO endpoint: http://localhost:${PORT}`);
});

// Connect to database
connectDB();

// Expose app and io for testing
module.exports = { app, io, server };