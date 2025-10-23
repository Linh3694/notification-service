#!/bin/bash

echo "======================================"
echo "📊 NOTIFICATION SERVICE - MEMORY MONITOR"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 Current Memory Usage:${NC}"
pm2 monit | grep -A 10 -B 5 notification-service || echo "Service not running"

echo ""
echo -e "${BLUE}📈 Detailed Memory Stats:${NC}"
pm2 jlist | jq -r '.[] | select(.name == "notification-service") | "\(.name): \(.monit.memory) MB used, \(.monit.cpu) % CPU"' 2>/dev/null || echo "jq not available, showing basic stats..."

echo ""
echo -e "${BLUE}💡 Memory Recommendations:${NC}"
echo "Current limit: 1.5GB (1536MB)"
echo ""
echo "Memory thresholds:"
echo "  🟢 Good: < 800MB"
echo "  🟡 Warning: 800-1200MB"
echo "  🔴 Critical: > 1200MB"
echo ""

echo -e "${BLUE}🛠️  Monitoring Commands:${NC}"
echo "  pm2 monit                    # Real-time monitoring"
echo "  pm2 logs notification-service # Check logs for memory issues"
echo "  ./monitor-memory.sh          # Run this script"
echo ""

echo -e "${BLUE}🚨 If memory issues occur:${NC}"
echo "  1. Check for memory leaks: pm2 monit"
echo "  2. Restart service: pm2 restart notification-service"
echo "  3. Consider scaling: pm2 scale notification-service 2"
echo "  4. Increase limit: edit ecosystem.config.js"
echo ""

echo -e "${GREEN}✅ Memory monitoring completed${NC}"
