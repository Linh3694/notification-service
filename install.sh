#!/bin/bash

# Notification Service Installation Script for Ubuntu 24.04
# Chạy với quyền sudo: sudo bash install.sh

set -e

echo "🚀 Bắt đầu cài đặt Notification Service..."

# Cập nhật hệ thống
echo "📦 Cập nhật hệ thống..."
apt update && apt upgrade -y

# Cài đặt Node.js 18.x
echo "📦 Cài đặt Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Cài đặt PM2 globally
echo "📦 Cài đặt PM2..."
npm install -g pm2

# Cài đặt Redis (nếu chưa có)
echo "📦 Kiểm tra Redis..."
if ! command -v redis-server &> /dev/null; then
    echo "📦 Cài đặt Redis..."
    apt install -y redis-server
    systemctl enable redis-server
    systemctl start redis-server
else
    echo "✅ Redis đã được cài đặt"
fi

# Cài đặt MariaDB client (nếu cần)
echo "📦 Cài đặt MariaDB client..."
apt install -y mariadb-client

# Tạo thư mục logs
echo "📁 Tạo thư mục logs..."
mkdir -p logs

# Cài đặt dependencies
echo "📦 Cài đặt dependencies..."
npm install

# Tạo file config.env từ example
echo "⚙️ Tạo file config.env..."
if [ ! -f config.env ]; then
    cp config.env.example config.env
    echo "⚠️ Vui lòng chỉnh sửa file config.env với thông tin database và Redis"
fi

# Tạo systemd service cho PM2
echo "🔧 Tạo systemd service cho PM2..."
pm2 startup systemd

# Tạo thư mục cho logs
mkdir -p /var/log/notification-service

# Cấp quyền cho thư mục logs
chmod 755 logs
chmod 755 /var/log/notification-service

echo "✅ Cài đặt hoàn tất!"
echo ""
echo "📋 Hướng dẫn tiếp theo:"
echo "1. Chỉnh sửa file config.env với thông tin database và Redis"
echo "2. Chạy: pm2 start ecosystem.config.js"
echo "3. Chạy: pm2 save"
echo "4. Chạy: pm2 startup"
echo ""
echo "🔍 Kiểm tra trạng thái:"
echo "- pm2 status"
echo "- pm2 logs"
echo "- pm2 monit" 