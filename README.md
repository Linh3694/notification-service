# Notification Service

Microservice quản lý thông báo và notifications tương thích với Frappe Framework và workspace-backend.

## Tính năng

- ✅ Tương thích hoàn toàn với Frappe API
- ✅ Kết nối MariaDB (production database)
- ✅ Redis caching và real-time updates với reconnection strategy
- ✅ Socket.IO cho real-time notifications với Redis adapter
- ✅ Push notifications (Expo, FCM)
- ✅ Email notifications (SMTP)
- ✅ System notifications (Frappe Notification Log)
- ✅ Notification queue và batch processing
- ✅ Notification templates
- ✅ Read/unread status tracking
- ✅ Notification statistics và analytics
- ✅ Multi-channel delivery (push, email, system)
- ✅ Real-time notification broadcasting
- ✅ Notification cleanup và retention
- ✅ **Cross-service communication** với Redis pub/sub
- ✅ **Real-time event handling** từ ticket-service, frappe, chat-service, workspace-backend
- ✅ **User presence tracking** và online status
- ✅ **Notification delivery tracking** và analytics
- ✅ **Broadcast messaging** cho system-wide notifications
- ✅ **Health check** và monitoring
- ✅ **Graceful shutdown** và error handling
- ✅ **JWT Authentication** tương thích với workspace-backend

## Cài đặt

```bash
cd notification-service
npm install
```

## Cấu hình

Sao chép và chỉnh sửa file `config.env`:

```bash
cp config.env.example config.env
```

Cấu hình các thông số:

- Database: MariaDB connection
- Redis: Valkey connection với reconnection strategy
- JWT Secret
- CORS origins
- Email SMTP settings
- Push notification tokens

## Chạy service

```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Notification Management

- `POST /api/notifications/register-device` - Đăng ký thiết bị nhận thông báo
- `POST /api/notifications/unregister-device` - Hủy đăng ký thiết bị
- `GET /api/notifications/` - Lấy danh sách thông báo của user
- `PUT /api/notifications/:notificationId/read` - Đánh dấu đã đọc
- `PUT /api/notifications/mark-all-read` - Đánh dấu tất cả đã đọc
- `DELETE /api/notifications/:notificationId` - Xóa thông báo
- `DELETE /api/notifications/` - Xóa tất cả thông báo

### Real-time Notifications

- `POST /api/notifications/test/ticket-service` - Test gửi message đến ticket-service
- `POST /api/notifications/test/frappe` - Test gửi message đến frappe
- `POST /api/notifications/test/broadcast` - Test broadcast message
- `GET /api/notifications/delivery-status/:notificationId` - Kiểm tra delivery status
- `GET /api/notifications/user-status/:userId` - Kiểm tra user online status

### Frappe Compatible API

- `POST /api/method/erp.common.doctype.erp_notification.erp_notification.create_notification`
- `GET /api/resource/ERP%20Notification` - Lấy danh sách notifications
- `GET /api/resource/ERP%20Notification/:name` - Lấy notification cụ thể
- `POST /api/resource/ERP%20Notification` - Tạo notification mới
- `PUT /api/resource/ERP%20Notification/:name` - Cập nhật notification
- `DELETE /api/resource/ERP%20Notification/:name` - Xóa notification

### Notification Log API

- `GET /api/resource/Notification%20Log` - Lấy notification logs
- `PUT /api/resource/Notification%20Log/:name` - Cập nhật notification log

### Health Check

- `GET /health` - Health check endpoint với thông tin chi tiết

## Socket.IO Events

### Client to Server

- `join_user_room` - Tham gia user room
- `leave_user_room` - Rời user room
- `mark_notification_read` - Đánh dấu đã đọc
- `register_push_token` - Đăng ký push token
- `send_notification` - Gửi notification real-time
- `user_online` - Báo cáo user online
- `user_offline` - Báo cáo user offline

### Server to Client

- `notification` - Notification mới
- `notification_read` - Xác nhận đã đọc
- `push_token_registered` - Xác nhận đăng ký token
- `notification_sent` - Xác nhận gửi notification

## Cross-Service Communication

Service hỗ trợ giao tiếp với các service khác thông qua Redis pub/sub:

### Channels

- `ticket-service` - Giao tiếp với ticket service
- `frappe` - Giao tiếp với Frappe
- `chat-service` - Giao tiếp với chat service
- `workspace-backend` - Giao tiếp với workspace backend
- `broadcast` - Broadcast message đến tất cả services

### Events

- `ticket_created`, `ticket_updated`, `ticket_assigned`, `ticket_status_changed`
- `user_created`, `user_updated`, `user_deleted`, `role_changed`
- `message_sent`, `user_online`, `user_offline`
- `system_maintenance`, `emergency_notification`, `service_status`

## Cấu trúc Database

Service sử dụng các DocTypes:

### ERP Notification

- `name` - ID notification (required)
- `title` - Tiêu đề notification
- `message` - Nội dung notification
- `notification_type` - Loại notification (system/email/push)
- `priority` - Độ ưu tiên (low/medium/high)
- `recipients` - Danh sách recipients (JSON)
- `status` - Trạng thái (draft/sent/failed)
- `channel` - Kênh gửi (push/email/system)
- `data` - Dữ liệu bổ sung (JSON)
- `sender` - Người gửi
- `sent_at` - Thời gian gửi

### Notification Log (Frappe)

- `name` - ID log entry
- `subject` - Tiêu đề
- `email_content` - Nội dung email
- `for_user` - User nhận
- `from_user` - User gửi
- `type` - Loại notification
- `document_type` - Loại document
- `document_name` - Tên document
- `read` - Đã đọc chưa (0/1)

## Notification Channels

### Push Notifications

- **Expo**: Hỗ trợ React Native apps
- **FCM**: Hỗ trợ Android/iOS native apps
- **Web Push**: Hỗ trợ web browsers

### Email Notifications

- **SMTP**: Gửi email qua SMTP server
- **Templates**: Hỗ trợ email templates
- **HTML Content**: Hỗ trợ HTML formatting

### System Notifications

- **Frappe UI**: Hiển thị trong Frappe interface
- **Real-time**: Socket.IO real-time updates
- **In-app**: Notifications trong ứng dụng

## Caching Strategy

- Redis cache cho user notifications (TTL: 30 minutes)
- Push token storage trong Redis với error handling
- Notification queue trong Redis
- Real-time notification broadcasting
- Notification delivery tracking
- User presence tracking
- Cross-service communication

## Security Features

- JWT Authentication tương thích với workspace-backend
- Rate limiting
- Content sanitization
- Access control cho notifications
- Secure token storage
- Email validation
- Error handling và logging

## Health Check

```bash
curl http://localhost:5003/health
```

Response:

```json
{
  "status": "ok",
  "service": "notification-service",
  "version": "1.0.0",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "database": "connected",
  "redis": "connected",
  "queue_length": 0,
  "cross_service_communication": {
    "service": "notification-service",
    "status": "healthy",
    "subscribedChannels": 6,
    "isInitialized": true
  },
  "uptime": 3600
}
```

## Logs

Service ghi logs chi tiết cho:

- Database connections
- Redis operations với reconnection
- Socket.IO events
- Notification processing
- Email sending
- Push notification delivery
- Authentication
- Cross-service communication
- Errors và warnings

## Monitoring

- Health check endpoint
- Redis connection monitoring
- Database connection monitoring
- Cross-service communication health
- Notification queue monitoring
- User presence tracking

## Docker Support (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 5003
CMD ["npm", "start"]
```

## Troubleshooting

### Redis Connection Issues

- Kiểm tra Redis host và port
- Kiểm tra Redis password
- Xem logs để debug connection issues

### Database Connection Issues

- Kiểm tra MariaDB connection string
- Kiểm tra database permissions
- Xem logs để debug connection issues

### Cross-Service Communication Issues

- Kiểm tra Redis pub/sub channels
- Xem logs để debug message handling
- Kiểm tra service health endpoints
