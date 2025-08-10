-- SCORE Cup Tournament Database Setup
CREATE TABLE tournaments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    season VARCHAR(100),
    total_teams INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'setup',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pools (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER DEFAULT 1,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER DEFAULT 1,
    pool_id INTEGER REFERENCES pools(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    captain VARCHAR(255),
    contact_email VARCHAR(255),
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    ties INTEGER DEFAULT 0,
    goals_for INTEGER DEFAULT 0,
    goals_against INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE announcements (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) DEFAULT 'Tournament Admin'
);

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

-- Add settings column to tournaments table if it doesn't exist
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS settings TEXT;

INSERT INTO tournaments (name, season, total_teams, status) VALUES 
('SCORE Cup Tournament', '2024 Spring', 18, 'setup');

SELECT 'SCORE Cup database initialized successfully!' as status;