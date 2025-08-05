# Cross-Service Communication

Hướng dẫn sử dụng Redis pub/sub để giao tiếp giữa các services (ticket-service, notification-service, frappe).

## Tổng Quan

Notification-service sử dụng Redis pub/sub để nhận và gửi messages từ/tới các services khác:

- **Ticket Service** → Notification Service
- **Frappe** → Notification Service
- **Notification Service** → Ticket Service
- **Notification Service** → Frappe
- **Broadcast** → Tất cả services

## Cấu Trúc Message

```javascript
{
  service: 'service-name',
  event: 'event-type',
  data: {
    // Event specific data
  },
  timestamp: '2024-01-01T00:00:00.000Z'
}
```

## Channels

### 1. **ticket-service**

Nhận messages từ ticket-service:

```javascript
// Ticket events
"ticket_created";
"ticket_updated";
"ticket_assigned";
"ticket_status_changed";
"ticket_feedback";
"message_sent";
```

### 2. **frappe**

Nhận messages từ frappe:

```javascript
// User events
"user_created";
"user_updated";
"user_deleted";
"role_changed";
"department_changed";
```

### 3. **broadcast**

Nhận broadcast messages:

```javascript
// System events
"system_maintenance";
"emergency_notification";
"service_status";
```

### 4. **notification-service**

Nhận messages từ notification-service (internal):

```javascript
// Internal events
"notification_sent";
"notification_delivered";
"notification_failed";
```

## API Endpoints

### Test Cross-Service Communication

#### Gửi message đến ticket-service:

```bash
POST /api/notifications/test/ticket-service
Content-Type: application/json

{
  "event": "ticket_created",
  "data": {
    "ticketId": "123",
    "ticketCode": "IT-01",
    "creatorId": "admin",
    "creatorName": "Admin User",
    "adminUsers": ["admin", "technical1"]
  }
}
```

#### Gửi message đến frappe:

```bash
POST /api/notifications/test/frappe
Content-Type: application/json

{
  "event": "user_created",
  "data": {
    "userId": "newuser",
    "fullName": "New User",
    "email": "newuser@example.com"
  }
}
```

#### Broadcast message:

```bash
POST /api/notifications/test/broadcast
Content-Type: application/json

{
  "event": "system_maintenance",
  "data": {
    "message": "Hệ thống sẽ bảo trì từ 2:00 AM đến 4:00 AM",
    "maintenanceTime": "2024-01-01T02:00:00.000Z",
    "duration": "2 hours"
  }
}
```

### Utility Endpoints

#### Kiểm tra delivery status:

```bash
GET /api/notifications/delivery-status/{notificationId}
```

#### Kiểm tra user online status:

```bash
GET /api/notifications/user-status/{userId}
```

## Event Handlers

### Ticket Events

#### `ticket_created`

```javascript
{
  ticketId: "123",
  ticketCode: "IT-01",
  creatorId: "admin",
  creatorName: "Admin User",
  adminUsers: ["admin", "technical1"]
}
```

#### `ticket_status_changed`

```javascript
{
  ticketId: "123",
  ticketCode: "IT-01",
  oldStatus: "Assigned",
  newStatus: "Processing",
  recipients: ["admin", "technical1"]
}
```

### Frappe Events

#### `user_created`

```javascript
{
  userId: "newuser",
  fullName: "New User",
  email: "newuser@example.com"
}
```

#### `role_changed`

```javascript
{
  userId: "user123",
  oldRole: "teacher",
  newRole: "admin"
}
```

## Notification Types

### 1. **Ticket Notifications**

- `ticket_created` - Ticket mới được tạo
- `ticket_updated` - Ticket được cập nhật
- `ticket_assigned` - Ticket được gán
- `ticket_status_changed` - Trạng thái ticket thay đổi
- `ticket_feedback` - Ticket nhận đánh giá
- `message_sent` - Tin nhắn mới trong ticket

### 2. **User Notifications**

- `welcome` - Chào mừng user mới
- `profile_updated` - Thông tin profile được cập nhật
- `role_changed` - Vai trò thay đổi
- `department_changed` - Phòng ban thay đổi

### 3. **System Notifications**

- `system_maintenance` - Bảo trì hệ thống
- `emergency` - Thông báo khẩn cấp
- `service_status` - Trạng thái dịch vụ

## Priority Levels

- **urgent** - Khẩn cấp (đỏ)
- **high** - Cao (cam)
- **medium** - Trung bình (vàng)
- **low** - Thấp (xanh)

## Delivery Channels

### 1. **Push Notifications**

- Expo (React Native)
- FCM (Android/iOS)
- Web Push (Browser)

### 2. **Email Notifications**

- SMTP
- HTML templates
- Rich content

### 3. **System Notifications**

- In-app notifications
- Socket.IO real-time
- Database storage

## Testing

### Test với curl:

```bash
# Test ticket created event
curl -X POST http://localhost:5003/api/notifications/test/ticket-service \
  -H "Content-Type: application/json" \
  -d '{
    "event": "ticket_created",
    "data": {
      "ticketId": "123",
      "ticketCode": "IT-01",
      "creatorId": "admin",
      "creatorName": "Admin User",
      "adminUsers": ["admin", "technical1"]
    }
  }'

# Test user created event
curl -X POST http://localhost:5003/api/notifications/test/frappe \
  -H "Content-Type: application/json" \
  -d '{
    "event": "user_created",
    "data": {
      "userId": "newuser",
      "fullName": "New User",
      "email": "newuser@example.com"
    }
  }'

# Test broadcast event
curl -X POST http://localhost:5003/api/notifications/test/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "event": "system_maintenance",
    "data": {
      "message": "Hệ thống sẽ bảo trì từ 2:00 AM đến 4:00 AM",
      "maintenanceTime": "2024-01-01T02:00:00.000Z",
      "duration": "2 hours"
    }
  }'
```

## Monitoring

### Logs

Notification-service ghi logs chi tiết cho:

- Message received
- Event processing
- Notification sending
- Delivery tracking
- Errors

### Metrics

- Messages received per service
- Notifications sent per type
- Delivery success rate
- User online status
- Queue length

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**

   - Kiểm tra Redis server
   - Kiểm tra network connectivity
   - Kiểm tra credentials

2. **Message Not Received**

   - Kiểm tra channel subscription
   - Kiểm tra message format
   - Kiểm tra Redis pub/sub

3. **Notification Not Sent**
   - Kiểm tra user tokens
   - Kiểm tra notification data
   - Kiểm tra delivery channels

### Debug Commands

```bash
# Check Redis connection
redis-cli ping

# Monitor Redis pub/sub
redis-cli monitor

# Check notification queue
redis-cli llen notification_queue

# Check user online status
redis-cli get user:online:admin
```

## Integration với Ticket Service

Ticket service cần gửi events khi:

```javascript
// Khi tạo ticket
await redisClient.publish("notification-service", {
  service: "ticket-service",
  event: "ticket_created",
  data: {
    ticketId: ticket._id,
    ticketCode: ticket.ticketCode,
    creatorId: ticket.creator,
    creatorName: user.fullname,
    adminUsers: adminUserIds,
  },
});

// Khi cập nhật status
await redisClient.publish("notification-service", {
  service: "ticket-service",
  event: "ticket_status_changed",
  data: {
    ticketId: ticket._id,
    ticketCode: ticket.ticketCode,
    oldStatus: oldStatus,
    newStatus: newStatus,
    recipients: recipientIds,
  },
});
```

## Integration với Frappe

Frappe cần gửi events khi:

```javascript
// Khi tạo user
await redisClient.publish("notification-service", {
  service: "frappe",
  event: "user_created",
  data: {
    userId: user.name,
    fullName: user.full_name,
    email: user.email,
  },
});

// Khi thay đổi role
await redisClient.publish("notification-service", {
  service: "frappe",
  event: "role_changed",
  data: {
    userId: user.name,
    oldRole: oldRole,
    newRole: newRole,
  },
});
```

## Kết Luận

Cross-service communication cho phép:

- ✅ **Real-time notifications** giữa các services
- ✅ **Decoupled architecture** - services độc lập
- ✅ **Scalable** - dễ dàng thêm services mới
- ✅ **Reliable** - Redis pub/sub đảm bảo delivery
- ✅ **Monitorable** - tracking và logging đầy đủ
