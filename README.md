# 🏆 SCORES Cup Tournament App

A complete soccer tournament management application built for America SCORES Chicago, featuring both an admin control panel and a public display dashboard with real-time updates, smart scheduling, and comprehensive tournament management capabilities.

## Features

### 🏆 Display Panel (Public View)
- **Live Tournament Dashboard** - Real-time tournament overview with current standings
- **Recent Matches** - Latest completed games with scores and results
- **Top Teams** - Current standings with points, goals, and statistics
- **Announcements** - Important tournament updates and information
- **Upcoming Schedule** - Next games with times, fields, and matchups

### ⚙️ Admin Panel (Tournament Management)
- **Team Management** - Add, edit, and organize tournament teams
- **Pool/Group Management** - Create and manage tournament pools
- **Smart Scheduling** - Automated round-robin schedule generation
- **Results Entry** - Quick score entry and match result tracking
- **Playoff Management** - Automated bracket generation and management
- **Announcements** - Create and manage tournament communications
- **Settings** - Tournament configuration and customization

## Tech Stack

- **Frontend**: React 18, React Router, Lucide React icons
- **Backend**: Node.js, Express.js, PostgreSQL
- **Database**: PostgreSQL 15 with Docker
- **Styling**: Custom CSS with Chicago SCORES branding
- **Authentication**: Session-based admin authentication
- **Architecture**: REST API with real-time updates

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose (recommended)
- Node.js 18+ (for local development)
- Git

### 🐳 Docker Development (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd SCORE_Cup_App
   ```

2. **Start all services**
   ```bash
   docker-compose up --build
   ```

3. **Fix database collation (one-time setup)**
   ```bash
   bash fix-database-collation.sh
   ```

### 🛠️ Local Development

1. **Start database only**
   ```bash
   docker-compose up -d tournament_db
   ```

2. **Install and start backend**
   ```bash
   cd backend && npm install && npm start
   ```

3. **Install and start frontend**
   ```bash
   cd frontend && npm install && npm start
   ```

### 🌐 Access the Application

- **Public Display**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin  
- **Backend API**: http://localhost:3002
- **Health Check**: http://localhost:3002/health

### 🔐 Default Admin Access
- **Password**: `ScoresCup312`

### 🏥 Health Monitoring
The application includes comprehensive health checks:
- **Database**: PostgreSQL connection and readiness
- **Backend API**: Service health and memory usage
- **Frontend**: Application availability
- **Docker**: Container orchestration with health dependencies

Check container health status:
```bash
docker-compose ps
```

## Project Structure

```
SCORE_Cup_App/
├── frontend/                 # React frontend application
│   ├── public/              # Static assets and logos
│   ├── src/
│   │   ├── components/      # React components
│   │   │   ├── tabs/       # Admin panel tabs
│   │   │   └── common/     # Shared components
│   │   ├── styles/         # CSS stylesheets
│   │   └── utils/          # API utilities
├── backend/                 # Node.js/Express backend
│   ├── server.js           # Main server file
│   ├── package.json        # Backend dependencies
│   └── Dockerfile          # Backend container config
├── database-docker/         # Database configuration
│   ├── init.sql            # Database schema
│   └── Dockerfile          # Database container config
└── docker-compose.yml       # Multi-container setup
```

## Key Components

### Display Screen Components
- `DisplayScreen.js` - Main tournament dashboard matching the wireframe
- `AnnouncementsDisplay.js` - Tournament announcements and updates
- `Footer.js` - App footer with sponsor logos

### Admin Panel Components
- `AdminPanel.js` - Main admin interface with tabbed navigation
- `TeamsTab.js` - Team management interface
- `ScheduleTab.js` - Game scheduling and management
- `ResultsTab.js` - Score entry and results tracking
- `PlayoffsTab.js` - Tournament bracket management
- `SettingsTab.js` - Tournament configuration
- `AnnouncementsTab.js` - Announcement management

### Backend Features
- **Smart Scheduling Algorithm** - Automatic round-robin schedule generation
- **Tournament Statistics** - Real-time calculation of standings and stats
- **Session Management** - Secure admin authentication
- **Data Validation** - Comprehensive input validation and error handling
- **API Documentation** - RESTful API with clear endpoint structure

## Database Schema

The application uses a PostgreSQL database with the following main tables:
- `tournaments` - Tournament configuration and settings
- `teams` - Team information and statistics
- `pools` - Tournament pools/groups
- `games` - Match schedule and results
- `playoff_games` - Playoff bracket matches
- `announcements` - Tournament communications

## Configuration

### Tournament Settings
The admin panel allows configuration of:
- Tournament name, season, and team count
- Game duration and field setup
- Pool structure and team distribution
- Scheduling parameters (start/end times, breaks)

### Environment Variables
- `DB_HOST` - Database host (default: tournament_db)
- `DB_USER` - Database user (default: tournament_user)
- `DB_PASSWORD` - Database password (default: tournament_pass_2024)
- `ADMIN_PASSWORD` - Admin panel password (default: ScoresCup312)

## Features in Detail

### Smart Scheduling
- Automatic round-robin generation ensuring each team plays every other team
- Intelligent time slot allocation across multiple fields
- Configurable game duration and break times
- Schedule validation and conflict detection

### Real-time Updates
- Display screen refreshes every 30 seconds
- Live standings calculation based on match results
- Automatic playoff bracket advancement
- Dynamic tournament statistics

### Playoff System
- Automatic qualification based on pool standings
- 8-team elimination bracket with re-seeding
- Rematch avoidance in quarterfinals when possible
- Championship progression tracking

## 🚀 Production Deployment

### Production Build
```bash
# Build optimized Docker images
bash build-production.sh

# Deploy to production
docker-compose -f docker-compose.production.yml up -d
```

### Production Features
- **Multi-stage Docker builds** for minimal image size (~20MB frontend)
- **Nginx static file serving** with React Router support
- **Health checks** and automatic restarts
- **Persistent database volumes**
- **Security optimizations** (no source maps, minimal attack surface)

See [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive production deployment guide.

## 📚 API Documentation

### Core Endpoints

#### Tournaments
- `GET /api/tournaments` - List all tournaments
- `POST /api/tournaments` - Create new tournament
- `PUT /api/tournaments/:id` - Update tournament
- `DELETE /api/tournaments/:id` - Delete tournament

#### Teams
- `GET /api/tournaments/:id/teams` - Get tournament teams
- `POST /api/tournaments/:id/teams` - Add team to tournament
- `PUT /api/teams/:id` - Update team information
- `DELETE /api/teams/:id` - Remove team

#### Games & Schedule
- `GET /api/tournaments/:id/games` - Get tournament games
- `POST /api/tournaments/:id/games` - Create new game
- `PUT /api/games/:id/result` - Submit game result
- `POST /api/tournaments/:id/schedule` - Generate tournament schedule

#### Standings & Results
- `GET /api/tournaments/:id/standings` - Get tournament standings
- `GET /api/tournaments/:id/playoffs` - Get playoff bracket
- `POST /api/tournaments/:id/playoffs` - Generate playoff bracket

#### Health & Monitoring
- `GET /health` - Detailed health check with database status
- `GET /` - Basic API status

### Authentication
Admin endpoints require session authentication with password: `ScoresCup312`

## 📊 Logging & Monitoring

### Log Locations
- **Backend Logs**: `./backend/logs/`
  - `app.log` - Application events and API requests
  - `error.log` - Error tracking and debugging
- **Docker Logs**: `docker-compose logs -f [service]`

### Log Levels
- **INFO**: General application events
- **WARN**: Non-critical issues
- **ERROR**: Application errors and failures
- **DEBUG**: Development debugging (dev mode only)

### Monitoring Commands
```bash
# View real-time logs
docker-compose logs -f

# Check container resource usage
docker stats

# Database performance
docker-compose exec tournament_db psql -U tournament_user -d tournament_db -c "SELECT * FROM pg_stat_activity;"
```

## 🔧 Performance Optimizations

### Bundle Size Optimization
- Removed unused sponsor logos (~2MB saved)
- Optimized Docker images with multi-stage builds
- Webpack code splitting for admin/display routes
- Font optimization with local Lubalin Graph font

### Database Performance
- Indexed frequently queried fields
- Connection pooling for concurrent requests
- Health checks prevent cascade failures
- Optimized tournament calculations

### Frontend Performance
- React.memo() for expensive components
- API response caching for standings
- Lazy loading for admin components
- Optimized re-render cycles

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
   - Ensure Docker is running and the database container is started
   - Check that port 5432 is available
   - Verify database credentials in server.js

2. **Frontend/Backend Communication**
   - Confirm backend is running on port 3002
   - Check CORS settings in server.js
   - Verify API_URL in DisplayScreen.js

3. **Admin Panel Access**
   - Use password: `ScoresCup312`
   - Clear browser cookies if authentication issues persist
   - Check server logs for authentication errors

## Contributing

This application was built for America SCORES Chicago's tournament management needs. For modifications or enhancements:

1. Follow the existing code structure and naming conventions
2. Test both admin and display functionality
3. Ensure responsive design for various screen sizes
4. Maintain Chicago SCORES branding and color scheme

## License

Built for America SCORES Chicago - All rights reserved.

## Support

For technical support or questions about this tournament application, please refer to the code documentation and inline comments throughout the application files.

---

**America SCORES Chicago** - Building soccer skills, academic achievement, and leadership in underserved communities.