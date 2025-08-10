// frontend/src/components/tabs/ScheduleGridTab.js
// Manual Schedule Grid Interface for Tournament Management

import React, { useState, useEffect } from "react";
import { Grid, Users, Check, X, AlertTriangle, Download, Trash2, Edit2 } from "lucide-react";

const ScheduleGridTab = ({ 
  teams,
  tournament,
  loading, 
  setLoading, 
  error, 
  setError, 
  success, 
  setSuccess, 
  onDataChange 
}) => {
  const [scheduleGrid, setScheduleGrid] = useState({});
  const [fieldNames, setFieldNames] = useState([]);
  const [windowTypes, setWindowTypes] = useState({});
  const [validationErrors, setValidationErrors] = useState([]);
  const [selectedCell, setSelectedCell] = useState(null);
  const [assigningTeams, setAssigningTeams] = useState({ team1: '', team2: '' });

  useEffect(() => {
    if (tournament) {
      fetchScheduleGrid();
    }
  }, [tournament]);

  const fetchScheduleGrid = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/tournaments/${tournament.id}/schedule-grid`);
      const data = await response.json();
      
      if (response.ok) {
        setScheduleGrid(data.schedule_grid);
        setFieldNames(data.field_names);
        setWindowTypes(data.window_types);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error("Error fetching schedule grid:", error);
      setError(`Failed to load schedule: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const assignGame = async (window, field, team1Id, team2Id) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/tournaments/${tournament.id}/schedule-grid/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          window: parseInt(window),
          field: field,
          team1_id: parseInt(team1Id),
          team2_id: parseInt(team2Id)
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        setSuccess(`Game assigned: Teams ${getTeamName(team1Id)} vs ${getTeamName(team2Id)}`);
        fetchScheduleGrid(); // Refresh the grid
        setSelectedCell(null);
        setAssigningTeams({ team1: '', team2: '' });
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error("Error assigning game:", error);
      setError(`Failed to assign game: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const clearGame = async (window, field) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/tournaments/${tournament.id}/schedule-grid/${window}/${field}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      
      if (response.ok) {
        setSuccess(`Game cleared from Window ${window}, ${field}`);
        fetchScheduleGrid(); // Refresh the grid
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error("Error clearing game:", error);
      setError(`Failed to clear game: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const validateSchedule = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/tournaments/${tournament.id}/schedule-grid/validate`);
      const data = await response.json();
      
      if (response.ok) {
        setValidationErrors(data.errors);
        if (data.valid) {
          setSuccess("Schedule is valid! All teams have exactly 2 pool games.");
        } else {
          setError(`Schedule has ${data.errors.length} validation errors.`);
        }
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error("Error validating schedule:", error);
      setError(`Failed to validate schedule: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getTeamName = (teamId) => {
    const team = teams.find(t => t.id === parseInt(teamId));
    return team ? team.name : `Team ${teamId}`;
  };

  const handleCellClick = (window, field) => {
    setSelectedCell({ window, field });
    const currentGame = scheduleGrid[window]?.[field];
    if (currentGame && currentGame.team1 && currentGame.team2) {
      setAssigningTeams({
        team1: currentGame.team1.toString(),
        team2: currentGame.team2.toString()
      });
    } else {
      setAssigningTeams({ team1: '', team2: '' });
    }
  };

  const handleAssignGame = () => {
    if (selectedCell && assigningTeams.team1 && assigningTeams.team2) {
      assignGame(selectedCell.window, selectedCell.field, assigningTeams.team1, assigningTeams.team2);
    }
  };

  const exportToCSV = () => {
    let csv = "Window,Field,Team 1,Team 2,Type\n";
    
    Object.entries(scheduleGrid).forEach(([window, fields]) => {
      Object.entries(fields).forEach(([field, game]) => {
        csv += `${window},${field},${game.team1_name || ''},${game.team2_name || ''},${windowTypes[window] || ''}\n`;
      });
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tournament-schedule-${tournament.name}.csv`;
    a.click();
  };

  if (loading) {
    return <div className="text-center py-12">Loading schedule grid...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Manual Schedule Grid</h2>
        <div className="flex space-x-3">
          <button
            onClick={validateSchedule}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center space-x-2"
          >
            <Check className="w-4 h-4" />
            <span>Validate</span>
          </button>
          <button
            onClick={exportToCSV}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="font-medium text-red-800 mb-2 flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2" />
            Validation Errors:
          </h4>
          <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
            {validationErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Schedule Grid */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-3 text-left font-medium">Window</th>
              {fieldNames.map(field => (
                <th key={field} className="px-4 py-3 text-center font-medium">{field}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(scheduleGrid).map(([window, fields]) => (
              <tr key={window} className="border-t">
                <td className="px-4 py-3 font-medium bg-gray-50">
                  <div>
                    <div className="text-lg">Window {window}</div>
                    <div className="text-sm text-gray-600">{windowTypes[window]}</div>
                  </div>
                </td>
                {fieldNames.map(field => {
                  const game = fields[field];
                  const isEmpty = !game.team1 || !game.team2;
                  const isSelected = selectedCell?.window == window && selectedCell?.field === field;
                  
                  return (
                    <td 
                      key={field} 
                      className={`px-2 py-3 text-center cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-100' : isEmpty ? 'bg-gray-50 hover:bg-gray-100' : 'bg-white hover:bg-gray-50'
                      }`}
                      onClick={() => handleCellClick(window, field)}
                    >
                      {isEmpty ? (
                        <div className="text-gray-400 text-sm">Click to assign</div>
                      ) : (
                        <div className="space-y-1">
                          <div className="font-medium text-sm">
                            {game.team1_name} vs {game.team2_name}
                          </div>
                          <div className="flex justify-center space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCellClick(window, field);
                              }}
                              className="text-yellow-500 hover:text-yellow-700 p-1"
                              title="Edit game"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                clearGame(window, field);
                              }}
                              className="text-red-500 hover:text-red-700 p-1"
                              title="Clear game"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Assignment Modal */}
      {selectedCell && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">
              Assign Game - Window {selectedCell.window}, {selectedCell.field}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Team 1</label>
                <select
                  value={assigningTeams.team1}
                  onChange={(e) => setAssigningTeams({...assigningTeams, team1: e.target.value})}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select Team 1</option>
                  {teams.map(team => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Team 2</label>
                <select
                  value={assigningTeams.team2}
                  onChange={(e) => setAssigningTeams({...assigningTeams, team2: e.target.value})}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select Team 2</option>
                  {teams.map(team => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleAssignGame}
                  disabled={!assigningTeams.team1 || !assigningTeams.team2 || assigningTeams.team1 === assigningTeams.team2}
                  className="flex-1 bg-blue-500 text-white py-2 rounded hover:bg-blue-600 disabled:bg-gray-300"
                >
                  Assign Game
                </button>
                <button
                  onClick={() => setSelectedCell(null)}
                  className="flex-1 bg-gray-500 text-white py-2 rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-800 mb-2">📋 How to use the Schedule Grid:</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• <strong>Windows 1-7:</strong> Pool Play (each team must play exactly 2 games)</li>
          <li>• <strong>Windows 8-10:</strong> Playoffs (Quarterfinals, Semifinals, Finals)</li>
          <li>• <strong>Click any cell</strong> to assign teams to that time slot and field</li>
          <li>• <strong>Click trash icon</strong> to clear a game assignment</li>
          <li>• <strong>Validate button</strong> checks for schedule conflicts and requirements</li>
          <li>• <strong>Export CSV</strong> downloads the complete schedule for external use</li>
        </ul>
      </div>
    </div>
  );
};

export default ScheduleGridTab;