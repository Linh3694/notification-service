const mongoose = require('mongoose');

// Schema cho notifications chính
const notificationSchema = new mongoose.Schema({
    title: {
        type: mongoose.Schema.Types.Mixed, // Support both String and Object {vi, en}
        required: true
    },
    message: {
        type: mongoose.Schema.Types.Mixed, // Support both String and Object {vi, en}
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ['attendance', 'ticket', 'chat', 'system', 'post'],
        index: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    channel: {
        type: String,
        enum: ['push', 'email', 'system'],
        default: 'push'
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    recipients: [{
        type: String, // User IDs
        required: true
    }],
    createdBy: {
        type: String,
        required: true,
        default: 'notification-service'
    },
    // Analytics fields
    totalRecipients: {
        type: Number,
        default: 0
    },
    sentCount: {
        type: Number,
        default: 0
    },
    deliveredCount: {
        type: Number,
        default: 0
    },
    readCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true, // Tự động tạo createdAt và updatedAt
    collection: 'notifications'
});

// Optimized indexes cho performance
// Compound indexes cho query patterns thường xuyên
notificationSchema.index({ recipients: 1, createdAt: -1 }); // User notification list
notificationSchema.index({ type: 1, createdAt: -1 }); // Filter by type
notificationSchema.index({ priority: 1, createdAt: -1 }); // Priority filtering
notificationSchema.index({ channel: 1, createdAt: -1 }); // Channel filtering
notificationSchema.index({ createdBy: 1, createdAt: -1 }); // Analytics queries

// Partial indexes cho active notifications
notificationSchema.index(
  { recipients: 1, createdAt: -1 },
  {
    partialFilterExpression: {
      totalRecipients: { $gt: 0 } // Chỉ index notifications có recipients
    }
  }
);

// TTL index cho auto cleanup old notifications (90 days)
// Note: TTL indexes không support complex partialFilterExpression, sẽ cleanup all
notificationSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60
    // Removed partialFilterExpression - TTL will apply to all documents
  }
);

// Instance methods
notificationSchema.methods.updateStats = async function() {
    const NotificationRead = mongoose.model('NotificationRead');
    
    const stats = await NotificationRead.aggregate([
        { $match: { notificationId: this._id } },
        {
            $group: {
                _id: null,
                deliveredCount: {
                    $sum: { $cond: [{ $ne: ['$deliveryStatus', 'failed'] }, 1, 0] }
                },
                readCount: {
                    $sum: { $cond: ['$read', 1, 0] }
                }
            }
        }
    ]);
    
    if (stats.length > 0) {
        this.deliveredCount = stats[0].deliveredCount || 0;
        this.readCount = stats[0].readCount || 0;
        await this.save();
    }
};

// Optimized static methods with better performance
notificationSchema.statics.getUserNotificationsOptimized = async function(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    try {
        // Use optimized aggregation with better indexing
        const pipeline = [
            // Match user notifications with index utilization
            { $match: { recipients: userId } },

            // Optimized lookup với index hints
            {
                $lookup: {
                    from: 'notification_reads',
                    let: { notifId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$notificationId', '$$notifId'] },
                                        { $eq: ['$userId', userId] },
                                        { $ne: ['$deleted', true] } // Exclude deleted
                                    ]
                                }
                            }
                        },
                        { $limit: 1 } // Only need one record
                    ],
                    as: 'readInfo'
                }
            },

            // Efficient field extraction
            {
                $addFields: {
                    read: {
                        $ifNull: [{ $arrayElemAt: ['$readInfo.read', 0] }, false]
                    },
                    readAt: {
                        $ifNull: [{ $arrayElemAt: ['$readInfo.readAt', 0] }, null]
                    },
                    deliveryStatus: {
                        $ifNull: [{ $arrayElemAt: ['$readInfo.deliveryStatus', 0] }, 'sent']
                    }
                }
            },

            // Filter out deleted notifications
            {
                $match: {
                    $or: [
                        { 'readInfo': { $size: 0 } }, // No read record = not deleted
                        { 'readInfo.deleted': { $ne: true } }
                    ]
                }
            },

            // Clean up projection
            {
                $project: {
                    readInfo: 0
                }
            },

            // Sort with compound index
            { $sort: { createdAt: -1 } },

            // Pagination
            { $skip: skip },
            { $limit: limit }
        ];

        const notifications = await this.aggregate(pipeline).hint('recipients_1_createdAt_-1');

        // Optimized count query with covered index
        const total = await this.countDocuments({ recipients: userId });

        return {
            notifications,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    } catch (error) {
        console.error('❌ [getUserNotificationsOptimized] Error:', error);
        // Fallback to basic method
        return this.getUserNotificationsBasic(userId, page, limit);
    }
};

// Fallback method for compatibility
notificationSchema.statics.getUserNotifications = async function(userId, page = 1, limit = 20) {
    // Try optimized method first, fallback to basic if needed
    try {
        return await this.getUserNotificationsOptimized(userId, page, limit);
    } catch (error) {
        console.warn('⚠️ [getUserNotifications] Optimized method failed, using basic:', error.message);
        return this.getUserNotificationsBasic(userId, page, limit);
    }
};

// Basic method as fallback
notificationSchema.statics.getUserNotificationsBasic = async function(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const notifications = await this.find({ recipients: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const total = await this.countDocuments({ recipients: userId });

    return {
        notifications,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    };
};

// Optimized unread count with better performance
notificationSchema.statics.getUnreadCountOptimized = async function(userId) {
    try {
        // Use NotificationRead collection for direct count (more efficient)
        const NotificationRead = mongoose.model('NotificationRead');

        // Count unread notifications using indexed query
        const unreadCount = await NotificationRead.countDocuments({
            userId: userId,
            read: false,
            deleted: { $ne: true }
        });

        return unreadCount;
    } catch (error) {
        console.warn('⚠️ [getUnreadCountOptimized] Error, falling back:', error.message);
        return this.getUnreadCountBasic(userId);
    }
};

// Fallback method
notificationSchema.statics.getUnreadCountBasic = async function(userId) {
    try {
        const result = await this.aggregate([
            { $match: { recipients: userId } },
            {
                $lookup: {
                    from: 'notification_reads',
                    let: { notifId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$notificationId', '$$notifId'] },
                                        { $eq: ['$userId', userId] },
                                        { $ne: ['$deleted', true] }
                                    ]
                                }
                            }
                        },
                        { $limit: 1 }
                    ],
                    as: 'readInfo'
                }
            },
            {
                $match: {
                    $or: [
                        { readInfo: { $size: 0 } }, // No read record = unread
                        { 'readInfo.read': false }
                    ]
                }
            },
            { $count: 'unreadCount' }
        ]);

        return result.length > 0 ? result[0].unreadCount : 0;
    } catch (error) {
        console.error('❌ [getUnreadCountBasic] Error:', error);
        return 0;
    }
};

// Main method with fallback
notificationSchema.statics.getUnreadCount = async function(userId) {
    try {
        return await this.getUnreadCountOptimized(userId);
    } catch (error) {
        console.warn('⚠️ [getUnreadCount] Optimized method failed, using basic:', error.message);
        return this.getUnreadCountBasic(userId);
    }
};

module.exports = mongoose.model('Notification', notificationSchema);