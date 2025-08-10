# Deployment Test Guide

## ✅ Quick Verification Test

After running `docker-compose up --build`, follow these steps to verify everything is working:

### 1. **Check Containers Status**
```bash
docker-compose ps
```
Expected: All 3 containers should be "Up" (tournament_db, tournament_backend, tournament_frontend)

### 2. **Test Basic API Connection**
```bash
curl http://localhost:3002/
```
Expected: JSON response with server status and endpoints list

### 3. **Check Database Connection**
```bash
curl http://localhost:3002/api/tournaments
```
Expected: JSON array (empty or with tournament data)

### 4. **Test Frontend Connection**
Open browser: `http://localhost:3000`
Expected: SCORES Cup Tournament application loads with navigation bar

### 5. **Test Admin Login**
1. Navigate to `http://localhost:3000/admin`
2. Enter password: `ScoresCup312`
3. Should see admin panel with tabs

### 6. **Check Enhanced Features**
Look at backend container logs:
```bash
docker logs tournament_backend
```

**If enhanced features loaded successfully, you'll see:**
```
✅ All enhanced dependencies available
🚀 Tournament API server running on port 3002
🔌 WebSocket server: ws://localhost:3002  
📊 Enhanced endpoints:
   • Statistics: /api/statistics/tournaments/:id/summary
   • Backups: /api/admin/backup
   • WebSocket: Real-time tournament updates
```

**If running in fallback mode, you'll see:**
```
⚠️  Missing enhanced dependencies: validator, ws
⚠️  Enhanced utilities not available, using fallbacks
🚀 Tournament API server running on port 3002
📊 Available endpoints:
   • Core API: /api/tournaments, /api/teams, /api/games
```

## 🔧 What Works in Both Modes

### ✅ **Core Features (Always Available)**
- Tournament creation and management
- Team registration and management
- Pool creation and management
- Game scheduling (round-robin)
- Score entry and results
- Standings calculation
- Playoff bracket generation
- Announcements system
- Admin authentication
- Display dashboard

### ✅ **Enhanced Features (If Dependencies Available)**
- Advanced tournament statistics
- Real-time WebSocket updates
- Comprehensive logging system
- Backup and restore functionality
- Enhanced form validation
- Performance monitoring
- Security logging

## 🚀 Expected Behavior

### **Scenario 1: Full Build (Enhanced Mode)**
If you run `docker-compose up --build` and Docker installs all dependencies correctly:
- All enhanced features will be available
- WebSocket server will start
- Advanced statistics endpoints will work
- Backup functionality will be enabled
- Comprehensive logging to files

### **Scenario 2: Fallback Mode**
If some enhanced dependencies are missing:
- Core tournament functionality still works perfectly
- Basic logging to console
- Enhanced endpoints return "503 Service Unavailable" 
- No WebSocket server (but frontend still works)
- Application remains fully functional for tournaments

## 🐛 Troubleshooting

### **Container Won't Start**
```bash
# Check logs
docker logs tournament_backend

# Common issues:
# 1. Port 3002 already in use
# 2. Database connection timeout
# 3. Missing environment variables
```

### **Database Connection Issues**
```bash
# Check database container
docker logs tournament_db

# Verify database is ready
curl http://localhost:3002/api/tournaments
```

### **Frontend Not Loading**
```bash
# Check frontend container
docker logs tournament_frontend

# Common issues:
# 1. Backend not ready yet (wait 30 seconds)
# 2. API_URL misconfiguration
# 3. Port 3000 already in use
```

### **Enhanced Features Not Available**
This is normal if dependencies aren't installed. The app will work with core features.

To enable enhanced features:
```bash
# Stop containers
docker-compose down

# Install dependencies manually
cd backend
npm install validator ws
cd ..

# Rebuild and restart
docker-compose up --build
```

## ✅ Success Criteria

**Minimum Success (Core Mode):**
- [ ] Frontend loads at http://localhost:3000
- [ ] Admin panel accessible with password `ScoresCup312`
- [ ] Can create teams and tournaments
- [ ] Can schedule games and enter scores
- [ ] Display screen shows tournament data

**Full Success (Enhanced Mode):**
- [ ] All minimum criteria met
- [ ] WebSocket server shows in logs
- [ ] Statistics endpoints respond with data
- [ ] Backup functionality available in admin panel
- [ ] Log files created in backend/logs/

## 🎯 Answer: Will `docker-compose up --build` work?

**YES** - The application will work correctly in both scenarios:

1. **If Docker successfully installs all dependencies** → Full enhanced mode with all features
2. **If some enhanced dependencies fail** → Fallback mode with core tournament functionality

The system is designed to gracefully degrade while maintaining all essential tournament management capabilities.