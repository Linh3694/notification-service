#!/bin/bash

echo "======================================"
echo "🔧 FIX NOTIFICATION ISSUES"
echo "======================================"
echo ""

# 1. Fix duplicate notifications - scale to 1 instance
echo "1️⃣ Fixing duplicate notifications..."
pm2 scale notification-service 1
echo "✅ Scaled notification-service to 1 instance"
echo ""

# 2. Show running instances
echo "2️⃣ Verify running instances:"
pm2 list | grep notification-service
echo ""

# 3. Restart to apply changes
echo "3️⃣ Restarting notification-service..."
pm2 restart notification-service
echo ""

echo "✅ DONE!"
echo ""
echo "📝 Next steps:"
echo "   1. Test với: cd /srv/app/notification-service && node test-student-attendance.js"
echo "   2. Chỉ nên thấy 1 notification, không còn duplicate"

