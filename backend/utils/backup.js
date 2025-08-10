// backend/utils/backup.js
// Tournament data backup and restore utilities

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class TournamentBackup {
  constructor(db) {
    this.db = db;
    this.backupDir = path.join(__dirname, '../backups');
    this.ensureBackupDirectory();
  }

  ensureBackupDirectory() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      logger.info('Backup directory created', { path: this.backupDir });
    }
  }

  async createFullBackup(tournamentId = null) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = tournamentId ? 
      `tournament_${tournamentId}_backup_${timestamp}` : 
      `full_backup_${timestamp}`;
    
    try {
      logger.info('Starting backup creation', { backupName, tournamentId });
      
      const backupData = await this.exportTournamentData(tournamentId);
      const backupPath = path.join(this.backupDir, `${backupName}.json`);
      
      // Write backup file
      fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
      
      // Create metadata file
      const metadata = {
        backupName,
        tournamentId,
        createdAt: new Date().toISOString(),
        fileSize: fs.statSync(backupPath).size,
        recordCounts: this.getRecordCounts(backupData),
        version: '1.0'
      };
      
      const metadataPath = path.join(this.backupDir, `${backupName}_metadata.json`);
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      
      logger.info('Backup created successfully', {
        backupName,
        backupPath,
        fileSize: metadata.fileSize,
        recordCounts: metadata.recordCounts
      });
      
      return {
        success: true,
        backupName,
        backupPath,
        metadata
      };
      
    } catch (error) {
      logger.error('Backup creation failed', error, { backupName, tournamentId });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async exportTournamentData(tournamentId = null) {
    const tables = [
      'tournaments',
      'teams', 
      'pools',
      'games',
      'playoff_games',
      'announcements'
    ];
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      tournamentId,
      tables: {}
    };
    
    for (const table of tables) {
      let query = `SELECT * FROM ${table}`;
      let params = [];
      
      if (tournamentId && table !== 'tournaments') {
        query += ` WHERE tournament_id = $1`;
        params = [tournamentId];
      } else if (tournamentId && table === 'tournaments') {
        query += ` WHERE id = $1`;
        params = [tournamentId];
      }
      
      query += ` ORDER BY id`;
      
      const result = await this.db.query(query, params);
      exportData.tables[table] = result.rows;
      
      logger.debug(`Exported ${table}`, { 
        recordCount: result.rows.length,
        tournamentId 
      });
    }
    
    return exportData;
  }

  async restoreFromBackup(backupName) {
    try {
      const backupPath = path.join(this.backupDir, `${backupName}.json`);
      const metadataPath = path.join(this.backupDir, `${backupName}_metadata.json`);
      
      if (!fs.existsSync(backupPath)) {
        throw new Error('Backup file not found');
      }
      
      logger.info('Starting backup restoration', { backupName, backupPath });
      
      // Read backup data
      const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      const metadata = fs.existsSync(metadataPath) ? 
        JSON.parse(fs.readFileSync(metadataPath, 'utf8')) : null;
      
      // Begin transaction
      const client = await this.db.connect();
      
      try {
        await client.query('BEGIN');
        
        // Clear existing data (in reverse order to handle foreign keys)
        const clearOrder = ['announcements', 'playoff_games', 'games', 'teams', 'pools'];
        
        if (backupData.tournamentId) {
          // Clear data for specific tournament
          for (const table of clearOrder) {
            await client.query(`DELETE FROM ${table} WHERE tournament_id = $1`, [backupData.tournamentId]);
          }
        } else {
          // Clear all data
          for (const table of clearOrder) {
            await client.query(`DELETE FROM ${table}`);
          }
          await client.query('DELETE FROM tournaments');
        }
        
        // Restore data (in correct order to handle foreign keys)
        const restoreOrder = ['tournaments', 'pools', 'teams', 'games', 'playoff_games', 'announcements'];
        
        for (const table of restoreOrder) {
          if (backupData.tables[table] && backupData.tables[table].length > 0) {
            const records = backupData.tables[table];
            
            for (const record of records) {
              const columns = Object.keys(record).filter(key => record[key] !== undefined);
              const values = columns.map(col => record[col]);
              const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
              
              const insertQuery = `
                INSERT INTO ${table} (${columns.join(', ')}) 
                VALUES (${placeholders})
              `;
              
              await client.query(insertQuery, values);
            }
            
            // Reset sequence if table has an id column
            if (records.some(record => record.id)) {
              const maxId = Math.max(...records.map(r => r.id));
              await client.query(`SELECT setval('${table}_id_seq', $1)`, [maxId]);
            }
            
            logger.debug(`Restored ${table}`, { recordCount: records.length });
          }
        }
        
        await client.query('COMMIT');
        
        logger.info('Backup restoration completed successfully', {
          backupName,
          tournamentId: backupData.tournamentId,
          tablesRestored: restoreOrder.filter(table => 
            backupData.tables[table] && backupData.tables[table].length > 0
          )
        });
        
        return {
          success: true,
          restoredAt: new Date().toISOString(),
          backupMetadata: metadata,
          tablesRestored: restoreOrder.length
        };
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
    } catch (error) {
      logger.error('Backup restoration failed', error, { backupName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async listBackups() {
    try {
      const files = fs.readdirSync(this.backupDir);
      const backups = [];
      
      const jsonFiles = files.filter(file => file.endsWith('.json') && !file.endsWith('_metadata.json'));
      
      for (const file of jsonFiles) {
        const backupName = path.basename(file, '.json');
        const backupPath = path.join(this.backupDir, file);
        const metadataPath = path.join(this.backupDir, `${backupName}_metadata.json`);
        
        let metadata = null;
        if (fs.existsSync(metadataPath)) {
          try {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          } catch (error) {
            logger.warn('Failed to read backup metadata', { backupName, error: error.message });
          }
        }
        
        const stats = fs.statSync(backupPath);
        
        backups.push({
          name: backupName,
          createdAt: metadata ? metadata.createdAt : stats.birthtime.toISOString(),
          fileSize: stats.size,
          tournamentId: metadata ? metadata.tournamentId : null,
          recordCounts: metadata ? metadata.recordCounts : null
        });
      }
      
      // Sort by creation date, newest first
      backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      return {
        success: true,
        backups
      };
      
    } catch (error) {
      logger.error('Failed to list backups', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteBackup(backupName) {
    try {
      const backupPath = path.join(this.backupDir, `${backupName}.json`);
      const metadataPath = path.join(this.backupDir, `${backupName}_metadata.json`);
      
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      
      if (fs.existsSync(metadataPath)) {
        fs.unlinkSync(metadataPath);
      }
      
      logger.info('Backup deleted successfully', { backupName });
      
      return {
        success: true,
        deletedAt: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('Failed to delete backup', error, { backupName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  getRecordCounts(backupData) {
    const counts = {};
    for (const [table, records] of Object.entries(backupData.tables)) {
      counts[table] = records.length;
    }
    return counts;
  }

  async createScheduledBackup() {
    logger.info('Creating scheduled backup');
    return await this.createFullBackup();
  }
}

module.exports = TournamentBackup;