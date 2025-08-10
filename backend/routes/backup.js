// backend/routes/backup.js
// Tournament backup and restore API routes

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { ResponseHandler } = require('../utils/database');

module.exports = (backupService, requireAuth) => {
  // Create a full tournament backup
  router.post('/backup', requireAuth, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { tournamentId } = req.body;
      logger.info('Creating tournament backup', { tournamentId, admin: req.session.isAdmin });
      
      const result = await backupService.createFullBackup(tournamentId);
      const duration = Date.now() - startTime;
      
      if (result.success) {
        logger.tournament('Backup created successfully', {
          backupName: result.backupName,
          tournamentId,
          duration
        });
        
        res.json(ResponseHandler.success(result, 'Backup created successfully', {
          requestDuration: duration
        }));
      } else {
        logger.error('Backup creation failed', new Error(result.error), { tournamentId });
        res.status(500).json(ResponseHandler.error(result.error));
      }
      
    } catch (error) {
      logger.error('Backup creation error', error);
      res.status(500).json(ResponseHandler.error('Failed to create backup'));
    }
  });

  // List all available backups
  router.get('/backups', requireAuth, async (req, res) => {
    try {
      logger.info('Listing available backups', { admin: req.session.isAdmin });
      
      const result = await backupService.listBackups();
      
      if (result.success) {
        res.json(ResponseHandler.success(result.backups, 'Backups listed successfully', {
          backupCount: result.backups.length
        }));
      } else {
        logger.error('Failed to list backups', new Error(result.error));
        res.status(500).json(ResponseHandler.error(result.error));
      }
      
    } catch (error) {
      logger.error('List backups error', error);
      res.status(500).json(ResponseHandler.error('Failed to list backups'));
    }
  });

  // Restore from backup
  router.post('/backup/:backupName/restore', requireAuth, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { backupName } = req.params;
      logger.info('Starting backup restoration', { 
        backupName, 
        admin: req.session.isAdmin 
      });
      
      // Log security event
      logger.security('Backup restoration initiated', {
        backupName,
        adminSession: req.session.isAdmin,
        timestamp: new Date().toISOString()
      });
      
      const result = await backupService.restoreFromBackup(backupName);
      const duration = Date.now() - startTime;
      
      if (result.success) {
        logger.tournament('Backup restored successfully', {
          backupName,
          duration,
          tablesRestored: result.tablesRestored
        });
        
        res.json(ResponseHandler.success(result, 'Backup restored successfully', {
          requestDuration: duration
        }));
      } else {
        logger.error('Backup restoration failed', new Error(result.error), { backupName });
        res.status(500).json(ResponseHandler.error(result.error));
      }
      
    } catch (error) {
      logger.error('Backup restoration error', error, { backupName: req.params.backupName });
      res.status(500).json(ResponseHandler.error('Failed to restore backup'));
    }
  });

  // Delete a backup
  router.delete('/backup/:backupName', requireAuth, async (req, res) => {
    try {
      const { backupName } = req.params;
      logger.info('Deleting backup', { backupName, admin: req.session.isAdmin });
      
      // Log security event
      logger.security('Backup deletion initiated', {
        backupName,
        adminSession: req.session.isAdmin,
        timestamp: new Date().toISOString()
      });
      
      const result = await backupService.deleteBackup(backupName);
      
      if (result.success) {
        logger.info('Backup deleted successfully', { backupName });
        res.json(ResponseHandler.success(result, 'Backup deleted successfully'));
      } else {
        logger.error('Backup deletion failed', new Error(result.error), { backupName });
        res.status(500).json(ResponseHandler.error(result.error));
      }
      
    } catch (error) {
      logger.error('Backup deletion error', error, { backupName: req.params.backupName });
      res.status(500).json(ResponseHandler.error('Failed to delete backup'));
    }
  });

  // Create scheduled backup (for automation)
  router.post('/backup/scheduled', async (req, res) => {
    try {
      logger.info('Creating scheduled backup');
      
      const result = await backupService.createScheduledBackup();
      
      if (result.success) {
        logger.info('Scheduled backup created', { backupName: result.backupName });
        res.json(ResponseHandler.success(result, 'Scheduled backup created successfully'));
      } else {
        logger.error('Scheduled backup failed', new Error(result.error));
        res.status(500).json(ResponseHandler.error(result.error));
      }
      
    } catch (error) {
      logger.error('Scheduled backup error', error);
      res.status(500).json(ResponseHandler.error('Failed to create scheduled backup'));
    }
  });

  return router;
};