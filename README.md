# SCORES Cup Tournament App

A complete soccer tournament management application built for America SCORES Chicago, featuring both an admin control panel and a public display dashboard.

![Tournament App](image%20(8).png)

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

## Quick Start

### Prerequisites
- Node.js (version 18+)
- Docker and Docker Compose
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd SCORE_Cup_App
   ```

2. **Set up the database**
   ```bash
   docker-compose up -d tournament_db
   ```

3. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

4. **Install frontend dependencies**
   ```bash
   cd ../frontend
   npm install
   ```

5. **Start the backend server**
   ```bash
   cd ../backend
   npm start
   ```

6. **Start the frontend development server**
   ```bash
   cd ../frontend
   npm start
   ```

### Access the Application

- **Public Display**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin
- **Backend API**: http://localhost:3002

### Default Admin Access
- **Password**: `ScoresCup312`

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