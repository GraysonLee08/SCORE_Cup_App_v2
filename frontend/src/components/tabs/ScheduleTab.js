// frontend/src/components/tabs/ScheduleTab.js
// Simple manual game entry and schedule display

import React, { useState } from "react";
import { Calendar, Clock, MapPin, Plus, AlertTriangle, Edit2, Trash2, X, Save, Info } from "lucide-react";
import { API_URL } from "../../utils/api";

const ScheduleTab = ({ 
  games, 
  teams,
  tournamentSettings,
  loading, 
  setLoading, 
  error, 
  setError, 
  success, 
  setSuccess, 
  onDataChange 
}) => {
  const [newGame, setNewGame] = useState({
    home_team_id: "",
    away_team_id: "",
    field: "",
    scheduled_start_time: "",
  });
  const [validationError, setValidationError] = useState("");
  const [editingGame, setEditingGame] = useState(null);
  const [editForm, setEditForm] = useState({
    home_team_id: "",
    away_team_id: "",
    field: "",
    scheduled_start_time: "",
  });

  // Function to convert military time to AM/PM format
  const formatTimeToAMPM = (militaryTime) => {
    if (!militaryTime) return '';
    
    const [hours, minutes] = militaryTime.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Get field names from tournament settings
  const fieldNames = tournamentSettings?.field_names || ["Field 1", "Field 2", "Field 3", "Field 4"];
  const gameDuration = tournamentSettings?.game_duration || 45; // minutes
  const breakDuration = tournamentSettings?.break_duration || 10; // minutes
  const startTime = tournamentSettings?.start_time || "09:00";
  const endTime = tournamentSettings?.end_time || "17:00";

  // Calculate available kick-off times based on tournament schedule
  const calculateAvailableKickOffTimes = () => {
    const times = [];
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;
    const slotDuration = gameDuration + breakDuration; // Total time per game slot
    
    let currentMinutes = startTotalMinutes;
    
    while (currentMinutes + gameDuration <= endTotalMinutes) {
      const hours = Math.floor(currentMinutes / 60);
      const minutes = currentMinutes % 60;
      const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      times.push(timeString);
      currentMinutes += slotDuration;
    }
    
    return times;
  };

  const availableKickOffTimes = calculateAvailableKickOffTimes();
  
  const resetForm = () => {
    setNewGame({
      home_team_id: "",
      away_team_id: "",
      field: "",
      scheduled_start_time: "",
    });
    setValidationError("");
  };

  const resetEditForm = () => {
    setEditingGame(null);
    setEditForm({
      home_team_id: "",
      away_team_id: "",
      field: "",
      scheduled_start_time: "",
    });
    setValidationError("");
  };

  const validateGame = (gameData, excludeGameId = null) => {
    const { home_team_id, away_team_id, field, scheduled_start_time } = gameData;
    
    if (home_team_id === away_team_id) {
      return "A team cannot play against itself";
    }
    
    const gameStart = new Date(`2024-01-01T${scheduled_start_time}`);
    const gameEnd = new Date(gameStart.getTime() + (gameDuration + breakDuration) * 60000);
    
    // Check for team conflicts - no team can play multiple games at the same time
    for (const existingGame of games) {
      if (!existingGame.scheduled_start_time) continue;
      if (excludeGameId && existingGame.id === excludeGameId) continue; // Skip the game being edited
      
      const existingStart = new Date(`2024-01-01T${existingGame.scheduled_start_time}`);
      const existingEnd = new Date(existingStart.getTime() + (gameDuration + breakDuration) * 60000);
      
      // Check if times overlap
      if (gameStart < existingEnd && gameEnd > existingStart) {
        // Check if either team is involved in the conflicting game
        if (existingGame.home_team_id.toString() === home_team_id || 
            existingGame.away_team_id.toString() === home_team_id ||
            existingGame.home_team_id.toString() === away_team_id || 
            existingGame.away_team_id.toString() === away_team_id) {
          const conflictingTeam = teams.find(t => 
            t.id.toString() === home_team_id || t.id.toString() === away_team_id
          );
          return `Team conflict: ${conflictingTeam?.name || 'Team'} is already playing at ${existingGame.scheduled_start_time}`;
        }
      }
    }
    
    // Check for field conflicts - no two games on same field at overlapping times
    for (const existingGame of games) {
      if (!existingGame.scheduled_start_time || existingGame.field !== field) continue;
      if (excludeGameId && existingGame.id === excludeGameId) continue; // Skip the game being edited
      
      const existingStart = new Date(`2024-01-01T${existingGame.scheduled_start_time}`);
      const existingEnd = new Date(existingStart.getTime() + (gameDuration + breakDuration) * 60000);
      
      // Check if times overlap
      if (gameStart < existingEnd && gameEnd > existingStart) {
        return `Field conflict: ${field} is already booked from ${existingGame.scheduled_start_time} to ${existingEnd.toTimeString().slice(0,5)}`;
      }
    }
    
    return null;
  };

  const handleSubmitGame = async () => {
    if (!newGame.home_team_id || !newGame.away_team_id || !newGame.field || !newGame.scheduled_start_time) {
      setValidationError("Please fill in all fields");
      return;
    }
    
    const validationErr = validateGame(newGame);
    if (validationErr) {
      setValidationError(validationErr);
      return;
    }
    
    try {
      setLoading(true);
      setValidationError("");
      
      const response = await fetch(`${API_URL}/api/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          home_team_id: parseInt(newGame.home_team_id),
          away_team_id: parseInt(newGame.away_team_id),
          field: newGame.field,
          scheduled_start_time: newGame.scheduled_start_time,
          status: 'scheduled'
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        const homeTeam = teams.find(t => t.id.toString() === newGame.home_team_id);
        const awayTeam = teams.find(t => t.id.toString() === newGame.away_team_id);
        setSuccess(`Game scheduled: ${homeTeam?.name} vs ${awayTeam?.name} at ${newGame.scheduled_start_time} on ${newGame.field}`);
        resetForm();
        onDataChange(); // Refresh the data
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error("Error creating game:", error);
      setError(`Failed to schedule game: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditGame = (game) => {
    setEditingGame(game.id);
    setEditForm({
      home_team_id: game.home_team_id.toString(),
      away_team_id: game.away_team_id.toString(),
      field: game.field,
      scheduled_start_time: game.scheduled_start_time,
    });
    setValidationError("");
  };

  const handleUpdateGame = async () => {
    if (!editForm.home_team_id || !editForm.away_team_id || !editForm.field || !editForm.scheduled_start_time) {
      setValidationError("Please fill in all fields");
      return;
    }
    
    const validationErr = validateGame(editForm, editingGame);
    if (validationErr) {
      setValidationError(validationErr);
      return;
    }
    
    try {
      setLoading(true);
      setValidationError("");
      
      const response = await fetch(`${API_URL}/api/games/${editingGame}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          home_team_id: parseInt(editForm.home_team_id),
          away_team_id: parseInt(editForm.away_team_id),
          field: editForm.field,
          scheduled_start_time: editForm.scheduled_start_time,
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        const homeTeam = teams.find(t => t.id.toString() === editForm.home_team_id);
        const awayTeam = teams.find(t => t.id.toString() === editForm.away_team_id);
        setSuccess(`Game updated: ${homeTeam?.name} vs ${awayTeam?.name} at ${editForm.scheduled_start_time} on ${editForm.field}`);
        resetEditForm();
        onDataChange(); // Refresh the data
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error("Error updating game:", error);
      setError(`Failed to update game: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGame = async (gameId, gameDesc) => {
    if (!window.confirm(`Are you sure you want to delete this game: ${gameDesc}?`)) {
      return;
    }

    try {
      setLoading(true);
      
      const response = await fetch(`${API_URL}/api/games/${gameId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess(`Game deleted: ${gameDesc}`);
        onDataChange(); // Refresh the data
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error("Error deleting game:", error);
      setError(`Failed to delete game: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Create schedule table data organized by time slots and fields
  const createScheduleTable = () => {
    const timeSlots = [...new Set(games
      .filter(game => game.scheduled_start_time)
      .map(game => game.scheduled_start_time)
    )].sort();

    return timeSlots.map(time => {
      const row = { time };
      fieldNames.forEach(field => {
        const game = games.find(g => 
          g.scheduled_start_time === time && g.field === field
        );
        row[field] = game ? {
          homeTeam: game.home_team_name || `Team ${game.home_team_id}`,
          awayTeam: game.away_team_name || `Team ${game.away_team_id}`,
          status: game.status,
          id: game.id
        } : null;
      });
      return row;
    });
  };

  const scheduleData = createScheduleTable();

  const scheduleContent = (
    <>
      <div style={{ textAlign: "center", marginBottom: "2rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
        <h2>Manual Schedule Builder</h2>
        <div style={{ position: "relative", display: "inline-block" }}>
          <Info className="w-5 h-5" style={{ color: "var(--primary-color)", cursor: "help" }} />
          <div style={{ 
            position: "absolute", 
            left: "50%", 
            transform: "translateX(-50%)", 
            bottom: "100%", 
            marginBottom: "0.5rem", 
            opacity: 0, 
            transition: "opacity 0.3s", 
            zIndex: 50,
            pointerEvents: "none"
          }} className="schedule-tooltip">
            <div style={{ 
              background: "#000", 
              color: "#fff", 
              fontSize: "0.75rem", 
              borderRadius: "4px", 
              padding: "0.75rem", 
              whiteSpace: "nowrap", 
              maxWidth: "20rem", 
              textAlign: "left"
            }}>
              <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>📋 Scheduling Rules & Controls:</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                <li>• No team can play multiple games at the same time</li>
                <li>• No field can host multiple games at overlapping times</li>
                <li>• Game duration: {gameDuration} minutes + {breakDuration} minute break</li>
                <li>• All fields: {fieldNames.join(", ")}</li>
                <li>• Edit/Delete buttons are visible on ALL games</li>
                <li>• You can edit or delete any game, including completed ones</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      
      {/* 2-Column Layout */}
      <div className="content-wrapper">
        {/* Column 1 - Add New Game */}
        <div className="col-one-third">
          <div className="content-card">
            <div className="form-group">
              <label className="form-label">Home Team</label>
              <select
                value={newGame.home_team_id}
                onChange={(e) => setNewGame({...newGame, home_team_id: e.target.value})}
              >
                <option value="">Select Home Team</option>
                {teams.map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">Away Team</label>
              <select
                value={newGame.away_team_id}
                onChange={(e) => setNewGame({...newGame, away_team_id: e.target.value})}
              >
                <option value="">Select Away Team</option>
                {teams.map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">Field</label>
              <select
                value={newGame.field}
                onChange={(e) => setNewGame({...newGame, field: e.target.value})}
              >
                <option value="">Select Field</option>
                {fieldNames.map(field => (
                  <option key={field} value={field}>{field}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">Kick-off Time</label>
              <select
                value={newGame.scheduled_start_time}
                onChange={(e) => setNewGame({...newGame, scheduled_start_time: e.target.value})}
              >
                <option value="">Select Kick-off Time</option>
                {availableKickOffTimes.map(time => (
                  <option key={time} value={time}>{formatTimeToAMPM(time)}</option>
                ))}
              </select>
              <div style={{ fontSize: "0.875rem", color: "var(--text-light)", marginTop: "0.25rem" }}>
                Available times based on {gameDuration}min games + {breakDuration}min breaks ({formatTimeToAMPM(startTime)} - {formatTimeToAMPM(endTime)})
              </div>
            </div>
            
            {validationError && (
              <div style={{ 
                marginTop: "1rem", 
                padding: "0.75rem", 
                background: "#fef2f2", 
                border: "1px solid #fecaca", 
                borderRadius: "4px", 
                display: "flex", 
                alignItems: "flex-start"
              }}>
                <AlertTriangle className="w-5 h-5" style={{ color: "#b91c1c", marginRight: "0.5rem", flexShrink: 0 }} />
                <span style={{ fontSize: "0.875rem", color: "#b91c1c" }}>{validationError}</span>
              </div>
            )}
            
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={handleSubmitGame}
                disabled={loading}
                className="btn"
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <Plus className="w-4 h-4" />
                {loading ? "Adding..." : "Add Game"}
              </button>
              <button
                onClick={resetForm}
                className="btn"
                style={{ backgroundColor: "#ccc", color: "#333" }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Column 2 - Tournament Schedule */}
        <div className="col-two-thirds">
          <div className="content-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid #e0e0e0" }}>
              <h3 style={{ display: "flex", alignItems: "center" }}>
                <Calendar className="w-5 h-5" style={{ marginRight: "0.5rem" }} />
                Tournament Schedule
              </h3>
              <p style={{ fontSize: "0.875rem", color: "var(--text-light)" }}>
                {games.length} games scheduled • {gameDuration} min games
              </p>
            </div>
            
            {scheduleData.length === 0 ? (
              <div className="empty-state">
                <Calendar className="empty-state-icon" />
                <p className="empty-state-title">No games scheduled yet</p>
                <p className="empty-state-text">Use the form to the left to add your first game</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="tournament-table">
                  <thead>
                    <tr>
                      <th>
                        <Clock className="w-4 h-4 inline mr-1" />
                        Time
                      </th>
                      {fieldNames.map(field => (
                        <th key={field} className="center">
                          <MapPin className="w-4 h-4 inline mr-1" />
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleData.map((row, index) => (
                      <tr key={row.time}>
                        <td className="font-medium">{formatTimeToAMPM(row.time)}</td>
                        {fieldNames.map(field => (
                          <td key={field} className="center">
                            {row[field] ? (
                              <div style={{ 
                                backgroundColor: "#dbeafe", 
                                color: "#1e40af", 
                                padding: "0.5rem", 
                                borderRadius: "4px", 
                                fontSize: "0.875rem",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "0.5rem"
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
                                  <span style={{ fontWeight: "500" }}>
                                    {row[field].homeTeam} vs {row[field].awayTeam}
                                  </span>
                                  <span style={{ 
                                    fontSize: "0.75rem", 
                                    textTransform: "capitalize",
                                    backgroundColor: "rgba(30, 64, 175, 0.1)",
                                    padding: "0.125rem 0.375rem",
                                    borderRadius: "3px"
                                  }}>
                                    {row[field].status}
                                  </span>
                                </div>
                                <div style={{ display: "flex", gap: "0.25rem", flexShrink: 0 }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const game = games.find(g => g.id === row[field].id);
                                      handleEditGame(game);
                                    }}
                                    style={{
                                      padding: "0.125rem",
                                      borderRadius: "2px",
                                      border: "none",
                                      cursor: "pointer",
                                      color: "white",
                                      fontSize: "0.625rem",
                                      backgroundColor: "var(--accent-color)",
                                      transition: "background-color 0.15s ease-in-out"
                                    }}
                                    title="Edit game"
                                  >
                                    <Edit2 className="w-2 h-2" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const gameDesc = `${row[field].homeTeam} vs ${row[field].awayTeam} at ${row.time}`;
                                      handleDeleteGame(row[field].id, gameDesc);
                                    }}
                                    style={{
                                      padding: "0.125rem",
                                      borderRadius: "2px",
                                      border: "none",
                                      cursor: "pointer",
                                      color: "white",
                                      fontSize: "0.625rem",
                                      backgroundColor: "#ef4444",
                                      transition: "background-color 0.15s ease-in-out"
                                    }}
                                    title="Delete game"
                                  >
                                    <Trash2 className="w-2 h-2" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="open-slot">Open</div>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );

  const editModal = editingGame && (
    <div className="modal-overlay">
      {/* Close button */}
      <button
        onClick={resetEditForm}
        className="modal-close-btn"
      >
        &times;
      </button>

      {/* Overlay content */}
      <div className="modal-content-wrapper">
        <div className="modal-content">
          <h3 className="modal-header">
            <Edit2 className="w-6 h-6 mr-3" />
            Edit Game
          </h3>
          
          <div className="modal-form-grid">
            <div className="modal-form-group">
              <label className="form-label">Home Team</label>
              <select
                value={editForm.home_team_id}
                onChange={(e) => setEditForm({...editForm, home_team_id: e.target.value})}
                className="modal-form-select"
              >
                <option value="">Select Home Team</option>
                {teams.map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
            
            <div className="modal-form-group">
              <label className="form-label">Away Team</label>
              <select
                value={editForm.away_team_id}
                onChange={(e) => setEditForm({...editForm, away_team_id: e.target.value})}
                className="modal-form-select"
              >
                <option value="">Select Away Team</option>
                {teams.map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
            
            <div className="modal-form-group">
              <label className="form-label">Field</label>
              <select
                value={editForm.field}
                onChange={(e) => setEditForm({...editForm, field: e.target.value})}
                className="modal-form-select"
              >
                <option value="">Select Field</option>
                {fieldNames.map(field => (
                  <option key={field} value={field}>{field}</option>
                ))}
              </select>
            </div>
            
            <div className="modal-form-group">
              <label className="form-label">Kick-off Time</label>
              <select
                value={editForm.scheduled_start_time}
                onChange={(e) => setEditForm({...editForm, scheduled_start_time: e.target.value})}
                className="modal-form-select"
              >
                <option value="">Select Kick-off Time</option>
                {availableKickOffTimes.map(time => (
                  <option key={time} value={time}>{formatTimeToAMPM(time)}</option>
                ))}
              </select>
            </div>
          </div>
          
          {validationError && (
            <div className="validation-error">
              <AlertTriangle className="w-6 h-6 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
              <span className="error-text">{validationError}</span>
            </div>
          )}
          
          <div className="modal-buttons">
            <button
              onClick={handleUpdateGame}
              disabled={loading}
              className="modal-btn-large modal-btn-save"
            >
              <Save className="w-5 h-5" />
              {loading ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={resetEditForm}
              className="modal-btn-large modal-btn-cancel"
            >
              <X className="w-5 h-5" />
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {scheduleContent}
      {editModal}
    </>
  );
};

export default ScheduleTab;