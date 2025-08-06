#!/bin/bash

# Notification Service Monitoring Script
# Chạy: bash monitoring.sh

echo "🔍 Notification Service Monitoring"
echo "=================================="

# Kiểm tra PM2 status
echo ""
echo "📊 PM2 Status:"
pm2 status

# Kiểm tra memory usage
echo ""
echo "💾 Memory Usage:"
pm2 monit --no-daemon --timeout 5

# Kiểm tra logs
echo ""
echo "📝 Recent Logs (last 20 lines):"
pm2 logs --lines 20

# Kiểm tra health endpoints
echo ""
echo "🏥 Health Check:"
echo "Instance 1 (Port 5003):"
curl -s http://localhost:5003/health | jq . 2>/dev/null || curl -s http://localhost:5003/health

echo ""
echo "Instance 2 (Port 5004):"
curl -s http://localhost:5004/health | jq . 2>/dev/null || curl -s http://localhost:5004/health

# Kiểm tra Redis connection
echo ""
echo "🔴 Redis Status:"
redis-cli ping 2>/dev/null && echo "✅ Redis connected" || echo "❌ Redis connection failed"

# Kiểm tra database connection
echo ""
echo "🗄️ Database Status:"
# Thêm logic kiểm tra database connection

# Kiểm tra ports
echo ""
echo "🔌 Port Status:"
netstat -tlnp | grep -E "(5003|5004)" || echo "❌ Ports not listening"

# Kiểm tra disk usage
echo ""
echo "💿 Disk Usage:"
df -h | grep -E "(/dev/|Filesystem)"

# Kiểm tra system resources
echo ""
echo "🖥️ System Resources:"
echo "CPU Usage:"
top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1

echo "Memory Usage:"
free -h | grep -E "(Mem|Swap)"

echo ""
echo "✅ Monitoring completed!" 