const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// Standard REST API routes
router.post('/create', notificationController.createNotification.bind(notificationController));
router.get('/user/:user_id', notificationController.getUserNotifications.bind(notificationController));
router.put('/mark-read/:notification_name', notificationController.markAsRead.bind(notificationController));
router.post('/register-token', notificationController.registerPushToken.bind(notificationController));
router.post('/bulk-send', notificationController.bulkSendNotifications.bind(notificationController));
router.get('/stats', notificationController.getNotificationStats.bind(notificationController));

// Frappe-compatible API routes

// Frappe method calls
router.post('/erp.common.doctype.erp_notification.erp_notification.create_notification', 
  notificationController.createNotification.bind(notificationController));

router.get('/erp.common.doctype.erp_notification.erp_notification.get_user_notifications', 
  notificationController.getUserNotifications.bind(notificationController));

router.post('/erp.common.doctype.erp_notification.erp_notification.mark_notification_as_read', 
  notificationController.markAsRead.bind(notificationController));

// Frappe resource API
router.get('/ERP%20Notification', async (req, res) => {
  try {
    const { filters, fields, limit_start, limit_page_length, order_by } = req.query;
    const database = require('../config/database');
    
    let parsedFilters = {};
    if (filters) {
      try {
        parsedFilters = JSON.parse(filters);
      } catch (e) {
        parsedFilters = req.query;
      }
    }

    const notifications = await database.getAll('ERP Notification',
      parsedFilters,
      fields || '*',
      order_by || 'modified DESC',
      limit_page_length || 50
    );

    res.json({
      message: notifications,
      status: 'success'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

router.get('/ERP%20Notification/:name', async (req, res) => {
  try {
    const database = require('../config/database');
    const notification = await database.get('ERP Notification', req.params.name);
    
    if (!notification) {
      return res.status(404).json({
        error: 'Record not found',
        message: `ERP Notification ${req.params.name} not found`
      });
    }

    res.json({
      message: notification,
      status: 'success'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

router.post('/ERP%20Notification', async (req, res) => {
  try {
    const database = require('../config/database');
    const data = req.body;
    
    // Add required Frappe fields
    data.name = data.name || `NOTIF-${Date.now()}`;
    data.creation = new Date().toISOString();
    data.modified = new Date().toISOString();
    data.owner = 'Administrator';
    data.modified_by = 'Administrator';
    data.docstatus = 0;
    data.idx = 0;

    await database.insert('ERP Notification', data);

    // Send notification if status is not draft
    if (data.status !== 'draft') {
      await notificationController.sendNotification(data);
    }

    res.json({
      message: data,
      status: 'success'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

router.put('/ERP%20Notification/:name', async (req, res) => {
  try {
    const database = require('../config/database');
    const data = req.body;
    
    // Update modified timestamp
    data.modified = new Date().toISOString();
    data.modified_by = 'Administrator';

    await database.update('ERP Notification', req.params.name, data);

    // Get updated record
    const updated = await database.get('ERP Notification', req.params.name);

    res.json({
      message: updated,
      status: 'success'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

router.delete('/ERP%20Notification/:name', async (req, res) => {
  try {
    const database = require('../config/database');
    await database.delete('ERP Notification', req.params.name);

    res.json({
      message: 'Record deleted successfully',
      status: 'success'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Notification Log API (Frappe compatible)
router.get('/Notification%20Log', async (req, res) => {
  try {
    const { filters, fields, limit_start, limit_page_length, order_by } = req.query;
    const database = require('../config/database');
    
    let parsedFilters = {};
    if (filters) {
      try {
        parsedFilters = JSON.parse(filters);
      } catch (e) {
        parsedFilters = req.query;
      }
    }

    const logs = await database.getAll('Notification Log',
      parsedFilters,
      fields || '*',
      order_by || 'creation DESC',
      limit_page_length || 50
    );

    res.json({
      message: logs,
      status: 'success'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

router.put('/Notification%20Log/:name', async (req, res) => {
  try {
    const database = require('../config/database');
    const data = req.body;
    
    data.modified = new Date().toISOString();
    await database.update('Notification Log', req.params.name, data);

    const updated = await database.get('Notification Log', req.params.name);

    res.json({
      message: updated,
      status: 'success'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Real-time notification endpoints
router.post('/broadcast', async (req, res) => {
  try {
    const { title, message, recipients = 'all', type = 'system' } = req.body;
    
    // Create and send notification
    const notificationData = {
      title,
      message,
      recipients: recipients === 'all' ? [] : recipients,
      recipient_type: recipients === 'all' ? 'all' : 'specific',
      notification_type: type,
      channel: 'push',
      priority: 'medium'
    };

    // Use the controller to create and send
    const mockReq = { body: notificationData, user: { name: 'Administrator' } };
    const mockRes = {
      json: (data) => res.json(data),
      status: (code) => ({ json: (data) => res.status(code).json(data) })
    };

    await notificationController.createNotification(mockReq, mockRes);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'notification-routes',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;