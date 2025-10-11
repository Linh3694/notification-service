const redisClient = require('../config/redis');
const notificationController = require('../controllers/notificationController');

class CrossServiceCommunication {
  constructor() {
    this.subscribedChannels = [];
    this.isInitialized = false;
  }

  // Khởi tạo subscription cho các channels
  async initializeSubscriptions() {
    if (this.isInitialized) {
      console.log('🔗 [Notification Service] Cross-service communication already initialized');
      return;
    }

    const channels = [
      'ticket-service',
      'frappe',
      'broadcast',
      'notification-service',
      'chat-service',
      'workspace-backend',
      'attendance-service',
      'notification_events',  // Channel từ attendance service
      'social-service'
    ];

    console.log('🔗 [Notification Service] Subscribing to channels:', channels);
    
    try {
      await redisClient.subscribeToChannels(channels, this.handleMessage.bind(this));
      this.subscribedChannels = channels;
      this.isInitialized = true;
      
      console.log('✅ [Notification Service] Cross-service communication initialized');
    } catch (error) {
      console.error('❌ [Notification Service] Failed to initialize cross-service communication:', error);
      throw error;
    }
  }

  // Xử lý message từ các services khác
  async handleMessage(message) {
    try {
      console.log('📨 [Notification Service] Received message:', {
        service: message.service,
        event: message.event || message.type, // Support both event and type
        timestamp: message.timestamp
      });

      // Handle attendance events from notification_events channel
      if (message.service === 'attendance-service' && message.type === 'attendance_recorded') {
        await this.handleAttendanceServiceMessage(message);
        return;
      }

      switch (message.service) {
        case 'social-service':
          await this.handleSocialServiceMessage(message);
          break;
        case 'ticket-service':
          await this.handleTicketServiceMessage(message);
          break;
        case 'frappe':
          await this.handleFrappeMessage(message);
          break;
        case 'broadcast':
          await this.handleBroadcastMessage(message);
          break;
        case 'chat-service':
          await this.handleChatServiceMessage(message);
          break;
        case 'workspace-backend':
          await this.handleWorkspaceBackendMessage(message);
          break;
        case 'attendance-service':
          await this.handleAttendanceServiceMessage(message);
          break;
        default:
          console.log('⚠️ [Notification Service] Unknown service:', message.service);
      }
    } catch (error) {
      console.error('❌ [Notification Service] Error handling message:', error);
    }
  }

  // Xử lý message từ social-service
  async handleSocialServiceMessage(message) {
    const { event, data } = message;
    switch (event) {
      case 'post_tagged':
        await this.sendNotification({
          title: 'Bạn được tag trong một bài viết',
          message: `${data.authorName} đã tag bạn trong một bài viết`,
          recipients: data.recipients,
          type: 'post_tagged',
          priority: 'low',
          data,
        });
        break;
      case 'post_reacted':
        await this.sendNotification({
          title: 'Bài viết của bạn có phản hồi mới',
          message: `${data.userId || 'Một người dùng'} đã react (${data.reactionType}) bài viết của bạn`,
          recipients: [data.recipientId],
          type: 'post_reacted',
          priority: 'low',
          data,
        });
        break;
      case 'post_commented':
        await this.sendNotification({
          title: 'Bài viết của bạn có bình luận mới',
          message: data.content,
          recipients: [data.recipientId],
          type: 'post_commented',
          priority: 'low',
          data,
        });
        break;
      default:
        console.log('⚠️ [Notification Service] Unknown social event:', event);
    }
  }

  // Xử lý message từ ticket-service
  async handleTicketServiceMessage(message) {
    const { event, data } = message;

    switch (event) {
      case 'ticket_created':
        await this.handleTicketCreated(data);
        break;
      case 'ticket_updated':
        await this.handleTicketUpdated(data);
        break;
      case 'ticket_assigned':
        await this.handleTicketAssigned(data);
        break;
      case 'ticket_status_changed':
        await this.handleTicketStatusChanged(data);
        break;
      case 'ticket_feedback':
        await this.handleTicketFeedback(data);
        break;
      case 'message_sent':
        await this.handleMessageSent(data);
        break;
      default:
        console.log('⚠️ [Notification Service] Unknown ticket event:', event);
    }
  }

  // Xử lý message từ frappe
  async handleFrappeMessage(message) {
    const { event, data } = message;

    switch (event) {
      case 'user_created':
        await this.handleUserCreated(data);
        break;
      case 'user_updated':
        await this.handleUserUpdated(data);
        break;
      case 'user_deleted':
        await this.handleUserDeleted(data);
        break;
      case 'role_changed':
        await this.handleRoleChanged(data);
        break;
      case 'department_changed':
        await this.handleDepartmentChanged(data);
        break;
      default:
        console.log('⚠️ [Notification Service] Unknown frappe event:', event);
    }
  }

  // Xử lý message từ chat-service
  async handleChatServiceMessage(message) {
    const { event, data } = message;

    switch (event) {
      case 'message_sent':
        await this.handleChatMessageSent(data);
        break;
      case 'user_online':
        await this.handleUserOnline(data);
        break;
      case 'user_offline':
        await this.handleUserOffline(data);
        break;
      default:
        console.log('⚠️ [Notification Service] Unknown chat event:', event);
    }
  }

  // Xử lý message từ workspace-backend
  async handleWorkspaceBackendMessage(message) {
    const { event, data } = message;

    switch (event) {
      case 'notification_sent':
        await this.handleNotificationSent(data);
        break;
      case 'user_status_changed':
        await this.handleUserStatusChanged(data);
        break;
      case 'system_event':
        await this.handleSystemEvent(data);
        break;
      default:
        console.log('⚠️ [Notification Service] Unknown workspace-backend event:', event);
    }
  }

  // Xử lý broadcast message
  async handleBroadcastMessage(message) {
    const { event, data } = message;

    switch (event) {
      case 'system_maintenance':
        await this.handleSystemMaintenance(data);
        break;
      case 'emergency_notification':
        await this.handleEmergencyNotification(data);
        break;
      case 'service_status':
        await this.handleServiceStatus(data);
        break;
      default:
        console.log('⚠️ [Notification Service] Unknown broadcast event:', event);
    }
  }

  // Ticket event handlers
  async handleTicketCreated(data) {
    console.log('🎫 [Notification Service] Handling ticket created:', data.ticketCode);
    
    // Gửi notification cho admin và technical users
    const notificationData = {
      title: 'Ticket mới được tạo',
      message: `Ticket #${data.ticketCode} đã được tạo bởi ${data.creatorName}`,
      recipients: data.adminUsers,
      type: 'ticket_created',
      priority: 'high',
      data: {
        ticketId: data.ticketId,
        ticketCode: data.ticketCode,
        creatorId: data.creatorId
      }
    };

    await this.sendNotification(notificationData);
  }

  async handleTicketUpdated(data) {
    console.log('🔄 [Notification Service] Handling ticket updated:', data.ticketCode);
    
    const notificationData = {
      title: 'Ticket đã được cập nhật',
      message: `Ticket #${data.ticketCode} đã được cập nhật`,
      recipients: data.recipients,
      type: 'ticket_updated',
      priority: 'medium',
      data: {
        ticketId: data.ticketId,
        ticketCode: data.ticketCode,
        updatedBy: data.updatedBy
      }
    };

    await this.sendNotification(notificationData);
  }

  async handleTicketAssigned(data) {
    console.log('👤 [Notification Service] Handling ticket assigned:', data.ticketCode);
    
    const notificationData = {
      title: 'Ticket đã được gán',
      message: `Ticket #${data.ticketCode} đã được gán cho ${data.assignedToName}`,
      recipients: [data.assignedToId],
      type: 'ticket_assigned',
      priority: 'high',
      data: {
        ticketId: data.ticketId,
        ticketCode: data.ticketCode,
        assignedToId: data.assignedToId
      }
    };

    await this.sendNotification(notificationData);
  }

  async handleTicketStatusChanged(data) {
    console.log('📊 [Notification Service] Handling ticket status changed:', data.ticketCode);
    
    const statusMessages = {
      'Processing': 'đang được xử lý',
      'Done': 'đã hoàn thành',
      'Closed': 'đã đóng',
      'Cancelled': 'đã bị hủy'
    };

    const statusMessage = statusMessages[data.newStatus] || data.newStatus;
    
    const notificationData = {
      title: 'Trạng thái ticket đã thay đổi',
      message: `Ticket #${data.ticketCode} ${statusMessage}`,
      recipients: data.recipients,
      type: 'ticket_status_changed',
      priority: 'medium',
      data: {
        ticketId: data.ticketId,
        ticketCode: data.ticketCode,
        oldStatus: data.oldStatus,
        newStatus: data.newStatus
      }
    };

    await this.sendNotification(notificationData);
  }

  async handleTicketFeedback(data) {
    console.log('⭐ [Notification Service] Handling ticket feedback:', data.ticketCode);
    
    const notificationData = {
      title: 'Ticket đã nhận đánh giá',
      message: `Ticket #${data.ticketCode} đã được đánh giá ${data.rating}/5 sao`,
      recipients: data.recipients,
      type: 'ticket_feedback',
      priority: 'medium',
      data: {
        ticketId: data.ticketId,
        ticketCode: data.ticketCode,
        rating: data.rating,
        comment: data.comment
      }
    };

    await this.sendNotification(notificationData);
  }

  async handleMessageSent(data) {
    console.log('💬 [Notification Service] Handling message sent:', data.ticketCode);
    
    const notificationData = {
      title: 'Tin nhắn mới trong ticket',
      message: `Có tin nhắn mới trong ticket #${data.ticketCode}`,
      recipients: data.recipients,
      type: 'message_sent',
      priority: 'low',
      data: {
        ticketId: data.ticketId,
        ticketCode: data.ticketCode,
        messageId: data.messageId,
        senderId: data.senderId
      }
    };

    await this.sendNotification(notificationData);
  }

  // Chat event handlers
  async handleChatMessageSent(data) {
    console.log('💬 [Notification Service] Handling chat message sent');
    
    const notificationData = {
      title: data.chatName || 'Tin nhắn mới',
      message: `${data.senderName}: ${data.messageContent}`,
      recipients: data.recipients,
      type: 'chat_message',
      priority: 'low',
      data: {
        chatId: data.chatId,
        messageId: data.messageId,
        senderId: data.senderId
      }
    };

    await this.sendNotification(notificationData);
  }

  async handleUserOnline(data) {
    console.log('🟢 [Notification Service] User online:', data.userId);
    await redisClient.setUserOnline(data.userId, data.socketId);
  }

  async handleUserOffline(data) {
    console.log('🔴 [Notification Service] User offline:', data.userId);
    await redisClient.setUserOffline(data.userId);
  }

  // Workspace-backend event handlers
  async handleNotificationSent(data) {
    console.log('📤 [Notification Service] Notification sent:', data.notificationId);
    // Track delivery status
    await redisClient.trackNotificationDelivery(data.notificationId, data.userId, 'sent');
  }

  async handleUserStatusChanged(data) {
    console.log('👤 [Notification Service] User status changed:', data.userId);
    // Update user status in Redis
    if (data.isOnline) {
      await redisClient.setUserOnline(data.userId, data.socketId);
    } else {
      await redisClient.setUserOffline(data.userId);
    }
  }

  async handleSystemEvent(data) {
    console.log('⚙️ [Notification Service] System event:', data.event);
    // Handle system-wide events
    const notificationData = {
      title: data.title || 'Thông báo hệ thống',
      message: data.message,
      recipients: data.recipients || 'all',
      type: 'system_event',
      priority: data.priority || 'medium',
      data: data
    };

    await this.sendNotification(notificationData);
  }

  // Frappe event handlers
  async handleUserCreated(data) {
    console.log('👤 [Notification Service] Handling user created:', data.userId);
    
    // Có thể gửi welcome notification
    const notificationData = {
      title: 'Chào mừng bạn đến với hệ thống',
      message: `Chào mừng ${data.fullName} đến với hệ thống Wellspring`,
      recipients: [data.userId],
      type: 'welcome',
      priority: 'low',
      data: {
        userId: data.userId,
        fullName: data.fullName
      }
    };

    await this.sendNotification(notificationData);
  }

  async handleUserUpdated(data) {
    console.log('🔄 [Notification Service] Handling user updated:', data.userId);
    
    // Có thể gửi notification về thay đổi thông tin
    const notificationData = {
      title: 'Thông tin tài khoản đã được cập nhật',
      message: 'Thông tin tài khoản của bạn đã được cập nhật',
      recipients: [data.userId],
      type: 'profile_updated',
      priority: 'low',
      data: {
        userId: data.userId,
        updatedFields: data.updatedFields
      }
    };

    await this.sendNotification(notificationData);
  }

  async handleUserDeleted(data) {
    console.log('🗑️ [Notification Service] Handling user deleted:', data.userId);
    
    // Có thể gửi notification cho admin
    const notificationData = {
      title: 'Người dùng đã bị xóa',
      message: `Người dùng ${data.fullName} đã bị xóa khỏi hệ thống`,
      recipients: data.adminUsers,
      type: 'user_deleted',
      priority: 'medium',
      data: {
        userId: data.userId,
        fullName: data.fullName
      }
    };

    await this.sendNotification(notificationData);
  }

  async handleRoleChanged(data) {
    console.log('🎭 [Notification Service] Handling role changed:', data.userId);
    
    const notificationData = {
      title: 'Vai trò đã được thay đổi',
      message: `Vai trò của bạn đã được thay đổi thành ${data.newRole}`,
      recipients: [data.userId],
      type: 'role_changed',
      priority: 'medium',
      data: {
        userId: data.userId,
        oldRole: data.oldRole,
        newRole: data.newRole
      }
    };

    await this.sendNotification(notificationData);
  }

  async handleDepartmentChanged(data) {
    console.log('🏢 [Notification Service] Handling department changed:', data.userId);
    
    const notificationData = {
      title: 'Phòng ban đã được thay đổi',
      message: `Bạn đã được chuyển đến phòng ban ${data.newDepartment}`,
      recipients: [data.userId],
      type: 'department_changed',
      priority: 'medium',
      data: {
        userId: data.userId,
        oldDepartment: data.oldDepartment,
        newDepartment: data.newDepartment
      }
    };

    await this.sendNotification(notificationData);
  }

  // Broadcast event handlers
  async handleSystemMaintenance(data) {
    console.log('🔧 [Notification Service] Handling system maintenance');
    
    const notificationData = {
      title: 'Bảo trì hệ thống',
      message: data.message || 'Hệ thống sẽ bảo trì trong thời gian sắp tới',
      recipients: data.recipients || 'all',
      type: 'system_maintenance',
      priority: 'high',
      data: {
        maintenanceTime: data.maintenanceTime,
        duration: data.duration
      }
    };

    await this.sendNotification(notificationData);
  }

  async handleEmergencyNotification(data) {
    console.log('🚨 [Notification Service] Handling emergency notification');
    
    const notificationData = {
      title: 'Thông báo khẩn cấp',
      message: data.message,
      recipients: data.recipients || 'all',
      type: 'emergency',
      priority: 'urgent',
      data: {
        emergencyType: data.emergencyType,
        actionRequired: data.actionRequired
      }
    };

    await this.sendNotification(notificationData);
  }

  async handleServiceStatus(data) {
    console.log('📊 [Notification Service] Handling service status:', data.service);
    
    const notificationData = {
      title: 'Trạng thái dịch vụ',
      message: `Dịch vụ ${data.service} ${data.status}`,
      recipients: data.recipients || 'admin',
      type: 'service_status',
      priority: 'medium',
      data: {
        service: data.service,
        status: data.status,
        details: data.details
      }
    };

    await this.sendNotification(notificationData);
  }

  // Gửi notification
  async sendNotification(notificationData) {
    try {
      console.log('📤 [Notification Service] Sending notification:', {
        title: notificationData.title,
        recipients: notificationData.recipients.length,
        type: notificationData.type
      });

      // Lưu vào database
      await notificationController.saveNotificationToDatabase(
        notificationData.recipients,
        notificationData.title,
        notificationData.message,
        notificationData.data,
        notificationData.type
      );

      // Gửi push notification
      const pushTokens = await this.getPushTokensForUsers(notificationData.recipients);
      if (pushTokens.length > 0) {
        await notificationController.sendPushNotifications(
          pushTokens,
          notificationData.title,
          notificationData.message,
          notificationData.data
        );
      }

      // Broadcast qua Socket.IO
      await this.broadcastNotification(notificationData);

      console.log('✅ [Notification Service] Notification sent successfully');
    } catch (error) {
      console.error('❌ [Notification Service] Error sending notification:', error);
    }
  }

  // Lấy push tokens cho danh sách users
  async getPushTokensForUsers(userIds) {
    const tokens = [];
    for (const userId of userIds) {
      try {
        const userTokens = await redisClient.getPushTokens(userId);
        if (userTokens && Object.keys(userTokens).length > 0) {
          tokens.push(...Object.values(userTokens));
        }
      } catch (error) {
        console.error(`Error getting push tokens for user ${userId}:`, error);
      }
    }
    return tokens;
  }

  // Broadcast notification qua Socket.IO
  async broadcastNotification(notificationData) {
    try {
      // Implementation sẽ được thêm trong app.js
      console.log('📡 [Notification Service] Broadcasting notification to Socket.IO');
    } catch (error) {
      console.error('Error broadcasting notification:', error);
    }
  }

  // Gửi message đến ticket-service
  async sendToTicketService(event, data) {
    await redisClient.publishToTicketService(event, data);
  }

  // Gửi message đến frappe
  async sendToFrappe(event, data) {
    await redisClient.publishToFrappe(event, data);
  }

  // Gửi message đến tất cả services
  async sendToAllServices(event, data) {
    await redisClient.publishToAllServices(event, data);
  }

  // Handle messages từ attendance service
  async handleAttendanceServiceMessage(message) {
    console.log('⏰ [Notification Service] Processing attendance service message:', message.type);
    
    // Chỉ xử lý event attendance_recorded - đơn giản hóa
    if (message.type === 'attendance_recorded') {
      await this.handleAttendanceRecorded(message.data);
    } else {
      console.log('⚠️ [Notification Service] Ignoring attendance event:', message.type);
    }
  }

  // Handler cho attendance event - route đến đúng handler
  async handleAttendanceRecorded(data) {
    try {
      const { employeeCode, employeeName, timestamp, deviceName, checkInTime, checkOutTime } = data;
      
      console.log(`⏰ [Notification Service] Processing attendance for: ${employeeCode} (${employeeName})`);
      
      const notificationController = require('../controllers/notificationController');
      
      // Try student attendance first
      await notificationController.sendStudentAttendanceNotification({
        employeeCode,
        employeeName,
        timestamp,
        deviceName,
        checkInTime,
        checkOutTime
      });
      
      // Note: sendStudentAttendanceNotification sẽ check xem có phải student không
      // Nếu không phải student, nó sẽ không làm gì
      // Để gửi cho employee, có thể uncomment dòng dưới nếu cần:
      // await notificationController.sendAttendanceNotification({
      //   employeeCode,
      //   employeeName,
      //   timestamp,
      //   deviceName
      // });
      
    } catch (error) {
      console.error('❌ [Notification Service] Error handling attendance recorded:', error);
    }
  }

  // Các methods khác đã được loại bỏ để đơn giản hóa

  // Health check
  async healthCheck() {
    try {
      return {
        service: 'notification-service',
        status: 'healthy',
        subscribedChannels: this.subscribedChannels.length,
        isInitialized: this.isInitialized,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        service: 'notification-service',
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = new CrossServiceCommunication(); 