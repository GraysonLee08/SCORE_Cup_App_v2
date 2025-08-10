// backend/utils/database.js
// Database utilities and helper functions

const logger = require('./logger');

class DatabaseUtils {
  constructor(db) {
    this.db = db;
  }

  async executeQuery(query, params = [], operationName = 'Database Operation') {
    const startTime = Date.now();
    
    try {
      logger.debug(`Executing query: ${operationName}`, { query, params });
      
      const result = await this.db.query(query, params);
      const duration = Date.now() - startTime;
      
      logger.performance(`${operationName} completed`, duration, {
        rowCount: result.rowCount,
        command: result.command
      });
      
      return {
        success: true,
        data: result.rows,
        rowCount: result.rowCount,
        duration
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`${operationName} failed`, error, {
        query,
        params,
        duration
      });
      
      return {
        success: false,
        error: error.message,
        code: error.code,
        duration
      };
    }
  }

  async checkConnection() {
    return await this.executeQuery('SELECT NOW()', [], 'Connection Check');
  }

  async beginTransaction() {
    return await this.executeQuery('BEGIN', [], 'Begin Transaction');
  }

  async commitTransaction() {
    return await this.executeQuery('COMMIT', [], 'Commit Transaction');
  }

  async rollbackTransaction() {
    return await this.executeQuery('ROLLBACK', [], 'Rollback Transaction');
  }

  async withTransaction(operations) {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');
      
      const results = [];
      for (const operation of operations) {
        const result = await client.query(operation.query, operation.params);
        results.push(result);
      }
      
      await client.query('COMMIT');
      logger.info('Transaction completed successfully', { operationsCount: operations.length });
      
      return {
        success: true,
        results
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction rolled back', error, { operationsCount: operations.length });
      
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async getTableStats(tableName) {
    const query = `
      SELECT 
        schemaname,
        tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_live_tup as live_tuples,
        n_dead_tup as dead_tuples,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze
      FROM pg_stat_user_tables 
      WHERE tablename = $1
    `;
    
    return await this.executeQuery(query, [tableName], `Get stats for table: ${tableName}`);
  }

  async getSystemStats() {
    const queries = [
      {
        name: 'active_connections',
        query: 'SELECT count(*) as count FROM pg_stat_activity WHERE state = \'active\''
      },
      {
        name: 'database_size',
        query: 'SELECT pg_size_pretty(pg_database_size(current_database())) as size'
      },
      {
        name: 'tournament_summary',
        query: `
          SELECT 
            (SELECT COUNT(*) FROM tournaments) as tournament_count,
            (SELECT COUNT(*) FROM teams) as team_count,
            (SELECT COUNT(*) FROM games) as game_count,
            (SELECT COUNT(*) FROM games WHERE status = 'completed') as completed_games,
            (SELECT COUNT(*) FROM announcements) as announcement_count
        `
      }
    ];

    const stats = {};
    for (const { name, query } of queries) {
      const result = await this.executeQuery(query, [], `System Stats: ${name}`);
      stats[name] = result.success ? result.data[0] : { error: result.error };
    }

    return stats;
  }

  async backupTable(tableName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupTableName = `${tableName}_backup_${timestamp}`;
    
    const query = `CREATE TABLE ${backupTableName} AS SELECT * FROM ${tableName}`;
    const result = await this.executeQuery(query, [], `Backup table: ${tableName}`);
    
    if (result.success) {
      logger.info(`Table backup created: ${backupTableName}`, { 
        originalTable: tableName,
        backupTable: backupTableName,
        rowCount: result.rowCount 
      });
    }
    
    return {
      ...result,
      backupTableName: result.success ? backupTableName : null
    };
  }
}

class ResponseHandler {
  static success(data, message = 'Operation successful', meta = {}) {
    return {
      success: true,
      message,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta
      }
    };
  }

  static error(message, statusCode = 500, details = null) {
    return {
      success: false,
      error: message,
      statusCode,
      details,
      timestamp: new Date().toISOString()
    };
  }

  static validationError(errors) {
    return {
      success: false,
      error: 'Validation failed',
      statusCode: 400,
      validationErrors: errors,
      timestamp: new Date().toISOString()
    };
  }

  static notFound(resource = 'Resource') {
    return {
      success: false,
      error: `${resource} not found`,
      statusCode: 404,
      timestamp: new Date().toISOString()
    };
  }

  static unauthorized(message = 'Authentication required') {
    return {
      success: false,
      error: message,
      statusCode: 401,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { DatabaseUtils, ResponseHandler };