// backend/routes/statistics.js
// Tournament statistics API routes

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { ResponseHandler } = require('../utils/database');

module.exports = (tournamentStats, requireAuth) => {
  // Get detailed tournament summary
  router.get('/tournaments/:id/summary', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { id } = req.params;
      logger.info('Fetching tournament summary', { tournamentId: id });
      
      const summary = await tournamentStats.getTournamentSummary(id);
      
      if (!summary) {
        return res.status(404).json(ResponseHandler.notFound('Tournament'));
      }
      
      const duration = Date.now() - startTime;
      logger.performance('Tournament summary fetched', duration, { tournamentId: id });
      
      res.json(ResponseHandler.success(summary, 'Tournament summary retrieved successfully', {
        requestDuration: duration
      }));
      
    } catch (error) {
      logger.error('Failed to fetch tournament summary', error, { tournamentId: req.params.id });
      res.status(500).json(ResponseHandler.error('Failed to fetch tournament summary'));
    }
  });

  // Get detailed standings with advanced statistics
  router.get('/tournaments/:id/standings/detailed', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { id } = req.params;
      logger.info('Fetching detailed standings', { tournamentId: id });
      
      const standings = await tournamentStats.calculateDetailedStandings(id);
      const duration = Date.now() - startTime;
      
      logger.performance('Detailed standings calculated', duration, { 
        tournamentId: id,
        teamCount: standings.length 
      });
      
      res.json(ResponseHandler.success(standings, 'Detailed standings retrieved successfully', {
        teamCount: standings.length,
        requestDuration: duration
      }));
      
    } catch (error) {
      logger.error('Failed to fetch detailed standings', error, { tournamentId: req.params.id });
      res.status(500).json(ResponseHandler.error('Failed to fetch detailed standings'));
    }
  });

  // Get top performers
  router.get('/tournaments/:id/top-performers', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit) || 5;
      
      logger.info('Fetching top performers', { tournamentId: id, limit });
      
      const performers = await tournamentStats.getTopPerformers(id, limit);
      const duration = Date.now() - startTime;
      
      logger.performance('Top performers calculated', duration, { 
        tournamentId: id,
        categories: Object.keys(performers).length 
      });
      
      res.json(ResponseHandler.success(performers, 'Top performers retrieved successfully', {
        categories: Object.keys(performers).length,
        requestDuration: duration
      }));
      
    } catch (error) {
      logger.error('Failed to fetch top performers', error, { tournamentId: req.params.id });
      res.status(500).json(ResponseHandler.error('Failed to fetch top performers'));
    }
  });

  // Get game analytics
  router.get('/tournaments/:id/analytics/games', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { id } = req.params;
      logger.info('Fetching game analytics', { tournamentId: id });
      
      const analytics = await tournamentStats.getGameAnalytics(id);
      const duration = Date.now() - startTime;
      
      logger.performance('Game analytics calculated', duration, { tournamentId: id });
      
      res.json(ResponseHandler.success(analytics, 'Game analytics retrieved successfully', {
        requestDuration: duration
      }));
      
    } catch (error) {
      logger.error('Failed to fetch game analytics', error, { tournamentId: req.params.id });
      res.status(500).json(ResponseHandler.error('Failed to fetch game analytics'));
    }
  });

  // Get pool analytics
  router.get('/tournaments/:id/analytics/pools', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { id } = req.params;
      logger.info('Fetching pool analytics', { tournamentId: id });
      
      const analytics = await tournamentStats.getPoolAnalytics(id);
      const duration = Date.now() - startTime;
      
      logger.performance('Pool analytics calculated', duration, { 
        tournamentId: id,
        poolCount: analytics.length 
      });
      
      res.json(ResponseHandler.success(analytics, 'Pool analytics retrieved successfully', {
        poolCount: analytics.length,
        requestDuration: duration
      }));
      
    } catch (error) {
      logger.error('Failed to fetch pool analytics', error, { tournamentId: req.params.id });
      res.status(500).json(ResponseHandler.error('Failed to fetch pool analytics'));
    }
  });

  return router;
};