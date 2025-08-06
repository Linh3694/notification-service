# Notification Service - Ubuntu 24.04 Installation Guide

## Tổng quan

Notification Service là microservice quản lý thông báo tương thích với Frappe Framework, hỗ trợ:
- Push notifications (Expo, FCM)
- Email notifications (SMTP)
- System notifications (Frappe Notification Log)
- Real-time notifications (Socket.IO)
- Cross-service communication (Redis pub/sub)

## Yêu cầu hệ thống

- Ubuntu 24.04 LTS
- Node.js 18.x
- Redis 6.x+
- MariaDB/MySQL
- PM2 (Process Manager)
- Nginx (Load Balancer)

## Cài đặt tự động

### 1. Clone repository
```bash
cd /opt
sudo git clone <repository-url> notification-service
cd notification-service
```

### 2. Chạy script cài đặt
```bash
sudo chmod +x install.sh
sudo bash install.sh
```

### 3. Cấu hình
```bash
# Chỉnh sửa file config.env
sudo nano config.env
```

### 4. Khởi động service
```bash
# Khởi động với PM2
pm2 start ecosystem.config.js

# Lưu PM2 configuration
pm2 save

# Tự động khởi động khi reboot
pm2 startup
```

## Cài đặt thủ công

### 1. Cập nhật hệ thống
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Cài đặt Node.js 18.x
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
sudo apt-get install -y nodejs
```

### 3. Cài đặt PM2
```bash
sudo npm install -g pm2
```

### 4. Cài đặt Redis
```bash
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

### 5. Cài đặt MariaDB client
```bash
sudo apt install -y mariadb-client
```

### 6. Cài đặt dependencies
```bash
npm install --production
```

### 7. Cấu hình
```bash
# Copy file config example
cp config.env.example config.env

# Chỉnh sửa config.env
nano config.env
```

## Cấu hình

### File config.env
```env
# Database Configuration (MariaDB)
DB_HOST=172.16.20.130
DB_PORT=3306
DB_USER=frappe
DB_PASSWORD=Frappe#2025
DB_NAME=_8f4b2a4f8a7b3e1d

# Redis Configuration
REDIS_HOST=172.16.20.120
REDIS_PORT=6379
REDIS_PASSWORD=breakpoint

# JWT Configuration
JWT_SECRET=your_jwt_secret_here

# Server Configuration
PORT=5003
SERVICE_NAME=notification-service

# CORS Origins
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,https://wis.wellspring.edu.vn,https://api-dev.wellspring.edu.vn

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=noreply@wellspring.edu.vn

# Push Notification Configuration
EXPO_ACCESS_TOKEN=your_expo_access_token
FCM_SERVER_KEY=your_fcm_server_key
```

## PM2 Configuration

### Ecosystem config (ecosystem.config.js)
- 2 instances: Port 5003 và 5004
- Cluster mode
- Auto-restart khi crash
- Memory limit: 1GB per instance
- Log rotation

### Khởi động PM2
```bash
# Khởi động với ecosystem config
pm2 start ecosystem.config.js

# Lưu configuration
pm2 save

# Tự động khởi động khi reboot
pm2 startup
```

## Nginx Load Balancer

### 1. Cài đặt Nginx
```bash
sudo apt install -y nginx
```

### 2. Cấu hình
```bash
# Copy file cấu hình
sudo cp nginx.conf /etc/nginx/sites-available/notification-service

# Tạo symlink
sudo ln -s /etc/nginx/sites-available/notification-service /etc/nginx/sites-enabled/

# Test cấu hình
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### 3. SSL Certificate (Let's Encrypt)
```bash
# Cài đặt Certbot
sudo apt install -y certbot python3-certbot-nginx

# Tạo SSL certificate
sudo certbot --nginx -d notification.wellspring.edu.vn
```

## Monitoring

### 1. PM2 Commands
```bash
# Xem trạng thái
pm2 status

# Xem logs
pm2 logs

# Monitor real-time
pm2 monit

# Restart tất cả
pm2 restart all

# Stop tất cả
pm2 stop all
```

### 2. Health Check
```bash
# Instance 1
curl http://localhost:5003/health

# Instance 2
curl http://localhost:5004/health

# Load balancer
curl https://notification.wellspring.edu.vn/health
```

### 3. Monitoring Script
```bash
# Chạy script monitoring
bash monitoring.sh
```

## Deployment

### 1. Deploy script
```bash
sudo chmod +x deploy.sh
sudo bash deploy.sh
```

### 2. Manual deployment
```bash
# Stop services
pm2 stop all

# Pull code mới
git pull origin main

# Install dependencies
npm install --production

# Start services
pm2 start ecosystem.config.js

# Save PM2 config
pm2 save
```

## Troubleshooting

### 1. Service không khởi động
```bash
# Kiểm tra logs
pm2 logs

# Kiểm tra config
pm2 show notification-service-1
pm2 show notification-service-2

# Restart service
pm2 restart notification-service-1
pm2 restart notification-service-2
```

### 2. Database connection issues
```bash
# Test database connection
mysql -h 172.16.20.130 -u frappe -p -D _8f4b2a4f8a7b3e1d

# Kiểm tra config.env
cat config.env | grep DB_
```

### 3. Redis connection issues
```bash
# Test Redis connection
redis-cli -h 172.16.20.120 -p 6379 -a breakpoint ping

# Kiểm tra Redis logs
sudo journalctl -u redis-server -f
```

### 4. Port conflicts
```bash
# Kiểm tra ports đang sử dụng
sudo netstat -tlnp | grep -E "(5003|5004)"

# Kill process nếu cần
sudo fuser -k 5003/tcp
sudo fuser -k 5004/tcp
```

## Security

### 1. Firewall
```bash
# Cấu hình UFW
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2. SSL/TLS
- Sử dụng Let's Encrypt certificates
- Cấu hình HSTS headers
- Disable weak ciphers

### 3. JWT Security
- Sử dụng strong JWT secret
- Set appropriate expiration time
- Validate tokens properly

## Backup & Recovery

### 1. Backup configuration
```bash
# Backup config files
cp config.env config.env.backup.$(date +%Y%m%d)
cp ecosystem.config.js ecosystem.config.js.backup.$(date +%Y%m%d)
```

### 2. Backup logs
```bash
# Backup PM2 logs
pm2 flush

# Backup application logs
tar -czf logs-backup-$(date +%Y%m%d).tar.gz logs/
```

### 3. Recovery
```bash
# Restore configuration
cp config.env.backup.* config.env

# Restart services
pm2 restart all
```

## Performance Tuning

### 1. Node.js optimization
- Set NODE_ENV=production
- Increase memory limit
- Use cluster mode

### 2. Redis optimization
- Configure maxmemory
- Set appropriate TTL
- Monitor memory usage

### 3. Database optimization
- Use connection pooling
- Optimize queries
- Monitor slow queries

## Logs

### 1. Application logs
- Location: `logs/` directory
- Rotation: PM2 handles log rotation
- Format: JSON with timestamps

### 2. System logs
```bash
# PM2 logs
pm2 logs

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# System logs
sudo journalctl -u nginx -f
```

## Support

- **Documentation**: Xem README.md
- **Issues**: Tạo issue trên repository
- **Monitoring**: Sử dụng monitoring.sh script
- **Health Check**: `/health` endpoint

## Changelog

### v1.0.0
- Initial release
- PM2 cluster mode support
- Redis pub/sub communication
- Socket.IO real-time notifications
- Cross-service communication
- Load balancing với Nginx 