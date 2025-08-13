// frontend/src/components/AdminPanel.js
// REFACTORED TOURNAMENT ORGANIZER CONTROL PANEL
// Main container that orchestrates tab components

import React, { useState, useEffect } from "react";
import { Users, Settings, Calendar, Trophy, MessageSquare, Target, LogOut } from "lucide-react";
import Login from "./Login";

// Import utilities
import { fetchTournaments, fetchTeams, fetchPools, fetchGames } from "../utils/api";
import MessageBox from "./common/MessageBox";
import TeamsTab from "./tabs/TeamsTab";
import PoolsTab from "./tabs/PoolsTab";
import ScheduleTab from "./tabs/ScheduleTab";
import ResultsTab from "./tabs/ResultsTab";
import PlayoffsTab from "./tabs/PlayoffsTab";
import SettingsTab from "./tabs/SettingsTab";
import AnnouncementsTab from "./tabs/AnnouncementsTab";

const AdminPanel = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(null); // null = checking, false = not auth, true = authenticated
  const [activeTab, setActiveTab] = useState("teams");
  const [tournament, setTournament] = useState(null);
  const [teams, setTeams] = useState([]);
  const [pools, setPools] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [tournamentSettings, setTournamentSettings] = useState({
    name: "",
    season: "",
    total_teams: 18,
    start_time: "09:00",
    end_time: "17:00",
    number_of_fields: 2,
    field_names: ["Field 1", "Field 2"],
    game_duration: 45,
    break_duration: 10,
    // Pool settings
    pool_settings: {
      numberOfPools: 4,
      teamsPerPool: 4,
      poolNames: ["Pool A", "Pool B", "Pool C", "Pool D"]
    }
  });

  // Check authentication on component mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Fetch data when authenticated
  useEffect(() => {
    if (isAuthenticated === true) {
      fetchData();
    }
  }, [isAuthenticated]);


  const checkAuthStatus = async () => {
    try {
      const response = await fetch(process.env.REACT_APP_API_URL + '/api/admin/check', {
        credentials: 'include'
      });
      const data = await response.json();
      setIsAuthenticated(data.isAuthenticated);
    } catch (error) {
      console.error('Auth check failed:', error);
      setIsAuthenticated(false);
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    try {
      await fetch(process.env.REACT_APP_API_URL + '/api/admin/logout', {
        method: 'POST',
        credentials: 'include'
      });
      setIsAuthenticated(false);
      // Clear any cached data
      setTournament(null);
      setTeams([]);
      setPools([]);
      setGames([]);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");

      console.log("🔄 Fetching tournament data...");

      const [tournamentsRes, teamsRes] = await Promise.all([
        fetchTournaments(),
        fetchTeams(),
      ]);

      console.log("✅ Data fetched:", {
        tournaments: tournamentsRes.data.length,
        teams: teamsRes.data.length,
      });

      setTournament(tournamentsRes.data[0] || null);
      setTeams(teamsRes.data || []);

      if (tournamentsRes.data[0]) {
        const tournament = tournamentsRes.data[0];
        const savedSettings = tournament.settings ? (typeof tournament.settings === 'string' ? JSON.parse(tournament.settings) : tournament.settings) : {};
        
        console.log('🔍 AdminPanel Loading Tournament:', {
          tournament_name: tournament.name,
          raw_settings: tournament.settings,
          parsed_settings: savedSettings,
          pool_settings: savedSettings.pool_settings
        });
        
        setTournamentSettings({
          name: tournament.name || "",
          season: tournament.season || "",
          total_teams: tournament.total_teams || 18,
          start_time: savedSettings.start_time || "09:00",
          end_time: savedSettings.end_time || "17:00",
          number_of_fields: savedSettings.number_of_fields || 2,
          field_names: savedSettings.field_names || ["Field 1", "Field 2"],
          game_duration: savedSettings.game_duration || 45,
          break_duration: savedSettings.break_duration || 10,
          // Pool settings
          pool_settings: savedSettings.pool_settings || {
            numberOfPools: 4,
            teamsPerPool: 4,
            poolNames: ["Pool A", "Pool B", "Pool C", "Pool D"]
          }
        });

        try {
          const [poolsRes, gamesRes] = await Promise.all([
            fetchPools(tournamentsRes.data[0].id),
            fetchGames(tournamentsRes.data[0].id),
          ]);
          
          console.log('🔍 AdminPanel Pools Fetched:', {
            pools_count: poolsRes.data?.length || 0,
            pools_data: poolsRes.data,
            games_count: gamesRes.data?.length || 0
          });
          
          setPools(poolsRes.data || []);
          setGames(gamesRes.data || []);
        } catch (poolError) {
          console.log("No pools/games yet, which is normal for new tournaments");
          setPools([]);
          setGames([]);
        }
      }
    } catch (error) {
      console.error("❌ Error fetching data:", error);
      setError("Failed to load tournament data: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderActiveTab = () => {
    const commonProps = {
      loading,
      setLoading,
      error,
      setError,
      success,
      setSuccess,
      onDataChange: fetchData,
    };

    console.log("🎯 Rendering active tab:", activeTab);

    try {
      switch (activeTab) {
      case "teams":
        return (
          <TeamsTab
            teams={teams}
            pools={pools}
            tournament={tournament}
            tournamentSettings={tournamentSettings}
            {...commonProps}
          />
        );
      case "pools":
        return (
          <PoolsTab
            teams={teams}
            pools={pools}
            tournamentSettings={tournamentSettings}
            setGames={setGames}
            {...commonProps}
          />
        );
      case "schedule":
        return (
          <ScheduleTab 
            games={games}
            teams={teams}
            pools={pools}
            tournamentSettings={tournamentSettings}
            {...commonProps}
          />
        );
      case "results":
        return (
          <ResultsTab
            games={games}
            teams={teams}
            pools={pools}
            tournament={tournament}
            {...commonProps}
          />
        );
      case "playoffs":
        return (
          <PlayoffsTab
            games={games}
            teams={teams}
            pools={pools}
            tournament={tournament}
            {...commonProps}
          />
        );
      case "settings":
        return (
          <SettingsTab
            tournament={tournament}
            setTournament={setTournament}
            tournamentSettings={tournamentSettings}
            setTournamentSettings={setTournamentSettings}
            {...commonProps}
          />
        );
      case "announcements":
        return (
          <AnnouncementsTab
            tournament={tournament}
            {...commonProps}
          />
        );
      default:
        return (
          <TeamsTab 
            teams={teams} 
            pools={pools} 
            tournament={tournament}
            tournamentSettings={tournamentSettings}
            {...commonProps} 
          />
        );
    }
    } catch (error) {
      console.error("❌ Error rendering tab:", activeTab, error);
      return (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h3>Error loading {activeTab} tab</h3>
          <p style={{ color: "red", marginBottom: "1rem" }}>
            {error.message || "An unexpected error occurred"}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="btn"
          >
            Refresh Page
          </button>
        </div>
      );
    }
  };

  // Show loading while checking authentication
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{borderBottomColor: 'var(--scores-primary)'}}></div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (isAuthenticated === false) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <>
      {/* Admin Sub-Navigation */}
      {isAuthenticated && (
        <nav style={{ backgroundColor: "rgba(0, 120, 215, 0.1)", borderBottom: "1px solid #e0e0e0" }}>
          <div className="container">
            <ul style={{ 
              listStyle: "none", 
              padding: 0, 
              margin: 0, 
              display: "flex", 
              justifyContent: "center", 
              flexWrap: "wrap", 
              gap: "1rem",
              paddingTop: "1rem",
              paddingBottom: "1rem"
            }}>
              <li>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation();
                    console.log("🔄 Switching to teams tab");
                    setActiveTab("teams"); 
                  }}
                  style={{
                    color: activeTab === "teams" ? "var(--primary-color)" : "var(--text-color)",
                    textDecoration: "none",
                    fontWeight: activeTab === "teams" ? "600" : "500",
                    padding: "0.5rem 1rem",
                    borderRadius: "4px",
                    backgroundColor: activeTab === "teams" ? "rgba(0, 120, 215, 0.1)" : "transparent",
                    transition: "all 0.2s ease-in-out",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    border: "none",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left"
                  }}
                >
                  <Users className="w-4 h-4" />
                  Teams
                </button>
              </li>
              <li>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation();
                    console.log("🔄 Switching to schedule tab");
                    setActiveTab("schedule"); 
                  }}
                  style={{
                    color: activeTab === "schedule" ? "var(--primary-color)" : "var(--text-color)",
                    textDecoration: "none",
                    fontWeight: activeTab === "schedule" ? "600" : "500",
                    padding: "0.5rem 1rem",
                    borderRadius: "4px",
                    backgroundColor: activeTab === "schedule" ? "rgba(0, 120, 215, 0.1)" : "transparent",
                    transition: "all 0.2s ease-in-out",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    border: "none",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left"
                  }}
                >
                  <Calendar className="w-4 h-4" />
                  Schedule
                </button>
              </li>
              <li>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation();
                    console.log("🔄 Switching to results tab");
                    setActiveTab("results"); 
                  }}
                  style={{
                    color: activeTab === "results" ? "var(--primary-color)" : "var(--text-color)",
                    textDecoration: "none",
                    fontWeight: activeTab === "results" ? "600" : "500",
                    padding: "0.5rem 1rem",
                    borderRadius: "4px",
                    backgroundColor: activeTab === "results" ? "rgba(0, 120, 215, 0.1)" : "transparent",
                    transition: "all 0.2s ease-in-out",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    border: "none",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left"
                  }}
                >
                  <Trophy className="w-4 h-4" />
                  Results
                </button>
              </li>
              <li>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation();
                    console.log("🔄 Switching to playoffs tab");
                    setActiveTab("playoffs"); 
                  }}
                  style={{
                    color: activeTab === "playoffs" ? "var(--primary-color)" : "var(--text-color)",
                    textDecoration: "none",
                    fontWeight: activeTab === "playoffs" ? "600" : "500",
                    padding: "0.5rem 1rem",
                    borderRadius: "4px",
                    backgroundColor: activeTab === "playoffs" ? "rgba(0, 120, 215, 0.1)" : "transparent",
                    transition: "all 0.2s ease-in-out",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    border: "none",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left"
                  }}
                >
                  <Target className="w-4 h-4" />
                  Playoffs
                </button>
              </li>
              <li>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation();
                    console.log("🔄 Switching to announcements tab");
                    setActiveTab("announcements"); 
                  }}
                  style={{
                    color: activeTab === "announcements" ? "var(--primary-color)" : "var(--text-color)",
                    textDecoration: "none",
                    fontWeight: activeTab === "announcements" ? "600" : "500",
                    padding: "0.5rem 1rem",
                    borderRadius: "4px",
                    backgroundColor: activeTab === "announcements" ? "rgba(0, 120, 215, 0.1)" : "transparent",
                    transition: "all 0.2s ease-in-out",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    border: "none",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left"
                  }}
                >
                  <MessageSquare className="w-4 h-4" />
                  Announcements
                </button>
              </li>
              <li>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation();
                    console.log("🔄 Switching to settings tab");
                    setActiveTab("settings"); 
                  }}
                  style={{
                    color: activeTab === "settings" ? "var(--primary-color)" : "var(--text-color)",
                    textDecoration: "none",
                    fontWeight: activeTab === "settings" ? "600" : "500",
                    padding: "0.5rem 1rem",
                    borderRadius: "4px",
                    backgroundColor: activeTab === "settings" ? "rgba(0, 120, 215, 0.1)" : "transparent",
                    transition: "all 0.2s ease-in-out",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    border: "none",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left"
                  }}
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
              </li>
              <li>
                <button 
                  onClick={() => { handleLogout(); }}
                  style={{
                    color: "#ff6b6b",
                    textDecoration: "none",
                    fontWeight: "500",
                    padding: "0.5rem 1rem",
                    borderRadius: "4px",
                    backgroundColor: "transparent",
                    transition: "all 0.2s ease-in-out",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    border: "none",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left"
                  }}
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </li>
            </ul>
          </div>
        </nav>
      )}

      {/* Main Content */}
      <main>
        <div className="container">
          {/* Message Box */}
          <MessageBox error={error} success={success} />

          {/* Tab Content */}
          {renderActiveTab()}
        </div>
      </main>
    </>
  );
};

export default AdminPanel;