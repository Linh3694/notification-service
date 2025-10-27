const database = require('../config/database');
const redisClient = require('../config/redis');
const cacheService = require('../services/cacheService');
const { Expo } = require('expo-server-sdk');
const Notification = require('../models/Notification');
const NotificationRead = require('../models/NotificationRead');

// Khởi tạo instance của Expo
let expo = new Expo();

/**
 * Hàm dịch trạng thái sang tiếng Việt
 */
function translateStatus(status) {
  const statusMap = {
    "Assigned": "Đã nhận",
    "Processing": "Đang xử lý",
    "In Progress": "Đang xử lý",
    "Completed": "Hoàn thành",
    "Done": "Hoàn thành",
    "Cancelled": "Đã huỷ",
    "Waiting for Customer": "Chờ phản hồi",
    "Closed": "Đã đóng",
  };

  return statusMap[status] || status;
}

/**
 * Gửi Web Push notification (cho PWA)
 * Sử dụng webpush library để gửi trực tiếp
 */
async function sendWebPushNotification(subscriptionString, title, body, data = {}) {
    try {
        const webpush = require('web-push');
        
        // Parse subscription từ string
        const subscription = typeof subscriptionString === 'string' 
            ? JSON.parse(subscriptionString) 
            : subscriptionString;

        // Set VAPID details (lấy từ Frappe hoặc env)
        // Trong production, cần config VAPID keys riêng cho notification-service
        // Hoặc share keys với Frappe
        const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
        const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
        const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@wellspring.edu.vn';

        if (vapidPublicKey && vapidPrivateKey) {
            webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
        }

        // Create payload
        const payload = JSON.stringify({
            title,
            body,
            icon: '/icon.png',
            badge: '/icon.png',
            data: data || {},
            timestamp: Date.now()
        });

        // Send notification
        const result = await webpush.sendNotification(subscription, payload);
        return { success: true, result };
        
    } catch (error) {
        // If subscription is invalid (410 Gone), return error to remove it
        if (error.statusCode === 410 || error.statusCode === 404) {
            console.log('⚠️ Web push subscription expired or invalid');
            return { success: false, expired: true };
        }
        console.error('❌ Error sending web push:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Gửi thông báo đến các thiết bị theo danh sách token
 * Support cả Expo Push (mobile app) và Web Push (PWA)
 * @param {Array} pushTokens - Danh sách token thiết bị
 * @param {String} title - Tiêu đề thông báo
 * @param {String} body - Nội dung thông báo
 * @param {Object} data - Dữ liệu bổ sung gửi kèm thông báo
 */
const sendPushNotifications = async (pushTokens, title, body, data = {}) => {
    try {
        let expoMessages = [];
        let webPushTokens = [];
        let tickets = [];

        // Phân loại tokens: Expo vs Web Push
        for (let pushToken of pushTokens) {
            // Check if it's Expo token (format: ExponentPushToken[xxx])
            if (Expo.isExpoPushToken(pushToken)) {
                expoMessages.push({
                    to: pushToken,
                    sound: 'default',
                    title,
                    body,
                    data,
                });
            } 
            // Check if it's Web Push subscription (JSON string or object)
            else if (typeof pushToken === 'string' && pushToken.includes('endpoint')) {
                webPushTokens.push(pushToken);
            }
            else {
                console.warn(`⚠️ Unknown token format: ${pushToken.substring(0, 50)}...`);
            }
        }

        console.log(`📱 Token breakdown: ${expoMessages.length} Expo, ${webPushTokens.length} Web Push`);

        // Gửi Expo Push Notifications
        if (expoMessages.length > 0) {
            let chunks = expo.chunkPushNotifications(expoMessages);
            for (let chunk of chunks) {
                try {
                    let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                    tickets.push(...ticketChunk);
                    console.log(`✅ Sent ${chunk.length} Expo push notifications`);
                } catch (error) {
                    console.error('❌ Error sending Expo push:', error);
                }
            }
        }

        // Gửi Web Push Notifications
        if (webPushTokens.length > 0) {
            for (let subscription of webPushTokens) {
                try {
                    const result = await sendWebPushNotification(subscription, title, body, data);
                    if (result) {
                        tickets.push({ status: 'ok', platform: 'web' });
                        console.log(`✅ Sent web push notification`);
                    }
                } catch (error) {
                    console.error('❌ Error sending web push:', error);
                }
            }
        }

        return tickets;
    } catch (error) {
        console.error('❌ Error in sendPushNotifications:', error);
        return [];
    }
};

/**
 * Lưu thông báo vào cơ sở dữ liệu
 * @param {Array} recipients - Danh sách ID người nhận
 * @param {String} title - Tiêu đề thông báo
 * @param {String} body - Nội dung thông báo
 * @param {Object} data - Dữ liệu bổ sung
 * @param {String} type - Loại thông báo
 */
const saveNotificationToDatabase = async (recipients, title, body, data = {}, type = "system") => {
    try {
        // Tạo các đối tượng thông báo cho từng người nhận
        const notifications = recipients.map(recipient => ({
            name: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            subject: title,
            email_content: body,
            for_user: recipient,
            from_user: 'Administrator',
            type: type,
            document_type: 'Notification',
            document_name: data.documentName || 'System Notification',
            read: 0,
            creation: new Date().toISOString(),
            modified: new Date().toISOString(),
            owner: 'Administrator',
            modified_by: 'Administrator'
        }));

        // Lưu vào cơ sở dữ liệu
        for (const notification of notifications) {
            await database.insert('Notification Log', notification);
        }

        console.log(`✅ [Notification Service] Saved ${notifications.length} notifications to database`);
    } catch (error) {
        console.error('Lỗi khi lưu thông báo vào cơ sở dữ liệu:', error);
        throw error;
    }
};

/**
 * Gửi notification mới - cập nhật để sử dụng MongoDB
 */
exports.sendNotification = async (notificationData) => {
    try {
        const { title, message, recipients, notification_type, priority, channel, data } = notificationData;
        
        console.log('📤 [Notification Service] Sending notification:', {
            title,
            recipients: recipients?.length || 0,
            type: notification_type
        });

        // Parse recipients nếu là string
        let recipientList = recipients;
        if (typeof recipients === 'string') {
            try {
                recipientList = JSON.parse(recipients);
            } catch (error) {
                console.error('Error parsing recipients:', error);
                recipientList = [recipients];
            }
        }

        // Extract eventTimestamp từ data nếu có (cho attendance events)
        let eventTimestamp = null;
        let createdAt = undefined; // Let Mongoose set default
        
        if (data && data.timestamp) {
            try {
                eventTimestamp = new Date(data.timestamp);
                // Validate timestamp không phải future
                const now = new Date();
                if (eventTimestamp > now) {
                    console.warn('⚠️ [Notification Service] Event timestamp is in the future, using current time');
                    eventTimestamp = now;
                }
                // Set createdAt = eventTimestamp để hiển thị đúng thời gian event
                createdAt = eventTimestamp;
                console.log('✅ [Notification Service] Using event timestamp:', eventTimestamp.toISOString());
            } catch (error) {
                console.error('❌ [Notification Service] Error parsing event timestamp:', error);
            }
        }

        // Tạo notification trong database
        const notificationDoc = {
            title,
            message,
            type: notification_type || 'system',
            priority: priority || 'medium',
            channel: channel || 'push',
            data: data || {},
            recipients: recipientList,
            totalRecipients: recipientList.length,
            createdBy: 'notification-service'
        };

        // Thêm eventTimestamp và createdAt nếu có
        if (eventTimestamp) {
            notificationDoc.eventTimestamp = eventTimestamp;
            notificationDoc.createdAt = createdAt;
        }

        const notification = new Notification(notificationDoc);

        await notification.save();
        console.log('✅ [Notification Service] Notification saved to database:', notification._id);

        // Tạo NotificationRead records cho từng recipient
        const readRecords = recipientList.map(userId => ({
            notificationId: notification._id,
            userId: userId,
            read: false,
            deliveryStatus: 'sent'
        }));

        await NotificationRead.insertMany(readRecords);
        notification.sentCount = recipientList.length;
        await notification.save();

        // Gửi push notifications
        const pushResults = await sendPushNotificationsToUsers(recipientList, title, message, data);
        
        // Cập nhật delivery status
        await updateDeliveryStatus(notification._id, pushResults);

        // Broadcast qua Socket.IO
        await broadcastNotificationToUsers(recipientList, notification);

        console.log('✅ [Notification Service] Notification sent successfully');
        return { 
            success: true, 
            message: 'Notification sent successfully',
            notificationId: notification._id,
            recipients: recipientList.length
        };
    } catch (error) {
        console.error('❌ [Notification Service] Error sending notification:', error);
        throw error;
    }
};

/**
 * Lấy push subscription từ Frappe database cho user
 */
async function getPushSubscriptionFromFrappe(userEmail) {
    try {
        const query = `
            SELECT subscription_json 
            FROM \`tabPush Subscription\` 
            WHERE user = ?
            LIMIT 1
        `;
        const result = await database.sqlQuery(query, [userEmail]);
        
        if (result && result.length > 0 && result[0].subscription_json) {
            console.log(`✅ [Notification Service] Found push subscription for ${userEmail}`);
            return result[0].subscription_json;
        }
        
        console.log(`⚠️ [Notification Service] No push subscription found for ${userEmail}`);
        return null;
    } catch (error) {
        console.error(`❌ [Notification Service] Error getting push subscription for ${userEmail}:`, error);
        return null;
    }
}

/**
 * Gửi push notifications đến danh sách users và trả về kết quả
 * Updated: Query push subscriptions từ Frappe database thay vì Redis
 */
async function sendPushNotificationsToUsers(userIds, title, message, data = {}) {
    const results = [];
    
    for (const userId of userIds) {
        try {
            console.log(`📱 [Notification Service] Getting push subscription for ${userId}`);
            
            // Try to get from Frappe database first (for PWA)
            const frappeSubscription = await getPushSubscriptionFromFrappe(userId);
            
            let tokens = [];
            
            if (frappeSubscription) {
                // PWA push subscription
                tokens.push(frappeSubscription);
                console.log(`✅ [Notification Service] Using Frappe subscription for ${userId}`);
            } else {
                // Fallback to Redis (for mobile app tokens)
                const userTokens = await redisClient.getPushTokens(userId);
                if (userTokens && Object.keys(userTokens).length > 0) {
                    tokens = Object.values(userTokens);
                    console.log(`✅ [Notification Service] Using Redis tokens for ${userId}: ${tokens.length} token(s)`);
                }
            }
            
            if (tokens.length > 0) {
                const tickets = await sendPushNotifications(tokens, title, message, data);
                
                results.push({
                    userId,
                    tokens,
                    tickets,
                    success: true
                });
            } else {
                console.log(`⚠️ [Notification Service] No push tokens found for ${userId}`);
                results.push({
                    userId,
                    tokens: [],
                    tickets: [],
                    success: false,
                    error: 'No push tokens found'
                });
            }
        } catch (error) {
            console.error(`❌ [Notification Service] Error sending push to user ${userId}:`, error);
            results.push({
                userId,
                tokens: [],
                tickets: [],
                success: false,
                error: error.message
            });
        }
    }
    
    return results;
}

/**
 * Cập nhật delivery status dựa trên push results
 */
async function updateDeliveryStatus(notificationId, pushResults) {
    for (const result of pushResults) {
        try {
            const readRecord = await NotificationRead.findOne({
                notificationId,
                userId: result.userId
            });
            
            if (readRecord) {
                if (result.success && result.tickets.length > 0) {
                    await readRecord.markAsDelivered();
                } else {
                    await readRecord.markAsFailed(result.error);
                }
            }
        } catch (error) {
            console.error(`Error updating delivery status for ${result.userId}:`, error);
        }
    }
}

/**
 * Broadcast notification qua Socket.IO đến specific users
 */
async function broadcastNotificationToUsers(userIds, notification) {
    try {
        // Sẽ được implement trong app.js với Socket.IO
        console.log('📡 [Notification Service] Broadcasting notification to users:', userIds.length);
        
        // TODO: Implement Socket.IO broadcast
        // io.to(userRoom).emit('new_notification', notification);
    } catch (error) {
        console.error('Error broadcasting notification:', error);
    }
}

/**
 * Gửi thông báo khi ticket mới được tạo
 */
exports.sendNewTicketNotification = async (ticket) => {
    try {
        // Tìm tất cả các admin và technical để gửi thông báo
        const admins = await database.getAll('User', { role: ['admin', 'superadmin', 'technical'] });

        if (!admins || admins.length === 0) {
            console.log('Không tìm thấy admin nào để gửi thông báo');
            return;
        }

        // Lấy danh sách ID người nhận
        const recipientIds = admins.map(admin => admin.name);

        // Tạo nội dung thông báo
        const title = 'Ticket mới';
        const body = `Ticket #${ticket.ticketCode} đã được tạo và đang chờ xử lý`;
        const data = {
            ticketId: ticket.name,
            ticketCode: ticket.ticketCode,
            type: 'new_ticket'
        };

        // Lưu thông báo vào cơ sở dữ liệu
        await saveNotificationToDatabase(recipientIds, title, body, data, "ticket");

        // Lấy danh sách token từ các admin
        const adminTokens = [];
        for (const admin of admins) {
            try {
                const tokens = await redisClient.getPushTokens(admin.name);
                if (tokens && Object.keys(tokens).length > 0) {
                    adminTokens.push(...Object.values(tokens));
                }
            } catch (error) {
                console.error(`Error getting tokens for admin ${admin.name}:`, error);
            }
        }

        if (adminTokens.length === 0) {
            console.log('Không có admin nào đăng ký nhận thông báo');
            return;
        }

        // Gửi thông báo đẩy
        await sendPushNotifications(adminTokens, title, body, data);
        console.log(`Đã gửi thông báo ticket mới #${ticket.ticketCode} đến ${adminTokens.length} admin`);
    } catch (error) {
        console.error('Lỗi khi gửi thông báo ticket mới:', error);
    }
};

/**
 * Gửi thông báo khi có đánh giá mới từ khách hàng
 */
exports.sendFeedbackNotification = async (ticket) => {
    try {
        const recipientsList = [];

        // Thêm người tạo ticket vào danh sách (nếu là admin/staff)
        if (ticket.owner) {
            const creator = await database.get('User', ticket.owner);
            if (creator && (creator.role === 'admin' || creator.role === 'technical' || creator.role === 'superadmin')) {
                recipientsList.push(creator);
            }
        }

        // Thêm người được gán ticket
        if (ticket.assigned_to) {
            const assignedUser = await database.get('User', ticket.assigned_to);
            if (assignedUser &&
                !recipientsList.some(user => user.name === assignedUser.name)) {
                recipientsList.push(assignedUser);
            }
        }

        // Thêm tất cả admin và superadmin
        const admins = await database.getAll('User', { role: ['admin', 'superadmin'] });
        for (const admin of admins) {
            if (!recipientsList.some(user => user.name === admin.name)) {
                recipientsList.push(admin);
            }
        }

        if (recipientsList.length === 0) {
            console.log('Không có người nhận thông báo đánh giá cho ticket:', ticket.ticketCode);
            return;
        }

        // Lấy danh sách ID người nhận
        const recipientIds = recipientsList.map(user => user.name);

        // Tạo nội dung thông báo
        let title = `Ticket #${ticket.ticketCode} đã được đánh giá`;
        let body;
        
        if (ticket.feedback && ticket.feedback.rating) {
            body = `Khách hàng đã đánh giá ${ticket.feedback.rating}/5 sao`;
        } else {
            body = `Khách hàng đã từ chối xác nhận hoàn thành`;
        }

        const data = {
            ticketId: ticket.name,
            ticketCode: ticket.ticketCode,
            type: 'ticket_feedback',
        };

        // Lưu thông báo vào cơ sở dữ liệu
        await saveNotificationToDatabase(recipientIds, title, body, data, "ticket");

        // Lấy danh sách token từ những người dùng có đăng ký thiết bị
        const tokens = [];
        for (const user of recipientsList) {
            try {
                const userTokens = await redisClient.getPushTokens(user.name);
                if (userTokens && Object.keys(userTokens).length > 0) {
                    tokens.push(...Object.values(userTokens));
                }
            } catch (error) {
                console.error(`Error getting tokens for user ${user.name}:`, error);
            }
        }

        console.log('Tokens to send notification:', tokens);

        // Gửi thông báo
        if (tokens.length > 0) {
            await sendPushNotifications(tokens, title, body, data);
            console.log(`Đã gửi thông báo đánh giá cho ticket #${ticket.ticketCode} đến ${tokens.length} người`);
        }
    } catch (error) {
        console.error('Lỗi khi gửi thông báo đánh giá ticket:', error);
    }
};

/**
 * Gửi thông báo khi ticket được cập nhật
 * @param {Object} ticket - Ticket object
 * @param {String} action - Loại hành động (assigned, status_updated, comment_added, etc)
 * @param {String} excludeUserId - ID của người dùng sẽ không nhận thông báo (người gửi tin nhắn)
 */
exports.sendTicketUpdateNotification = async (ticket, action, excludeUserId = null) => {
    try {
        const recipientsList = [];

        // Luôn thêm người tạo ticket vào danh sách nhận thông báo (trừ khi là người bị loại trừ)
        if (ticket.owner && (!excludeUserId || ticket.owner !== excludeUserId)) {
            const creator = await database.get('User', ticket.owner);
            if (creator) {
                recipientsList.push(creator);
            }
        }

        // Nếu ticket được gán cho ai đó, thêm họ vào danh sách (trừ khi là người bị loại trừ)
        if (ticket.assigned_to && (!excludeUserId || ticket.assigned_to !== excludeUserId)) {
            const assignedUser = await database.get('User', ticket.assigned_to);
            if (assignedUser &&
                !recipientsList.some(user => user.name === assignedUser.name)) {
                recipientsList.push(assignedUser);
            }
        }

        // Nếu action là status_updated (cập nhật trạng thái), thêm tất cả superadmin vào danh sách nhận thông báo
        if (action === 'status_updated') {
            const superAdmins = await database.getAll('User', { role: "superadmin" });
            for (const admin of superAdmins) {
                // Kiểm tra xem admin đã có trong danh sách chưa và không phải là người bị loại trừ
                if (!recipientsList.some(user => user.name === admin.name) && 
                    (!excludeUserId || admin.name !== excludeUserId)) {
                    recipientsList.push(admin);
                }
            }
        }

        // Nếu trạng thái là Closed hoặc chuyển từ Done sang Processing (mở lại ticket),
        // thêm tất cả admin và người được gán vào danh sách
        if (ticket.status === 'Closed' || 
            (ticket.status === 'Processing' && action === 'status_updated')) {
            const admins = await database.getAll('User', { role: ['admin', 'technical'] });
            for (const admin of admins) {
                if (!recipientsList.some(user => user.name === admin.name) && 
                    (!excludeUserId || admin.name !== excludeUserId)) {
                    recipientsList.push(admin);
                }
            }
        }

        if (recipientsList.length === 0) {
            console.log('Không có người nhận thông báo cho ticket:', ticket.ticketCode);
            return;
        }

        // Lấy danh sách ID người nhận
        const recipientIds = recipientsList.map(user => user.name);

        // Tạo nội dung thông báo dựa trên hành động
        let title, body;

        switch (action) {
            case 'assigned':
                title = `Ticket #${ticket.ticketCode} đã được gán`;
                body = `Ticket đã được gán cho nhân viên hỗ trợ`;
                break;
            case 'status_updated':
                title = `Ticket #${ticket.ticketCode} đã cập nhật trạng thái`;
                // Nếu trạng thái từ Done sang Processing, đó là khách hàng mở lại ticket
                if (ticket.status === 'Processing') {
                    body = `Khách hàng đã yêu cầu xử lý lại ticket`;
                } else {
                    body = `Trạng thái mới: ${translateStatus(ticket.status)}`;
                }
                break;
            case 'comment_added':
                title = `Ticket #${ticket.ticketCode} có tin nhắn mới`;
                body = `Có tin nhắn mới trong ticket của bạn`;
                break;
            case 'feedback_added':
                title = `Ticket #${ticket.ticketCode} đã nhận đánh giá`;
                body = ticket.feedback && ticket.feedback.rating 
                    ? `Khách hàng đã đánh giá ${ticket.feedback.rating}/5 sao` 
                    : `Khách hàng đã gửi đánh giá`;
                break;
            default:
                title = `Ticket #${ticket.ticketCode} đã cập nhật`;
                body = `Ticket của bạn đã được cập nhật`;
        }

        const data = {
            ticketId: ticket.name,
            ticketCode: ticket.ticketCode,
            type: 'ticket_update',
            action: action
        };

        // Lưu thông báo vào cơ sở dữ liệu
        await saveNotificationToDatabase(recipientIds, title, body, data, "ticket");

        // Lấy danh sách token từ những người dùng có đăng ký thiết bị
        const tokens = [];
        for (const user of recipientsList) {
            // Kiểm tra xem user có phải là người gửi không
            const isSender = excludeUserId && user.name === excludeUserId;
            console.log('Checking user:', {
                userId: user.name,
                excludeUserId: excludeUserId,
                isSender,
                hasDeviceToken: true // Assume they have tokens
            });
            // Chỉ lấy token của người không phải là người gửi
            if (!isSender) {
                try {
                    const userTokens = await redisClient.getPushTokens(user.name);
                    if (userTokens && Object.keys(userTokens).length > 0) {
                        tokens.push(...Object.values(userTokens));
                    }
                } catch (error) {
                    console.error(`Error getting tokens for user ${user.name}:`, error);
                }
            }
        }

        console.log('Final tokens to send:', tokens);
        console.log('excludeUserId:', excludeUserId);
        console.log('recipientsList:', recipientsList.map(u => ({
            id: u.name,
            deviceToken: 'stored in redis'
        })));

        // Gửi thông báo
        if (tokens.length > 0) {
            await sendPushNotifications(tokens, title, body, data);
            console.log(`Đã gửi thông báo cập nhật cho ticket #${ticket.ticketCode} đến ${tokens.length} người`);
        }
    } catch (error) {
        console.error('Lỗi khi gửi thông báo cập nhật ticket:', error);
    }
};

/**
 * Đăng ký thiết bị để nhận thông báo - Enhanced for PWA support
 */
exports.registerDevice = async (req, res) => {
    try {
        const {
            deviceToken,
            deviceId,
            deviceName,
            platform = 'web',
            browser,
            os,
            osVersion,
            appVersion,
            language,
            timezone,
            userAgent,
            isPWA = false,
            subscription // For web push subscriptions
        } = req.body;

        const userId = req.user.name || req.user._id;

        // Validation based on platform
        if (platform === 'web') {
            // Web push: subscription object required
            if (!subscription) {
                return res.status(400).json({
                    success: false,
                    message: 'Web push subscription is required for web platform'
                });
            }
        } else {
            // Mobile: device token required
            if (!deviceToken) {
                return res.status(400).json({
                    success: false,
                    message: 'Device token is required'
                });
            }

            // Validate Expo token format
            if (platform === 'expo' && !Expo.isExpoPushToken(deviceToken)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid Expo push token format'
                });
            }
        }

        // Prepare device info
        const deviceInfo = {
            deviceId: deviceId,
            deviceName: deviceName,
            platform: platform,
            browser: browser,
            os: os,
            osVersion: osVersion,
            appVersion: appVersion,
            language: language || 'en',
            timezone: timezone || 'UTC',
            userAgent: userAgent,
            isPWA: isPWA,
            subscription: subscription // For web push
        };

        // Use subscription for web push, deviceToken for mobile
        const token = platform === 'web' ? JSON.stringify(subscription) : deviceToken;

        // Store token with device info
        const assignedDeviceId = await redisClient.storePushToken(userId, token, platform, deviceInfo);

        console.log(`✅ [registerDevice] Registered device ${assignedDeviceId} for user ${userId} (${platform})`);

        return res.status(200).json({
            success: true,
            message: 'Đăng ký thiết bị thành công',
            data: {
                deviceId: assignedDeviceId,
                platform: platform,
                deviceName: deviceInfo.deviceName
            }
        });
    } catch (error) {
        console.error('❌ [registerDevice] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi đăng ký thiết bị',
            error: error.message
        });
    }
};

/**
 * Hủy đăng ký thiết bị - Legacy method (removes all tokens)
 */
exports.unregisterDevice = async (req, res) => {
    try {
        const userId = req.user.name || req.user._id;

        // For backward compatibility, remove all tokens for user
        // This is less precise but maintains compatibility
        const devices = await redisClient.getUserDevices(userId);
        for (const device of devices) {
            await redisClient.removeDeviceToken(userId, device.deviceId);
        }

        return res.status(200).json({
            success: true,
            message: 'Hủy đăng ký thiết bị thành công'
        });
    } catch (error) {
        console.error('❌ [unregisterDevice] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi hủy đăng ký thiết bị',
            error: error.message
        });
    }
};

/**
 * Lấy danh sách thiết bị của user
 */
exports.getUserDevices = async (req, res) => {
    try {
        const userId = req.user.name || req.user._id;
        const devices = await redisClient.getUserDevices(userId);

        return res.status(200).json({
            success: true,
            data: devices,
            total: devices.length
        });
    } catch (error) {
        console.error('❌ [getUserDevices] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi lấy danh sách thiết bị',
            error: error.message
        });
    }
};

/**
 * Cập nhật thông tin thiết bị
 */
exports.updateDevice = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const updates = req.body;
        const userId = req.user.name || req.user._id;

        // Validate allowed updates
        const allowedUpdates = ['deviceName', 'appVersion', 'language', 'timezone'];
        const filteredUpdates = {};

        for (const [key, value] of Object.entries(updates)) {
            if (allowedUpdates.includes(key)) {
                filteredUpdates[key] = value;
            }
        }

        if (Object.keys(filteredUpdates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không có trường nào được phép cập nhật'
            });
        }

        // Update device info in Redis
        const key = `push_tokens:${userId}`;
        const deviceData = await redisClient.client.hGet(key, deviceId);

        if (!deviceData) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy thiết bị'
            });
        }

        const parsedData = JSON.parse(deviceData);
        Object.assign(parsedData, filteredUpdates);
        parsedData.lastActive = new Date().toISOString();

        await redisClient.client.hSet(key, deviceId, JSON.stringify(parsedData));

        console.log(`✅ [updateDevice] Updated device ${deviceId} for user ${userId}`);

        return res.status(200).json({
            success: true,
            message: 'Cập nhật thiết bị thành công',
            data: {
                deviceId: deviceId,
                updates: filteredUpdates
            }
        });
    } catch (error) {
        console.error('❌ [updateDevice] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi cập nhật thiết bị',
            error: error.message
        });
    }
};

/**
 * Hủy đăng ký thiết bị cụ thể theo deviceId
 */
exports.unregisterDeviceById = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const userId = req.user.name || req.user._id;

        const success = await redisClient.removeDeviceToken(userId, deviceId);

        if (!success) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy thiết bị để xóa'
            });
        }

        console.log(`✅ [unregisterDeviceById] Removed device ${deviceId} for user ${userId}`);

        return res.status(200).json({
            success: true,
            message: 'Hủy đăng ký thiết bị thành công',
            data: { deviceId }
        });
    } catch (error) {
        console.error('❌ [unregisterDeviceById] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi hủy đăng ký thiết bị',
            error: error.message
        });
    }
};

/**
 * Test device registration (for development)
 */
exports.testDeviceRegistration = async (req, res) => {
    try {
        const testData = {
            platform: 'web',
            deviceName: 'Test Browser',
            browser: 'Chrome',
            os: 'macOS',
            osVersion: '14.0',
            appVersion: '1.0.0',
            language: 'en',
            timezone: 'UTC',
            isPWA: true,
            subscription: {
                endpoint: 'https://test-endpoint.com',
                keys: {
                    p256dh: 'test-p256dh-key',
                    auth: 'test-auth-key'
                }
            }
        };

        const userId = req.user?.name || req.user?._id || 'test-user';
        const deviceId = await redisClient.storePushToken(userId, JSON.stringify(testData.subscription), 'web', testData);

        return res.status(200).json({
            success: true,
            message: 'Test device registration successful',
            data: {
                userId,
                deviceId,
                deviceInfo: testData
            }
        });
    } catch (error) {
        console.error('❌ [testDeviceRegistration] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Test device registration failed',
            error: error.message
        });
    }
};

/**
 * Lấy danh sách thông báo của người dùng - Cached & Optimized
 */
exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.name || req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        // Try cache first
        const cached = await cacheService.getUserNotifications(userId, page, limit);
        if (cached) {
            console.log(`✅ [getNotifications] Cache hit for user ${userId}, page ${page}`);
            return res.status(200).json(JSON.parse(cached));
        }

        // Cache miss - query database
        console.log(`📡 [getNotifications] Cache miss for user ${userId}, page ${page}`);
        const result = await Notification.getUserNotifications(userId, page, limit);

        // Also get unread count
        const unreadCount = await Notification.getUnreadCount(userId);

        const response = {
            success: true,
            notifications: result.notifications,
            pagination: {
                ...result.pagination,
                unreadCount
            }
        };

        // Cache the result
        await cacheService.setUserNotifications(userId, page, limit, response);

        return res.status(200).json(response);
    } catch (error) {
        console.error('❌ [getNotifications] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi lấy danh sách thông báo',
            error: error.message
        });
    }
};

/**
 * Đánh dấu thông báo đã đọc - Cache-aware
 */
exports.markAsRead = async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.user.name || req.user._id;

        // Find and update the notification read record
        const readRecord = await NotificationRead.findOne({
            notificationId: notificationId,
            userId: userId
        });

        if (!readRecord) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy thông báo'
            });
        }

        // Mark as read
        await readRecord.markAsRead();

        // Invalidate user cache
        console.log(`🗑️ [markAsRead] Invalidating cache for user: ${userId}`);
        try {
            await cacheService.invalidateUserCache(userId);
            console.log(`✅ [markAsRead] Cache invalidated successfully for user: ${userId}`);
        } catch (cacheError) {
            console.warn(`⚠️ [markAsRead] Cache invalidation failed:`, cacheError.message);
        }

        console.log(`✅ [markAsRead] Marked notification ${notificationId} as read for user ${userId}`);

        return res.status(200).json({
            success: true,
            message: 'Đã đánh dấu thông báo là đã đọc'
        });
    } catch (error) {
        console.error('❌ [markAsRead] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi đánh dấu thông báo',
            error: error.message
        });
    }
};

/**
 * Đánh dấu tất cả thông báo đã đọc - Cache-aware
 */
exports.markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.name || req.user._id;

        // Use optimized method
        const count = await NotificationRead.markAllAsReadForUser(userId);

        // Invalidate user cache
        await cacheService.invalidateUserCache(userId);

        console.log(`✅ [markAllAsRead] Marked ${count} notifications as read for user ${userId}`);

        return res.status(200).json({
            success: true,
            message: 'Đã đánh dấu tất cả thông báo là đã đọc',
            count: count
        });
    } catch (error) {
        console.error('❌ [markAllAsRead] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi đánh dấu tất cả thông báo',
            error: error.message
        });
    }
};

/**
 * Xóa thông báo
 */
exports.deleteNotification = async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.user.name || req.user._id;

        const notification = await database.get('Notification Log', notificationId);
        if (!notification || notification.for_user !== userId) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy thông báo'
            });
        }

        await database.delete('Notification Log', notificationId);

        // Invalidate cache
        await redisClient.invalidateUserNotificationsCache(userId);

        return res.status(200).json({
            success: true,
            message: 'Đã xóa thông báo'
        });
    } catch (error) {
        console.error('Lỗi khi xóa thông báo:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi xóa thông báo'
        });
    }
};

/**
 * Xóa tất cả thông báo
 */
exports.deleteAllNotifications = async (req, res) => {
    try {
        const userId = req.user.name || req.user._id;

        await database.query(
            'DELETE FROM `tabNotification Log` WHERE `for_user` = ?',
            [userId]
        );

        // Invalidate cache
        await redisClient.invalidateUserNotificationsCache(userId);

        return res.status(200).json({
            success: true,
            message: 'Đã xóa tất cả thông báo'
        });
    } catch (error) {
        console.error('Lỗi khi xóa tất cả thông báo:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi xóa tất cả thông báo'
        });
    }
};

/**
 * Gửi thông báo khi có tin nhắn chat mới
 */
exports.sendNewChatMessageNotification = async (message, senderName, chat) => {
    try {
        // Lấy thông tin người gửi và người nhận
        const senderId = message.sender.toString();

        // Lọc ra các người dùng trong cuộc trò chuyện trừ người gửi
        const recipientIds = chat.participants
            .filter(participantId => participantId.toString() !== senderId)
            .map(participantId => participantId.toString());

        if (recipientIds.length === 0) {
            console.log('Không có người nhận thông báo cho tin nhắn');
            return;
        }

        // Tìm thông tin chi tiết của người nhận
        const recipients = await database.getAll('User', { _id: { $in: recipientIds } });

        if (recipients.length === 0) {
            console.log('Không tìm thấy thông tin người nhận');
            return;
        }

        // Tạo nội dung thông báo dựa trên loại chat
        let title, body;
        
        if (chat.isGroup) {
            // Cho group chat: title = "Nhóm: <Tên nhóm>", body = "Tên người chat: <nội dung>"
            title = `Nhóm: ${chat.name || 'Nhóm không tên'}`;
            
            // Tùy chỉnh nội dung tùy theo loại tin nhắn
            if (message.type === 'text') {
                const messageContent = message.content.length > 30
                    ? `${message.content.substring(0, 30)}...`
                    : message.content;
                body = `${senderName}: ${messageContent}`;
            } else if (message.type === 'image') {
                body = `${senderName}: Đã gửi một hình ảnh`;
            } else if (message.type === 'multiple-images') {
                body = `${senderName}: Đã gửi ${message.fileUrls.length} hình ảnh`;
            } else if (message.type === 'file') {
                body = `${senderName}: Đã gửi một tệp đính kèm`;
            } else {
                body = `${senderName}: Đã gửi một tin nhắn`;
            }
        } else {
            // Cho chat 1-1: giữ nguyên format cũ
            title = `${senderName}`;
            
            // Tùy chỉnh nội dung tùy theo loại tin nhắn
            if (message.type === 'text') {
                body = message.content.length > 30
                    ? `${message.content.substring(0, 30)}...`
                    : message.content;
            } else if (message.type === 'image') {
                body = 'Đã gửi một hình ảnh';
            } else if (message.type === 'multiple-images') {
                body = `Đã gửi ${message.fileUrls.length} hình ảnh`;
            } else if (message.type === 'file') {
                body = 'Đã gửi một tệp đính kèm';
            } else {
                body = 'Đã gửi một tin nhắn';
            }
        }

        const data = {
            chatId: chat._id.toString(),
            messageId: message._id.toString(),
            senderId: senderId,
            type: 'new_chat_message'
        };

        // Lưu thông báo vào cơ sở dữ liệu
        await saveNotificationToDatabase(recipientIds, title, body, data, "chat");

        // Lấy danh sách token thiết bị từ người nhận
        const recipientTokens = [];
        for (const user of recipients) {
            try {
                const userTokens = await redisClient.getPushTokens(user._id);
                if (userTokens && Object.keys(userTokens).length > 0) {
                    recipientTokens.push(...Object.values(userTokens));
                }
            } catch (error) {
                console.error(`Error getting tokens for user ${user._id}:`, error);
            }
        }

        if (recipientTokens.length === 0) {
            console.log('Không có người nhận nào đăng ký thiết bị nhận thông báo');
            return;
        }

        // Gửi thông báo đẩy
        await sendPushNotifications(recipientTokens, title, body, data);
        console.log(`Đã gửi thông báo tin nhắn mới đến ${recipientTokens.length} người nhận`);
    } catch (error) {
        console.error('Lỗi khi gửi thông báo tin nhắn chat mới:', error);
    }
};

/**
 * Gửi thông báo khi có người tag trong bài viết
 */
exports.sendTaggedInPostNotification = async (post, authorName, taggedUserIds) => {
    try {
        if (!taggedUserIds || taggedUserIds.length === 0) {
            return;
        }

        // Tìm thông tin người được tag
        const taggedUsers = await database.getAll('User', { _id: { $in: taggedUserIds } });

        if (taggedUsers.length === 0) {
            console.log('Không tìm thấy người dùng được tag');
            return;
        }

        // Tạo nội dung thông báo
        const title = `${authorName} đã tag bạn trong một bài viết`;
        const body = post.content.length > 50
            ? `${post.content.substring(0, 50)}...`
            : post.content;

        const data = {
            postId: post._id.toString(),
            authorId: post.author._id.toString(),
            type: 'tagged_in_post'
        };

        // Lưu thông báo vào cơ sở dữ liệu
        await saveNotificationToDatabase(taggedUserIds, title, body, data, "post");

        // Lấy danh sách token thiết bị
        const userTokens = [];
        for (const user of taggedUsers) {
            try {
                const userTokens = await redisClient.getPushTokens(user._id);
                if (userTokens && Object.keys(userTokens).length > 0) {
                    userTokens.push(...Object.values(userTokens));
                }
            } catch (error) {
                console.error(`Error getting tokens for user ${user._id}:`, error);
            }
        }

        if (userTokens.length === 0) {
            console.log('Không có người được tag nào đăng ký thiết bị nhận thông báo');
            return;
        }

        // Gửi thông báo đẩy
        await sendPushNotifications(userTokens, title, body, data);
        console.log(`Đã gửi thông báo tag trong bài viết đến ${userTokens.length} người dùng`);
    } catch (error) {
        console.error('Lỗi khi gửi thông báo tag trong bài viết:', error);
    }
};

/**
 * Gửi thông báo khi có người reaction bài viết
 */
exports.sendPostReactionNotification = async (post, reactorName, reactionType) => {
    try {
        // Tìm thông tin tác giả bài viết
        const postAuthor = await database.get('User', post.author._id || post.author);

        if (!postAuthor) {
            console.log('Không tìm thấy tác giả bài viết');
            return;
        }

        // Kiểm tra thiết bị token
        if (!postAuthor.deviceToken) {
            console.log('Tác giả bài viết không đăng ký thiết bị nhận thông báo');
            return;
        }

        // Tạo nội dung thông báo
        const title = `${reactorName} đã ${reactionType} bài viết của bạn`;
        const body = post.content.length > 50
            ? `${post.content.substring(0, 50)}...`
            : post.content;

        const data = {
            postId: post._id.toString(),
            reactorName: reactorName,
            reactionType: reactionType,
            type: 'post_reaction'
        };

        // Lưu thông báo vào cơ sở dữ liệu
        await saveNotificationToDatabase([postAuthor._id], title, body, data, "post");

        // Gửi thông báo đẩy
        await sendPushNotifications([postAuthor.deviceToken], title, body, data);
        console.log(`Đã gửi thông báo reaction bài viết đến ${postAuthor.fullname}`);
    } catch (error) {
        console.error('Lỗi khi gửi thông báo reaction bài viết:', error);
    }
};

/**
 * Gửi thông báo khi có người comment bài viết
 */
exports.sendPostCommentNotification = async (post, commenterName, commentContent) => {
    try {
        // Tìm thông tin tác giả bài viết
        const postAuthor = await database.get('User', post.author._id || post.author);

        if (!postAuthor) {
            console.log('Không tìm thấy tác giả bài viết');
            return;
        }

        // Kiểm tra thiết bị token
        if (!postAuthor.deviceToken) {
            console.log('Tác giả bài viết không đăng ký thiết bị nhận thông báo');
            return;
        }

        // Tạo nội dung thông báo
        const title = `${commenterName} đã bình luận bài viết của bạn`;
        const body = commentContent.length > 50
            ? `${commentContent.substring(0, 50)}...`
            : commentContent;

        const data = {
            postId: post._id.toString(),
            commenterName: commenterName,
            commentContent: commentContent,
            type: 'post_comment'
        };

        // Lưu thông báo vào cơ sở dữ liệu
        await saveNotificationToDatabase([postAuthor._id], title, body, data, "post");

        // Gửi thông báo đẩy
        await sendPushNotifications([postAuthor.deviceToken], title, body, data);
        console.log(`Đã gửi thông báo comment bài viết đến ${postAuthor.fullname}`);
    } catch (error) {
        console.error('Lỗi khi gửi thông báo comment bài viết:', error);
    }
};

/**
 * Gửi thông báo khi có người reaction comment
 */
exports.sendCommentReactionNotification = async (post, commentId, reactorName, reactionType) => {
    try {
        // Tìm comment được reaction
        const comment = post.comments.find(c => c._id.toString() === commentId.toString());
        if (!comment) {
            console.log('Không tìm thấy comment');
            return;
        }

        // Tìm thông tin tác giả comment
        const commentAuthor = await database.get('User', comment.user._id || comment.user);

        if (!commentAuthor) {
            console.log('Không tìm thấy tác giả comment');
            return;
        }

        // Kiểm tra thiết bị token
        if (!commentAuthor.deviceToken) {
            console.log('Tác giả comment không đăng ký thiết bị nhận thông báo');
            return;
        }

        // Tạo nội dung thông báo
        const title = `${reactorName} đã ${reactionType} bình luận của bạn`;
        const body = comment.content.length > 50
            ? `${comment.content.substring(0, 50)}...`
            : comment.content;

        const data = {
            postId: post._id.toString(),
            commentId: commentId.toString(),
            reactorName: reactorName,
            reactionType: reactionType,
            type: 'comment_reaction'
        };

        // Lưu thông báo vào cơ sở dữ liệu
        await saveNotificationToDatabase([commentAuthor._id], title, body, data, "post");

        // Gửi thông báo đẩy
        await sendPushNotifications([commentAuthor.deviceToken], title, body, data);
        console.log(`Đã gửi thông báo reaction comment đến ${commentAuthor.fullname}`);
    } catch (error) {
        console.error('Lỗi khi gửi thông báo reaction comment:', error);
    }
};

/**
 * Gửi thông báo khi có người reply comment
 */
exports.sendCommentReplyNotification = async (post, parentCommentId, replierName, replyContent) => {
    try {
        // Tìm parent comment
        const parentComment = post.comments.find(c => c._id.toString() === parentCommentId.toString());
        if (!parentComment) {
            console.log('Không tìm thấy parent comment');
            return;
        }

        // Tìm thông tin tác giả parent comment
        const parentCommentAuthor = await database.get('User', parentComment.user._id || parentComment.user);

        if (!parentCommentAuthor) {
            console.log('Không tìm thấy tác giả parent comment');
            return;
        }

        // Kiểm tra thiết bị token
        if (!parentCommentAuthor.deviceToken) {
            console.log('Tác giả parent comment không đăng ký thiết bị nhận thông báo');
            return;
        }

        // Tạo nội dung thông báo
        const title = `${replierName} đã trả lời bình luận của bạn`;
        const body = replyContent.length > 50
            ? `${replyContent.substring(0, 50)}...`
            : replyContent;

        const data = {
            postId: post._id.toString(),
            parentCommentId: parentCommentId.toString(),
            replierName: replierName,
            replyContent: replyContent,
            type: 'comment_reply'
        };

        // Lưu thông báo vào cơ sở dữ liệu
        await saveNotificationToDatabase([parentCommentAuthor._id], title, body, data, "post");

        // Gửi thông báo đẩy
        await sendPushNotifications([parentCommentAuthor.deviceToken], title, body, data);
        console.log(`Đã gửi thông báo reply comment đến ${parentCommentAuthor.fullname}`);
    } catch (error) {
        console.error('Lỗi khi gửi thông báo reply comment:', error);
    }
};

/**
 * ATTENDANCE NOTIFICATION FUNCTION
 * Đơn giản: chỉ thông báo chấm công cơ bản
 */

/**
 * Dynamic lookup employeeCode to userId from Frappe database
 */
async function lookupUserIdByEmployeeCode(employeeCode) {
    try {
        console.log(`🔍 [Notification Service] Looking up userId for employeeCode: ${employeeCode}`);
        
        // Query User doctype - employee data is stored in Frappe Users
        // Check employee_code (custom field) or name field
        const userQuery = `SELECT name, email FROM \`tabUser\` WHERE employee_code = ? OR name = ? LIMIT 1`;
        const userResult = await database.sqlQuery(userQuery, [employeeCode, employeeCode]);
        
        if (userResult && userResult.length > 0) {
            const user = userResult[0];
            const userId = user.email || user.name;
            console.log(`✅ [Notification Service] Found User mapping: ${employeeCode} → ${userId}`);
            return userId;
        }
        
        // Fallback: Check if employeeCode is already an email
        if (employeeCode && employeeCode.includes('@')) {
            console.log(`✅ [Notification Service] EmployeeCode is already email: ${employeeCode}`);
            return employeeCode;
        }
        
        console.log(`⚠️ [Notification Service] No mapping found for ${employeeCode}, using as-is`);
        return employeeCode;
        
    } catch (error) {
        console.error(`❌ [Notification Service] Error looking up userId:`, error);
        // Fallback to employeeCode
        return employeeCode;
    }
}

/**
 * Helper function để xác định time window của staff attendance
 * Returns: { window: 'check-in' | 'lunch' | 'check-out', hour: number }
 */
function getAttendanceTimeWindow(timestamp) {
    const eventTime = new Date(timestamp);
    const hour = eventTime.getHours();
    const minute = eventTime.getMinutes();
    
    // Lunch break: 12:00 - 13:00
    if (hour === 12 || (hour === 13 && minute === 0)) {
        return { window: 'lunch', hour };
    }
    
    // Check-in window: 00:00 - 12:00
    if (hour >= 0 && hour < 12) {
        return { window: 'check-in', hour };
    }
    
    // Check-out window: 13:00 - 23:59
    return { window: 'check-out', hour };
}

/**
 * Check if this is first attendance of the day for employee
 * Uses Redis to track daily attendance records
 */
async function isFirstAttendanceOfDay(employeeCode, timestamp) {
    try {
        const eventDate = new Date(timestamp);
        const dateKey = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const dailyAttendanceKey = `staff_attendance:${employeeCode}:${dateKey}`;
        
        const exists = await redisClient.client.exists(dailyAttendanceKey);
        
        if (!exists) {
            // Set marker for today (expire at midnight)
            const tomorrow = new Date(eventDate);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            const ttl = Math.floor((tomorrow - eventDate) / 1000); // Seconds until midnight
            
            await redisClient.client.set(dailyAttendanceKey, '1', 'EX', ttl);
            return true;
        }
        
        return false;
    } catch (error) {
        console.warn('⚠️ [Staff Attendance] Redis check failed:', error.message);
        return true; // Default to first attendance if Redis fails
    }
}

/**
 * Gửi thông báo chấm công cho nhân viên
 * Logic: 
 * - First check-in of day → "Check-in at HH:mm at [location]"
 * - Subsequent entries → "FaceID recorded at HH:mm at [location]"
 * - Lunch break (12:00-13:00) → Skip notification
 */
exports.sendAttendanceNotification = async (attendanceData) => {
    try {
        const { employeeCode, employeeName, timestamp, deviceName } = attendanceData;
        
        console.log(`👔 [Staff Attendance] Processing for: ${employeeCode} (${employeeName})`);
        
        // Step 1: Check time window
        const timeWindow = getAttendanceTimeWindow(timestamp);
        console.log(`⏰ [Staff Attendance] Time window: ${timeWindow.window} (hour: ${timeWindow.hour})`);
        
        // Step 2: Skip lunch break notifications
        if (timeWindow.window === 'lunch') {
            console.log(`🍱 [Staff Attendance] Skipping lunch break notification for ${employeeCode}`);
            return;
        }
        
        // Step 3: Check if first attendance of day
        const isFirstOfDay = await isFirstAttendanceOfDay(employeeCode, timestamp);
        
        // Step 4: Convert employeeCode to userId using database lookup
        const userId = await lookupUserIdByEmployeeCode(employeeCode);
        
        // Debug: Check if user has push tokens
        try {
            const pushTokens = await redisClient.getPushTokens(userId);
            const tokenCount = pushTokens ? Object.keys(pushTokens).length : 0;
            console.log(`🔔 [Staff Attendance] Push tokens for userId ${userId}: ${tokenCount} tokens found`);
            
            if (tokenCount === 0) {
                console.log(`❌ [Staff Attendance] No push tokens found for userId ${userId}`);
            }
        } catch (redisError) {
            console.warn(`⚠️ [Staff Attendance] Redis error checking push tokens:`, redisError.message);
        }
        
        // Step 5: Format time with date
        const eventTime = new Date(timestamp);
        const time = eventTime.toLocaleString('vi-VN', { 
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit'
        });
        
        // Step 6: Create appropriate message based on context
        let message;
        if (isFirstOfDay) {
            message = `Check-in lúc ${time} tại ${deviceName || 'Unknown Device'}`;
        } else {
            message = `FaceID ghi nhận lúc ${time} tại ${deviceName || 'Unknown Device'}`;
        }
        
        const notificationData = {
            title: 'Chấm công',
            message,
            recipients: [userId],
            notification_type: 'attendance',
            priority: 'medium',
            channel: 'push',
            data: { 
                employeeCode, 
                employeeName, 
                timestamp, 
                deviceName,
                timeWindow: timeWindow.window,
                isFirstOfDay,
                type: 'staff_attendance'
            }
        };

        await this.sendNotification(notificationData);
        console.log(`✅ [Staff Attendance] Sent ${isFirstOfDay ? 'check-in' : 'subsequent'} notification to ${employeeCode} (userId: ${userId})`);
    } catch (error) {
        console.error('❌ [Staff Attendance] Error sending notification:', error);
    }
};

/**
 * Location translation mapping
 */
const LOCATION_TRANSLATIONS = {
    // English → Vietnamese & English
    'Gate 2': { vi: 'Cổng 2', en: 'Gate 2' },
    'Gate 5': { vi: 'Cổng 5', en: 'Gate 5' },
    'Main Gate': { vi: 'Cổng chính', en: 'Main Gate' },
    'School Entrance': { vi: 'Lối vào trường', en: 'School Entrance' },
    'Front Gate': { vi: 'Cổng trước', en: 'Front Gate' },
    'Back Gate': { vi: 'Cổng sau', en: 'Back Gate' },
    // Vietnamese → Vietnamese & English
    'Cổng 2': { vi: 'Cổng 2', en: 'Gate 2' },
    'Cổng 5': { vi: 'Cổng 5', en: 'Gate 5' },
    'Cổng chính': { vi: 'Cổng chính', en: 'Main Gate' },
    'Lối vào trường': { vi: 'Lối vào trường', en: 'School Entrance' },
    'Cổng trước': { vi: 'Cổng trước', en: 'Front Gate' },
    'Cổng sau': { vi: 'Cổng sau', en: 'Back Gate' }
};

/**
 * Get localized location name
 */
function getLocalizedLocation(location) {
    // Try exact match first
    if (LOCATION_TRANSLATIONS[location]) {
        return LOCATION_TRANSLATIONS[location];
    }
    
    // Try case-insensitive match
    const locationLower = location.toLowerCase();
    for (const key in LOCATION_TRANSLATIONS) {
        if (key.toLowerCase() === locationLower) {
            return LOCATION_TRANSLATIONS[key];
        }
    }
    
    // No translation found, return default
    return {
        vi: location,
        en: location
    };
}

/**
 * Parse location từ device name
 * Examples:
 * "Gate 2 - Check In" → { location: "Gate 2", action: "Check In" }
 * "Gate 5 - Check Out" → { location: "Gate 5", action: "Check Out" }
 * "Cổng 2 - Vào" → { location: "Cổng 2", action: "Vào" }
 */
function parseDeviceLocation(deviceName) {
    if (!deviceName) return { location: 'cổng trường', action: null };

    const parts = deviceName.split(' - ');
    if (parts.length >= 2) {
        const location = parts[0].trim();
        const action = parts[1].trim();
        return { location, action };
    }

    return { location: deviceName, action: null };
}

/**
 * Gửi thông báo chấm công học sinh đến phụ huynh
 * Khi học sinh check in/out tại cổng trường, gửi notification đến guardians
 * Trả về structured data để frontend xử lý song ngữ
 */
exports.sendStudentAttendanceNotification = async (attendanceData) => {
    try {
        const { employeeCode, employeeName, timestamp, deviceName, checkInTime, checkOutTime } = attendanceData;

        console.log(`👨‍🎓 [Notification Service] Processing student attendance for: ${employeeCode} (${employeeName})`);

        // Step 0: Rate limiting - check duplicate notifications trong 5 phút
        const rateLimitKey = `attendance_notif:${employeeCode}`;
        const rateLimitWindow = 300000; // 5 phút = 300000ms
        
        try {
            const lastNotificationTime = await redisClient.client.get(rateLimitKey);
            if (lastNotificationTime) {
                const timeSinceLastNotif = Date.now() - parseInt(lastNotificationTime);
                if (timeSinceLastNotif < rateLimitWindow) {
                    console.log(`⏱️ [Notification Service] Rate limited: Last notification sent ${Math.floor(timeSinceLastNotif/1000)}s ago for ${employeeCode}`);
                    return; // Skip duplicate notification
                }
            }
            // Set rate limit marker
            await redisClient.client.set(rateLimitKey, Date.now().toString(), 'EX', 300); // Expire after 5 minutes
        } catch (redisError) {
            console.warn('⚠️ [Notification Service] Redis rate limit check failed, continuing:', redisError.message);
            // Tiếp tục xử lý nếu Redis fail
        }

        // Step 1: Check if employeeCode is a student
        const studentQuery = `SELECT name, student_name, student_code FROM \`tabCRM Student\` WHERE student_code = ? LIMIT 1`;
        const studentResult = await database.sqlQuery(studentQuery, [employeeCode]);

        if (!studentResult || studentResult.length === 0) {
            console.log(`⚠️ [Notification Service] No student found with code: ${employeeCode}`);
            return;
        }

        const student = studentResult[0];
        console.log(`✅ [Notification Service] Found student: ${student.student_name} (${student.student_code})`);

        // Step 2: Get guardians for this student (bỏ điều kiện access = 1 để lấy tất cả guardians)
        const guardianQuery = `
            SELECT DISTINCT g.guardian_id, g.guardian_name, g.email, fr.access
            FROM \`tabCRM Family Relationship\` fr
            INNER JOIN \`tabCRM Guardian\` g ON g.name = fr.guardian
            WHERE fr.student = ?
        `;
        const guardians = await database.sqlQuery(guardianQuery, [student.name]);

        if (!guardians || guardians.length === 0) {
            console.log(`⚠️ [Notification Service] No guardians found for student ${student.student_code}`);
            return;
        }

        console.log(`👪 [Notification Service] Found ${guardians.length} guardian(s), access status:`,
            guardians.map(g => ({ name: g.guardian_name, access: g.access })));

        console.log(`👪 [Notification Service] Found ${guardians.length} guardian(s) for student ${student.student_name}`);

        // Step 3: Parse location từ device name
        const { location, action } = parseDeviceLocation(deviceName);
        console.log(`📍 [Notification Service] Parsed location: "${location}" from device: "${deviceName}"`);

        // Step 3.5: Get localized location names
        const localizedLocation = getLocalizedLocation(location);
        console.log(`🌍 [Notification Service] Localized location:`, localizedLocation);

        // Step 4: Format time - bao gồm cả ngày để rõ ràng hơn khi xem lại notifications cũ
        const eventTime = new Date(timestamp);
        const time = eventTime.toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Step 5: Create guardian user emails (format: guardian_id@parent.wellspring.edu.vn)
        const recipients = guardians.map(g => `${g.guardian_id}@parent.wellspring.edu.vn`);

        console.log(`📤 [Notification Service] Sending student attendance notification to ${recipients.length} guardian(s):`, recipients);

        // Step 6: Structured data cho frontend xử lý song ngữ
        // Format message cho cả tiếng Việt và tiếng Anh với localized location
        const messageVi = `${student.student_name} đã qua ${localizedLocation.vi} vào ${time}`;
        const messageEn = `${student.student_name} passed ${localizedLocation.en} at ${time}`;
        
        const notificationData = {
            // Gửi cả bản dịch để service worker có thể hiển thị ngay
            title: {
                vi: 'Điểm danh',
                en: 'Attendance'
            },
            message: {
                vi: messageVi,
                en: messageEn
            },
            // Giữ lại keys để frontend app có thể dùng
            titleKey: 'attendance_notification_title',
            messageKey: 'attendance_notification_gate_pass',
            recipients,
            notification_type: 'attendance',
            priority: 'high',
            channel: 'push',
            data: {
                student_id: student.name, // Frappe docname for filtering
                studentCode: student.student_code,
                studentName: student.student_name,
                time: time,
                location: localizedLocation, // Object với {vi, en}
                action: action, // Check In/Out hoặc Vào/Ra
                timestamp: timestamp,
                deviceName: deviceName, // giữ nguyên để debug
                checkInTime,
                checkOutTime,
                notificationType: 'student_attendance'
            }
        };

        await this.sendNotification(notificationData);
        console.log(`✅ [Notification Service] Sent student attendance notification to ${recipients.length} guardian(s)`);
        console.log(`📋 [Notification Service] Notification data:`, JSON.stringify(notificationData, null, 2));

    } catch (error) {
        console.error('❌ [Notification Service] Error sending student attendance notification:', error);
    }
};

/**
 * Test endpoint để simulate attendance event
 */
exports.testAttendanceNotification = async (req, res) => {
  try {
    const { employeeCode, employeeName, timestamp, deviceName } = req.body;

    if (!employeeCode) {
      return res.status(400).json({ error: 'employeeCode is required' });
    }

    console.log('🧪 Testing attendance notification for:', employeeCode);

    await this.sendAttendanceNotification({
      employeeCode,
      employeeName: employeeName || 'Test Employee',
      timestamp: timestamp || new Date().toISOString(),
      deviceName: deviceName || 'Test Device'
    });

    res.json({
      success: true,
      message: 'Attendance notification sent successfully',
      data: { employeeCode, employeeName, timestamp, deviceName }
    });
  } catch (error) {
    console.error('Error testing attendance notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
};

/**
 * =============================
 * NOTIFICATION MANAGEMENT APIs
 * =============================
 */

/**
 * Lấy danh sách notifications của user (có pagination)
 */
exports.getUserNotifications = async (req, res) => {
    try {
        const userId = req.params.userId || req.user?.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const type = req.query.type; // filter theo loại

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const result = await Notification.getUserNotifications(userId, page, limit);

        res.json({
            success: true,
            data: result.notifications,
            pagination: result.pagination,
            unreadCount: await Notification.getUnreadCount(userId)
        });
    } catch (error) {
        console.error('Error getting user notifications:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Đánh dấu notification đã đọc
 */
exports.markNotificationAsRead = async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.body.userId || req.user?.id;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const readRecord = await NotificationRead.findOne({
            notificationId,
            userId
        });

        if (!readRecord) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        await readRecord.markAsRead();

        res.json({
            success: true,
            message: 'Notification marked as read'
        });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Đánh dấu tất cả notifications đã đọc cho user
 */
exports.markAllNotificationsAsRead = async (req, res) => {
    try {
        const userId = req.body.userId || req.user?.id;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const count = await NotificationRead.markAllAsReadForUser(userId);

        res.json({
            success: true,
            message: `Marked ${count} notifications as read`
        });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Lấy số lượng unread notifications
 */
exports.getUnreadCount = async (req, res) => {
    try {
        const userId = req.params.userId || req.user?.id;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const count = await Notification.getUnreadCount(userId);

        res.json({
            success: true,
            unreadCount: count
        });
    } catch (error) {
        console.error('Error getting unread count:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * =============================
 * ANALYTICS APIs
 * =============================
 */

/**
 * Lấy analytics tổng quan của user
 */
exports.getUserNotificationStats = async (req, res) => {
    try {
        const userId = req.params.userId || req.user?.id;
        const { startDate, endDate } = req.query;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const stats = await NotificationRead.getUserReadingStats(userId, startDate, endDate);

        res.json({
            success: true,
            data: {
                ...stats,
                readingRate: stats.total > 0 ? (stats.read / stats.total * 100).toFixed(2) : 0,
                deliveryRate: stats.total > 0 ? (stats.delivered / stats.total * 100).toFixed(2) : 0,
                avgReadTimeMinutes: stats.avgReadTime ? Math.round(stats.avgReadTime / 1000 / 60) : null
            }
        });
    } catch (error) {
        console.error('Error getting user notification stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Lấy analytics chi tiết của một notification
 */
exports.getNotificationAnalytics = async (req, res) => {
    try {
        const { notificationId } = req.params;

        const notification = await Notification.findById(notificationId);
        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        const deliveryStats = await NotificationRead.getDeliveryStats(notificationId);
        
        // Lấy chi tiết reads
        const readDetails = await NotificationRead.find({ notificationId })
            .select('userId read readAt deliveryStatus deliveredAt createdAt')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: {
                notification: {
                    id: notification._id,
                    title: notification.title,
                    type: notification.type,
                    totalRecipients: notification.totalRecipients,
                    sentCount: notification.sentCount,
                    deliveredCount: notification.deliveredCount,
                    readCount: notification.readCount,
                    createdAt: notification.createdAt
                },
                deliveryStats,
                readDetails: readDetails.map(r => ({
                    userId: r.userId,
                    read: r.read,
                    readAt: r.readAt,
                    deliveryStatus: r.deliveryStatus,
                    deliveredAt: r.deliveredAt,
                    sentAt: r.createdAt
                })),
                analytics: {
                    readingRate: notification.totalRecipients > 0 ? 
                        (notification.readCount / notification.totalRecipients * 100).toFixed(2) : 0,
                    deliveryRate: notification.totalRecipients > 0 ? 
                        (notification.deliveredCount / notification.totalRecipients * 100).toFixed(2) : 0
                }
            }
        });
    } catch (error) {
        console.error('Error getting notification analytics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Đánh dấu tất cả notifications đã đọc cho user (Frappe integration)
 * Khác với markAllNotificationsAsRead, function này lấy userId từ params
 */
exports.markAllNotificationsAsReadForUser = async (req, res) => {
    try {
        const userId = req.params.userId;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        console.log(`📖 [Notification Controller] Marking all as read for user: ${userId}`);

        const count = await NotificationRead.markAllAsReadForUser(userId);

        res.json({
            success: true,
            message: `Marked ${count} notifications as read`,
            count
        });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Xóa notification cho user (soft delete - đánh dấu deleted trong NotificationRead)
 */
exports.deleteNotificationForUser = async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.body.userId;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        console.log(`🗑️ [Notification Controller] Deleting notification ${notificationId} for user: ${userId}`);

        // Find or create NotificationRead record
        let readRecord = await NotificationRead.findOne({
            notificationId,
            userId
        });

        if (!readRecord) {
            // Create new record if not exists
            readRecord = new NotificationRead({
                notificationId,
                userId,
                read: false,
                deliveryStatus: 'delivered'
            });
        }

        // Mark as deleted
        readRecord.deleted = true;
        readRecord.deletedAt = new Date();
        await readRecord.save();

        res.json({
            success: true,
            message: 'Notification deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}; 