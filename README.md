# Notification Service

Microservice quản lý thông báo và notifications tương thích với Frappe Framework.

## Tính năng

- ✅ Tương thích hoàn toàn với Frappe API
- ✅ Kết nối MariaDB (production database)
- ✅ Redis caching và real-time updates
- ✅ Socket.IO cho real-time notifications
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
- ✅ **Real-time event handling** từ ticket-service và frappe
- ✅ **User presence tracking** và online status
- ✅ **Notification delivery tracking** và analytics
- ✅ **Broadcast messaging** cho system-wide notifications

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
- Redis: Valkey connection
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

- `POST /api/notifications/create` - Tạo notification mới
- `GET /api/notifications/user/:user_id` - Lấy notifications của user
- `PUT /api/notifications/mark-read/:notification_name` - Đánh dấu đã đọc
- `POST /api/notifications/register-token` - Đăng ký push token
- `POST /api/notifications/bulk-send` - Gửi nhiều notifications
- `GET /api/notifications/stats` - Thống kê notifications

### Real-time Notifications

- `POST /api/notifications/broadcast` - Broadcast notification real-time
- `GET /api/notifications/queue` - Xem notification queue

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

### Cross-Service Communication API

- `POST /api/notifications/test/ticket-service` - Test gửi message đến ticket-service
- `POST /api/notifications/test/frappe` - Test gửi message đến frappe
- `POST /api/notifications/test/broadcast` - Test broadcast message
- `GET /api/notifications/delivery-status/:notificationId` - Kiểm tra delivery status
- `GET /api/notifications/user-status/:userId` - Kiểm tra user online status

## Socket.IO Events

### Client to Server

- `join_user_room` - Tham gia user room
- `leave_user_room` - Rời user room
- `mark_notification_read` - Đánh dấu đã đọc
- `register_push_token` - Đăng ký push token
- `send_notification` - Gửi notification real-time

### Server to Client

- `notification` - Notification mới
- `notification_read` - Xác nhận đã đọc
- `push_token_registered` - Xác nhận đăng ký token
- `notification_sent` - Xác nhận gửi notification

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
- Push token storage trong Redis
- Notification queue trong Redis
- Real-time notification broadcasting
- Notification delivery tracking

## Security Features

- JWT Authentication
- Rate limiting
- Content sanitization
- Access control cho notifications
- Secure token storage
- Email validation

## Health Check

```bash
curl http://localhost:5003/health
```

## Logs

Service ghi logs chi tiết cho:

- Database connections
- Redis operations
- Socket.IO events
- Notification processing
- Email sending
- Push notification delivery
- Authentication
- Errors và warnings

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
