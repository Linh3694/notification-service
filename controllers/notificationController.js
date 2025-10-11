const database = require('../config/database');
const redisClient = require('../config/redis');
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
 * Gửi thông báo đến các thiết bị theo danh sách token
 * @param {Array} pushTokens - Danh sách token thiết bị
 * @param {String} title - Tiêu đề thông báo
 * @param {String} body - Nội dung thông báo
 * @param {Object} data - Dữ liệu bổ sung gửi kèm thông báo
 */
const sendPushNotifications = async (pushTokens, title, body, data = {}) => {
    try {
        // Tạo danh sách messages để gửi
        let messages = [];

        // Kiểm tra và lọc các token hợp lệ
        for (let pushToken of pushTokens) {
            if (!Expo.isExpoPushToken(pushToken)) {
                console.error(`Push token ${pushToken} không phải là token Expo hợp lệ`);
                continue;
            }

            // Thêm thông báo vào danh sách
            messages.push({
                to: pushToken,
                sound: 'default',
                title,
                body,
                data,
            });
        }

        // Chia thành chunks để tránh vượt quá giới hạn của Expo
        let chunks = expo.chunkPushNotifications(messages);
        let tickets = [];

        // Gửi từng chunk
        for (let chunk of chunks) {
            try {
                let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
            } catch (error) {
                console.error('Lỗi khi gửi thông báo:', error);
            }
        }

        return tickets;
    } catch (error) {
        console.error('Lỗi trong quá trình gửi thông báo:', error);
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

        // Tạo notification trong database
        const notification = new Notification({
            title,
            message,
            type: notification_type || 'system',
            priority: priority || 'medium',
            channel: channel || 'push',
            data: data || {},
            recipients: recipientList,
            totalRecipients: recipientList.length,
            createdBy: 'notification-service'
        });

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
 * Gửi push notifications đến danh sách users và trả về kết quả
 */
async function sendPushNotificationsToUsers(userIds, title, message, data = {}) {
    const results = [];
    
    for (const userId of userIds) {
        try {
            const userTokens = await redisClient.getPushTokens(userId);
            if (userTokens && Object.keys(userTokens).length > 0) {
                const tokens = Object.values(userTokens);
                const tickets = await sendPushNotifications(tokens, title, message, data);
                
                results.push({
                    userId,
                    tokens,
                    tickets,
                    success: true
                });
            } else {
                results.push({
                    userId,
                    tokens: [],
                    tickets: [],
                    success: false,
                    error: 'No push tokens found'
                });
            }
        } catch (error) {
            console.error(`Error sending push to user ${userId}:`, error);
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
 * Đăng ký thiết bị để nhận thông báo
 */
exports.registerDevice = async (req, res) => {
    try {
        const { deviceToken } = req.body;
        const userId = req.user.name || req.user._id;

        if (!deviceToken) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu token thiết bị'
            });
        }

        // Kiểm tra token có hợp lệ không
        if (!Expo.isExpoPushToken(deviceToken)) {
            return res.status(400).json({
                success: false,
                message: 'Token không hợp lệ'
            });
        }

        // Lưu token vào Redis
        await redisClient.storePushToken(userId, deviceToken);

        return res.status(200).json({
            success: true,
            message: 'Đăng ký thiết bị thành công'
        });
    } catch (error) {
        console.error('Lỗi khi đăng ký thiết bị:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi đăng ký thiết bị'
        });
    }
};

/**
 * Hủy đăng ký thiết bị
 */
exports.unregisterDevice = async (req, res) => {
    try {
        const userId = req.user.name || req.user._id;

        // Xóa token khỏi Redis
        await redisClient.removePushToken(userId);

        return res.status(200).json({
            success: true,
            message: 'Hủy đăng ký thiết bị thành công'
        });
    } catch (error) {
        console.error('Lỗi khi hủy đăng ký thiết bị:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi hủy đăng ký thiết bị'
        });
    }
};

/**
 * Lấy danh sách thông báo của người dùng
 */
exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.name || req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Lấy danh sách thông báo từ database
        const notifications = await database.getAll(
            'Notification Log', 
            { for_user: userId },
            ['name', 'subject', 'email_content', 'type', 'read', 'creation'],
            'creation DESC',
            limit,
            skip
        );

        // Đếm tổng số thông báo và số thông báo chưa đọc
        const total = await database.getAll('Notification Log', { for_user: userId });
        const unreadCount = await database.getAll('Notification Log', { for_user: userId, read: 0 });

        return res.status(200).json({
            success: true,
            notifications,
            pagination: {
                total: total.length,
                unreadCount: unreadCount.length,
                page,
                limit,
                pages: Math.ceil(total.length / limit)
            }
        });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách thông báo:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi lấy danh sách thông báo'
        });
    }
};

/**
 * Đánh dấu thông báo đã đọc
 */
exports.markAsRead = async (req, res) => {
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

        await database.update('Notification Log', notificationId, {
            read: 1,
            modified: new Date().toISOString()
        });

        // Invalidate cache
        await redisClient.invalidateUserNotificationsCache(userId);

        return res.status(200).json({
            success: true,
            message: 'Đã đánh dấu thông báo là đã đọc'
        });
    } catch (error) {
        console.error('Lỗi khi đánh dấu thông báo đã đọc:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi đánh dấu thông báo'
        });
    }
};

/**
 * Đánh dấu tất cả thông báo đã đọc
 */
exports.markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.name || req.user._id;

        await database.query(
            'UPDATE `tabNotification Log` SET `read` = 1, `modified` = ? WHERE `for_user` = ?',
            [new Date().toISOString(), userId]
        );

        // Invalidate cache
        await redisClient.invalidateUserNotificationsCache(userId);

        return res.status(200).json({
            success: true,
            message: 'Đã đánh dấu tất cả thông báo là đã đọc'
        });
    } catch (error) {
        console.error('Lỗi khi đánh dấu tất cả thông báo đã đọc:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi đánh dấu tất cả thông báo'
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
        
        // Try to fetch from Frappe Employee doctype
        const employeeQuery = `SELECT email FROM \`tabEmployee\` WHERE employee_id = ? OR name = ? LIMIT 1`;
        const employeeResult = await database.sqlQuery(employeeQuery, [employeeCode, employeeCode]);
        
        if (employeeResult && employeeResult.length > 0) {
            const email = employeeResult[0].email;
            if (email) {
                console.log(`✅ [Notification Service] Found Employee mapping: ${employeeCode} → ${email}`);
                return email;
            }
        }
        
        // Fallback: Try User doctype with custom field
        const userQuery = `SELECT name, email FROM \`tabUser\` WHERE employee_id = ? OR employee_code = ? OR name = ? LIMIT 1`;
        const userResult = await database.sqlQuery(userQuery, [employeeCode, employeeCode, employeeCode]);
        
        if (userResult && userResult.length > 0) {
            const user = userResult[0];
            const userId = user.email || user.name;
            console.log(`✅ [Notification Service] Found User mapping: ${employeeCode} → ${userId}`);
            return userId;
        }
        
        // Final fallback: Check if employeeCode is already an email
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
 * Gửi thông báo chấm công đơn giản
 * Format: "Bạn đã chấm công lúc *Time* tại *Location*"
 */
exports.sendAttendanceNotification = async (attendanceData) => {
    try {
        const { employeeCode, employeeName, timestamp, deviceName } = attendanceData;
        
        // Convert employeeCode to userId using database lookup
        const userId = await lookupUserIdByEmployeeCode(employeeCode);

        
        // Debug: Check if user has push tokens
        try {
            const pushTokens = await redisClient.getPushTokens(userId);
            const tokenCount = pushTokens ? Object.keys(pushTokens).length : 0;
            console.log(`🔔 [Notification Service] Push tokens for userId ${userId}: ${tokenCount} tokens found`);
            
            if (tokenCount === 0) {
                console.log(`❌ [Notification Service] No push tokens found for userId ${userId} - user may not have the mobile app or not logged in`);
                // Still proceed to save notification in database for later delivery
            }
        } catch (redisError) {
            console.warn(`⚠️ [Notification Service] Redis error checking push tokens:`, redisError.message);
        }
        
        // Format thời gian theo múi giờ Việt Nam
        const time = new Date(timestamp).toLocaleString('vi-VN', { 
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        
        const message = `Bạn đã chấm công lúc ${time} tại ${deviceName || 'Unknown Device'}`;
        
        const notificationData = {
            title: 'Chấm công',
            message,
            recipients: [userId], // Use userId instead of employeeCode
            notification_type: 'attendance',
            priority: 'medium',
            channel: 'push',
            data: { 
                employeeCode, 
                employeeName, 
                timestamp, 
                deviceName,
                type: 'attendance' // Thêm type để mobile app có thể handle
            }
        };

        await this.sendNotification(notificationData);
        console.log(`✅ [Notification Service] Sent attendance notification to ${employeeCode} (userId: ${userId}): ${message}`);
    } catch (error) {
        console.error('❌ [Notification Service] Error sending attendance notification:', error);
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