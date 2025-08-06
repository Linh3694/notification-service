#!/bin/bash

# Notification Service Deployment Script
# Chạy với quyền sudo: sudo bash deploy.sh

set -e

echo "🚀 Bắt đầu deploy Notification Service..."

# Dừng các instances hiện tại
echo "🛑 Dừng các instances hiện tại..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# Pull code mới (nếu sử dụng git)
echo "📥 Pull code mới..."
git pull origin main 2>/dev/null || echo "⚠️ Không thể pull code, tiếp tục với code hiện tại"

# Cài đặt dependencies
echo "📦 Cài đặt dependencies..."
npm install --production

# Tạo thư mục logs nếu chưa có
mkdir -p logs

# Backup config.env cũ
if [ -f config.env ]; then
    echo "💾 Backup config.env..."
    cp config.env config.env.backup.$(date +%Y%m%d_%H%M%S)
fi

# Khởi động với PM2
echo "🚀 Khởi động với PM2..."
pm2 start ecosystem.config.js

# Lưu PM2 configuration
echo "💾 Lưu PM2 configuration..."
pm2 save

# Kiểm tra trạng thái
echo "🔍 Kiểm tra trạng thái..."
pm2 status

echo "✅ Deploy hoàn tất!"
echo ""
echo "📋 Lệnh hữu ích:"
echo "- pm2 status: Xem trạng thái"
echo "- pm2 logs: Xem logs"
echo "- pm2 monit: Monitor real-time"
echo "- pm2 restart all: Restart tất cả"
echo "- pm2 stop all: Dừng tất cả"
echo ""
echo "🌐 Health check:"
echo "- http://localhost:5003/health"
echo "- http://localhost:5004/health" 