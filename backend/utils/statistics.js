// backend/utils/statistics.js
// Advanced tournament statistics and analytics

const logger = require('./logger');

class TournamentStatistics {
  constructor(db) {
    this.db = db;
  }

  async calculateDetailedStandings(tournamentId) {
    const query = `
      WITH team_stats AS (
        SELECT 
          t.id,
          t.name,
          t.pool_id,
          p.name as pool_name,
          COUNT(g.id) as games_played,
          COUNT(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score) 
                      OR (g.away_team_id = t.id AND g.away_score > g.home_score) 
                 THEN 1 END) as wins,
          COUNT(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score) 
                      OR (g.away_team_id = t.id AND g.away_score < g.home_score) 
                 THEN 1 END) as losses,
          COUNT(CASE WHEN g.home_score = g.away_score AND g.status = 'completed' THEN 1 END) as ties,
          SUM(CASE WHEN g.home_team_id = t.id THEN COALESCE(g.home_score, 0) 
                   WHEN g.away_team_id = t.id THEN COALESCE(g.away_score, 0) 
                   ELSE 0 END) as goals_for,
          SUM(CASE WHEN g.home_team_id = t.id THEN COALESCE(g.away_score, 0) 
                   WHEN g.away_team_id = t.id THEN COALESCE(g.home_score, 0) 
                   ELSE 0 END) as goals_against,
          (SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score) 
                        OR (g.away_team_id = t.id AND g.away_score > g.home_score) 
                   THEN 3
                   WHEN g.home_score = g.away_score AND g.status = 'completed' 
                   THEN 1 
                   ELSE 0 END)) as points
        FROM teams t
        LEFT JOIN pools p ON t.pool_id = p.id
        LEFT JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id) 
                           AND g.status = 'completed'
                           AND g.tournament_id = $1
        WHERE t.tournament_id = $1
        GROUP BY t.id, t.name, t.pool_id, p.name
      )
      SELECT 
        *,
        (goals_for - goals_against) as goal_difference,
        CASE 
          WHEN games_played > 0 THEN ROUND((wins::numeric / games_played) * 100, 1)
          ELSE 0 
        END as win_percentage,
        CASE 
          WHEN games_played > 0 THEN ROUND((goals_for::numeric / games_played), 2)
          ELSE 0 
        END as goals_per_game,
        CASE 
          WHEN games_played > 0 THEN ROUND((goals_against::numeric / games_played), 2)
          ELSE 0 
        END as goals_conceded_per_game
      FROM team_stats
      ORDER BY points DESC, goal_difference DESC, goals_for DESC, name ASC
    `;

    const result = await this.db.query(query, [tournamentId]);
    
    if (result.rowCount === 0) {
      logger.warn('No standings data found', { tournamentId });
      return [];
    }

    logger.tournament('Detailed standings calculated', { 
      tournamentId, 
      teamCount: result.rowCount 
    });

    return result.rows;
  }

  async getTournamentSummary(tournamentId) {
    const summaryQuery = `
      SELECT 
        t.name as tournament_name,
        t.season,
        t.total_teams,
        t.status,
        COUNT(DISTINCT teams.id) as registered_teams,
        COUNT(DISTINCT pools.id) as pool_count,
        COUNT(DISTINCT games.id) as total_games,
        COUNT(DISTINCT CASE WHEN games.status = 'completed' THEN games.id END) as completed_games,
        COUNT(DISTINCT CASE WHEN games.status = 'scheduled' THEN games.id END) as scheduled_games,
        SUM(CASE WHEN games.status = 'completed' THEN COALESCE(games.home_score, 0) + COALESCE(games.away_score, 0) ELSE 0 END) as total_goals,
        AVG(CASE WHEN games.status = 'completed' THEN COALESCE(games.home_score, 0) + COALESCE(games.away_score, 0) END) as avg_goals_per_game,
        MAX(CASE WHEN games.status = 'completed' THEN GREATEST(COALESCE(games.home_score, 0), COALESCE(games.away_score, 0)) END) as highest_individual_score,
        COUNT(DISTINCT announcements.id) as announcement_count
      FROM tournaments t
      LEFT JOIN teams ON teams.tournament_id = t.id
      LEFT JOIN pools ON pools.tournament_id = t.id  
      LEFT JOIN games ON games.tournament_id = t.id
      LEFT JOIN announcements ON announcements.tournament_id = t.id
      WHERE t.id = $1
      GROUP BY t.id, t.name, t.season, t.total_teams, t.status
    `;

    const result = await this.db.query(summaryQuery, [tournamentId]);
    
    if (result.rowCount === 0) {
      return null;
    }

    const summary = result.rows[0];
    
    // Calculate completion percentage
    const totalGames = parseInt(summary.total_games) || 0;
    const completedGames = parseInt(summary.completed_games) || 0;
    summary.completion_percentage = totalGames > 0 ? 
      Math.round((completedGames / totalGames) * 100) : 0;

    logger.tournament('Tournament summary generated', { 
      tournamentId, 
      completionPercentage: summary.completion_percentage 
    });

    return summary;
  }

  async getTopPerformers(tournamentId, limit = 5) {
    const queries = {
      top_scorers: `
        SELECT 
          t.name as team_name,
          SUM(CASE WHEN g.home_team_id = t.id THEN COALESCE(g.home_score, 0) 
                   WHEN g.away_team_id = t.id THEN COALESCE(g.away_score, 0) 
                   ELSE 0 END) as total_goals
        FROM teams t
        JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id) 
                      AND g.status = 'completed'
        WHERE t.tournament_id = $1
        GROUP BY t.id, t.name
        ORDER BY total_goals DESC
        LIMIT $2
      `,
      
      best_defense: `
        SELECT 
          t.name as team_name,
          SUM(CASE WHEN g.home_team_id = t.id THEN COALESCE(g.away_score, 0) 
                   WHEN g.away_team_id = t.id THEN COALESCE(g.home_score, 0) 
                   ELSE 0 END) as goals_conceded,
          COUNT(g.id) as games_played
        FROM teams t
        JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id) 
                      AND g.status = 'completed'
        WHERE t.tournament_id = $1
        GROUP BY t.id, t.name
        HAVING COUNT(g.id) > 0
        ORDER BY goals_conceded ASC, games_played DESC
        LIMIT $2
      `,
      
      most_wins: `
        SELECT 
          t.name as team_name,
          COUNT(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score) 
                          OR (g.away_team_id = t.id AND g.away_score > g.home_score) 
                     THEN 1 END) as wins
        FROM teams t
        JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id) 
                      AND g.status = 'completed'
        WHERE t.tournament_id = $1
        GROUP BY t.id, t.name
        ORDER BY wins DESC
        LIMIT $2
      `
    };

    const results = {};
    
    for (const [category, query] of Object.entries(queries)) {
      const result = await this.db.query(query, [tournamentId, limit]);
      results[category] = result.rows;
    }

    logger.tournament('Top performers calculated', { 
      tournamentId, 
      categories: Object.keys(results).length 
    });

    return results;
  }

  async getGameAnalytics(tournamentId) {
    const analyticsQuery = `
      WITH game_analysis AS (
        SELECT 
          g.*,
          (COALESCE(g.home_score, 0) + COALESCE(g.away_score, 0)) as total_goals,
          ABS(COALESCE(g.home_score, 0) - COALESCE(g.away_score, 0)) as goal_difference,
          ht.name as home_team_name,
          at.name as away_team_name
        FROM games g
        JOIN teams ht ON g.home_team_id = ht.id
        JOIN teams at ON g.away_team_id = at.id
        WHERE g.tournament_id = $1 AND g.status = 'completed'
      )
      SELECT 
        COUNT(*) as total_completed_games,
        AVG(total_goals) as avg_goals_per_game,
        MAX(total_goals) as highest_scoring_game,
        MIN(total_goals) as lowest_scoring_game,
        AVG(goal_difference) as avg_goal_difference,
        COUNT(CASE WHEN goal_difference = 0 THEN 1 END) as total_draws,
        COUNT(CASE WHEN goal_difference = 1 THEN 1 END) as one_goal_games,
        COUNT(CASE WHEN total_goals >= 5 THEN 1 END) as high_scoring_games,
        COUNT(CASE WHEN total_goals = 0 THEN 1 END) as scoreless_games
      FROM game_analysis
    `;

    const result = await this.db.query(analyticsQuery, [tournamentId]);
    
    if (result.rowCount === 0) {
      return {
        total_completed_games: 0,
        avg_goals_per_game: 0,
        highest_scoring_game: 0,
        lowest_scoring_game: 0,
        avg_goal_difference: 0,
        total_draws: 0,
        one_goal_games: 0,
        high_scoring_games: 0,
        scoreless_games: 0
      };
    }

    const analytics = result.rows[0];
    
    // Round averages to 2 decimal places
    analytics.avg_goals_per_game = parseFloat(analytics.avg_goals_per_game || 0).toFixed(2);
    analytics.avg_goal_difference = parseFloat(analytics.avg_goal_difference || 0).toFixed(2);

    logger.tournament('Game analytics calculated', { 
      tournamentId, 
      totalGames: analytics.total_completed_games 
    });

    return analytics;
  }

  async getPoolAnalytics(tournamentId) {
    const poolQuery = `
      SELECT 
        p.id,
        p.name as pool_name,
        COUNT(DISTINCT t.id) as team_count,
        COUNT(DISTINCT g.id) as total_games,
        COUNT(DISTINCT CASE WHEN g.status = 'completed' THEN g.id END) as completed_games,
        SUM(CASE WHEN g.status = 'completed' 
                 THEN COALESCE(g.home_score, 0) + COALESCE(g.away_score, 0) 
                 ELSE 0 END) as total_goals,
        AVG(CASE WHEN g.status = 'completed' 
                 THEN COALESCE(g.home_score, 0) + COALESCE(g.away_score, 0) 
                 END) as avg_goals_per_game
      FROM pools p
      LEFT JOIN teams t ON t.pool_id = p.id
      LEFT JOIN games g ON g.pool_id = p.id AND g.tournament_id = $1
      WHERE p.tournament_id = $1
      GROUP BY p.id, p.name
      ORDER BY p.name
    `;

    const result = await this.db.query(poolQuery, [tournamentId]);
    
    const pools = result.rows.map(pool => ({
      ...pool,
      avg_goals_per_game: parseFloat(pool.avg_goals_per_game || 0).toFixed(2),
      completion_percentage: pool.total_games > 0 ? 
        Math.round((pool.completed_games / pool.total_games) * 100) : 0
    }));

    logger.tournament('Pool analytics calculated', { 
      tournamentId, 
      poolCount: pools.length 
    });

    return pools;
  }
}

module.exports = TournamentStatistics;