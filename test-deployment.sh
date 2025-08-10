#!/bin/bash
# Test deployment script

echo "🧪 Testing SCORES Cup Tournament Application"
echo "============================================="

# Wait for services to be ready
echo "⏳ Waiting 30 seconds for services to initialize..."
sleep 30

echo "🔍 Testing backend API..."

# Test 1: Health check
echo "1. Health check:"
curl -s http://localhost:3002/ | grep -q "Tournament API" && echo "✅ API is running" || echo "❌ API not responding"

# Test 2: Database connection
echo "2. Database connection:"
curl -s http://localhost:3002/api/tournaments | grep -q "\[" && echo "✅ Database connected" || echo "❌ Database connection failed"

# Test 3: Frontend
echo "3. Frontend check:"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200" && echo "✅ Frontend is running" || echo "❌ Frontend not responding"

echo ""
echo "🎯 Application Status:"
echo "• Backend API: http://localhost:3002"
echo "• Frontend: http://localhost:3000"
echo "• Admin Panel: http://localhost:3000/admin (password: ScoresCup312)"
echo ""
echo "📋 To verify functionality:"
echo "1. Open http://localhost:3000 in your browser"
echo "2. Navigate to /admin and login with password: ScoresCup312"
echo "3. Create some teams and test the tournament features"
echo ""
echo "✨ Deployment test complete!"