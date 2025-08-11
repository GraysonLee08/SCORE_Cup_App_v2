// frontend/src/components/tabs/TeamsTab.js
// Teams management tab component

import React, { useState, useEffect } from "react";
import { Users, Plus, Trash2, Edit2, Save, X, ChevronUp, ChevronDown } from "lucide-react";
import { createTeam, deleteTeam, updateTeam, showMessage, createPool } from "../../utils/api";

const TeamsTab = ({ 
  teams, 
  pools, 
  tournament,
  tournamentSettings,
  loading, 
  setLoading, 
  error, 
  setError, 
  success, 
  setSuccess, 
  onDataChange 
}) => {
  // localStorage keys
  const STORAGE_KEYS = {
    newTeam: 'teamsTab_newTeam',
    editingTeam: 'teamsTab_editingTeam',
    editForm: 'teamsTab_editForm',
    assigningPool: 'teamsTab_assigningPool',
    poolAssignments: 'teamsTab_poolAssignments',
    sortConfig: 'teamsTab_sortConfig'
  };

  // Helper function to load from localStorage
  const loadFromStorage = (key, defaultValue) => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch (error) {
      console.warn(`Failed to load ${key} from localStorage:`, error);
      return defaultValue;
    }
  };

  // Initialize state with localStorage values
  const [newTeam, setNewTeam] = useState(() => 
    loadFromStorage(STORAGE_KEYS.newTeam, {
      name: "",
      captain: "",
      contact_email: "",
    })
  );
  const [editingTeam, setEditingTeam] = useState(() => 
    loadFromStorage(STORAGE_KEYS.editingTeam, null)
  );
  const [editForm, setEditForm] = useState(() => 
    loadFromStorage(STORAGE_KEYS.editForm, {})
  );
  const [assigningPool, setAssigningPool] = useState(() => 
    loadFromStorage(STORAGE_KEYS.assigningPool, null)
  );
  const [poolAssignments, setPoolAssignments] = useState(() => 
    loadFromStorage(STORAGE_KEYS.poolAssignments, {})
  );
  const [sortConfig, setSortConfig] = useState(() =>
    loadFromStorage(STORAGE_KEYS.sortConfig, { key: null, direction: 'asc' })
  );
  const [savingAllPools, setSavingAllPools] = useState(false);

  // Save to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.newTeam, JSON.stringify(newTeam));
  }, [newTeam]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.editingTeam, JSON.stringify(editingTeam));
  }, [editingTeam]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.editForm, JSON.stringify(editForm));
  }, [editForm]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.assigningPool, JSON.stringify(assigningPool));
  }, [assigningPool]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.poolAssignments, JSON.stringify(poolAssignments));
  }, [poolAssignments]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sortConfig, JSON.stringify(sortConfig));
  }, [sortConfig]);

  // Use only database pools - this is now database-driven only
  const availablePools = pools.map(pool => ({
    id: pool.id,
    name: pool.name,
    source: 'database'
  }));

  console.log('🔍 TeamsTab Pools Debug:', {
    database_pools: pools.length,
    available_pools: availablePools.length,
    pool_names: availablePools.map(p => p.name)
  });

  // Initialize pool assignments from current team data
  useEffect(() => {
    const currentAssignments = {};
    teams.forEach(team => {
      currentAssignments[team.id] = team.pool_id || "";
    });
    setPoolAssignments(currentAssignments);
  }, [teams]);

  // Sort teams based on current sort configuration
  const sortedTeams = React.useMemo(() => {
    if (!sortConfig.key) {
      return teams;
    }

    return [...teams].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle special cases
      if (sortConfig.key === 'pool') {
        const poolA = availablePools.find(p => p.id === a.pool_id);
        const poolB = availablePools.find(p => p.id === b.pool_id);
        aValue = poolA ? poolA.name : '';
        bValue = poolB ? poolB.name : '';
      } else if (sortConfig.key === 'record') {
        const aPoints = a.points || 0;
        const bPoints = b.points || 0;
        aValue = aPoints;
        bValue = bPoints;
      } else if (sortConfig.key === 'captain' || sortConfig.key === 'contact_email') {
        aValue = aValue || '';
        bValue = bValue || '';
      }

      // Convert to strings for consistent comparison
      aValue = String(aValue).toLowerCase();
      bValue = String(bValue).toLowerCase();

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [teams, sortConfig, availablePools]);

  // Handle column sort
  const handleSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Get sort icon for a column
  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return null;
    }
    return sortConfig.direction === 'asc' ? 
      <ChevronUp className="w-4 h-4 inline ml-1" /> : 
      <ChevronDown className="w-4 h-4 inline ml-1" />;
  };


  const addTeam = async () => {
    setError("");
    setSuccess("");

    if (!newTeam.name.trim()) {
      showMessage(setError, setSuccess, "Please enter a team name", true);
      return;
    }
    // Captain and email are now optional - can be added later

    try {
      setLoading(true);
      console.log("📝 Adding team:", newTeam);

      const response = await createTeam({
        name: newTeam.name.trim(),
        captain: newTeam.captain.trim() || null, // Allow empty captain
        contact_email: newTeam.contact_email.trim() || null,
        tournament_id: 1,
      });

      console.log("✅ Team added successfully:", response.data);
      setNewTeam({ name: "", captain: "", contact_email: "" });
      showMessage(setError, setSuccess, `Team "${newTeam.name}" added successfully!`);
      
      // Stable update with debounced callback
      const stableUpdate = () => {
        if (typeof onDataChange === 'function') {
          onDataChange();
        }
      };
      setTimeout(stableUpdate, 100);
    } catch (error) {
      console.error("❌ Error adding team:", error);
      showMessage(
        setError,
        setSuccess,
        "Failed to add team: " + (error.response?.data?.error || error.message),
        true
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading && newTeam.name.trim()) {
      e.preventDefault();
      addTeam();
    }
  };

  const handleDeleteTeam = async (teamId, teamName) => {
    if (!window.confirm(`Are you sure you want to delete team "${teamName}"? This cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      await deleteTeam(teamId);
      showMessage(setError, setSuccess, `Team "${teamName}" deleted successfully!`);
      // Stable update with debounced callback
      const stableUpdate = () => {
        if (typeof onDataChange === 'function') {
          onDataChange();
        }
      };
      setTimeout(stableUpdate, 100);
    } catch (error) {
      console.error("❌ Error deleting team:", error);
      showMessage(
        setError,
        setSuccess,
        "Failed to delete team: " + (error.response?.data?.error || error.message),
        true
      );
    } finally {
      setLoading(false);
    }
  };

  const assignTeamToPool = async (teamId, poolValue) => {
    setAssigningPool(teamId); // Show loading state for this team
    
    try {
      console.log("🔄 Assigning team", teamId, "to pool", poolValue, {
        tournament_id: tournament?.id,
        poolValue_type: typeof poolValue
      });
      
      console.log("🔄 Updating team with pool_id:", poolValue);
      await updateTeam(teamId, { pool_id: poolValue });
      
      console.log("🔄 Refreshing data...");
      showMessage(setError, setSuccess, "Team assigned to pool successfully!");
      
      if (typeof onDataChange === 'function') {
        onDataChange();
      }
    } catch (error) {
      console.error("❌ Error assigning team to pool:", error);
      console.error("❌ Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      showMessage(
        setError,
        setSuccess,
        "Failed to assign team to pool: " + (error.response?.data?.error || error.message),
        true
      );
    } finally {
      setAssigningPool(null); // Clear loading state
    }
  };

  const updatePoolAssignment = (teamId, poolValue) => {
    setPoolAssignments(prev => ({
      ...prev,
      [teamId]: poolValue || ""
    }));
  };

  const saveAllPoolAssignments = async () => {
    setSavingAllPools(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      const updatePromises = Object.entries(poolAssignments).map(async ([teamId, poolId]) => {
        try {
          await updateTeam(parseInt(teamId), { pool_id: poolId || null });
          successCount++;
        } catch (error) {
          console.error(`Failed to update team ${teamId}:`, error);
          errorCount++;
        }
      });

      await Promise.all(updatePromises);
      
      if (errorCount === 0) {
        showMessage(setError, setSuccess, `All ${successCount} pool assignments saved successfully!`);
      } else {
        showMessage(setError, setSuccess, `${successCount} assignments saved, ${errorCount} failed. Please check individual assignments.`, true);
      }

      // Refresh data
      if (typeof onDataChange === 'function') {
        onDataChange();
      }
    } catch (error) {
      console.error("❌ Error saving pool assignments:", error);
      showMessage(setError, setSuccess, "Failed to save pool assignments: " + error.message, true);
    } finally {
      setSavingAllPools(false);
    }
  };

  const hasUnsavedChanges = () => {
    return teams.some(team => {
      const currentAssignment = poolAssignments[team.id];
      const originalAssignment = team.pool_id || "";
      return currentAssignment !== originalAssignment.toString();
    });
  };

  const startEditingTeam = (team) => {
    setEditingTeam(team.id);
    setEditForm({
      name: team.name,
      captain: team.captain || "",
      contact_email: team.contact_email || ""
    });
  };

  const cancelEditingTeam = () => {
    setEditingTeam(null);
    setEditForm({});
  };

  const saveTeamEdit = async (teamId) => {
    try {
      setLoading(true);
      await updateTeam(teamId, {
        name: editForm.name.trim(),
        captain: editForm.captain.trim() || null,
        contact_email: editForm.contact_email.trim() || null
      });
      
      showMessage(setError, setSuccess, "Team information updated successfully!");
      setEditingTeam(null);
      setEditForm({});
      
      // Refresh data
      if (typeof onDataChange === 'function') {
        onDataChange();
      }
    } catch (error) {
      console.error("❌ Error updating team:", error);
      showMessage(
        setError,
        setSuccess,
        "Failed to update team: " + (error.response?.data?.error || error.message),
        true
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h2>Team Management</h2>
        <div style={{ textAlign: "right" }}>
          <div style={{ marginBottom: "0.5rem" }}>
            <span style={{ color: "var(--text-light)" }}>{teams.length} teams registered</span>
            {sortConfig.key && (
              <button
                onClick={() => setSortConfig({ key: null, direction: 'asc' })}
                className="btn"
                style={{ 
                  fontSize: "0.75rem", 
                  padding: "0.25rem 0.5rem", 
                  marginLeft: "0.5rem",
                  backgroundColor: "#f59e0b",
                  color: "#fff"
                }}
                title="Clear sorting"
              >
                Clear Sort
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-light)" }}>
              Available pools: {availablePools.length}
            </div>
            {hasUnsavedChanges() && (
              <button
                onClick={saveAllPoolAssignments}
                disabled={savingAllPools}
                className="btn"
                style={{ fontSize: "0.875rem" }}
                title="Save all pool assignments to database"
              >
                {savingAllPools ? "Saving..." : "Save All Pool Assignments"}
              </button>
            )}
            <button
              onClick={() => onDataChange && onDataChange()}
              className="btn"
              style={{ 
                fontSize: "0.75rem", 
                padding: "0.25rem 0.5rem", 
                backgroundColor: "#e0e0e0", 
                color: "#333" 
              }}
              title="Refresh pool data"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>


      {/* Info for when no pools exist */}
      {availablePools.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h4 className="font-medium text-yellow-800 mb-2">No Pools Available</h4>
          <p className="text-sm text-yellow-700">
            Create pools in the Settings tab first, then come back here to assign teams.
          </p>
        </div>
      )}

      {/* Add Team Form */}
      <div className="content-card" style={{ marginBottom: "2rem", backgroundColor: "var(--light-bg)" }}>
        <h3 style={{ marginBottom: "1rem" }}>Register New Team</h3>
        <p style={{ fontSize: "0.875rem", color: "var(--text-light)", marginBottom: "1rem" }}>
          Only team name is required. Captain and email can be added later by clicking the edit button (📝) next to any team.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          <input
            type="text"
            placeholder="Team Name (required)"
            value={newTeam.name}
            onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
            onKeyDown={handleKeyDown}
          />
          <input
            type="text"
            placeholder="Captain Name (optional)"
            value={newTeam.captain}
            onChange={(e) => setNewTeam({ ...newTeam, captain: e.target.value })}
            onKeyDown={handleKeyDown}
          />
          <input
            type="email"
            placeholder="Contact Email (optional)"
            value={newTeam.contact_email}
            onChange={(e) => setNewTeam({ ...newTeam, contact_email: e.target.value })}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={addTeam}
            disabled={loading || !newTeam.name.trim()}
            className="btn"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
          >
            <Plus className="w-5 h-5" />
            <span>{loading ? "Adding..." : "Add Team"}</span>
          </button>
        </div>
      </div>

      {/* Teams List */}
      {teams.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-xl">No teams registered yet</p>
          <p>Add your first team above to get started!</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full standings-table">
            <thead>
              <tr className="bg-gray-100">
                <th 
                  className="cursor-pointer hover:bg-gray-200 transition-colors"
                  onClick={() => handleSort('name')}
                  title="Click to sort by team name"
                >
                  Team Name {getSortIcon('name')}
                </th>
                <th 
                  className="cursor-pointer hover:bg-gray-200 transition-colors"
                  onClick={() => handleSort('captain')}
                  title="Click to sort by captain"
                >
                  Captain {getSortIcon('captain')}
                </th>
                <th 
                  className="cursor-pointer hover:bg-gray-200 transition-colors"
                  onClick={() => handleSort('contact_email')}
                  title="Click to sort by contact email"
                >
                  Contact {getSortIcon('contact_email')}
                </th>
                <th 
                  className="cursor-pointer hover:bg-gray-200 transition-colors"
                  onClick={() => handleSort('pool')}
                  title="Click to sort by pool assignment"
                >
                  Pool Assignment {getSortIcon('pool')}
                </th>
                <th 
                  className="cursor-pointer hover:bg-gray-200 transition-colors"
                  onClick={() => handleSort('record')}
                  title="Click to sort by points/record"
                >
                  Record {getSortIcon('record')}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTeams.map((team) => (
                <tr key={team.id} className="hover:bg-gray-50">
                  {/* Team Name */}
                  <td className="font-medium">
                    {editingTeam === team.id ? (
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full text-sm"
                      />
                    ) : (
                      team.name
                    )}
                  </td>

                  {/* Captain */}
                  <td>
                    {editingTeam === team.id ? (
                      <input
                        type="text"
                        value={editForm.captain}
                        onChange={(e) => setEditForm({ ...editForm, captain: e.target.value })}
                        placeholder="Captain name (optional)"
                        className="w-full text-sm"
                      />
                    ) : (
                      team.captain || <span className="text-gray-400 italic">Not provided</span>
                    )}
                  </td>

                  {/* Contact Email */}
                  <td>
                    {editingTeam === team.id ? (
                      <input
                        type="email"
                        value={editForm.contact_email}
                        onChange={(e) => setEditForm({ ...editForm, contact_email: e.target.value })}
                        placeholder="Email (optional)"
                        className="w-full text-sm"
                      />
                    ) : (
                      team.contact_email || <span className="text-gray-400">-</span>
                    )}
                  </td>

                  {/* Pool Assignment */}
                  <td>
                    {assigningPool === team.id ? (
                      <div className="text-sm text-blue-600">Assigning...</div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <select
                          value={poolAssignments[team.id] || ""}
                          onChange={(e) => updatePoolAssignment(team.id, e.target.value)}
                          className="w-full text-sm"
                          disabled={editingTeam === team.id || assigningPool === team.id}
                        >
                        <option value="">Unassigned</option>
                        {availablePools.length > 0 ? (
                          availablePools.map((pool) => (
                            <option key={pool.id} value={pool.id}>
                              {pool.name}
                            </option>
                          ))
                        ) : (
                          <option disabled>No pools configured - configure in Settings tab</option>
                        )}
                        </select>
                        {poolAssignments[team.id] !== (team.pool_id || "").toString() && (
                          <span className="text-xs text-orange-600 font-medium" title="Unsaved changes">*</span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Record */}
                  <td>
                    <span className="text-sm text-gray-600">
                      {team.wins || 0}W-{team.losses || 0}L-{team.ties || 0}T ({team.points || 0}pts)
                    </span>
                  </td>

                  {/* Actions */}
                  <td>
                    {editingTeam === team.id ? (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => saveTeamEdit(team.id)}
                          disabled={loading || !editForm.name.trim()}
                          className="text-green-500 hover:text-green-700 transition-colors disabled:text-gray-400"
                          title="Save changes"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={cancelEditingTeam}
                          className="text-gray-500 hover:text-gray-700 transition-colors"
                          title="Cancel editing"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => startEditingTeam(team)}
                          className="text-blue-500 hover:text-blue-700 transition-colors"
                          title="Edit team information"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTeam(team.id, team.name)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                          title="Delete team"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Help Section for Table Features */}
      {teams.length > 0 && (
        <div className="mt-6 tournament-card bg-scores-accent p-4">
          <h4 className="font-medium text-blue-800 mb-2">💡 Team Management Guide:</h4>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Click on any column header to sort teams (Team Name, Captain, Contact, Pool, Record)</li>
            <li>• Click the same header again to reverse sort direction (↑ ascending, ↓ descending)</li>
            <li>• Use "Clear Sort" button to return to original order</li>
            {availablePools.length > 0 && (
              <>
                <li>• Select pool assignments from the dropdowns in the "Pool Assignment" column</li>
                <li>• Changes are marked with an orange asterisk (*) until saved</li>
                <li>• Click "Save All Pool Assignments" button to persist all changes to the database</li>
                <li>• Teams without pool assignments won't be included in automatic scheduling</li>
              </>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default TeamsTab;