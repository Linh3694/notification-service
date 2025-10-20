const mongoose = require('mongoose');

// Schema cho notifications chính
const notificationSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
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

// Indexes cho performance
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ recipients: 1, createdAt: -1 });
notificationSchema.index({ createdBy: 1, createdAt: -1 });

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

// Static methods
notificationSchema.statics.getUserNotifications = async function(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    
    // Aggregate để join với notification_reads và lấy trạng thái đã đọc
    const notifications = await this.aggregate([
        {
            $match: { recipients: userId }
        },
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
                                    { $eq: ['$userId', userId] }
                                ]
                            }
                        }
                    }
                ],
                as: 'readInfo'
            }
        },
        {
            $addFields: {
                read: {
                    $cond: {
                        if: { $gt: [{ $size: '$readInfo' }, 0] },
                        then: { $arrayElemAt: ['$readInfo.read', 0] },
                        else: false
                    }
                },
                readAt: {
                    $cond: {
                        if: { $gt: [{ $size: '$readInfo' }, 0] },
                        then: { $arrayElemAt: ['$readInfo.readAt', 0] },
                        else: null
                    }
                },
                deleted: {
                    $cond: {
                        if: { $gt: [{ $size: '$readInfo' }, 0] },
                        then: { $arrayElemAt: ['$readInfo.deleted', 0] },
                        else: false
                    }
                }
            }
        },
        {
            $match: {
                $or: [
                    { deleted: false },
                    { deleted: { $exists: false } }
                ]
            }
        },
        {
            $project: {
                readInfo: 0
            }
        },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit }
    ]);
    
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

notificationSchema.statics.getUnreadCount = async function(userId) {
    const result = await this.aggregate([
        {
            $match: { recipients: userId }
        },
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
                                    { $eq: ['$userId', userId] }
                                ]
                            }
                        }
                    }
                ],
                as: 'readInfo'
            }
        },
        {
            $addFields: {
                isRead: {
                    $cond: {
                        if: { $gt: [{ $size: '$readInfo' }, 0] },
                        then: { $arrayElemAt: ['$readInfo.read', 0] },
                        else: false
                    }
                },
                isDeleted: {
                    $cond: {
                        if: { $gt: [{ $size: '$readInfo' }, 0] },
                        then: { $arrayElemAt: ['$readInfo.deleted', 0] },
                        else: false
                    }
                }
            }
        },
        {
            $match: {
                isRead: false,
                $or: [
                    { isDeleted: false },
                    { isDeleted: { $exists: false } }
                ]
            }
        },
        {
            $count: 'unreadCount'
        }
    ]);
    
    return result.length > 0 ? result[0].unreadCount : 0;
};

module.exports = mongoose.model('Notification', notificationSchema);