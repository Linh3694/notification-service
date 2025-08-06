const mongoose = require('mongoose');

// Schema cho tracking read/unread status
const notificationReadSchema = new mongoose.Schema({
    notificationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Notification',
        required: true,
        index: true
    },
    userId: {
        type: String,
        required: true,
        index: true
    },
    read: {
        type: Boolean,
        default: false,
        index: true
    },
    readAt: {
        type: Date,
        default: null
    },
    deliveryStatus: {
        type: String,
        enum: ['sent', 'delivered', 'failed'],
        default: 'sent'
    },
    deliveredAt: {
        type: Date,
        default: null
    },
    // Metadata cho push notifications
    pushTokenUsed: {
        type: String,
        default: null
    },
    platform: {
        type: String,
        enum: ['expo', 'fcm', 'web'],
        default: 'expo'
    },
    errorMessage: {
        type: String,
        default: null
    }
}, {
    timestamps: true,
    collection: 'notification_reads'
});

// Compound indexes
notificationReadSchema.index({ notificationId: 1, userId: 1 }, { unique: true });
notificationReadSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationReadSchema.index({ deliveryStatus: 1, createdAt: -1 });

// Instance methods
notificationReadSchema.methods.markAsRead = async function() {
    if (!this.read) {
        this.read = true;
        this.readAt = new Date();
        await this.save();
        
        // Cập nhật stats trong notification chính
        const Notification = mongoose.model('Notification');
        const notification = await Notification.findById(this.notificationId);
        if (notification) {
            await notification.updateStats();
        }
    }
    return this;
};

notificationReadSchema.methods.markAsDelivered = async function() {
    if (this.deliveryStatus === 'sent') {
        this.deliveryStatus = 'delivered';
        this.deliveredAt = new Date();
        await this.save();
        
        // Cập nhật stats
        const Notification = mongoose.model('Notification');
        const notification = await Notification.findById(this.notificationId);
        if (notification) {
            await notification.updateStats();
        }
    }
    return this;
};

notificationReadSchema.methods.markAsFailed = async function(errorMessage = null) {
    this.deliveryStatus = 'failed';
    this.errorMessage = errorMessage;
    await this.save();
    
    // Cập nhật stats
    const Notification = mongoose.model('Notification');
    const notification = await Notification.findById(this.notificationId);
    if (notification) {
        await notification.updateStats();
    }
    return this;
};

// Static methods
notificationReadSchema.statics.markAllAsReadForUser = async function(userId) {
    const result = await this.updateMany(
        { userId: userId, read: false },
        { 
            read: true, 
            readAt: new Date() 
        }
    );
    
    return result.modifiedCount;
};

notificationReadSchema.statics.getDeliveryStats = async function(notificationId) {
    const stats = await this.aggregate([
        { $match: { notificationId: mongoose.Types.ObjectId(notificationId) } },
        {
            $group: {
                _id: '$deliveryStatus',
                count: { $sum: 1 }
            }
        }
    ]);
    
    return stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
    }, {});
};

notificationReadSchema.statics.getUserReadingStats = async function(userId, startDate = null, endDate = null) {
    const matchConditions = { userId };
    
    if (startDate && endDate) {
        matchConditions.createdAt = {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        };
    }
    
    const stats = await this.aggregate([
        { $match: matchConditions },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                read: { $sum: { $cond: ['$read', 1, 0] } },
                delivered: { $sum: { $cond: [{ $eq: ['$deliveryStatus', 'delivered'] }, 1, 0] } },
                failed: { $sum: { $cond: [{ $eq: ['$deliveryStatus', 'failed'] }, 1, 0] } },
                avgReadTime: {
                    $avg: {
                        $cond: [
                            '$readAt',
                            { $subtract: ['$readAt', '$createdAt'] },
                            null
                        ]
                    }
                }
            }
        }
    ]);
    
    return stats.length > 0 ? stats[0] : {
        total: 0,
        read: 0,
        delivered: 0,
        failed: 0,
        avgReadTime: null
    };
};

module.exports = mongoose.model('NotificationRead', notificationReadSchema);