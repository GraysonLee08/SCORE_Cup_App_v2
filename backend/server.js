// backend/server.js - Complete Enhanced Tournament API with Smart Scheduling
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const session = require("express-session");

// Import utilities with fallback handling
let logger, Validator, ValidationError, DatabaseUtils, ResponseHandler, TournamentStatistics;
try {
  logger = require('./utils/logger');
  ({ Validator, ValidationError } = require('./utils/validation'));
  ({ DatabaseUtils, ResponseHandler } = require('./utils/database'));
  TournamentStatistics = require('./utils/statistics');
} catch (error) {
  console.warn('⚠️  Enhanced utilities not available, using fallbacks');
  // Fallback logger
  logger = {
    info: (msg, ctx) => console.log(`ℹ️  ${msg}`, ctx || ''),
    warn: (msg, ctx) => console.warn(`⚠️  ${msg}`, ctx || ''),
    error: (msg, err, ctx) => console.error(`❌ ${msg}`, err?.message || err || '', ctx || ''),
    debug: (msg, ctx) => console.debug(`🐛 ${msg}`, ctx || ''),
    tournament: (msg, ctx) => console.log(`🏆 ${msg}`, ctx || ''),
    security: (msg, ctx) => console.log(`🔒 ${msg}`, ctx || ''),
    performance: (msg, duration, ctx) => console.log(`⚡ ${msg} (${duration}ms)`, ctx || '')
  };
  // Fallback response handler
  ResponseHandler = {
    success: (data, message) => ({ success: true, message, data }),
    error: (message) => ({ success: false, error: message }),
    notFound: (resource) => ({ success: false, error: `${resource} not found` })
  };
}

const app = express();
const PORT = 3002;

// Connect to database with retry logic
const db = new Pool({
  host: process.env.DB_HOST || "tournament_db",
  port: 5432,
  database: "tournament_db",
  user: "tournament_user",
  password: "tournament_pass_2024",
});

// Initialize utilities with fallbacks
let dbUtils, tournamentStats;
try {
  dbUtils = DatabaseUtils ? new DatabaseUtils(db) : null;
  tournamentStats = TournamentStatistics ? new TournamentStatistics(db) : null;
} catch (error) {
  console.warn('⚠️  Database utilities not available, using basic functionality');
  dbUtils = null;
  tournamentStats = null;
}

// Test database connection
db.connect()
  .then(() => logger.info("Database connected successfully"))
  .catch((err) => logger.error("Database connection failed", err));

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Session configuration
app.use(session({
  secret: 'tournament-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Admin password
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ScoresCup312";

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    return next();
  } else {
    return res.status(401).json({ error: 'Authentication required' });
  }
};

// Health check route
app.get("/", (req, res) => {
  res.json({
    status: "Tournament API is running!",
    timestamp: new Date().toISOString(),
    endpoints: [
      "/api/tournaments",
      "/api/teams",
      "/api/pools",
      "/api/games",
      "/api/standings",
      "/api/schedule",
      "/api/announcements",
    ],
  });
});

// Detailed health check route for Docker
app.get("/health", async (req, res) => {
  try {
    // Test database connection
    const dbResult = await db.query('SELECT 1 as healthy');
    const dbHealthy = dbResult.rows[0]?.healthy === 1;
    
    const health = {
      status: dbHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealthy ? "connected" : "disconnected",
        api: "running"
      },
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
    
    res.status(dbHealthy ? 200 : 503).json(health);
  } catch (error) {
    logger.error("Health check failed:", error);
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      services: {
        database: "error",
        api: "running"
      },
      error: error.message
    });
  }
});

// ========================================
// REQUEST LOGGING MIDDLEWARE
// ========================================

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;
  
  res.send = function(data) {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      responseSize: data ? data.length : 0
    });
    
    // Log slow requests
    if (duration > 1000) {
      logger.warn(`Slow request detected: ${req.method} ${req.path}`, {
        duration: `${duration}ms`,
        path: req.path
      });
    }
    
    return originalSend.call(this, data);
  };
  
  next();
});

// ========================================
// AUTHENTICATION ROUTES
// ========================================

// Admin login
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    console.log("✅ Admin logged in successfully");
    res.json({ success: true, message: "Login successful" });
  } else {
    console.log("❌ Failed admin login attempt");
    res.status(401).json({ error: "Invalid password" });
  }
});

// Check admin authentication status
app.get("/api/admin/check", (req, res) => {
  res.json({ 
    isAuthenticated: !!(req.session && req.session.isAdmin) 
  });
});

// Admin logout
app.post("/api/admin/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Could not logout" });
    }
    res.clearCookie('connect.sid');
    console.log("✅ Admin logged out");
    res.json({ success: true, message: "Logout successful" });
  });
});

// Tournament reset endpoint
app.post("/api/admin/reset-tournament", requireAuth, async (req, res) => {
  try {
    console.log("🔄 Resetting tournament...");
    
    // Delete all data in correct order (respecting foreign keys)
    await db.query("DELETE FROM playoff_games");
    await db.query("DELETE FROM games");
    await db.query("DELETE FROM announcements");
    await db.query("DELETE FROM teams");
    await db.query("DELETE FROM pools");
    
    // Reset auto-increment sequences
    await db.query("ALTER SEQUENCE teams_id_seq RESTART WITH 1");
    await db.query("ALTER SEQUENCE pools_id_seq RESTART WITH 1");
    await db.query("ALTER SEQUENCE games_id_seq RESTART WITH 1");
    await db.query("ALTER SEQUENCE playoff_games_id_seq RESTART WITH 1");
    await db.query("ALTER SEQUENCE announcements_id_seq RESTART WITH 1");
    
    console.log("✅ Tournament reset completed");
    res.json({ 
      success: true, 
      message: "Tournament reset successfully. All teams, games, and playoff data have been cleared." 
    });
    
  } catch (error) {
    console.error("❌ Error resetting tournament:", error);
    res.status(500).json({ error: "Failed to reset tournament: " + error.message });
  }
});

// ========================================
// TOURNAMENT ROUTES
// ========================================

app.get("/api/tournaments", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM tournaments ORDER BY created_at DESC"
    );
    console.log("✅ Tournaments fetched:", result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching tournaments:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/tournaments", async (req, res) => {
  try {
    const { name, season, total_teams, settings } = req.body;
    
    // Default settings if not provided
    const defaultSettings = {
      start_time: "09:00",
      end_time: "17:00",
      number_of_fields: 2,
      field_names: ["Field 1", "Field 2"],
      game_duration: 45,
      break_duration: 10,
      pool_settings: {
        numberOfPools: 4,
        teamsPerPool: 4,
        poolNames: ["Pool A", "Pool B", "Pool C", "Pool D"]
      }
    };
    
    const finalSettings = settings ? { ...defaultSettings, ...settings } : defaultSettings;
    
    const result = await db.query(
      "INSERT INTO tournaments (name, season, total_teams, settings) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, season, total_teams, JSON.stringify(finalSettings)]
    );
    console.log("✅ Tournament created:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error creating tournament:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/tournaments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, season, total_teams, status, settings } = req.body;
    
    let query, values;
    if (settings !== undefined) {
      query = "UPDATE tournaments SET name = $1, season = $2, total_teams = $3, status = $4, settings = $5 WHERE id = $6 RETURNING *";
      values = [name, season, total_teams, status, JSON.stringify(settings), id];
    } else {
      query = "UPDATE tournaments SET name = $1, season = $2, total_teams = $3, status = $4 WHERE id = $5 RETURNING *";
      values = [name, season, total_teams, status, id];
    }
    
    const result = await db.query(query, values);
    console.log("✅ Tournament updated:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error updating tournament:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// TEAM ROUTES
// ========================================

app.get("/api/teams", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT t.*, p.name as pool_name 
      FROM teams t 
      LEFT JOIN pools p ON t.pool_id = p.id 
      ORDER BY t.points DESC, t.name ASC
    `);
    console.log("✅ Teams fetched:", result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching teams:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/teams", async (req, res) => {
  try {
    const { name, captain, contact_email, pool_id, tournament_id } = req.body;
    console.log("📝 Adding team:", { name, captain, contact_email, pool_id });

    if (!name) {
      return res
        .status(400)
        .json({ error: "Team name is required" });
    }

    const result = await db.query(
      "INSERT INTO teams (name, captain, contact_email, pool_id, tournament_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [name, captain, contact_email, pool_id || null, tournament_id || 1]
    );

    console.log("✅ Team added successfully:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error adding team:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/teams/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log("🔄 Updating team", id, "with data:", updateData);

    // Build dynamic query based on what fields are provided
    const fields = [];
    const values = [];
    let valueIndex = 1;

    // Only update fields that are provided in the request
    if (updateData.name !== undefined) {
      fields.push(`name = $${valueIndex}`);
      values.push(updateData.name);
      valueIndex++;
    }

    if (updateData.captain !== undefined) {
      fields.push(`captain = $${valueIndex}`);
      values.push(updateData.captain);
      valueIndex++;
    }

    if (updateData.contact_email !== undefined) {
      fields.push(`contact_email = $${valueIndex}`);
      values.push(updateData.contact_email);
      valueIndex++;
    }

    if (updateData.pool_id !== undefined) {
      fields.push(`pool_id = $${valueIndex}`);
      values.push(updateData.pool_id === "" ? null : updateData.pool_id);
      valueIndex++;
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    // Add the team ID as the last parameter
    values.push(id);

    const query = `UPDATE teams SET ${fields.join(
      ", "
    )} WHERE id = $${valueIndex} RETURNING *`;

    console.log("📝 SQL Query:", query);
    console.log("📝 Values:", values);

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Team not found" });
    }

    console.log("✅ Team updated successfully:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error updating team:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/teams/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      "DELETE FROM teams WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Team not found" });
    }

    console.log("✅ Team deleted:", result.rows[0]);
    res.json({ message: "Team deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting team:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// POOL ROUTES
// ========================================

app.get("/api/tournaments/:tournamentId/pools", async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const result = await db.query(
      "SELECT * FROM pools WHERE tournament_id = $1 ORDER BY name",
      [tournamentId]
    );
    console.log("✅ Pools fetched:", result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching pools:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/tournaments/:tournamentId/pools/generate", async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { numberOfPools, teamsPerPool, poolNames } = req.body || {};
    
    const tournament = await db.query(
      "SELECT total_teams FROM tournaments WHERE id = $1",
      [tournamentId]
    );

    if (tournament.rows.length === 0) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    const totalTeams = tournament.rows[0].total_teams;
    
    // Use custom settings if provided, otherwise calculate optimal distribution
    let poolDistribution;
    if (numberOfPools && teamsPerPool) {
      poolDistribution = Array(numberOfPools).fill(teamsPerPool);
    } else {
      poolDistribution = calculatePoolDistribution(totalTeams);
    }

    console.log(
      "📊 Generating pools for",
      totalTeams,
      "teams:",
      poolDistribution
    );

    // Clear existing pools and unassign teams
    await db.query("UPDATE teams SET pool_id = NULL WHERE tournament_id = $1", [tournamentId]);
    await db.query("DELETE FROM pools WHERE tournament_id = $1", [tournamentId]);

    // Create new pools
    const pools = [];
    for (let i = 0; i < poolDistribution.length; i++) {
      let poolName;
      if (poolNames && poolNames[i] && poolNames[i].trim()) {
        poolName = poolNames[i].trim();
      } else {
        const defaultLetter = String.fromCharCode(65 + i); // A, B, C, D...
        poolName = `Pool ${defaultLetter}`;
      }
      
      const result = await db.query(
        "INSERT INTO pools (tournament_id, name) VALUES ($1, $2) RETURNING *",
        [tournamentId, poolName]
      );
      pools.push(result.rows[0]);
    }

    console.log("✅ Generated", pools.length, "pools with names:", pools.map(p => p.name));
    res.json(pools);
  } catch (error) {
    console.error("❌ Error generating pools:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create individual pool
app.post("/api/tournaments/:tournamentId/pools", async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { name } = req.body;
    
    const result = await db.query(
      "INSERT INTO pools (tournament_id, name) VALUES ($1, $2) RETURNING *",
      [tournamentId, name]
    );
    
    console.log("✅ Pool created:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error creating pool:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update pool
app.put("/api/pools/:poolId", async (req, res) => {
  try {
    const { poolId } = req.params;
    const { name } = req.body;
    
    const result = await db.query(
      "UPDATE pools SET name = $1 WHERE id = $2 RETURNING *",
      [name, poolId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Pool not found" });
    }
    
    console.log("✅ Pool updated:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error updating pool:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete pool
app.delete("/api/pools/:poolId", async (req, res) => {
  try {
    const { poolId } = req.params;
    
    // First, unassign teams from this pool
    await db.query("UPDATE teams SET pool_id = NULL WHERE pool_id = $1", [poolId]);
    
    // Delete games for this pool
    await db.query("DELETE FROM games WHERE pool_id = $1", [poolId]);
    
    // Delete the pool
    const result = await db.query("DELETE FROM pools WHERE id = $1 RETURNING *", [poolId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Pool not found" });
    }
    
    console.log("✅ Pool deleted:", result.rows[0]);
    res.json({ message: "Pool deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting pool:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// SMART SCHEDULING ROUTES
// ========================================

app.post("/api/pools/:poolId/schedule-with-settings", async (req, res) => {
  try {
    const { poolId } = req.params;
    const scheduleSettings = req.body;

    console.log(
      "📅 Generating schedule with custom settings:",
      scheduleSettings
    );

    // Get teams in this pool
    const teamsResult = await db.query(
      "SELECT * FROM teams WHERE pool_id = $1 ORDER BY name",
      [poolId]
    );
    const teams = teamsResult.rows;

    if (teams.length < 2) {
      return res
        .status(400)
        .json({ error: "Need at least 2 teams to generate schedule" });
    }

    // Get pool info
    const poolResult = await db.query("SELECT * FROM pools WHERE id = $1", [
      poolId,
    ]);
    const pool = poolResult.rows[0];

    console.log(
      "📅 Generating intelligent schedule for",
      pool.name,
      "with",
      teams.length,
      "teams"
    );

    // Clear existing games
    await db.query("DELETE FROM games WHERE pool_id = $1", [poolId]);

    // Generate ALL round-robin matchups (every team plays every other team once)
    const matchups = [];
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        matchups.push({
          home_team: teams[i],
          away_team: teams[j],
          home_team_id: teams[i].id,
          away_team_id: teams[j].id,
        });
      }
    }

    console.log(
      "🎮 Generated",
      matchups.length,
      "total matchups for",
      pool.name
    );
    console.log(
      "📊 Expected games for",
      teams.length,
      "teams:",
      (teams.length * (teams.length - 1)) / 2
    );

    // Verify we have the correct number of games
    const expectedGames = (teams.length * (teams.length - 1)) / 2;
    if (matchups.length !== expectedGames) {
      console.error("❌ Incorrect number of matchups generated!");
      return res.status(500).json({
        error: `Expected ${expectedGames} games for ${teams.length} teams, but generated ${matchups.length}`,
      });
    }

    // Verify round-robin completeness
    const isValidSchedule = verifyRoundRobinSchedule(teams, matchups);
    if (!isValidSchedule) {
      return res
        .status(500)
        .json({ error: "Generated schedule is not a valid round-robin" });
    }

    // Log the complete schedule breakdown
    logScheduleBreakdown(teams, matchups);

    // Generate smart schedule
    const scheduledGames = generateSmartSchedule(matchups, scheduleSettings);

    // Save to database
    const games = [];
    console.log(`\n💾 SAVING ${scheduledGames.length} GAMES TO DATABASE:`);
    for (let i = 0; i < scheduledGames.length; i++) {
      const scheduledGame = scheduledGames[i];
      console.log(`   Game ${i + 1}: Teams ${scheduledGame.home_team_id} vs ${scheduledGame.away_team_id} - ${scheduledGame.start_time} to ${scheduledGame.end_time} on ${scheduledGame.field}`);
      
      const result = await db.query(
        `
        INSERT INTO games (
          tournament_id, pool_id, home_team_id, away_team_id, 
          game_date, field, game_type, scheduled_start_time, estimated_end_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
      `,
        [
          pool.tournament_id,
          poolId,
          scheduledGame.home_team_id,
          scheduledGame.away_team_id,
          scheduledGame.game_date,
          scheduledGame.field,
          "pool",
          scheduledGame.start_time,
          scheduledGame.end_time,
        ]
      );
      
      const savedGame = result.rows[0];
      console.log(`   ✅ Saved as: ${savedGame.scheduled_start_time} to ${savedGame.estimated_end_time} on ${savedGame.field}`);
      games.push(savedGame);
    }

    console.log(
      "✅ Generated",
      games.length,
      "complete round-robin games for",
      pool.name
    );

    // Verify each team plays the correct number of games
    const teamGameCounts = {};
    games.forEach((game) => {
      teamGameCounts[game.home_team_id] =
        (teamGameCounts[game.home_team_id] || 0) + 1;
      teamGameCounts[game.away_team_id] =
        (teamGameCounts[game.away_team_id] || 0) + 1;
    });

    console.log("📊 Games per team:", teamGameCounts);

    res.json({
      games,
      schedule_summary: {
        total_games: games.length,
        expected_games: expectedGames,
        games_per_team: teams.length - 1,
        earliest_start: scheduledGames[0]?.start_time,
        latest_end: scheduledGames[scheduledGames.length - 1]?.end_time,
        fields_used: [...new Set(scheduledGames.map((g) => g.field))],
        team_game_counts: teamGameCounts,
      },
    });
  } catch (error) {
    console.error("❌ Error generating schedule with settings:", error);
    res.status(500).json({ error: error.message });
  }
});

// Legacy schedule endpoint (for backwards compatibility)
app.post("/api/pools/:poolId/schedule", async (req, res) => {
  try {
    const { poolId } = req.params;

    // Use default settings for legacy calls
    const defaultSettings = {
      tournament_date: new Date().toISOString().split("T")[0],
      start_time: "09:00",
      number_of_fields: 2,
      field_names: ["Field 1", "Field 2"],
      game_duration: 45,
      break_duration: 10,
    };

    // Forward to the enhanced endpoint
    req.body = defaultSettings;
    return app._router.handle(
      {
        ...req,
        url: `/api/pools/${poolId}/schedule-with-settings`,
        method: "POST",
      },
      res
    );
  } catch (error) {
    console.error("❌ Error with legacy schedule endpoint:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// GAME ROUTES
// ========================================

app.get("/api/tournaments/:tournamentId/games", async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const result = await db.query(
      `
      SELECT g.*, 
             ht.name as home_team_name, 
             at.name as away_team_name,
             p.name as pool_name
      FROM games g
      JOIN teams ht ON g.home_team_id = ht.id
      JOIN teams at ON g.away_team_id = at.id
      LEFT JOIN pools p ON g.pool_id = p.id
      WHERE g.tournament_id = $1
      ORDER BY g.game_date ASC, g.scheduled_start_time ASC NULLS LAST, g.created_at ASC
    `,
      [tournamentId]
    );

    console.log("✅ Games fetched:", result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching games:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new game manually
app.post("/api/games", async (req, res) => {
  try {
    const { home_team_id, away_team_id, field, scheduled_start_time, status = 'scheduled' } = req.body;
    
    console.log("🆕 Creating new game:", {
      home_team_id,
      away_team_id,
      field,
      scheduled_start_time,
      status
    });

    // Get tournament ID from the home team
    const teamResult = await db.query(
      "SELECT tournament_id FROM teams WHERE id = $1",
      [home_team_id]
    );
    
    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: "Home team not found" });
    }
    
    const tournament_id = teamResult.rows[0].tournament_id;
    
    // Calculate estimated end time
    let estimated_end_time = null;
    if (scheduled_start_time) {
      const startTime = new Date(`2024-01-01T${scheduled_start_time}`);
      const endTime = new Date(startTime.getTime() + 45 * 60000); // 45 minutes
      estimated_end_time = endTime.toTimeString().slice(0, 5);
    }

    // Insert the new game
    const result = await db.query(
      `INSERT INTO games (
        tournament_id, home_team_id, away_team_id, field, 
        scheduled_start_time, estimated_end_time, status, 
        game_date, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) 
      RETURNING *`,
      [
        tournament_id,
        home_team_id,
        away_team_id,
        field,
        scheduled_start_time,
        estimated_end_time,
        status,
        new Date().toISOString().split('T')[0] // today's date
      ]
    );

    console.log("✅ Game created successfully with ID:", result.rows[0].id);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error creating game:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/games/:gameId/result", async (req, res) => {
  try {
    const { gameId } = req.params;
    const { home_score, away_score } = req.body;

    console.log(
      "⚽ Recording result for game",
      gameId,
      ":",
      home_score,
      "-",
      away_score
    );

    const result = await db.query(
      "UPDATE games SET home_score = $1, away_score = $2, status = $3 WHERE id = $4 RETURNING *",
      [home_score, away_score, "completed", gameId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Game not found" });
    }

    // Update team statistics
    await updateTeamStats(result.rows[0].home_team_id);
    await updateTeamStats(result.rows[0].away_team_id);

    console.log("✅ Game result recorded and stats updated");
    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error recording game result:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/games/:gameId", async (req, res) => {
  try {
    const { gameId } = req.params;
    const { scheduled_start_time, field, game_date, home_team_id, away_team_id } = req.body;

    console.log("📅 Updating game for game", gameId, ":", {
      scheduled_start_time,
      field,
      game_date,
      home_team_id,
      away_team_id,
    });

    // Calculate estimated_end_time if scheduled_start_time is provided
    let estimated_end_time = null;
    if (scheduled_start_time) {
      // If it's a time string like "14:30", combine with game_date
      if (scheduled_start_time.includes(":") && !scheduled_start_time.includes("T")) {
        const date = game_date || new Date().toISOString().split("T")[0];
        const datetime = `${date}T${scheduled_start_time}:00`;
        const startTime = new Date(datetime);
        const endTime = new Date(startTime.getTime() + 45 * 60000);
        estimated_end_time = endTime.toTimeString().slice(0, 5); // HH:MM format
      } else {
        // Handle full datetime format
        const startTime = new Date(scheduled_start_time);
        const endTime = new Date(startTime.getTime() + 45 * 60000);
        estimated_end_time = endTime.toISOString();
      }
    }

    // Validate team assignments if provided
    if (home_team_id && away_team_id && home_team_id === away_team_id) {
      return res.status(400).json({ error: "Teams must be different" });
    }

    // Build dynamic update query based on provided fields
    const updates = [];
    const values = [];
    let paramCounter = 1;

    if (scheduled_start_time !== undefined) {
      updates.push(`scheduled_start_time = $${paramCounter++}`);
      values.push(scheduled_start_time);
      updates.push(`estimated_end_time = $${paramCounter++}`);
      values.push(estimated_end_time);
    }
    
    if (field !== undefined) {
      updates.push(`field = $${paramCounter++}`);
      values.push(field);
    }
    
    if (game_date !== undefined) {
      updates.push(`game_date = $${paramCounter++}`);
      values.push(game_date);
    }
    
    if (home_team_id !== undefined) {
      updates.push(`home_team_id = $${paramCounter++}`);
      values.push(home_team_id);
    }
    
    if (away_team_id !== undefined) {
      updates.push(`away_team_id = $${paramCounter++}`);
      values.push(away_team_id);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    values.push(gameId);
    const query = `UPDATE games SET ${updates.join(', ')} WHERE id = $${paramCounter} RETURNING *`;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Game not found" });
    }

    console.log("✅ Game updated successfully");
    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error updating game:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a game
app.delete("/api/games/:gameId", async (req, res) => {
  try {
    const { gameId } = req.params;
    
    console.log("🗑️ Deleting game:", gameId);

    const result = await db.query(
      "DELETE FROM games WHERE id = $1 RETURNING *",
      [gameId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Game not found" });
    }

    console.log("✅ Game deleted successfully");
    res.json({ message: "Game deleted successfully", game: result.rows[0] });
  } catch (error) {
    console.error("❌ Error deleting game:", error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk update multiple games at once (for admin scheduling)
app.put("/api/games/bulk-schedule", async (req, res) => {
  try {
    const { games } = req.body; // Array of { id, scheduled_start_time, field, game_date }

    if (!games || !Array.isArray(games)) {
      return res.status(400).json({ error: "Games array is required" });
    }

    console.log(`📅 Bulk updating ${games.length} game schedules`);

    const updatedGames = [];
    
    for (const gameUpdate of games) {
      const { id, scheduled_start_time, field, game_date } = gameUpdate;
      
      // Calculate estimated_end_time
      let estimated_end_time = null;
      if (scheduled_start_time) {
        if (scheduled_start_time.includes(":") && !scheduled_start_time.includes("T")) {
          const date = game_date || new Date().toISOString().split("T")[0];
          const datetime = `${date}T${scheduled_start_time}:00`;
          const startTime = new Date(datetime);
          const endTime = new Date(startTime.getTime() + 45 * 60000);
          estimated_end_time = endTime.toTimeString().slice(0, 5);
        }
      }

      const result = await db.query(
        "UPDATE games SET scheduled_start_time = $1, estimated_end_time = $2, field = $3, game_date = COALESCE($4, game_date) WHERE id = $5 RETURNING *",
        [scheduled_start_time, estimated_end_time, field, game_date, id]
      );

      if (result.rows.length > 0) {
        updatedGames.push(result.rows[0]);
      }
    }

    console.log(`✅ Successfully updated ${updatedGames.length} games`);
    res.json({
      message: `Updated ${updatedGames.length} games`,
      updated_games: updatedGames,
    });
  } catch (error) {
    console.error("❌ Error bulk updating game schedules:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get available time slots for a field on a given date
app.get("/api/tournaments/:tournamentId/available-slots", async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { date, field } = req.query;

    if (!date) {
      return res.status(400).json({ error: "Date parameter is required" });
    }

    // Get tournament settings for time constraints
    const tournament = await db.query(
      "SELECT settings FROM tournaments WHERE id = $1",
      [tournamentId]
    );

    if (tournament.rows.length === 0) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    const settings = tournament.rows[0].settings || {};
    const startTime = settings.start_time || "09:00";
    const endTime = settings.end_time || "17:00";
    const gameDuration = settings.game_duration || 45;
    const breakDuration = settings.break_duration || 10;
    const slotDuration = gameDuration + breakDuration;

    // Get existing games for this field and date
    let whereClause = "g.tournament_id = $1 AND g.game_date = $2";
    let params = [tournamentId, date];
    
    if (field) {
      whereClause += " AND g.field = $3";
      params.push(field);
    }

    const existingGames = await db.query(
      `SELECT g.*, ht.name as home_team_name, at.name as away_team_name
       FROM games g
       JOIN teams ht ON g.home_team_id = ht.id
       JOIN teams at ON g.away_team_id = at.id
       WHERE ${whereClause}
       ORDER BY g.scheduled_start_time`,
      params
    );

    // Generate available time slots
    const slots = [];
    let currentTime = startTime;

    while (timeToMinutes(currentTime) + gameDuration <= timeToMinutes(endTime)) {
      const slotEnd = addMinutes(currentTime, gameDuration);
      
      // Check if this slot conflicts with existing games
      const hasConflict = existingGames.rows.some(game => {
        if (!game.scheduled_start_time) return false;
        
        const gameStart = game.scheduled_start_time;
        const gameEnd = game.estimated_end_time || addMinutes(gameStart, gameDuration);
        
        return (timeToMinutes(currentTime) < timeToMinutes(gameEnd) && 
                timeToMinutes(slotEnd) > timeToMinutes(gameStart));
      });

      slots.push({
        start_time: currentTime,
        end_time: slotEnd,
        available: !hasConflict,
        duration_minutes: gameDuration,
      });

      currentTime = addMinutes(currentTime, slotDuration);
    }

    res.json({
      date,
      field: field || "all fields",
      available_slots: slots,
      existing_games: existingGames.rows,
      tournament_settings: {
        start_time: startTime,
        end_time: endTime,
        game_duration: gameDuration,
        break_duration: breakDuration,
      },
    });
  } catch (error) {
    console.error("❌ Error getting available slots:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// MANUAL SCHEDULE GRID ROUTES
// ========================================

// Get the complete schedule grid (10 windows x 4 fields)
app.get("/api/tournaments/:tournamentId/schedule-grid", async (req, res) => {
  try {
    const { tournamentId } = req.params;
    
    // Get tournament settings for field names
    const tournament = await db.query(
      "SELECT settings FROM tournaments WHERE id = $1",
      [tournamentId]
    );

    if (tournament.rows.length === 0) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    const settings = tournament.rows[0].settings || {};
    const fieldNames = settings.field_names || ["Field 1", "Field 2", "Field 3", "Field 4"];
    
    // Initialize empty 10x4 grid structure
    const scheduleGrid = {};
    for (let window = 1; window <= 10; window++) {
      scheduleGrid[window] = {};
      fieldNames.forEach((fieldName, index) => {
        scheduleGrid[window][fieldName] = {
          team1: null,
          team2: null,
          team1_name: "",
          team2_name: "",
          game_id: null,
          window_type: window <= 7 ? "pool_play" : "playoffs"
        };
      });
    }

    // Get all existing games and populate the grid
    const games = await db.query(`
      SELECT g.*, 
             ht.name as home_team_name, 
             at.name as away_team_name,
             g.scheduled_start_time,
             g.field
      FROM games g
      LEFT JOIN teams ht ON g.home_team_id = ht.id
      LEFT JOIN teams at ON g.away_team_id = at.id
      WHERE g.tournament_id = $1
      ORDER BY g.scheduled_start_time, g.field
    `, [tournamentId]);

    // Populate grid with existing games (this is a simplified mapping)
    // For now, we'll use time slots to determine windows
    let windowCounter = 1;
    const timeSlots = {};
    
    games.rows.forEach(game => {
      if (game.scheduled_start_time && game.field) {
        const timeKey = game.scheduled_start_time;
        if (!timeSlots[timeKey]) {
          timeSlots[timeKey] = windowCounter++;
        }
        const windowNum = timeSlots[timeKey];
        
        if (windowNum <= 10 && scheduleGrid[windowNum] && scheduleGrid[windowNum][game.field]) {
          scheduleGrid[windowNum][game.field] = {
            team1: game.home_team_id,
            team2: game.away_team_id,
            team1_name: game.home_team_name || "",
            team2_name: game.away_team_name || "",
            game_id: game.id,
            window_type: windowNum <= 7 ? "pool_play" : "playoffs"
          };
        }
      }
    });

    res.json({
      schedule_grid: scheduleGrid,
      field_names: fieldNames,
      window_types: {
        1: "Pool Play", 2: "Pool Play", 3: "Pool Play", 4: "Pool Play",
        5: "Pool Play", 6: "Pool Play", 7: "Pool Play",
        8: "Quarterfinals", 9: "Semifinals", 10: "Finals"
      }
    });
  } catch (error) {
    console.error("❌ Error fetching schedule grid:", error);
    res.status(500).json({ error: error.message });
  }
});

// Assign teams to a specific window/field slot
app.post("/api/tournaments/:tournamentId/schedule-grid/assign", async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { window, field, team1_id, team2_id } = req.body;

    console.log(`🎯 Assigning game - Window ${window}, Field: ${field}, Teams: ${team1_id} vs ${team2_id}`);

    if (team1_id === team2_id) {
      return res.status(400).json({ error: "Teams must be different" });
    }

    // Calculate time slot based on window number
    const baseStartTime = "09:00";
    const gameDuration = 75; // 45 min game + 30 min buffer
    const windowStartTime = addMinutes(baseStartTime, (window - 1) * gameDuration);

    // Check if game already exists for this window/field
    const existingGame = await db.query(`
      SELECT id FROM games 
      WHERE tournament_id = $1 AND field = $2 
      AND scheduled_start_time = $3
    `, [tournamentId, field, windowStartTime]);

    let gameId;
    if (existingGame.rows.length > 0) {
      // Update existing game
      const result = await db.query(`
        UPDATE games 
        SET home_team_id = $1, away_team_id = $2
        WHERE id = $3
        RETURNING *
      `, [team1_id, team2_id, existingGame.rows[0].id]);
      gameId = result.rows[0].id;
    } else {
      // Create new game
      const result = await db.query(`
        INSERT INTO games (tournament_id, home_team_id, away_team_id, field, scheduled_start_time, game_date, status)
        VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'scheduled')
        RETURNING *
      `, [tournamentId, team1_id, team2_id, field, windowStartTime]);
      gameId = result.rows[0].id;
    }

    console.log("✅ Game assigned successfully, ID:", gameId);
    res.json({ success: true, game_id: gameId });
  } catch (error) {
    console.error("❌ Error assigning game:", error);
    res.status(500).json({ error: error.message });
  }
});

// Clear a specific window/field slot
app.delete("/api/tournaments/:tournamentId/schedule-grid/:window/:field", async (req, res) => {
  try {
    const { tournamentId, window, field } = req.params;

    console.log(`🗑️ Clearing game - Window ${window}, Field: ${field}`);

    // Calculate time slot based on window number
    const baseStartTime = "09:00";
    const gameDuration = 75;
    const windowStartTime = addMinutes(baseStartTime, (parseInt(window) - 1) * gameDuration);

    // Delete the game for this window/field
    const result = await db.query(`
      DELETE FROM games 
      WHERE tournament_id = $1 AND field = $2 AND scheduled_start_time = $3
      RETURNING id
    `, [tournamentId, field, windowStartTime]);

    console.log("✅ Game cleared successfully");
    res.json({ success: true, deleted_games: result.rows.length });
  } catch (error) {
    console.error("❌ Error clearing game:", error);
    res.status(500).json({ error: error.message });
  }
});

// Validate the entire schedule
app.get("/api/tournaments/:tournamentId/schedule-grid/validate", async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const errors = [];

    // Get all teams
    const teams = await db.query("SELECT id, name FROM teams WHERE tournament_id = $1", [tournamentId]);
    const teamCounts = {};
    teams.rows.forEach(team => {
      teamCounts[team.id] = { name: team.name, pool_games: 0, total_games: 0 };
    });

    // Get all pool play games (windows 1-7)
    const poolGames = await db.query(`
      SELECT home_team_id, away_team_id, scheduled_start_time
      FROM games 
      WHERE tournament_id = $1 
      AND scheduled_start_time >= '09:00' 
      AND scheduled_start_time < '15:00'
    `, [tournamentId]);

    // Count pool games for each team
    poolGames.rows.forEach(game => {
      if (teamCounts[game.home_team_id]) teamCounts[game.home_team_id].pool_games++;
      if (teamCounts[game.away_team_id]) teamCounts[game.away_team_id].pool_games++;
    });

    // Check that each team plays exactly 2 pool games
    Object.values(teamCounts).forEach(teamData => {
      if (teamData.pool_games !== 2) {
        errors.push(`Team "${teamData.name}" has ${teamData.pool_games} pool games (should be exactly 2)`);
      }
    });

    // Check for conflicts (same team playing multiple games in same window)
    const windowGames = {};
    poolGames.rows.forEach(game => {
      const timeKey = game.scheduled_start_time;
      if (!windowGames[timeKey]) windowGames[timeKey] = [];
      windowGames[timeKey].push(game.home_team_id, game.away_team_id);
    });

    Object.entries(windowGames).forEach(([timeKey, teamIds]) => {
      const uniqueTeams = new Set(teamIds);
      if (uniqueTeams.size !== teamIds.length) {
        errors.push(`Window conflict at ${timeKey}: Some teams are playing multiple games simultaneously`);
      }
    });

    res.json({
      valid: errors.length === 0,
      errors: errors,
      team_stats: teamCounts
    });
  } catch (error) {
    console.error("❌ Error validating schedule:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// STANDINGS ROUTES
// ========================================

app.get("/api/tournaments/:tournamentId/standings", async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const result = await db.query(
      `
      SELECT t.*, p.name as pool_name,
             CASE 
               WHEN t.games_played > 0 THEN ROUND(t.points::decimal / t.games_played, 2)
               ELSE 0 
             END as points_per_game,
             (t.goals_for - t.goals_against) as goal_differential
      FROM teams t
      LEFT JOIN pools p ON t.pool_id = p.id
      WHERE t.tournament_id = $1
      ORDER BY p.name, t.points DESC, goal_differential DESC, t.goals_for DESC
    `,
      [tournamentId]
    );

    console.log("✅ Standings fetched for", result.rows.length, "teams");
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching standings:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// SMART SCHEDULING ALGORITHM
// ========================================

function generateSmartSchedule(matchups, settings) {
  const {
    tournament_date,
    start_time,
    number_of_fields,
    field_names,
    game_duration,
    break_duration,
    min_games_per_team,
  } = settings;

  console.log("🧠 Smart scheduling with settings:", settings);

  // Validate settings
  if (!start_time || !number_of_fields || !game_duration || !break_duration) {
    console.error("❌ Missing required settings for scheduling");
    return [];
  }

  const gameSlotDuration = game_duration + break_duration;
  const startTimeMinutes = timeToMinutes(start_time);
  
  console.log(`⚽ TIME WINDOW SCHEDULING:`);
  console.log(`   ${matchups.length} total games to schedule`);
  console.log(`   ${number_of_fields} fields available`);
  console.log(`   ${gameSlotDuration} minutes per time slot`);
  console.log(`   ${min_games_per_team || 3} minimum games per team`);

  // Group games into time windows - each window uses ALL fields
  const timeWindows = [];
  let currentWindowGames = [];
  
  for (let i = 0; i < matchups.length; i++) {
    currentWindowGames.push(matchups[i]);
    
    // When we have enough games to fill all fields, or we're at the end
    if (currentWindowGames.length === number_of_fields || i === matchups.length - 1) {
      timeWindows.push([...currentWindowGames]);
      currentWindowGames = [];
    }
  }

  console.log(`\n🕐 CREATED ${timeWindows.length} TIME WINDOWS:`);
  timeWindows.forEach((window, index) => {
    console.log(`   Window ${index + 1}: ${window.length} games (${window.length === number_of_fields ? 'FULL' : 'PARTIAL'})`);
  });

  // Schedule each time window
  const scheduledGames = [];
  let currentTimeMinutes = startTimeMinutes;

  timeWindows.forEach((windowGames, windowIndex) => {
    const windowStartTime = minutesToTime(currentTimeMinutes);
    const windowEndTime = minutesToTime(currentTimeMinutes + game_duration);
    
    console.log(`\n📅 SCHEDULING WINDOW ${windowIndex + 1} at ${windowStartTime}-${windowEndTime}:`);
    
    // Assign games to fields in this time window
    windowGames.forEach((matchup, gameIndexInWindow) => {
      const fieldIndex = gameIndexInWindow % number_of_fields;
      const fieldName = field_names[fieldIndex] || `Field ${fieldIndex + 1}`;
      
      const scheduledGame = {
        home_team_id: matchup.home_team_id,
        away_team_id: matchup.away_team_id,
        game_date: tournament_date,
        field: fieldName,
        start_time: windowStartTime,
        end_time: windowEndTime,
      };

      scheduledGames.push(scheduledGame);
      
      console.log(`   ${fieldName}: Teams ${matchup.home_team_id} vs ${matchup.away_team_id}`);
    });

    // Move to next time window
    currentTimeMinutes += gameSlotDuration;
  });

  // Log final summary with time window analysis
  console.log(`\n📊 FINAL TIME WINDOW SUMMARY:`);
  const gamesByTimeWindow = {};
  scheduledGames.forEach(game => {
    if (!gamesByTimeWindow[game.start_time]) {
      gamesByTimeWindow[game.start_time] = [];
    }
    gamesByTimeWindow[game.start_time].push(`${game.field}: Teams ${game.home_team_id} vs ${game.away_team_id}`);
  });
  
  Object.keys(gamesByTimeWindow).sort().forEach((time, index) => {
    const games = gamesByTimeWindow[time];
    console.log(`Window ${index + 1} (${time}): ${games.length}/${number_of_fields} fields used`);
    games.forEach(game => console.log(`   ${game}`));
  });

  console.log(`\n🎯 SCHEDULING EFFICIENCY:`);
  console.log(`   Total games: ${scheduledGames.length}`);
  console.log(`   Time windows used: ${Object.keys(gamesByTimeWindow).length}`);
  console.log(`   Average games per window: ${(scheduledGames.length / Object.keys(gamesByTimeWindow).length).toFixed(1)}`);
  console.log(`   Field utilization: ${((scheduledGames.length / (Object.keys(gamesByTimeWindow).length * number_of_fields)) * 100).toFixed(1)}%`);

  return scheduledGames;
}

// ========================================
// ROUND-ROBIN VERIFICATION HELPERS
// ========================================

function verifyRoundRobinSchedule(teams, matchups) {
  console.log("🔍 Verifying round-robin schedule...");

  const teamCount = teams.length;
  const expectedGames = (teamCount * (teamCount - 1)) / 2;

  console.log(
    `📊 Teams: ${teamCount}, Expected games: ${expectedGames}, Generated: ${matchups.length}`
  );

  // Check total number of games
  if (matchups.length !== expectedGames) {
    console.error(
      `❌ Wrong number of games! Expected ${expectedGames}, got ${matchups.length}`
    );
    return false;
  }

  // Check that each team plays every other team exactly once
  const gameMatrix = {};
  teams.forEach((team) => {
    gameMatrix[team.id] = new Set();
  });

  matchups.forEach((matchup) => {
    const { home_team_id, away_team_id } = matchup;

    // Add opponents to each team's set
    gameMatrix[home_team_id].add(away_team_id);
    gameMatrix[away_team_id].add(home_team_id);
  });

  // Verify each team plays every other team
  let isValid = true;
  teams.forEach((team) => {
    const expectedOpponents = teamCount - 1; // Everyone except themselves
    const actualOpponents = gameMatrix[team.id].size;

    console.log(
      `👥 Team ${team.id} (${team.name}): plays ${actualOpponents}/${expectedOpponents} teams`
    );

    if (actualOpponents !== expectedOpponents) {
      console.error(
        `❌ Team ${team.id} should play ${expectedOpponents} games but only plays ${actualOpponents}`
      );
      isValid = false;
    }

    // Check that they play every other team
    teams.forEach((opponent) => {
      if (opponent.id !== team.id && !gameMatrix[team.id].has(opponent.id)) {
        console.error(
          `❌ Team ${team.id} (${team.name}) doesn't play Team ${opponent.id} (${opponent.name})`
        );
        isValid = false;
      }
    });
  });

  if (isValid) {
    console.log(
      "✅ Round-robin schedule is VALID - every team plays every other team exactly once"
    );
  } else {
    console.error(
      "❌ Round-robin schedule is INVALID - missing games detected"
    );
  }

  return isValid;
}

function logScheduleBreakdown(teams, matchups) {
  console.log("\n📋 COMPLETE ROUND-ROBIN SCHEDULE BREAKDOWN:");
  console.log("=".repeat(50));

  matchups.forEach((matchup, index) => {
    const homeTeam = teams.find((t) => t.id === matchup.home_team_id);
    const awayTeam = teams.find((t) => t.id === matchup.away_team_id);
    console.log(`Game ${index + 1}: ${homeTeam.name} vs ${awayTeam.name}`);
  });

  console.log("=".repeat(50));
  console.log(`✅ Total: ${matchups.length} games for ${teams.length} teams`);
  console.log(`📊 Each team plays ${teams.length - 1} games\n`);
}

// ========================================
// HELPER FUNCTIONS
// ========================================

// Time calculation helpers
function timeToMinutes(timeString) {
  const [hours, minutes] = timeString.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}`;
}

function addMinutes(timeString, minutesToAdd) {
  const totalMinutes = timeToMinutes(timeString) + minutesToAdd;
  return minutesToTime(totalMinutes);
}

function laterTime(time1, time2) {
  return timeToMinutes(time1) > timeToMinutes(time2) ? time1 : time2;
}

// Calculate optimal pool distribution
function calculatePoolDistribution(totalTeams) {
  const idealPoolSize = 4;
  const basePoolCount = Math.floor(totalTeams / idealPoolSize);
  const remainder = totalTeams % idealPoolSize;

  let distribution = [];

  if (remainder === 0) {
    // Perfect division by 4
    for (let i = 0; i < basePoolCount; i++) {
      distribution.push(idealPoolSize);
    }
  } else if (remainder === 1) {
    // One team left over - make one pool of 5
    for (let i = 0; i < basePoolCount - 1; i++) {
      distribution.push(4);
    }
    distribution.push(5);
  } else if (remainder === 2) {
    // Two teams left over - make two pools of 5
    for (let i = 0; i < basePoolCount - 1; i++) {
      distribution.push(4);
    }
    distribution.push(5);
    distribution.push(5);
  } else if (remainder === 3) {
    // Three teams left over - make three pools of 5
    for (let i = 0; i < basePoolCount; i++) {
      distribution.push(4);
    }
    distribution.push(5);
  }

  return distribution;
}

// Update team statistics based on game results
async function updateTeamStats(teamId) {
  try {
    const gamesResult = await db.query(
      `
      SELECT 
        COUNT(*) as games_played,
        SUM(CASE 
          WHEN (home_team_id = $1 AND home_score > away_score) OR 
               (away_team_id = $1 AND away_score > home_score) 
          THEN 1 ELSE 0 END) as wins,
        SUM(CASE 
          WHEN (home_team_id = $1 AND home_score < away_score) OR 
               (away_team_id = $1 AND away_score < home_score) 
          THEN 1 ELSE 0 END) as losses,
        SUM(CASE 
          WHEN home_score = away_score 
          THEN 1 ELSE 0 END) as ties,
        SUM(CASE 
          WHEN home_team_id = $1 THEN home_score 
          WHEN away_team_id = $1 THEN away_score 
          ELSE 0 END) as goals_for,
        SUM(CASE 
          WHEN home_team_id = $1 THEN away_score 
          WHEN away_team_id = $1 THEN home_score 
          ELSE 0 END) as goals_against
      FROM games 
      WHERE (home_team_id = $1 OR away_team_id = $1) AND status = 'completed'
    `,
      [teamId]
    );

    const stats = gamesResult.rows[0];
    const points = stats.wins * 3 + stats.ties * 1;

    await db.query(
      `
      UPDATE teams 
      SET wins = $1, losses = $2, ties = $3, goals_for = $4, goals_against = $5, 
          points = $6, games_played = $7
      WHERE id = $8
    `,
      [
        stats.wins || 0,
        stats.losses || 0,
        stats.ties || 0,
        stats.goals_for || 0,
        stats.goals_against || 0,
        points,
        stats.games_played || 0,
        teamId,
      ]
    );

    console.log("📊 Updated stats for team", teamId);
  } catch (error) {
    console.error("❌ Error updating team stats:", error);
  }
}

// ========================================
// ANNOUNCEMENT ROUTES
// ========================================

app.get("/api/tournaments/:tournamentId/announcements", async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const result = await db.query(
      "SELECT * FROM announcements WHERE tournament_id = $1 ORDER BY created_at DESC",
      [tournamentId]
    );
    console.log("✅ Announcements fetched:", result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching announcements:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/tournaments/:tournamentId/announcements", async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { title, message, created_by } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: "Title and message are required" });
    }

    const result = await db.query(
      "INSERT INTO announcements (tournament_id, title, message, created_by) VALUES ($1, $2, $3, $4) RETURNING *",
      [tournamentId, title, message, created_by || 'Tournament Admin']
    );

    console.log("✅ Announcement created:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error creating announcement:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/tournaments/:tournamentId/announcements/reset", async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const result = await db.query(
      "DELETE FROM announcements WHERE tournament_id = $1",
      [tournamentId]
    );

    console.log("✅ All announcements reset for tournament:", tournamentId);
    res.json({ message: `${result.rowCount} announcements deleted successfully` });
  } catch (error) {
    console.error("❌ Error resetting announcements:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/announcements/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      "DELETE FROM announcements WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    console.log("✅ Announcement deleted:", result.rows[0]);
    res.json({ message: "Announcement deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting announcement:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// PLAYOFF ROUTES 
// ========================================

// Get playoff bracket and qualification status
app.get("/api/tournaments/:tournamentId/playoffs", async (req, res) => {
  try {
    const { tournamentId } = req.params;

    // Get all teams with their pool rankings
    const poolStandings = await db.query(
      `
      SELECT t.*, p.name as pool_name, p.id as pool_id,
             ROW_NUMBER() OVER (
               PARTITION BY t.pool_id 
               ORDER BY t.points DESC, 
                        (t.goals_for - t.goals_against) DESC,
                        t.goals_for DESC,
                        t.goals_against ASC
             ) as pool_rank
      FROM teams t
      LEFT JOIN pools p ON t.pool_id = p.id
      WHERE t.tournament_id = $1 AND t.pool_id IS NOT NULL
      ORDER BY p.name, pool_rank
    `,
      [tournamentId]
    );

    // Get existing playoff bracket if any
    const playoffBracket = await db.query(
      "SELECT * FROM playoffs WHERE tournament_id = $1 ORDER BY round, position",
      [tournamentId]
    );

    // Get playoff games if any
    const playoffGames = await db.query(
      `
      SELECT pg.*, 
             ht.name as home_team_name, 
             at.name as away_team_name,
             wt.name as winner_team_name
      FROM playoff_games pg
      LEFT JOIN teams ht ON pg.home_team_id = ht.id
      LEFT JOIN teams at ON pg.away_team_id = at.id
      LEFT JOIN teams wt ON pg.winner_team_id = wt.id
      WHERE pg.tournament_id = $1
      ORDER BY 
        CASE pg.round 
          WHEN 'quarterfinal' THEN 1 
          WHEN 'semifinal' THEN 2 
          WHEN 'final' THEN 3 
          ELSE 4 
        END, 
        pg.position
    `,
      [tournamentId]
    );

    res.json({
      pool_standings: poolStandings.rows,
      playoff_bracket: playoffBracket.rows,
      playoff_games: playoffGames.rows,
    });
  } catch (error) {
    console.error("❌ Error fetching playoff data:", error);
    res.status(500).json({ error: error.message });
  }
});

// Generate playoff bracket based on pool results
app.post("/api/tournaments/:tournamentId/playoffs/generate", async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { customSeeding } = req.body;

    console.log("🏆 Generating playoff bracket for tournament:", tournamentId);
    console.log("🎯 Custom seeding provided:", customSeeding ? 'Yes' : 'No');

    // Get pool standings with proper tournament ranking
    const poolStandings = await db.query(
      `
      SELECT t.*, p.name as pool_name, p.id as pool_id,
             ROW_NUMBER() OVER (
               PARTITION BY t.pool_id 
               ORDER BY t.points DESC, 
                        (t.goals_for - t.goals_against) DESC,
                        t.goals_for DESC,
                        t.goals_against ASC
             ) as pool_rank
      FROM teams t
      LEFT JOIN pools p ON t.pool_id = p.id
      WHERE t.tournament_id = $1 AND t.pool_id IS NOT NULL
      ORDER BY p.name, pool_rank
    `,
      [tournamentId]
    );

    const teams = poolStandings.rows;

    console.log("🔍 Total teams in standings:", teams.length);
    console.log("🔍 First team pool_rank:", teams[0]?.pool_rank, "type:", typeof teams[0]?.pool_rank);
    
    // Get pool winners (1st place in each pool) - pool_rank is a string from SQL
    const poolWinners = teams.filter(team => team.pool_rank === "1");
    console.log("🏆 Pool winners found:", poolWinners.length, poolWinners.map(t => t.name));
    
    // Get second place teams for wildcard selection
    const secondPlace = teams.filter(team => team.pool_rank === "2");
    console.log("🥈 Second place teams found:", secondPlace.length, secondPlace.map(t => t.name));
    
    // Sort second place teams to get top 2 wildcards
    secondPlace.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if ((b.goals_for - b.goals_against) !== (a.goals_for - a.goals_against)) 
        return (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against);
      if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;
      if (a.goals_against !== b.goals_against) return a.goals_against - b.goals_against;
      return a.name.localeCompare(b.name);
    });

    let qualifiedTeams;
    let wildcards; // Define wildcards variable for both paths

    if (customSeeding && customSeeding.length === 8) {
      // Use custom seeding from bracket builder
      console.log("🎯 Using custom seeding:", customSeeding);
      
      // Get all teams by ID for lookup (including third place for flexibility)
      const allAvailableTeams = teams; // All teams from the query
      const teamsById = {};
      allAvailableTeams.forEach(team => {
        teamsById[team.id] = team;
      });
      
      // Build qualified teams array based on custom seeding order
      qualifiedTeams = customSeeding
        .sort((a, b) => a.seed - b.seed) // Ensure proper seed order
        .map(seedData => {
          const team = teamsById[seedData.teamId];
          if (!team) {
            throw new Error(`Team with ID ${seedData.teamId} not found in qualified teams`);
          }
          return team;
        });
      
      // For custom seeding, determine wildcards by checking which teams are not pool winners
      wildcards = qualifiedTeams.filter(team => !poolWinners.some(winner => winner.id === team.id));
      
      console.log("🏆 Custom seeded teams:", qualifiedTeams.map((t, i) => `${i+1}. ${t.name}`));
      console.log("🎯 Custom wildcards:", wildcards.map(w => w.name));
    } else {
      // Use automatic seeding based on performance
      console.log("🤖 Using automatic seeding");
      wildcards = secondPlace.slice(0, 2);
      qualifiedTeams = [...poolWinners, ...wildcards];

      if (qualifiedTeams.length !== 8) {
        return res.status(400).json({ 
          error: `Need exactly 8 qualified teams for playoffs. Found ${qualifiedTeams.length}. Complete pool play first.` 
        });
      }

      // Sort all qualified teams to determine seeds 1-8
      qualifiedTeams.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if ((b.goals_for - b.goals_against) !== (a.goals_for - a.goals_against)) 
          return (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against);
        if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;
        if (a.goals_against !== b.goals_against) return a.goals_against - b.goals_against;
        return a.name.localeCompare(b.name);
      });
      
      console.log("🏆 Auto seeded teams:", qualifiedTeams.map((t, i) => `${i+1}. ${t.name}`));
    }

    if (qualifiedTeams.length !== 8) {
      return res.status(400).json({ 
        error: `Need exactly 8 qualified teams for playoffs. Found ${qualifiedTeams.length}.` 
      });
    }

    // Clear existing playoff data
    await db.query("DELETE FROM playoff_games WHERE tournament_id = $1", [tournamentId]);
    await db.query("DELETE FROM playoffs WHERE tournament_id = $1", [tournamentId]);

    // Create playoff bracket entries
    for (let i = 0; i < 8; i++) {
      await db.query(
        "INSERT INTO playoffs (tournament_id, round, position, team_id, seed) VALUES ($1, $2, $3, $4, $5)",
        [tournamentId, 'qualification', i + 1, qualifiedTeams[i].id, i + 1]
      );
    }

    // Generate quarterfinal matchups with rematch avoidance
    const matchups = [
      { seed1: 1, seed2: 8, qf: 1 },  // QF1: 1 vs 8
      { seed1: 4, seed2: 5, qf: 2 },  // QF2: 4 vs 5
      { seed1: 3, seed2: 6, qf: 3 },  // QF3: 3 vs 6
      { seed1: 2, seed2: 7, qf: 4 }   // QF4: 2 vs 7
    ];

    // Apply rematch avoidance rule
    for (const matchup of matchups) {
      const team1 = qualifiedTeams[matchup.seed1 - 1];
      const team2 = qualifiedTeams[matchup.seed2 - 1];
      
      // Check if teams are from same pool
      if (team1.pool_id === team2.pool_id) {
        console.log(`⚠️ Rematch detected: ${team1.name} vs ${team2.name} (same pool)`);
        
        // Find another matchup to swap with
        for (const otherMatchup of matchups) {
          if (otherMatchup.qf === matchup.qf) continue;
          
          const otherTeam1 = qualifiedTeams[otherMatchup.seed1 - 1];
          const otherTeam2 = qualifiedTeams[otherMatchup.seed2 - 1];
          
          // Try swapping the lower seeds to avoid rematch
          const lowerSeed1 = Math.max(matchup.seed1, matchup.seed2);
          const lowerSeed2 = Math.max(otherMatchup.seed1, otherMatchup.seed2);
          
          if (lowerSeed1 > lowerSeed2) {
            // Swap team2 with otherTeam2 if it avoids both rematches
            if (team1.pool_id !== otherTeam2.pool_id && otherTeam1.pool_id !== team2.pool_id) {
              matchup.seed2 = otherMatchup.seed2;
              otherMatchup.seed2 = lowerSeed1;
              console.log(`✅ Applied rematch avoidance: swapped seeds ${lowerSeed1} and ${otherMatchup.seed2}`);
              break;
            }
          }
        }
      }
    }

    // Create playoff games
    for (const matchup of matchups) {
      const homeTeam = qualifiedTeams[matchup.seed1 - 1];
      const awayTeam = qualifiedTeams[matchup.seed2 - 1];
      
      await db.query(
        `INSERT INTO playoff_games 
         (tournament_id, round, position, home_team_id, away_team_id, status) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tournamentId, 'quarterfinal', matchup.qf, homeTeam.id, awayTeam.id, 'scheduled']
      );

      console.log(`⚽ QF${matchup.qf}: Seed ${matchup.seed1} ${homeTeam.name} vs Seed ${matchup.seed2} ${awayTeam.name}`);
    }

    // Create placeholder semifinal and final games
    await db.query(
      `INSERT INTO playoff_games (tournament_id, round, position, status) VALUES 
       ($1, 'semifinal', 1, 'pending'),
       ($1, 'semifinal', 2, 'pending'),
       ($1, 'final', 1, 'pending')`,
      [tournamentId]
    );

    console.log("✅ Playoff bracket generated successfully");

    // Return the generated bracket
    const newBracket = await db.query(
      `SELECT pg.*, 
              ht.name as home_team_name, 
              at.name as away_team_name
       FROM playoff_games pg
       LEFT JOIN teams ht ON pg.home_team_id = ht.id
       LEFT JOIN teams at ON pg.away_team_id = at.id
       WHERE pg.tournament_id = $1
       ORDER BY 
         CASE pg.round 
           WHEN 'quarterfinal' THEN 1 
           WHEN 'semifinal' THEN 2 
           WHEN 'final' THEN 3 
         END, 
         pg.position`,
      [tournamentId]
    );

    res.json({
      success: true,
      message: "Playoff bracket generated successfully",
      bracket: newBracket.rows,
      qualified_teams: qualifiedTeams.map((team, index) => ({
        ...team,
        seed: index + 1,
        is_pool_winner: poolWinners.some(winner => winner.id === team.id),
        is_wildcard: wildcards.some(wildcard => wildcard.id === team.id)
      }))
    });

  } catch (error) {
    console.error("❌ Error generating playoff bracket:", error);
    res.status(500).json({ error: error.message });
  }
});

// Submit playoff game result
app.post("/api/playoff-games/:gameId/result", async (req, res) => {
  try {
    const { gameId } = req.params;
    const { home_score, away_score, field, scheduled_start_time } = req.body;

    console.log("⚽ Recording playoff result for game", gameId);
    console.log("📊 Raw scores:", { home_score, away_score, field, scheduled_start_time });
    
    // Convert scores to integers
    const homeScoreInt = parseInt(home_score);
    const awayScoreInt = parseInt(away_score);
    
    // Validate scores
    if (isNaN(homeScoreInt) || isNaN(awayScoreInt) || homeScoreInt < 0 || awayScoreInt < 0) {
      return res.status(400).json({ error: "Invalid scores provided" });
    }

    // Update the playoff game result
    const gameResult = await db.query(
      `UPDATE playoff_games 
       SET home_score = $1::integer, away_score = $2::integer, status = 'completed',
           field = $4, scheduled_start_time = $5,
           winner_team_id = CASE 
             WHEN $1::integer > $2::integer THEN home_team_id 
             WHEN $2::integer > $1::integer THEN away_team_id
             ELSE NULL 
           END
       WHERE id = $3 RETURNING *`,
      [homeScoreInt, awayScoreInt, gameId, field, scheduled_start_time]
    );

    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: "Playoff game not found" });
    }

    const game = gameResult.rows[0];
    
    // If this is a completed quarterfinal, advance winner to semifinal
    if (game.round === 'quarterfinal' && game.winner_team_id) {
      const winnerTeamId = game.winner_team_id;
      
      // Determine which semifinal this winner goes to
      const semifinalPosition = game.position <= 2 ? 1 : 2;
      const semifinalSide = ((game.position - 1) % 2) + 1; // 1 or 2 within the semifinal
      
      // Update or set the semifinal matchup
      await db.query(
        `UPDATE playoff_games 
         SET ${semifinalSide === 1 ? 'home_team_id' : 'away_team_id'} = $1,
             status = CASE 
               WHEN home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN 'scheduled'
               ELSE 'pending'
             END
         WHERE tournament_id = $2 AND round = 'semifinal' AND position = $3`,
        [winnerTeamId, game.tournament_id, semifinalPosition]
      );
    }

    // If this is a completed semifinal, advance winner to final
    if (game.round === 'semifinal' && game.winner_team_id) {
      const winnerTeamId = game.winner_team_id;
      
      // Update the final
      await db.query(
        `UPDATE playoff_games 
         SET ${game.position === 1 ? 'home_team_id' : 'away_team_id'} = $1,
             status = CASE 
               WHEN home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN 'scheduled'
               ELSE 'pending'
             END
         WHERE tournament_id = $2 AND round = 'final'`,
        [winnerTeamId, game.tournament_id]
      );
    }

    console.log("✅ Playoff result recorded and bracket updated");
    res.json(game);

  } catch (error) {
    console.error("❌ Error recording playoff result:", error);
    res.status(500).json({ error: error.message });
  }
});

// Schedule playoff game
app.put("/api/playoff-games/:gameId/schedule", async (req, res) => {
  try {
    const { gameId } = req.params;
    const { game_date, scheduled_start_time, field } = req.body;

    const result = await db.query(
      `UPDATE playoff_games 
       SET game_date = $1, scheduled_start_time = $2, field = $3,
           estimated_end_time = $2 + INTERVAL '45 minutes'
       WHERE id = $4 RETURNING *`,
      [game_date, scheduled_start_time, field, gameId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Playoff game not found" });
    }

    console.log("📅 Playoff game scheduled:", result.rows[0]);
    res.json(result.rows[0]);

  } catch (error) {
    console.error("❌ Error scheduling playoff game:", error);
    res.status(500).json({ error: error.message });
  }
});

// Auto-schedule all playoff games with proper timing
app.post("/api/tournaments/:tournamentId/playoffs/auto-schedule", async (req, res) => {
  try {
    const { tournamentId } = req.params;
    
    console.log("🏗️ Auto-scheduling playoff games for tournament:", tournamentId);

    // Get tournament settings for scheduling parameters
    const tournamentResult = await db.query(`
      SELECT settings FROM tournaments WHERE id = $1
    `, [tournamentId]);

    if (tournamentResult.rows.length === 0) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    const settings = tournamentResult.rows[0].settings;
    const gameDuration = settings.game_duration || 45; // minutes
    const breakDuration = settings.break_duration || 15; // minutes between games
    const roundBreakDuration = settings.round_break_duration || 60; // minutes between rounds
    const fieldNames = settings.field_names || ["Field 1", "Field 2", "Field 3", "Field 4"];
    
    // Find the latest pool play game end time to start playoffs after
    const latestPoolGameResult = await db.query(`
      SELECT scheduled_start_time
      FROM games 
      WHERE tournament_id = $1 
        AND scheduled_start_time IS NOT NULL 
        AND game_type = 'pool'
      ORDER BY scheduled_start_time DESC 
      LIMIT 1
    `, [tournamentId]);
    
    let playoffStartTime;
    if (latestPoolGameResult.rows.length > 0) {
      const latestGame = latestPoolGameResult.rows[0];
      const gameEndTime = new Date(`2000-01-01T${latestGame.scheduled_start_time}`);
      gameEndTime.setMinutes(gameEndTime.getMinutes() + gameDuration + roundBreakDuration);
      playoffStartTime = `${gameEndTime.getHours().toString().padStart(2, '0')}:${gameEndTime.getMinutes().toString().padStart(2, '0')}`;
      console.log(`🕐 Latest pool game starts at ${latestGame.scheduled_start_time}, ends around ${gameEndTime.getHours().toString().padStart(2, '0')}:${(gameEndTime.getMinutes() - roundBreakDuration).toString().padStart(2, '0')}, playoffs will start at ${playoffStartTime}`);
    } else {
      // Fallback to settings if no pool games found
      playoffStartTime = settings.playoffs_start_time || settings.start_time || "10:00";
      console.log(`⚠️  No pool games found, using fallback playoff start time: ${playoffStartTime}`);
    }

    // Get all playoff games ordered by round and position
    const gamesResult = await db.query(`
      SELECT id, round, position, home_team_id, away_team_id, status 
      FROM playoff_games 
      WHERE tournament_id = $1 
      ORDER BY 
        CASE round 
          WHEN 'quarterfinal' THEN 1 
          WHEN 'semifinal' THEN 2 
          WHEN 'final' THEN 3 
        END, 
        position
    `, [tournamentId]);

    const games = gamesResult.rows;
    
    if (games.length === 0) {
      return res.status(400).json({ error: "No playoff games found. Generate bracket first." });
    }

    // Calculate time slots for each round using calculated playoff start time
    const [startHour, startMinute] = playoffStartTime.split(':').map(Number);
    let currentTimeMinutes = startHour * 60 + startMinute;
    
    const rounds = {
      'quarterfinal': [],
      'semifinal': [],
      'final': []
    };

    // Group games by round
    games.forEach(game => {
      rounds[game.round].push(game);
    });

    const scheduledGames = [];
    let fieldIndex = 0;

    // Schedule Quarterfinals (all at same time on different fields)
    if (rounds.quarterfinal.length > 0) {
      const qfTime = formatTime(currentTimeMinutes);
      console.log(`⚡ Scheduling ${rounds.quarterfinal.length} quarterfinals at ${qfTime}`);
      
      for (let i = 0; i < rounds.quarterfinal.length; i++) {
        const game = rounds.quarterfinal[i];
        const field = fieldNames[i % fieldNames.length];
        
        await db.query(`
          UPDATE playoff_games 
          SET scheduled_start_time = $1, field = $2, game_date = CURRENT_DATE
          WHERE id = $3
        `, [qfTime, field, game.id]);
        
        scheduledGames.push({
          id: game.id,
          round: game.round,
          position: game.position,
          time: qfTime,
          field: field
        });
      }
      
      // Move to semifinal time (after game duration + round break)
      currentTimeMinutes += gameDuration + roundBreakDuration;
    }

    // Schedule Semifinals (all at same time on different fields)  
    if (rounds.semifinal.length > 0) {
      const sfTime = formatTime(currentTimeMinutes);
      console.log(`🥈 Scheduling ${rounds.semifinal.length} semifinals at ${sfTime}`);
      
      for (let i = 0; i < rounds.semifinal.length; i++) {
        const game = rounds.semifinal[i];
        const field = fieldNames[i % fieldNames.length];
        
        await db.query(`
          UPDATE playoff_games 
          SET scheduled_start_time = $1, field = $2, game_date = CURRENT_DATE
          WHERE id = $3
        `, [sfTime, field, game.id]);
        
        scheduledGames.push({
          id: game.id,
          round: game.round,
          position: game.position,
          time: sfTime,
          field: field
        });
      }
      
      // Move to final time (after game duration + round break)
      currentTimeMinutes += gameDuration + roundBreakDuration;
    }

    // Schedule Final
    if (rounds.final.length > 0) {
      const finalTime = formatTime(currentTimeMinutes);
      console.log(`🏆 Scheduling final at ${finalTime}`);
      
      const game = rounds.final[0];
      const field = fieldNames[0]; // Use primary field for final
      
      await db.query(`
        UPDATE playoff_games 
        SET scheduled_start_time = $1, field = $2, game_date = CURRENT_DATE
        WHERE id = $3
      `, [finalTime, field, game.id]);
      
      scheduledGames.push({
        id: game.id,
        round: game.round,
        position: game.position,
        time: finalTime,
        field: field
      });
    }

    console.log("✅ Auto-scheduling completed:", scheduledGames.length, "games scheduled");
    
    res.json({ 
      success: true, 
      message: `Successfully scheduled ${scheduledGames.length} playoff games`,
      scheduledGames: scheduledGames,
      schedule: {
        quarterfinals: scheduledGames.filter(g => g.round === 'quarterfinal'),
        semifinals: scheduledGames.filter(g => g.round === 'semifinal'),
        final: scheduledGames.filter(g => g.round === 'final')
      }
    });

  } catch (error) {
    console.error("❌ Error auto-scheduling playoff games:", error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to format time from minutes to HH:MM
function formatTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// ========================================
// ENHANCED API ROUTES (with fallbacks)
// ========================================

// Try to initialize enhanced services
let backupService, statisticsRoutes, backupRoutes;
try {
  // Try to load backup service
  try {
    const TournamentBackup = require('./utils/backup');
    backupService = new TournamentBackup(db);
    logger.info('Backup service initialized');
  } catch (backupError) {
    logger.warn('Backup service not available', { error: backupError.message });
    backupService = null;
  }
  
  // Try to load route modules
  if (tournamentStats) {
    try {
      statisticsRoutes = require('./routes/statistics')(tournamentStats, requireAuth);
      app.use('/api/statistics', statisticsRoutes);
      logger.info('Statistics API routes loaded');
    } catch (statsError) {
      logger.warn('Statistics routes not available', { error: statsError.message });
    }
  }
  
  if (backupService) {
    try {
      backupRoutes = require('./routes/backup')(backupService, requireAuth);
      app.use('/api/admin', backupRoutes);
      logger.info('Backup API routes loaded');
    } catch (backupRouteError) {
      logger.warn('Backup routes not available', { error: backupRouteError.message });
    }
  }
} catch (error) {
  logger.warn('Enhanced API initialization failed', { error: error.message });
}

// Always provide fallback endpoints for graceful degradation
if (!statisticsRoutes || !tournamentStats) {
  app.get('/api/statistics/tournaments/:id/summary', (req, res) => {
    res.status(503).json(ResponseHandler.error('Enhanced statistics not available in this build'));
  });
  
  app.get('/api/statistics/tournaments/:id/standings/detailed', (req, res) => {
    res.status(503).json(ResponseHandler.error('Detailed standings not available in this build'));
  });
}

if (!backupService) {
  app.post('/api/admin/backup', requireAuth, (req, res) => {
    res.status(503).json(ResponseHandler.error('Backup functionality not available in this build'));
  });
  
  app.get('/api/admin/backups', requireAuth, (req, res) => {
    res.status(503).json(ResponseHandler.error('Backup functionality not available in this build'));
  });
}

// WebSocket support with fallback
const http = require('http');
const server = http.createServer(app);

let wsServer;
try {
  // First check if ws module is available
  require('ws');
  const TournamentWebSocketServer = require('./utils/websocket');
  wsServer = new TournamentWebSocketServer(server);
  app.locals.wsServer = wsServer;
  logger.info('WebSocket server initialized successfully');
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('ws')) {
    logger.warn('WebSocket module not installed, running without real-time features');
  } else {
    logger.warn('WebSocket server initialization failed', { error: error.message });
  }
  wsServer = null;
  app.locals.wsServer = null;
}

// System stats endpoint with fallback
app.get('/api/system/stats', requireAuth, async (req, res) => {
  try {
    const stats = {
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: process.platform,
        nodeVersion: process.version
      }
    };
    
    // Add enhanced stats if available
    if (dbUtils) {
      try {
        stats.database = await dbUtils.getSystemStats();
        stats.connection = await dbUtils.checkConnection();
      } catch (error) {
        logger.warn('Database stats not available', { error: error.message });
      }
    }
    
    if (wsServer) {
      stats.websocket = wsServer.getStats();
    }
    
    logger.info('System stats requested', { admin: req.session.isAdmin });
    
    res.json(ResponseHandler.success(stats, 'System stats retrieved successfully'));
  } catch (error) {
    logger.error('Failed to fetch system stats', error);
    res.status(500).json(ResponseHandler.error('Failed to fetch system stats'));
  }
});

// ========================================
// ERROR HANDLING & SERVER START
// ========================================

// Enhanced error handling middleware with logging
app.use((error, req, res, next) => {
  logger.error('Unhandled server error', error, {
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent']
  });
  res.status(500).json(ResponseHandler.error('Internal server error'));
});

// 404 handler
app.use((req, res) => {
  logger.warn('404 - Endpoint not found', {
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent']
  });
  res.status(404).json(ResponseHandler.notFound('Endpoint'));
});

// Start server with enhanced features when available
server.listen(PORT, "0.0.0.0", () => {
  logger.info('Tournament API server started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    enhancedFeatures: !!(tournamentStats && backupService && wsServer)
  });
  
  console.log(`🚀 Tournament API server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/`);
  
  if (wsServer) {
    console.log(`🔌 WebSocket server: ws://localhost:${PORT}`);
  }
  
  console.log(`📊 Available endpoints:`);
  console.log(`   • Core API: /api/tournaments, /api/teams, /api/games`);
  
  if (tournamentStats) {
    console.log(`   • Statistics: /api/statistics/tournaments/:id/summary`);
    console.log(`   • Analytics: /api/statistics/tournaments/:id/analytics/*`);
  }
  
  if (backupService) {
    console.log(`   • Backups: /api/admin/backup, /api/admin/backups`);
  }
  
  console.log(`   • System: /api/system/stats`);
  
  if (wsServer) {
    console.log(`   • WebSocket: Real-time tournament updates`);
  }
  
  console.log(`📝 Logs: ./backend/logs/`);
  console.log(`🚀 Server ready for tournament management!`);
});

// Error handling middleware (must be last)
app.use((err, req, res, next) => {
  logger.error(`Unhandled error in ${req.method} ${req.path}`, err, {
    method: req.method,
    path: req.path,
    body: req.body,
    query: req.query,
    ip: req.ip
  });
  
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    if (wsServer) wsServer.close();
    db.end();
    logger.info('Server shut down completed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    if (wsServer) wsServer.close();
    db.end();
    logger.info('Server shut down completed');
    process.exit(0);
  });
});
