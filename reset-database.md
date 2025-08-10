# Database Reset Instructions

## Issue
The database is missing the `games` table and other recent schema updates, causing API calls to fail.

## Solution
Recreate the database with the updated schema:

### Option 1: Reset with Docker (Recommended)
```bash
# Stop the current containers
docker-compose down

# Remove the database volume to start fresh
docker volume rm score_cup_app_db_data

# Restart with fresh database
docker-compose up -d
```

### Option 2: Manual Database Reset
If you have direct access to PostgreSQL:

```sql
-- Connect to your database and run:
DROP TABLE IF EXISTS playoff_games CASCADE;
DROP TABLE IF EXISTS playoffs CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS pools CASCADE;
DROP TABLE IF EXISTS tournaments CASCADE;

-- Then run the complete init.sql file to recreate all tables
```

### Option 3: Add Missing Tables Only
If you want to keep existing data, you can add just the missing tables:

```sql
-- Add games table
CREATE TABLE games (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER DEFAULT 1,
    pool_id INTEGER REFERENCES pools(id) ON DELETE CASCADE,
    home_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    away_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    game_date DATE,
    field VARCHAR(100),
    game_type VARCHAR(50) DEFAULT 'pool',
    scheduled_start_time TIME,
    estimated_end_time TIME,
    home_score INTEGER,
    away_score INTEGER,
    status VARCHAR(50) DEFAULT 'scheduled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add playoff tables
CREATE TABLE playoffs (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round VARCHAR(50) NOT NULL,
    position INTEGER NOT NULL,
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    seed INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE playoff_games (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round VARCHAR(50) NOT NULL,
    position INTEGER NOT NULL,
    home_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    away_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    game_date DATE,
    field VARCHAR(100),
    scheduled_start_time TIME,
    estimated_end_time TIME,
    home_score INTEGER,
    away_score INTEGER,
    winner_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'scheduled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add settings column if it doesn't exist
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS settings TEXT;
```

## After Reset
1. Restart your frontend development server to pick up the new environment variable
2. Test the pool assignment functionality
3. Check the browser console for any remaining errors