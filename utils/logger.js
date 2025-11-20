/**
 * Winston Logger for Notification Service
 * Structured JSON logging cho notification operations
 */

const winston = require('winston');

// Custom JSON formatter
const jsonFormat = winston.format.printf(({ timestamp, level, message, ...meta }) => {
  const logObject = {
    timestamp,
    level,
    service: 'notification',
    message,
  };

  // Add metadata fields if present
  if (meta.user_email) logObject.user_email = meta.user_email;
  if (meta.user_name) logObject.user_name = meta.user_name;
  if (meta.action) logObject.action = meta.action;
  if (meta.notification_id) logObject.notification_id = meta.notification_id;
  if (meta.recipient_count) logObject.recipient_count = meta.recipient_count;
  if (meta.notification_type) logObject.notification_type = meta.notification_type;
  if (meta.delivery_status) logObject.delivery_status = meta.delivery_status;
  if (meta.duration_ms) logObject.duration_ms = meta.duration_ms;
  if (meta.http_status) logObject.http_status = meta.http_status;
  if (meta.ip) logObject.ip = meta.ip;
  if (meta.details) logObject.details = meta.details;

  return JSON.stringify(logObject, null, 0);
});

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss Z' }),
    jsonFormat
  ),
  defaultMeta: { service: 'notification' },
  transports: [
    // Console transport for PM2 capture
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss Z' }),
        jsonFormat
      ),
    }),
  ],
});

/**
 * Log notification sent
 */
function logNotificationSent(sender_email, sender_name, notification_type, recipient_count, subject = '', status = 'sent') {
  logger.info(`Thông báo gửi đi: ${notification_type}`, {
    user_email: sender_email,
    user_name: sender_name,
    action: 'notification_sent',
    notification_type,
    recipient_count,
    delivery_status: status,
    details: {
      subject,
      sent_at: new Date().toISOString(),
    },
  });
}

/**
 * Log notification marked as read
 */
function logNotificationRead(reader_email, reader_name, notification_id, notification_type) {
  logger.info(`Thông báo đánh dấu đã đọc`, {
    user_email: reader_email,
    user_name: reader_name,
    action: 'notification_read',
    notification_id,
    notification_type,
    details: {
      read_at: new Date().toISOString(),
    },
  });
}

/**
 * Log notification deleted
 */
function logNotificationDeleted(user_email, user_name, notification_id, notification_type) {
  logger.info(`Thông báo xóa`, {
    user_email,
    user_name,
    action: 'notification_deleted',
    notification_id,
    notification_type,
    details: {
      deleted_at: new Date().toISOString(),
    },
  });
}

/**
 * Log push notification sent
 */
function logPushNotificationSent(recipient_email, recipient_name, device_type, status = 'success', error_message = '') {
  const level = status === 'success' ? 'info' : 'warn';
  logger[level](`Push notification: ${device_type}`, {
    user_email: recipient_email,
    user_name: recipient_name,
    action: 'push_notification_sent',
    delivery_status: status,
    details: {
      device_type,
      error_message,
      sent_at: new Date().toISOString(),
    },
  });
}

/**
 * Log email notification sent
 */
function logEmailNotificationSent(recipient_email, recipient_name, subject, status = 'success', error_message = '') {
  const level = status === 'success' ? 'info' : 'warn';
  logger[level](`Email notification`, {
    user_email: recipient_email,
    user_name: recipient_name,
    action: 'email_notification_sent',
    delivery_status: status,
    details: {
      subject,
      error_message,
      sent_at: new Date().toISOString(),
    },
  });
}

/**
 * Log notification preference updated
 */
function logPreferenceUpdated(user_email, user_name, notification_type, enabled = true) {
  logger.info(`Cập nhật tùy chọn thông báo`, {
    user_email,
    user_name,
    action: 'preference_updated',
    notification_type,
    details: {
      enabled,
      updated_at: new Date().toISOString(),
    },
  });
}

/**
 * Log API call with response time
 */
function logAPICall(user_email, method, endpoint, response_time_ms, http_status, ip = '') {
  const level = http_status >= 400 ? 'warn' : 'info';
  const slow_marker = response_time_ms > 2000 ? ' [CHẬM]' : '';

  logger[level](`API${slow_marker}: ${method} ${endpoint}`, {
    user_email,
    action: `api_${method.toLowerCase()}`,
    duration_ms: response_time_ms,
    http_status,
    ip,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log error
 */
function logError(user_email, action, error_message, notification_id = '', details = {}) {
  logger.error(`Lỗi: ${action}`, {
    user_email,
    action,
    notification_id,
    error_message,
    details,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log cache operation
 */
function logCacheOperation(operation, key, hit = null) {
  const action = hit ? 'cache_hit' : hit === false ? 'cache_miss' : 'cache_invalidate';
  logger.info(`Cache ${operation}`, {
    action,
    key,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  logger,
  logNotificationSent,
  logNotificationRead,
  logNotificationDeleted,
  logPushNotificationSent,
  logEmailNotificationSent,
  logPreferenceUpdated,
  logAPICall,
  logError,
  logCacheOperation,
};

