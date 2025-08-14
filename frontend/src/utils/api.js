// frontend/src/utils/api.js
// Shared API functions for tournament management

import axios from "axios";

// Handle API URL for both development and production
const rawApiUrl = (typeof process !== 'undefined' && (process.env?.REACT_APP_API_URL || process.env?.REACT_APP_API_BASE_URL)) || "http://localhost:3002";
// If API_URL is just '/api', we use empty string so paths like '/api/admin/login' work correctly
export const API_URL = rawApiUrl === '/api' ? '' : rawApiUrl;

// Helper to construct API URLs
const getApiUrl = (endpoint) => {
  return `${API_URL}${endpoint}`;
};

// API Functions
export const fetchTournaments = () => 
  axios.get(getApiUrl('/api/tournaments')).catch(() => ({ data: [] }));

export const fetchTeams = () => 
  axios.get(getApiUrl('/api/teams')).catch(() => ({ data: [] }));

export const fetchPools = (tournamentId) => 
  axios.get(getApiUrl(`/api/tournaments/${tournamentId}/pools`));

export const fetchGames = (tournamentId) => 
  axios.get(getApiUrl(`/api/tournaments/${tournamentId}/games`));

export const createTeam = (teamData) => 
  axios.post(getApiUrl('/api/teams'), teamData);

export const deleteTeam = (teamId) => 
  axios.delete(getApiUrl(`/api/teams/${teamId}`));

export const updateTeam = (teamId, data) => 
  axios.put(getApiUrl(`/api/teams/${teamId}`), data);

export const generatePools = (tournamentId, poolSettings) => 
  axios.post(getApiUrl(`/api/tournaments/${tournamentId}/pools/generate`), poolSettings);

export const createPool = (tournamentId, poolData) => 
  axios.post(getApiUrl(`/api/tournaments/${tournamentId}/pools`), poolData);

export const updatePool = (poolId, poolData) => 
  axios.put(getApiUrl(`/api/pools/${poolId}`), poolData);

export const deletePool = (poolId) => 
  axios.delete(getApiUrl(`/api/pools/${poolId}`));

export const generateSchedule = (poolId, settings) => 
  axios.post(getApiUrl(`/api/pools/${poolId}/schedule-with-settings`), settings);

export const updateTournament = (tournamentId, data) => 
  axios.put(getApiUrl(`/api/tournaments/${tournamentId}`), data);

export const createTournament = (data) => 
  axios.post(getApiUrl('/api/tournaments'), data);

export const submitGameResult = (gameId, resultData) => 
  axios.post(`${API_URL}/api/games/${gameId}/result`, resultData);

export const updateGame = (gameId, gameData) => 
  axios.put(`${API_URL}/api/games/${gameId}`, gameData);

export const fetchStandings = (tournamentId) => 
  axios.get(`${API_URL}/api/tournaments/${tournamentId}/standings`);

export const fetchAnnouncements = (tournamentId) => 
  axios.get(`${API_URL}/api/tournaments/${tournamentId}/announcements`);

export const createAnnouncement = (tournamentId, data) => 
  axios.post(`${API_URL}/api/tournaments/${tournamentId}/announcements`, data);

export const deleteAnnouncement = (announcementId) => 
  axios.delete(`${API_URL}/api/announcements/${announcementId}`);

export const resetAnnouncements = (tournamentId) => 
  axios.delete(`${API_URL}/api/tournaments/${tournamentId}/announcements/reset`);

// Utility Functions
export const showMessage = (setError, setSuccess, message, isError = false) => {
  if (isError) {
    setError(message);
    setTimeout(() => setError(""), 5000);
  } else {
    setSuccess(message);
    setTimeout(() => setSuccess(""), 3000);
  }
};

// Calculate standings from games data (client-side backup)
export const calculateStandings = (teams, games) => {
  const standings = teams.map(team => ({
    ...team,
    games_played: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    goals_for: 0,
    goals_against: 0,
    goal_difference: 0,
    points: 0
  }));

  games.forEach(game => {
    if (game.status === 'completed' && game.home_score !== null && game.away_score !== null) {
      const homeTeam = standings.find(t => t.id === game.home_team_id);
      const awayTeam = standings.find(t => t.id === game.away_team_id);
      
      if (homeTeam && awayTeam) {
        homeTeam.games_played++;
        awayTeam.games_played++;
        homeTeam.goals_for += game.home_score;
        homeTeam.goals_against += game.away_score;
        awayTeam.goals_for += game.away_score;
        awayTeam.goals_against += game.home_score;
        
        if (game.home_score > game.away_score) {
          homeTeam.wins++;
          homeTeam.points += 3;
          awayTeam.losses++;
        } else if (game.home_score < game.away_score) {
          awayTeam.wins++;
          awayTeam.points += 3;
          homeTeam.losses++;
        } else {
          homeTeam.ties++;
          awayTeam.ties++;
          homeTeam.points += 1;
          awayTeam.points += 1;
        }
        
        homeTeam.goal_difference = homeTeam.goals_for - homeTeam.goals_against;
        awayTeam.goal_difference = awayTeam.goals_for - awayTeam.goals_against;
      }
    }
  });

  return standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
    return b.goals_for - a.goals_for;
  });
};

// ========================================
// PLAYOFF API FUNCTIONS
// ========================================

export const fetchPlayoffs = async (tournamentId = 1) => {
  try {
    const response = await fetch(`${API_URL}/api/tournaments/${tournamentId}/playoffs`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("❌ Error fetching playoffs:", error);
    return { success: false, error: error.message };
  }
};

export const generatePlayoffBracket = async (tournamentId = 1, customSeeding = null) => {
  try {
    const requestBody = customSeeding ? { customSeeding } : {};
    
    const response = await fetch(`${API_URL}/api/tournaments/${tournamentId}/playoffs/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("❌ Error generating playoff bracket:", error);
    return { success: false, error: error.message };
  }
};

export const submitPlayoffResult = async (gameId, result) => {
  try {
    const response = await fetch(`${API_URL}/api/playoff-games/${gameId}/result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("❌ Error submitting playoff result:", error);
    return { success: false, error: error.message };
  }
};

export const schedulePlayoffGame = async (gameId, schedule) => {
  try {
    const response = await fetch(`${API_URL}/api/playoff-games/${gameId}/schedule`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(schedule)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("❌ Error scheduling playoff game:", error);
    return { success: false, error: error.message };
  }
};

// ========================================
// ENHANCED API FUNCTIONS
// ========================================

// Statistics API functions
export const fetchTournamentSummary = (tournamentId) =>
  axios.get(`${API_URL}/api/statistics/tournaments/${tournamentId}/summary`);

export const fetchDetailedStandings = (tournamentId) =>
  axios.get(`${API_URL}/api/statistics/tournaments/${tournamentId}/standings/detailed`);

export const fetchTopPerformers = (tournamentId, limit = 5) =>
  axios.get(`${API_URL}/api/statistics/tournaments/${tournamentId}/top-performers?limit=${limit}`);

export const fetchGameAnalytics = (tournamentId) =>
  axios.get(`${API_URL}/api/statistics/tournaments/${tournamentId}/analytics/games`);

export const fetchPoolAnalytics = (tournamentId) =>
  axios.get(`${API_URL}/api/statistics/tournaments/${tournamentId}/analytics/pools`);

// Backup API functions
export const createBackup = (tournamentId = null) =>
  axios.post(`${API_URL}/api/admin/backup`, { tournamentId }, { withCredentials: true });

export const listBackups = () =>
  axios.get(`${API_URL}/api/admin/backups`, { withCredentials: true });

export const restoreBackup = (backupName) =>
  axios.post(`${API_URL}/api/admin/backup/${backupName}/restore`, {}, { withCredentials: true });

export const deleteBackup = (backupName) =>
  axios.delete(`${API_URL}/api/admin/backup/${backupName}`, { withCredentials: true });

// System stats
export const fetchSystemStats = () =>
  axios.get(`${API_URL}/api/system/stats`, { withCredentials: true });