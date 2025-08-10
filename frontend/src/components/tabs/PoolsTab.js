// frontend/src/components/tabs/PoolsTab.js
// Pools management tab component

import React, { useState, useEffect } from "react";
import { Grid, Calendar, ChevronDown } from "lucide-react";
import { generatePools, generateSchedule, showMessage, updateTeam } from "../../utils/api";

const PoolsTab = ({ 
  teams, 
  pools, 
  loading, 
  setLoading, 
  error, 
  setError, 
  success, 
  setSuccess, 
  tournamentSettings,
  onDataChange,
  setGames 
}) => {
  const [selectedPoolId, setSelectedPoolId] = useState(pools.length > 0 ? pools[0].id : null);

  useEffect(() => {
    if (pools.length > 0 && (!selectedPoolId || !pools.find(p => p.id === selectedPoolId))) {
      setSelectedPoolId(pools[0].id);
    }
  }, [pools, selectedPoolId]);

  const assignTeamToPool = async (teamId, poolId) => {
    try {
      setLoading(true);
      await updateTeam(teamId, { pool_id: poolId });
      showMessage(setError, setSuccess, "Team assigned to pool successfully!");
      onDataChange();
    } catch (error) {
      console.error("❌ Error assigning team to pool:", error);
      showMessage(
        setError,
        setSuccess,
        "Failed to assign team: " + (error.response?.data?.error || error.message),
        true
      );
    } finally {
      setLoading(false);
    }
  };

  const removeTeamFromPool = async (teamId) => {
    try {
      setLoading(true);
      await updateTeam(teamId, { pool_id: null });
      showMessage(setError, setSuccess, "Team removed from pool successfully!");
      onDataChange();
    } catch (error) {
      console.error("❌ Error removing team from pool:", error);
      showMessage(
        setError,
        setSuccess,
        "Failed to remove team: " + (error.response?.data?.error || error.message),
        true
      );
    } finally {
      setLoading(false);
    }
  };
  const handleGeneratePools = async () => {
    if (teams.length < 4) {
      showMessage(setError, setSuccess, "You need at least 4 teams to generate pools", true);
      return;
    }

    try {
      setLoading(true);
      console.log("📊 Generating pools for", teams.length, "teams...");

      const response = await generatePools(1);
      console.log("✅ Pools generated:", response.data);
      showMessage(setError, setSuccess, `Generated ${response.data.length} pools successfully!`);
      onDataChange();
    } catch (error) {
      console.error("❌ Error generating pools:", error);
      showMessage(
        setError,
        setSuccess,
        "Failed to generate pools: " + (error.response?.data?.error || error.message),
        true
      );
    } finally {
      setLoading(false);
    }
  };

  const generateScheduleForPool = async (poolId, poolName) => {
    try {
      setLoading(true);
      console.log("📅 Generating smart schedule for", poolName);

      const scheduleSettings = {
        tournament_date: new Date().toISOString().split("T")[0],
        start_time: tournamentSettings.start_time || "09:00",
        number_of_fields: tournamentSettings.number_of_fields || 2,
        field_names: tournamentSettings.field_names || ["Field 1", "Field 2"],
        game_duration: tournamentSettings.game_duration || 45,
        break_duration: tournamentSettings.break_duration || 10,
      };

      console.log("⚙️ Using schedule settings:", scheduleSettings);

      const response = await generateSchedule(poolId, scheduleSettings);
      console.log("✅ Smart schedule generated:", response.data);

      const { games, schedule_summary } = response.data;

      setGames((prevGames) => [...prevGames, ...games]);
      showMessage(
        setError,
        setSuccess,
        `Generated ${games.length} games for ${poolName}! ` +
        `Schedule: ${schedule_summary.earliest_start} - ${schedule_summary.latest_end} ` +
        `across ${schedule_summary.fields_used.length} fields.`
      );

      onDataChange();
    } catch (error) {
      console.error("❌ Error generating schedule:", error);
      showMessage(
        setError,
        setSuccess,
        "Failed to generate schedule: " + (error.response?.data?.error || error.message),
        true
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Pool Management</h2>
        <button
          onClick={handleGeneratePools}
          disabled={loading || teams.length < 4}
          className="bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          <Grid className="w-5 h-5" />
          <span>{loading ? "Generating..." : "Generate Pools"}</span>
        </button>
      </div>

      {pools.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Grid className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-xl">No pools generated yet</p>
          <p>You need at least 4 teams to generate pools</p>
          <p className="text-sm mt-2">Current teams: {teams.length}</p>
        </div>
      ) : (
        <>
          {/* Mobile dropdown for pool selection */}
          <div className="block md:hidden mb-6">
            <div className="relative">
              <select
                value={selectedPoolId || ''}
                onChange={(e) => setSelectedPoolId(Number(e.target.value))}
                className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-4 py-3 pr-10 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {pools.map((pool) => (
                  <option key={pool.id} value={pool.id}>
                    {pool.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Mobile single pool view */}
          <div className="block md:hidden">
            {pools
              .filter((pool) => pool.id === selectedPoolId)
              .map((pool) => {
                const poolTeams = teams.filter((team) => team.pool_id === pool.id);
                return (
                  <div key={pool.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold">{pool.name}</h3>
                      <span className="text-sm text-gray-500">
                        {poolTeams.length} teams
                      </span>
                    </div>

                    <div className="space-y-2 mb-4">
                      {poolTeams.length > 0 ? (
                        poolTeams.map((team) => (
                          <div key={team.id} className="bg-blue-50 p-2 rounded text-sm font-medium flex justify-between items-center">
                            <span>{team.name}</span>
                            <button
                              onClick={() => removeTeamFromPool(team.id)}
                              disabled={loading}
                              className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50"
                              title="Remove from pool"
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-gray-400 text-sm italic">No teams assigned yet</div>
                      )}
                    </div>

                    {/* Unassigned teams available for this pool */}
                    {teams.filter(team => !team.pool_id).length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Add Unassigned Teams:</h4>
                        <div className="grid grid-cols-1 gap-2">
                          {teams.filter(team => !team.pool_id).map((team) => (
                            <button
                              key={team.id}
                              onClick={() => assignTeamToPool(team.id, pool.id)}
                              disabled={loading}
                              className="text-left bg-gray-100 hover:bg-gray-200 p-2 rounded text-sm transition-colors"
                            >
                              {team.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="text-sm text-gray-600">
                        <div>Teams in pool: {poolTeams.length}</div>
                        <div>Potential games: {poolTeams.length >= 2 ? (poolTeams.length * (poolTeams.length - 1)) / 2 : 0}</div>
                      </div>

                      <button
                        onClick={() => generateScheduleForPool(pool.id, pool.name)}
                        disabled={poolTeams.length < 2 || loading}
                        className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 text-sm flex items-center justify-center space-x-2"
                      >
                        <Calendar className="w-4 h-4" />
                        <span>Generate Smart Schedule</span>
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Desktop horizontal grid layout */}
          <div className="hidden md:block">
            <div className="grid gap-6" style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))'
            }}>
              {pools.map((pool) => {
                const poolTeams = teams.filter((team) => team.pool_id === pool.id);
                return (
                  <div key={pool.id} className="border border-gray-200 rounded-lg p-4 min-w-0">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold truncate">{pool.name}</h3>
                      <span className="text-sm text-gray-500 whitespace-nowrap ml-2">
                        {poolTeams.length} teams
                      </span>
                    </div>

                    <div className="space-y-2 mb-4">
                      {poolTeams.length > 0 ? (
                        poolTeams.map((team) => (
                          <div key={team.id} className="bg-blue-50 p-2 rounded text-sm font-medium flex justify-between items-center">
                            <span className="truncate">{team.name}</span>
                            <button
                              onClick={() => removeTeamFromPool(team.id)}
                              disabled={loading}
                              className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50 ml-2"
                              title="Remove from pool"
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-gray-400 text-sm italic">No teams assigned yet</div>
                      )}
                    </div>

                    {/* Unassigned teams available for this pool */}
                    {teams.filter(team => !team.pool_id).length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Add Unassigned Teams:</h4>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {teams.filter(team => !team.pool_id).map((team) => (
                            <button
                              key={team.id}
                              onClick={() => assignTeamToPool(team.id, pool.id)}
                              disabled={loading}
                              className="w-full text-left bg-gray-100 hover:bg-gray-200 p-2 rounded text-sm transition-colors truncate"
                            >
                              {team.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="text-sm text-gray-600">
                        <div>Teams in pool: {poolTeams.length}</div>
                        <div>Potential games: {poolTeams.length >= 2 ? (poolTeams.length * (poolTeams.length - 1)) / 2 : 0}</div>
                      </div>

                      <button
                        onClick={() => generateScheduleForPool(pool.id, pool.name)}
                        disabled={poolTeams.length < 2 || loading}
                        className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 text-sm flex items-center justify-center space-x-2"
                      >
                        <Calendar className="w-4 h-4" />
                        <span>Generate Smart Schedule</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PoolsTab;