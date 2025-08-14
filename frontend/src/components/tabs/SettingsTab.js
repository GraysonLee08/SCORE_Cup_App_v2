// frontend/src/components/tabs/SettingsTab.js
// Settings management tab component

import React, { useState, useEffect } from "react";
import { updateTournament, createTournament, showMessage, fetchPools, generatePools, updatePool, deletePool, API_URL } from "../../utils/api";

const SettingsTab = ({ 
  tournament, 
  setTournament,
  tournamentSettings, 
  setTournamentSettings, 
  loading, 
  setLoading, 
  error, 
  setError, 
  success, 
  setSuccess, 
  onDataChange 
}) => {
  const [pools, setPools] = useState([]);
  const [editingPool, setEditingPool] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    if (tournament) {
      fetchPoolsData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament]);

  const fetchPoolsData = async () => {
    try {
      const response = await fetchPools(tournament.id);
      setPools(response.data);
    } catch (error) {
      console.error("Error fetching pools:", error);
    }
  };

  const updatePoolCount = (newCount) => {
    const currentNames = tournamentSettings.pool_settings.poolNames;
    const newNames = [];
    
    for (let i = 0; i < newCount; i++) {
      if (currentNames[i]) {
        newNames.push(currentNames[i]);
      } else {
        const defaultLetter = String.fromCharCode(65 + i); // A, B, C, D...
        newNames.push(`Pool ${defaultLetter}`);
      }
    }
    
    setTournamentSettings({
      ...tournamentSettings,
      pool_settings: {
        ...tournamentSettings.pool_settings,
        numberOfPools: newCount,
        poolNames: newNames
      }
    });
  };

  const updatePoolName = (index, name) => {
    const newNames = [...tournamentSettings.pool_settings.poolNames];
    newNames[index] = name;
    setTournamentSettings({
      ...tournamentSettings,
      pool_settings: {
        ...tournamentSettings.pool_settings,
        poolNames: newNames
      }
    });
  };

  const updateTeamsPerPool = (teamsPerPool) => {
    setTournamentSettings({
      ...tournamentSettings,
      pool_settings: {
        ...tournamentSettings.pool_settings,
        teamsPerPool: teamsPerPool
      }
    });
  };

  const saveTournamentSettings = async () => {
    try {
      setLoading(true);
      console.log("💾 Saving tournament settings:", tournamentSettings);

      if (tournament) {
        const response = await updateTournament(tournament.id, {
          name: tournamentSettings.name,
          season: tournamentSettings.season,
          total_teams: tournamentSettings.total_teams,
          status: tournament.status,
          settings: {
            start_time: tournamentSettings.start_time,
            end_time: tournamentSettings.end_time,
            number_of_fields: tournamentSettings.number_of_fields,
            field_names: tournamentSettings.field_names,
            game_duration: tournamentSettings.game_duration,
            break_duration: tournamentSettings.break_duration,
            min_games_per_team: tournamentSettings.min_games_per_team,
            pool_settings: tournamentSettings.pool_settings
          }
        });
        setTournament(response.data);
        showMessage(setError, setSuccess, "Tournament settings saved successfully!");
        
        // Immediately update the tournament settings in parent component
        if (typeof onDataChange === 'function') {
          onDataChange();
        }
      } else {
        const response = await createTournament({
          name: tournamentSettings.name,
          season: tournamentSettings.season,
          total_teams: tournamentSettings.total_teams,
        });
        setTournament(response.data);
        showMessage(setError, setSuccess, "Tournament created successfully!");
        onDataChange();
      }
    } catch (error) {
      console.error("❌ Error saving tournament settings:", error);
      showMessage(
        setError,
        setSuccess,
        "Failed to save tournament settings: " + (error.response?.data?.error || error.message),
        true
      );
    } finally {
      setLoading(false);
    }
  };

  const saveFieldSettings = async () => {
    try {
      setLoading(true);
      console.log("⚽ Saving field settings:", {
        number_of_fields: tournamentSettings.number_of_fields,
        field_names: tournamentSettings.field_names,
        game_duration: tournamentSettings.game_duration,
        break_duration: tournamentSettings.break_duration,
      });

      if (!tournament) {
        showMessage(setError, setSuccess, "Please save tournament settings first", true);
        return;
      }

      // Update tournament with field settings
      const response = await updateTournament(tournament.id, {
        name: tournamentSettings.name,
        season: tournamentSettings.season,
        total_teams: tournamentSettings.total_teams,
        status: tournament.status,
        settings: {
          start_time: tournamentSettings.start_time,
          end_time: tournamentSettings.end_time,
          number_of_fields: tournamentSettings.number_of_fields,
          field_names: tournamentSettings.field_names,
          game_duration: tournamentSettings.game_duration,
          break_duration: tournamentSettings.break_duration,
          min_games_per_team: tournamentSettings.min_games_per_team,
          pool_settings: tournamentSettings.pool_settings
        }
      });

      setTournament(response.data);
      showMessage(
        setError,
        setSuccess,
        `Field settings saved! ${tournamentSettings.field_names.length} fields configured: ${tournamentSettings.field_names.join(", ")}`
      );
      
      // Refresh data in parent component
      if (typeof onDataChange === 'function') {
        onDataChange();
      }
    } catch (error) {
      console.error("❌ Error saving field settings:", error);
      showMessage(setError, setSuccess, "Failed to save field settings: " + error.message, true);
    } finally {
      setLoading(false);
    }
  };

  const saveAndGeneratePools = async () => {
    try {
      setLoading(true);
      console.log("🏊 Saving and generating pools with settings:", tournamentSettings.pool_settings);
      
      if (!tournament) {
        showMessage(setError, setSuccess, "Please save tournament settings first", true);
        return;
      }

      // Step 1: Save pool settings to tournament
      console.log("💾 Step 1: Saving pool settings to tournament...");
      await updateTournament(tournament.id, {
        name: tournamentSettings.name,
        season: tournamentSettings.season,
        total_teams: tournamentSettings.total_teams,
        status: tournament.status,
        settings: {
          start_time: tournamentSettings.start_time,
          end_time: tournamentSettings.end_time,
          number_of_fields: tournamentSettings.number_of_fields,
          field_names: tournamentSettings.field_names,
          game_duration: tournamentSettings.game_duration,
          break_duration: tournamentSettings.break_duration,
          min_games_per_team: tournamentSettings.min_games_per_team,
          pool_settings: tournamentSettings.pool_settings
        }
      });

      // Step 2: Generate actual pools in database
      console.log("🏊 Step 2: Creating pools in database...");
      const response = await generatePools(tournament.id, {
        numberOfPools: tournamentSettings.pool_settings.numberOfPools,
        teamsPerPool: tournamentSettings.pool_settings.teamsPerPool,
        poolNames: tournamentSettings.pool_settings.poolNames
      });

      setPools(response.data);
      showMessage(setError, setSuccess, `Pool settings saved and ${response.data.length} pools generated successfully!`);
      onDataChange(); // Refresh data in parent component
    } catch (error) {
      console.error("❌ Error saving and generating pools:", error);
      showMessage(
        setError,
        setSuccess,
        "Failed to save and generate pools: " + (error.response?.data?.error || error.message),
        true
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePool = async (poolId, poolName) => {
    if (!window.confirm(`Are you sure you want to delete "${poolName}"? This will unassign all teams from this pool.`)) {
      return;
    }

    try {
      setLoading(true);
      await deletePool(poolId);
      await fetchPoolsData();
      showMessage(setError, setSuccess, `Pool "${poolName}" deleted successfully!`);
      onDataChange();
    } catch (error) {
      console.error("❌ Error deleting pool:", error);
      showMessage(
        setError,
        setSuccess,
        "Failed to delete pool: " + (error.response?.data?.error || error.message),
        true
      );
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePoolName = async (poolId, newName) => {
    try {
      setLoading(true);
      await updatePool(poolId, { name: newName });
      await fetchPoolsData();
      showMessage(setError, setSuccess, "Pool name updated successfully!");
      setEditingPool(null);
      onDataChange();
    } catch (error) {
      console.error("❌ Error updating pool:", error);
      showMessage(
        setError,
        setSuccess,
        "Failed to update pool name: " + (error.response?.data?.error || error.message),
        true
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetTournament = () => {
    setShowResetConfirm(true);
  };

  const confirmResetTournament = async () => {
    try {
      setLoading(true);
      setShowResetConfirm(false);
      
      if (!tournament) {
        showMessage(setError, setSuccess, "No tournament to reset", true);
        return;
      }

      const response = await fetch(`${API_URL}/api/admin/reset-tournament`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ tournamentId: tournament.id })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reset tournament');
      }

      showMessage(setError, setSuccess, "Tournament reset successfully! All teams, games, and results have been cleared.");
      
      // Refresh all data
      if (typeof onDataChange === 'function') {
        onDataChange();
      }
    } catch (error) {
      console.error("❌ Error resetting tournament:", error);
      showMessage(
        setError,
        setSuccess,
        "Failed to reset tournament: " + error.message,
        true
      );
    } finally {
      setLoading(false);
    }
  };

  const cancelResetTournament = () => {
    setShowResetConfirm(false);
  };

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">Tournament Settings</h2>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Tournament Configuration */}
        <div>
          <h3 className="text-lg font-medium mb-4 text-gray-800">Tournament Configuration</h3>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tournament Name
              </label>
              <input
                type="text"
                value={tournamentSettings.name}
                onChange={(e) =>
                  setTournamentSettings({ ...tournamentSettings, name: e.target.value })
                }
                className="w-full"
                placeholder="SCORE Cup Tournament"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Season</label>
              <input
                type="text"
                value={tournamentSettings.season}
                onChange={(e) =>
                  setTournamentSettings({ ...tournamentSettings, season: e.target.value })
                }
                className="w-full"
                placeholder="2024 Spring"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expected Total Teams
              </label>
              <input
                type="number"
                min="4"
                max="32"
                value={tournamentSettings.total_teams}
                onChange={(e) =>
                  setTournamentSettings({
                    ...tournamentSettings,
                    total_teams: parseInt(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tournament Start Time
                </label>
                <input
                  type="time"
                  value={tournamentSettings.start_time}
                  onChange={(e) =>
                    setTournamentSettings({ ...tournamentSettings, start_time: e.target.value })
                  }
                  className="w-full"
                />
                <p className="text-sm text-gray-500 mt-1">First game kick-off time</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tournament End Time
                </label>
                <input
                  type="time"
                  value={tournamentSettings.end_time}
                  onChange={(e) =>
                    setTournamentSettings({ ...tournamentSettings, end_time: e.target.value })
                  }
                  className="w-full"
                />
                <p className="text-sm text-gray-500 mt-1">Latest game start time</p>
              </div>
            </div>

            <button
              onClick={saveTournamentSettings}
              disabled={loading}
              className="btn btn-primary w-full"
            >
              {loading ? "Saving..." : "Save Tournament Settings"}
            </button>
          </div>
        </div>

        {/* Field Management */}
        <div>
          <h3 className="text-lg font-medium mb-4 text-gray-800">Field Management</h3>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Fields Available
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={tournamentSettings.number_of_fields || 2}
                onChange={(e) => {
                  const newFieldCount = parseInt(e.target.value);
                  const currentFieldNames = tournamentSettings.field_names || [];
                  const newFieldNames = [];
                  
                  // Generate field names array to match the new field count
                  for (let i = 0; i < newFieldCount; i++) {
                    newFieldNames.push(currentFieldNames[i] || `Field ${i + 1}`);
                  }
                  
                  setTournamentSettings({
                    ...tournamentSettings,
                    number_of_fields: newFieldCount,
                    field_names: newFieldNames,
                  });
                }}
                className="w-full"
              />
              <p className="text-sm text-gray-500 mt-1">
                This determines how many games can be played simultaneously
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Field Names</label>
              <div className="space-y-2">
                {Array.from({ length: tournamentSettings.number_of_fields || 2 }, (_, index) => (
                  <input
                    key={index}
                    type="text"
                    placeholder={`Field ${index + 1}`}
                    value={
                      tournamentSettings.field_names?.[index] || `Field ${index + 1}`
                    }
                    onChange={(e) => {
                      const newFieldNames = [...(tournamentSettings.field_names || [])];
                      newFieldNames[index] = e.target.value;
                      setTournamentSettings({
                        ...tournamentSettings,
                        field_names: newFieldNames,
                      });
                    }}
                    className="w-full text-sm"
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Game Duration (minutes)
              </label>
              <input
                type="number"
                min="30"
                max="120"
                value={tournamentSettings.game_duration || 45}
                onChange={(e) =>
                  setTournamentSettings({
                    ...tournamentSettings,
                    game_duration: parseInt(e.target.value),
                  })
                }
                className="w-full"
              />
              <p className="text-sm text-gray-500 mt-1">Including setup time between games</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Break Between Games (minutes)
              </label>
              <input
                type="number"
                min="5"
                max="30"
                value={tournamentSettings.break_duration || 10}
                onChange={(e) =>
                  setTournamentSettings({
                    ...tournamentSettings,
                    break_duration: parseInt(e.target.value),
                  })
                }
                className="w-full"
              />
              <p className="text-sm text-gray-500 mt-1">Time between games on the same field</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Games Per Team
              </label>
              <input
                type="number"
                min="3"
                max="8"
                value={tournamentSettings.min_games_per_team || 3}
                onChange={(e) =>
                  setTournamentSettings({
                    ...tournamentSettings,
                    min_games_per_team: parseInt(e.target.value),
                  })
                }
                className="w-full"
              />
              <p className="text-sm text-gray-500 mt-1">
                Guaranteed minimum games each team will play (pool games + extra games)
              </p>
              <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800 font-medium">Scheduling Impact:</p>
                <p className="text-sm text-blue-700 mt-1">
                  • Each time window uses all {tournamentSettings.number_of_fields || 2} fields
                  • {(tournamentSettings.number_of_fields || 2) * 2} teams play per window
                  • Total games needed: {Math.ceil((tournamentSettings.total_teams || 18) * (tournamentSettings.min_games_per_team || 3) / 2)}
                </p>
              </div>
            </div>

            <button
              onClick={saveFieldSettings}
              disabled={loading}
              className="btn btn-secondary w-full"
            >
              {loading ? "Saving..." : "Save Field Settings"}
            </button>
          </div>
        </div>

        {/* Pool Management */}
        <div>
          <h3 className="text-lg font-medium mb-4 text-gray-800">Pool Management</h3>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Pools
              </label>
              <input
                type="number"
                min="2"
                max="8"
                value={tournamentSettings.pool_settings.numberOfPools}
                onChange={(e) => updatePoolCount(parseInt(e.target.value))}
                className="w-full"
              />
              <p className="text-sm text-gray-500 mt-1">
                How many pools to divide teams into
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Teams per Pool
              </label>
              <input
                type="number"
                min="3"
                max="6"
                value={tournamentSettings.pool_settings.teamsPerPool}
                onChange={(e) => updateTeamsPerPool(parseInt(e.target.value))}
                className="w-full"
              />
              <p className="text-sm text-gray-500 mt-1">
                Optimal pool size (4-6 teams recommended)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pool Names
              </label>
              <div className="space-y-2">
                {tournamentSettings.pool_settings.poolNames.map((name, index) => (
                  <input
                    key={index}
                    type="text"
                    placeholder={`Pool ${String.fromCharCode(65 + index)}`}
                    value={name}
                    onChange={(e) => updatePoolName(index, e.target.value)}
                    className="w-full text-sm"
                  />
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Custom names for each pool (optional)
              </p>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-800 mb-2">Pool Configuration Preview</h4>
              <div className="text-sm text-blue-700">
                <p>• {tournamentSettings.pool_settings.numberOfPools} pools: {tournamentSettings.pool_settings.poolNames.join(", ")}</p>
                <p>• {tournamentSettings.pool_settings.teamsPerPool} teams per pool</p>
                <p>• {tournamentSettings.pool_settings.numberOfPools * tournamentSettings.pool_settings.teamsPerPool} total team slots</p>
                <p>• {((tournamentSettings.pool_settings.teamsPerPool * (tournamentSettings.pool_settings.teamsPerPool - 1)) / 2) * tournamentSettings.pool_settings.numberOfPools} total pool games</p>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={saveAndGeneratePools}
                disabled={loading || !tournament}
                className="btn btn-primary w-full"
              >
                {loading ? "Saving & Generating..." : "Save & Generate Pools"}
              </button>
              <p className="text-sm text-gray-600 text-center">
                This will save your pool configuration and create the actual pools in the database
              </p>
            </div>

            {/* Current Pools Display */}
            {pools.length > 0 && (
              <div className="mt-6">
                <h4 className="font-medium text-gray-800 mb-3">Current Pools ({pools.length})</h4>
                <div className="space-y-2">
                  {pools.map((pool) => (
                    <div key={pool.id} className="flex items-center justify-between bg-gray-50 p-3 rounded">
                      {editingPool === pool.id ? (
                        <div className="flex items-center space-x-2 flex-1">
                          <input
                            type="text"
                            defaultValue={pool.name}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleUpdatePoolName(pool.id, e.target.value);
                              } else if (e.key === 'Escape') {
                                setEditingPool(null);
                              }
                            }}
                            onBlur={(e) => {
                              if (e.target.value !== pool.name) {
                                handleUpdatePoolName(pool.id, e.target.value);
                              } else {
                                setEditingPool(null);
                              }
                            }}
                            className="flex-1 px-2 py-1 text-sm"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <span 
                          className="font-medium cursor-pointer hover:text-blue-600 flex-1"
                          onClick={() => setEditingPool(pool.id)}
                          title="Click to edit pool name"
                        >
                          {pool.name}
                        </span>
                      )}
                      <div className="flex space-x-1">
                        {editingPool !== pool.id && (
                          <button
                            onClick={() => setEditingPool(pool.id)}
                            disabled={loading}
                            className="text-blue-500 hover:text-blue-700 text-sm px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                            title="Edit pool name"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => handleDeletePool(pool.id, pool.name)}
                          disabled={loading}
                          className="text-red-500 hover:text-red-700 text-sm px-2 py-1 rounded hover:bg-red-50 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Schedule Preview and Tips sections remain the same */}
      <div className="mt-8 bg-blue-50 rounded-lg p-6">
        <h3 className="text-lg font-medium mb-4 text-blue-800">Schedule Planning Preview</h3>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="bg-white p-4 rounded">
            <div className="font-medium text-gray-700">Tournament Games</div>
            <div className="text-2xl font-bold text-blue-600">
              {Math.ceil((tournamentSettings.total_teams || 18) * (tournamentSettings.min_games_per_team || 3) / 2)} games
            </div>
            <div className="text-gray-500">{tournamentSettings.min_games_per_team || 3} games per team minimum</div>
          </div>

          <div className="bg-white p-4 rounded">
            <div className="font-medium text-gray-700">Daily Field Capacity</div>
            <div className="text-2xl font-bold text-green-600">
              {(() => {
                const startHour = parseInt(tournamentSettings.start_time?.split(":")[0] || "9");
                const startMinute = parseInt(tournamentSettings.start_time?.split(":")[1] || "0");
                const endHour = parseInt(tournamentSettings.end_time?.split(":")[0] || "17");
                const endMinute = parseInt(tournamentSettings.end_time?.split(":")[1] || "0");
                const totalMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
                const gameSlot = (tournamentSettings.game_duration || 45) + (tournamentSettings.break_duration || 10);
                return Math.floor(totalMinutes / gameSlot) * (tournamentSettings.number_of_fields || 2);
              })()} games
            </div>
            <div className="text-gray-500">
              {tournamentSettings.start_time} - {tournamentSettings.end_time}
            </div>
          </div>

          <div className="bg-white p-4 rounded">
            <div className="font-medium text-gray-700">Tournament Duration</div>
            <div className="text-2xl font-bold text-purple-600">
              {(() => {
                const totalGames = Math.ceil((tournamentSettings.total_teams || 18) * (tournamentSettings.min_games_per_team || 3) / 2);
                const startHour = parseInt(tournamentSettings.start_time?.split(":")[0] || "9");
                const startMinute = parseInt(tournamentSettings.start_time?.split(":")[1] || "0");
                const endHour = parseInt(tournamentSettings.end_time?.split(":")[0] || "17");
                const endMinute = parseInt(tournamentSettings.end_time?.split(":")[1] || "0");
                const totalMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
                const gameSlot = (tournamentSettings.game_duration || 45) + (tournamentSettings.break_duration || 10);
                const timeWindows = Math.floor(totalMinutes / gameSlot);
                const gamesPerWindow = tournamentSettings.number_of_fields || 2;
                const dailyCapacity = timeWindows * gamesPerWindow;
                return Math.ceil(totalGames / dailyCapacity);
              })()}
              {(() => {
                const totalGames = Math.ceil((tournamentSettings.total_teams || 18) * (tournamentSettings.min_games_per_team || 3) / 2);
                const gameSlot = (tournamentSettings.game_duration || 45) + (tournamentSettings.break_duration || 10);
                const gamesPerWindow = tournamentSettings.number_of_fields || 2;
                const timeWindows = Math.ceil(totalGames / gamesPerWindow);
                return timeWindows === 1 ? " window" : timeWindows <= 8 ? ` windows (${Math.ceil(timeWindows * gameSlot / 60)}h)` : " days";
              })()}
            </div>
            <div className="text-gray-500">Estimated duration</div>
          </div>
        </div>
      </div>

      {/* Reset Tournament Section */}
      <div className="mt-8 p-6 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
              <span className="text-red-600 text-sm font-bold">⚠️</span>
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-800 mb-2">Danger Zone</h3>
            <p className="text-red-700 mb-4">
              Reset the entire tournament to start fresh. This will permanently delete all teams, games, 
              pool assignments, playoff data, and results. Tournament settings will be preserved.
            </p>
            <button
              onClick={handleResetTournament}
              disabled={loading}
              className="bg-red-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed btn"
            >
              {loading ? "Resetting..." : "Reset Tournament"}
            </button>
          </div>
        </div>
      </div>

      {/* Organizer Instructions */}
      <div className="mt-8 grid md:grid-cols-2 gap-6">
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <h4 className="font-medium text-green-800 mb-2">✅ Organizer Checklist:</h4>
          <ul className="text-sm text-green-700 space-y-1">
            <li>• Set tournament name, season, and timing</li>
            <li>• Configure number of available fields</li>
            <li>• Register all teams</li>
            <li>• Generate balanced pools</li>
            <li>• Assign teams to pools</li>
            <li>• Generate smart game schedules</li>
          </ul>
        </div>

        <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <h4 className="font-medium text-yellow-800 mb-2">⚠️ Scheduling Tips:</h4>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• More fields = shorter tournament</li>
            <li>• Set realistic start/end times</li>
            <li>• Allow buffer time for delays</li>
            <li>• Consider field quality and location</li>
            <li>• Plan for weather contingencies</li>
          </ul>
        </div>
      </div>

      {/* Reset Tournament Confirmation Overlay */}
      {showResetConfirm && (
        <div 
          className="overlay"
          style={{
            height: '100%',
            width: '100%',
            display: 'block',
            position: 'fixed',
            zIndex: 9999,
            top: 0,
            left: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.95)'
          }}
        >
          <span 
            className="closebtn"
            onClick={cancelResetTournament}
            title="Close Overlay"
            style={{
              position: 'absolute',
              top: '20px',
              right: '45px',
              fontSize: '60px',
              cursor: 'pointer',
              color: 'white',
              transition: 'color 0.2s ease-in-out'
            }}
            onMouseEnter={(e) => e.target.style.color = '#ccc'}
            onMouseLeave={(e) => e.target.style.color = 'white'}
          >
            ×
          </span>
          
          <div 
            className="overlay-content"
            style={{
              position: 'relative',
              top: '40%',
              transform: 'translateY(-50%)',
              width: '80%',
              maxWidth: '600px',
              textAlign: 'center',
              margin: 'auto',
              color: 'white'
            }}
          >
            <div style={{ marginBottom: '40px' }}>
              <div style={{
                width: '80px',
                height: '80px',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
                border: '3px solid #ef4444'
              }}>
                <span style={{ fontSize: '40px' }}>⚠️</span>
              </div>
              
              <h2 style={{ 
                fontSize: '32px', 
                fontWeight: 'bold', 
                marginBottom: '20px',
                color: 'white'
              }}>
                Confirm Tournament Reset
              </h2>
              
              <p style={{ 
                fontSize: '18px', 
                marginBottom: '30px',
                color: '#e5e5e5'
              }}>
                This action will permanently delete:
              </p>
              
              <ul style={{ 
                fontSize: '16px', 
                color: '#e5e5e5',
                listStyle: 'none',
                padding: 0,
                marginBottom: '30px',
                lineHeight: '1.8'
              }}>
                <li>• All registered teams</li>
                <li>• All games and schedules</li>
                <li>• All pool assignments</li>
                <li>• All playoff data</li>
                <li>• All match results</li>
              </ul>
              
              <p style={{ 
                fontSize: '16px', 
                color: '#ef4444',
                fontWeight: 'bold',
                marginBottom: '40px'
              }}>
                ⚠️ This action cannot be undone. Tournament settings will be preserved.
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
              <button
                onClick={confirmResetTournament}
                disabled={loading}
                style={{
                  padding: '15px 40px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                  transition: 'all 0.2s ease-in-out',
                  minWidth: '200px'
                }}
                onMouseEnter={(e) => !loading && (e.target.style.backgroundColor = '#dc2626')}
                onMouseLeave={(e) => !loading && (e.target.style.backgroundColor = '#ef4444')}
              >
                {loading ? "Resetting..." : "Yes, Reset Tournament"}
              </button>
              
              <button
                onClick={cancelResetTournament}
                disabled={loading}
                style={{
                  padding: '15px 40px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  backgroundColor: '#4b5563',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                  transition: 'all 0.2s ease-in-out',
                  minWidth: '200px'
                }}
                onMouseEnter={(e) => !loading && (e.target.style.backgroundColor = '#6b7280')}
                onMouseLeave={(e) => !loading && (e.target.style.backgroundColor = '#4b5563')}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsTab;