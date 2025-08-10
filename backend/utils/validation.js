// backend/utils/validation.js
// Data validation and sanitization utilities

const validator = require('validator');

class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

class Validator {
  static sanitizeString(str, options = {}) {
    if (typeof str !== 'string') return '';
    
    let sanitized = str.trim();
    
    if (options.maxLength) {
      sanitized = sanitized.substring(0, options.maxLength);
    }
    
    if (options.removeSpecialChars) {
      sanitized = sanitized.replace(/[<>\"'&]/g, '');
    }
    
    return sanitized;
  }

  static validateTeam(teamData) {
    const errors = [];
    
    // Team name validation
    if (!teamData.name || typeof teamData.name !== 'string') {
      errors.push({ field: 'name', message: 'Team name is required' });
    } else {
      const name = this.sanitizeString(teamData.name, { maxLength: 100, removeSpecialChars: true });
      if (name.length < 2) {
        errors.push({ field: 'name', message: 'Team name must be at least 2 characters long' });
      }
      if (name.length > 100) {
        errors.push({ field: 'name', message: 'Team name must be less than 100 characters' });
      }
    }
    
    // Captain validation (optional)
    if (teamData.captain && typeof teamData.captain === 'string') {
      const captain = this.sanitizeString(teamData.captain, { maxLength: 100 });
      if (captain.length > 100) {
        errors.push({ field: 'captain', message: 'Captain name must be less than 100 characters' });
      }
    }
    
    // Email validation (optional)
    if (teamData.contact_email && typeof teamData.contact_email === 'string') {
      const email = teamData.contact_email.trim();
      if (!validator.isEmail(email)) {
        errors.push({ field: 'contact_email', message: 'Invalid email format' });
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      sanitized: {
        name: this.sanitizeString(teamData.name || '', { maxLength: 100, removeSpecialChars: true }),
        captain: teamData.captain ? this.sanitizeString(teamData.captain, { maxLength: 100 }) : null,
        contact_email: teamData.contact_email ? teamData.contact_email.trim().toLowerCase() : null
      }
    };
  }

  static validateTournament(tournamentData) {
    const errors = [];
    
    // Tournament name validation
    if (!tournamentData.name || typeof tournamentData.name !== 'string') {
      errors.push({ field: 'name', message: 'Tournament name is required' });
    } else {
      const name = this.sanitizeString(tournamentData.name, { maxLength: 255 });
      if (name.length < 3) {
        errors.push({ field: 'name', message: 'Tournament name must be at least 3 characters long' });
      }
    }
    
    // Season validation
    if (tournamentData.season && typeof tournamentData.season === 'string') {
      const season = this.sanitizeString(tournamentData.season, { maxLength: 100 });
      if (season.length > 100) {
        errors.push({ field: 'season', message: 'Season must be less than 100 characters' });
      }
    }
    
    // Total teams validation
    if (tournamentData.total_teams !== undefined) {
      const totalTeams = parseInt(tournamentData.total_teams);
      if (isNaN(totalTeams) || totalTeams < 2 || totalTeams > 100) {
        errors.push({ field: 'total_teams', message: 'Total teams must be a number between 2 and 100' });
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      sanitized: {
        name: this.sanitizeString(tournamentData.name || '', { maxLength: 255 }),
        season: tournamentData.season ? this.sanitizeString(tournamentData.season, { maxLength: 100 }) : null,
        total_teams: parseInt(tournamentData.total_teams) || 18
      }
    };
  }

  static validateGameResult(resultData) {
    const errors = [];
    
    // Home score validation
    if (resultData.home_score !== undefined) {
      const homeScore = parseInt(resultData.home_score);
      if (isNaN(homeScore) || homeScore < 0 || homeScore > 50) {
        errors.push({ field: 'home_score', message: 'Home score must be a number between 0 and 50' });
      }
    }
    
    // Away score validation
    if (resultData.away_score !== undefined) {
      const awayScore = parseInt(resultData.away_score);
      if (isNaN(awayScore) || awayScore < 0 || awayScore > 50) {
        errors.push({ field: 'away_score', message: 'Away score must be a number between 0 and 50' });
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      sanitized: {
        home_score: resultData.home_score !== undefined ? parseInt(resultData.home_score) : null,
        away_score: resultData.away_score !== undefined ? parseInt(resultData.away_score) : null
      }
    };
  }

  static validateAnnouncement(announcementData) {
    const errors = [];
    
    // Title validation
    if (!announcementData.title || typeof announcementData.title !== 'string') {
      errors.push({ field: 'title', message: 'Announcement title is required' });
    } else {
      const title = this.sanitizeString(announcementData.title, { maxLength: 255 });
      if (title.length < 3) {
        errors.push({ field: 'title', message: 'Title must be at least 3 characters long' });
      }
    }
    
    // Message validation
    if (!announcementData.message || typeof announcementData.message !== 'string') {
      errors.push({ field: 'message', message: 'Announcement message is required' });
    } else {
      const message = this.sanitizeString(announcementData.message, { maxLength: 1000 });
      if (message.length < 5) {
        errors.push({ field: 'message', message: 'Message must be at least 5 characters long' });
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      sanitized: {
        title: this.sanitizeString(announcementData.title || '', { maxLength: 255 }),
        message: this.sanitizeString(announcementData.message || '', { maxLength: 1000 })
      }
    };
  }

  static validateTimeFormat(time) {
    if (!time || typeof time !== 'string') return false;
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }

  static validateDateFormat(date) {
    if (!date || typeof date !== 'string') return false;
    const parsedDate = new Date(date);
    return parsedDate instanceof Date && !isNaN(parsedDate);
  }
}

module.exports = { Validator, ValidationError };