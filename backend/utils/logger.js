// backend/utils/logger.js
// Comprehensive logging system for tournament application

const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../logs');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  formatMessage(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      context,
      pid: process.pid
    };
    return JSON.stringify(logEntry) + '\n';
  }

  writeToFile(filename, content) {
    const filePath = path.join(this.logDir, filename);
    fs.appendFileSync(filePath, content);
  }

  info(message, context = {}) {
    const formatted = this.formatMessage('INFO', message, context);
    console.log(`ℹ️  ${message}`, context);
    this.writeToFile('app.log', formatted);
  }

  warn(message, context = {}) {
    const formatted = this.formatMessage('WARN', message, context);
    console.warn(`⚠️  ${message}`, context);
    this.writeToFile('app.log', formatted);
  }

  error(message, error = null, context = {}) {
    const errorContext = {
      ...context,
      error: error ? {
        message: error.message,
        stack: error.stack,
        code: error.code
      } : null
    };
    const formatted = this.formatMessage('ERROR', message, errorContext);
    console.error(`❌ ${message}`, errorContext);
    this.writeToFile('error.log', formatted);
    this.writeToFile('app.log', formatted);
  }

  debug(message, context = {}) {
    if (process.env.NODE_ENV === 'development') {
      const formatted = this.formatMessage('DEBUG', message, context);
      console.debug(`🐛 ${message}`, context);
      this.writeToFile('debug.log', formatted);
    }
  }

  tournament(message, context = {}) {
    const formatted = this.formatMessage('TOURNAMENT', message, context);
    console.log(`🏆 ${message}`, context);
    this.writeToFile('tournament.log', formatted);
  }

  security(message, context = {}) {
    const formatted = this.formatMessage('SECURITY', message, context);
    console.log(`🔒 ${message}`, context);
    this.writeToFile('security.log', formatted);
  }

  performance(message, duration, context = {}) {
    const perfContext = { ...context, duration: `${duration}ms` };
    const formatted = this.formatMessage('PERFORMANCE', message, perfContext);
    console.log(`⚡ ${message} (${duration}ms)`, context);
    this.writeToFile('performance.log', formatted);
  }
}

module.exports = new Logger();