const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { authenticate } = require("../middleware/authMiddleware");
const crossServiceCommunication = require("../services/crossServiceCommunication");

// Đăng ký thiết bị để nhận thông báo
router.post("/register-device", authenticate, notificationController.registerDevice);

// Hủy đăng ký thiết bị
router.post("/unregister-device", authenticate, notificationController.unregisterDevice);

// Lấy danh sách thông báo
router.get("/", authenticate, notificationController.getNotifications);

// Đánh dấu thông báo đã đọc
router.put("/:notificationId/read", authenticate, notificationController.markAsRead);

// Đánh dấu tất cả thông báo đã đọc
router.put("/mark-all-read", authenticate, notificationController.markAllAsRead);

// Xóa thông báo
router.delete("/:notificationId", authenticate, notificationController.deleteNotification);

// Xóa tất cả thông báo
router.delete("/", authenticate, notificationController.deleteAllNotifications);

// =============================
// NEW DATABASE-BASED APIs
// =============================

// Lấy notifications của user với pagination (database-based)
router.get("/user/:userId", notificationController.getUserNotifications);

// Đánh dấu notification đã đọc (database-based)
router.post("/:notificationId/mark-read", notificationController.markNotificationAsRead);

// Đánh dấu tất cả notifications đã đọc (database-based)
router.post("/mark-all-read", notificationController.markAllNotificationsAsRead);

// Lấy số lượng unread notifications
router.get("/user/:userId/unread-count", notificationController.getUnreadCount);

// Analytics: Lấy thống kê user
router.get("/user/:userId/stats", notificationController.getUserNotificationStats);

// Analytics: Chi tiết notification
router.get("/:notificationId/analytics", notificationController.getNotificationAnalytics);

// Test cross-service communication
router.post("/test/ticket-service", async (req, res) => {
  try {
    const { event, data } = req.body;
    
    await crossServiceCommunication.sendToTicketService(event, data);
    
    res.status(200).json({
      success: true,
      message: `Message sent to ticket-service: ${event}`,
      data: data
    });
  } catch (error) {
    console.error('Error sending message to ticket-service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message to ticket-service',
      error: error.message
    });
  }
});


// Get notification delivery status
router.get("/delivery-status/:notificationId", async (req, res) => {
  try {
    const { notificationId } = req.params;
    const status = await require("../config/redis").getNotificationDeliveryStatus(notificationId);
    
    res.status(200).json({
      success: true,
      notificationId,
      deliveryStatus: status
    });
  } catch (error) {
    console.error('Error getting delivery status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get delivery status',
      error: error.message
    });
  }
});

// Get user online status
router.get("/user-status/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const isOnline = await require("../config/redis").isUserOnline(userId);
    
    res.status(200).json({
      success: true,
      userId,
      isOnline
    });
  } catch (error) {
    console.error('Error getting user status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user status',
      error: error.message
    });
  }
});



module.exports = router; 