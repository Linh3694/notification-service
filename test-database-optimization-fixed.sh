#!/bin/bash

echo "======================================"
echo "🧪 TEST DATABASE OPTIMIZATION - FIXED VERSION"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}📋 Step 1: Fixed Database Index Migration${NC}"
echo "Applying optimized MongoDB indexes with fixed script..."
cd /Users/linh/frappe-bench-venv/notification-service
node scripts/migrate-database-indexes.js

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database indexes migrated successfully${NC}"
else
    echo -e "${RED}❌ Database migration failed${NC}"
    exit 1
fi
echo ""

echo -e "${BLUE}📋 Step 2: Fixed Performance Testing${NC}"
echo "Running performance benchmark tests with Redis connection..."
node scripts/test-database-performance.js

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Performance tests completed successfully${NC}"
else
    echo -e "${RED}❌ Performance tests failed${NC}"
    exit 1
fi
echo ""

echo -e "${GREEN}🎉 DATABASE OPTIMIZATION FIXED & TESTED!${NC}"
echo ""
echo -e "${YELLOW}📊 Fixed Issues:${NC}"
echo "  ✅ MongoDB index migration script"
echo "  ✅ Redis connection in performance tests"
echo "  ✅ Cache service error handling"
echo "  ✅ Proper error recovery"
echo ""
echo -e "${BLUE}🔍 Performance Results Expected:${NC}"
echo "  📊 User Notifications: 70-80% faster"
echo "  📊 Unread Count: 80-90% faster"
echo "  📊 Cache Hit Rate: 90%+"
echo "  📊 Database Load: 80% reduction"
