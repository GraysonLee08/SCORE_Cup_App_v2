// frontend/src/components/DisplayScreen.js
// Tournament Dashboard - matches the target design with mock data

import React, { useState, useEffect } from "react";
import axios from "axios";
import { Trophy, Users, Calendar, Target, ChevronRight, Award } from "lucide-react";
import '../styles/tournament.css';
import AnnouncementsDisplay from "./AnnouncementsDisplay";
import { fetchPools, fetchTeams } from "../utils/api";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3002";

const DisplayScreen = () => {
  const [tournament, setTournament] = useState(null);
  const [standings, setStandings] = useState([]);
  const [recentGames, setRecentGames] = useState([]);
  const [allGames, setAllGames] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [pools, setPools] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [matchesTab, setMatchesTab] = useState("recent");
  const [schedule, setSchedule] = useState([]);

  useEffect(() => {
    fetchDisplayData();
    const interval = setInterval(fetchDisplayData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDisplayData = async () => {
    try {
      const tournamentsRes = await axios.get(`${API_URL}/api/tournaments`);
      if (tournamentsRes.data.length > 0) {
        const latestTournament = tournamentsRes.data[0];
        setTournament(latestTournament);

        // Fetch core data first
        const [standingsRes, gamesRes, announcementsRes] = await Promise.all([
          axios.get(`${API_URL}/api/tournaments/${latestTournament.id}/standings`),
          axios.get(`${API_URL}/api/tournaments/${latestTournament.id}/games`),
          axios.get(`${API_URL}/api/tournaments/${latestTournament.id}/announcements`)
        ]);

        setStandings(standingsRes.data);
        setAnnouncements(announcementsRes.data);
        setAllGames(gamesRes.data);

        // Try to fetch pools and teams separately with error handling
        try {
          const [poolsRes, teamsRes] = await Promise.all([
            fetchPools(latestTournament.id),
            fetchTeams(latestTournament.id)
          ]);
          setPools(poolsRes.data || []);
          setTeams(teamsRes.data || []);
          console.log("✅ Pools loaded:", poolsRes.data?.length || 0);
          console.log("✅ Teams loaded:", teamsRes.data?.length || 0);
        } catch (poolError) {
          console.warn("Failed to fetch pools/teams data:", poolError);
          setPools([]);
          setTeams([]);
        }
        
        const completed = gamesRes.data
          .filter((game) => game.status === "completed")
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 5);
        setRecentGames(completed);
        
        const upcoming = gamesRes.data
          .filter((game) => game.status === "scheduled" && game.scheduled_start_time)
          .sort((a, b) => new Date(`2024-01-01T${a.scheduled_start_time}`) - new Date(`2024-01-01T${b.scheduled_start_time}`))
          .slice(0, 6);
        setSchedule(upcoming);
      }
      setLoading(false);
    } catch (error) {
      console.error("Error fetching display data:", error);
      setLoading(false);
    }
  };

  const topTeams = standings?.length > 0
    ? standings
        .sort((a, b) => b.points - a.points || (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against))
        .slice(0, 5)
    : [];

  // Calculate comprehensive tournament statistics
  const tournamentStats = {
    totalTeams: standings?.length || 0,
    activeTeams: standings?.filter(team => team.games_played > 0).length || 0,
    totalGames: allGames?.length || 0,
    completedGames: allGames?.filter(game => game.status === "completed").length || 0,
    upcomingGames: allGames?.filter(game => game.status === "scheduled").length || 0,
    totalGoals: allGames?.length > 0 
      ? allGames
          .filter(game => game.status === "completed")
          .reduce((total, game) => total + (game.home_score || 0) + (game.away_score || 0), 0)
      : 0,
    avgGoalsPerGame: allGames?.length > 0 && allGames.filter(game => game.status === "completed").length > 0 
      ? (allGames
          .filter(game => game.status === "completed")
          .reduce((total, game) => total + (game.home_score || 0) + (game.away_score || 0), 0) / 
         allGames.filter(game => game.status === "completed").length).toFixed(1)
      : 0,
    highestScoringGame: allGames?.length > 0 
      ? allGames
          .filter(game => game.status === "completed")
          .reduce((highest, game) => {
            const gameTotal = (game.home_score || 0) + (game.away_score || 0);
            const highestTotal = (highest.home_score || 0) + (highest.away_score || 0);
            return gameTotal > highestTotal ? game : highest;
          }, {})
      : {},
    tournamentLeader: standings?.length > 0 
      ? [...standings].sort((a, b) => b.points - a.points || (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against))[0]
      : null,
    topScorer: standings?.length > 0 
      ? [...standings].sort((a, b) => (b.goals_for || 0) - (a.goals_for || 0))[0]
      : null
  };

  // Calculate tournament progress and status
  const tournamentProgress = {
    progressPercentage: tournamentStats.totalGames > 0 
      ? Math.round((tournamentStats.completedGames / tournamentStats.totalGames) * 100)
      : 0,
    currentStage: (() => {
      if (!tournament) return "Setup";
      
      const status = tournament.status?.toLowerCase();
      if (status === "setup" || status === "registration") return "Registration Open";
      if (status === "active" || status === "ongoing") {
        // Determine stage based on game progress
        if (tournamentStats.totalGames === 0) return "Pre-Tournament";
        if (tournamentStats.progressPercentage < 60) return "Pool Play Stage";
        if (tournamentStats.progressPercentage < 90) return "Knockout Stage";
        return "Final Stage";
      }
      if (status === "completed" || status === "finished") return "Tournament Complete";
      return tournament.status || "Setup";
    })(),
    statusColor: (() => {
      const status = tournament?.status?.toLowerCase();
      if (status === "active" || status === "ongoing") return { bg: "#d4edda", text: "#155724", icon: "🟢" };
      if (status === "setup" || status === "registration") return { bg: "#fff3cd", text: "#856404", icon: "🟡" };
      if (status === "completed" || status === "finished") return { bg: "#d1ecf1", text: "#0c5460", icon: "🏁" };
      return { bg: "#f8d7da", text: "#721c24", icon: "⚪" };
    })(),
    isLive: tournament?.status?.toLowerCase() === "active" || tournament?.status?.toLowerCase() === "ongoing"
  };

  // Calculate pool standings with proper tournament format criteria
  const calculatePoolStandings = () => {
    if (!pools || pools.length === 0 || !teams || teams.length === 0) {
      return {};
    }
    
    const standings = {};
    
    pools.forEach(pool => {
      const poolTeams = teams.filter(team => team.pool_id === pool.id);
      const poolGames = allGames.filter(game => 
        poolTeams.some(team => team.id === game.home_team_id || team.id === game.away_team_id) &&
        game.status === 'completed'
      );

      // Calculate stats for each team
      const teamStats = poolTeams.map(team => {
        let wins = 0, losses = 0, ties = 0, goalsFor = 0, goalsAgainst = 0;
        let yellowCards = 0, redCards = 0; // Fair play points (placeholder - would need to be tracked)

        poolGames.forEach(game => {
          if (game.home_team_id === team.id) {
            goalsFor += game.home_score || 0;
            goalsAgainst += game.away_score || 0;
            if (game.home_score > game.away_score) wins++;
            else if (game.home_score < game.away_score) losses++;
            else ties++;
          } else if (game.away_team_id === team.id) {
            goalsFor += game.away_score || 0;
            goalsAgainst += game.home_score || 0;
            if (game.away_score > game.home_score) wins++;
            else if (game.away_score < game.home_score) losses++;
            else ties++;
          }
        });

        const points = wins * 3 + ties * 1;
        const goalDifferential = goalsFor - goalsAgainst;
        const fairPlayPoints = yellowCards * 1 + redCards * 3; // Lower is better
        const gamesPlayed = wins + losses + ties;

        return {
          ...team,
          wins,
          losses,
          ties,
          goalsFor,
          goalsAgainst,
          points,
          goalDifferential,
          fairPlayPoints,
          gamesPlayed
        };
      });

      // Sort by tournament ranking criteria
      teamStats.sort((a, b) => {
        // 1. Points
        if (b.points !== a.points) return b.points - a.points;
        // 2. Goal differential
        if (b.goalDifferential !== a.goalDifferential) return b.goalDifferential - a.goalDifferential;
        // 3. Goals for
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        // 4. Goals against (fewer is better)
        if (a.goalsAgainst !== b.goalsAgainst) return a.goalsAgainst - b.goalsAgainst;
        // 5. Fair play points (fewer is better)
        if (a.fairPlayPoints !== b.fairPlayPoints) return a.fairPlayPoints - b.fairPlayPoints;
        // 6. Alphabetical as tiebreaker (would be coin toss in reality)
        return a.name.localeCompare(b.name);
      });

      standings[pool.id] = {
        pool,
        teams: teamStats,
        winner: teamStats[0],
        secondPlace: teamStats[1]
      };
    });

    return standings;
  };

  const poolStandings = calculatePoolStandings();
  console.log("🏊‍♂️ Pool Standings calculated:", Object.keys(poolStandings).length, "pools");

  // Sort all teams by overall tournament performance (like MLB standings)
  const overallStandings = standings?.length > 0 ? [...standings].sort((a, b) => {
    // Primary: Points (wins * 3 + ties * 1)
    if (b.points !== a.points) return b.points - a.points;
    // Secondary: Goal differential  
    const aDiff = (a.goals_for || 0) - (a.goals_against || 0);
    const bDiff = (b.goals_for || 0) - (b.goals_against || 0);
    if (bDiff !== aDiff) return bDiff - aDiff;
    // Tertiary: Goals for
    if ((b.goals_for || 0) !== (a.goals_for || 0)) return (b.goals_for || 0) - (a.goals_for || 0);
    // Quaternary: Goals against (lower is better)
    return (a.goals_against || 0) - (b.goals_against || 0);
  }) : [];

  const getTeamCssClass = (teamName) => {
    const classMap = {
      'Purple Panthers': 'team-purple-panthers',
      'Red Dragons': 'team-red-dragons',
      'Blue Sharks': 'team-blue-sharks',
      'Green Gorillas': 'team-green-gorillas',
      'Yellow Eagles': 'team-yellow-eagles',
      'Orange Tigers': 'team-orange-tigers',
      'White Wolves': 'team-white-wolves',
      'Teal Turtles': 'team-teal-turtles',
      'Brown Rangers': 'team-brown-rangers',
      'Pink Panthers': 'team-pink-panthers',
      'Gray Gorillas': 'team-gray-gorillas',
      'White Panthers': 'team-white-panthers'
    };
    return classMap[teamName] || 'team-gray-gorillas';
  };

  if (loading) {
    return (
      <main>
        <div className="container" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
          <div style={{ textAlign: "center" }}>
            <Trophy className="w-16 h-16" style={{ color: "var(--primary-color)", margin: "0 auto 1rem", display: "block" }} />
            <h2>Loading tournament data...</h2>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="container">
        {/* Page Header */}
        <div style={{ textAlign: "center", marginBottom: "3rem", paddingTop: "2rem" }}>
          <h1 style={{ color: "var(--primary-color)", marginBottom: "0.5rem", fontFamily: "Lubalin, serif" }}>
            {tournament?.name || 'SCORES Cup Tournament'}
          </h1>
          <p style={{ color: "var(--text-light)" }}>Live tournament results and standings</p>
        </div>

        {/* Tournament Status Banner */}
        {tournament && (
          <div className="content-card" style={{ marginBottom: "2rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h3 style={{ marginBottom: "0.5rem" }}>{tournament.name}</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", fontSize: "0.875rem", color: "var(--text-light)" }}>
                  <span>📅 Start: {tournament.start_date ? new Date(tournament.start_date).toLocaleDateString() : 'TBD'}</span>
                  <span>📅 End: {tournament.end_date ? new Date(tournament.end_date).toLocaleDateString() : 'TBD'}</span>
                  <span style={{ 
                    padding: "0.25rem 0.75rem", 
                    backgroundColor: tournamentProgress.statusColor.bg, 
                    color: tournamentProgress.statusColor.text, 
                    borderRadius: "4px",
                    fontWeight: "500"
                  }}>
                    Status: {tournamentProgress.currentStage}
                  </span>
                </div>
              </div>
              <div>
                <span style={{ 
                  fontSize: "0.875rem", 
                  backgroundColor: tournamentProgress.statusColor.bg, 
                  color: tournamentProgress.statusColor.text, 
                  padding: "0.5rem 1rem", 
                  borderRadius: "20px",
                  fontWeight: "500"
                }}>
                  {tournamentProgress.statusColor.icon} {tournamentProgress.isLive ? 'Live' : tournament.status}
                </span>
              </div>
            </div>
            
            {/* Dynamic Progress Bar */}
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.875rem", color: "var(--text-light)" }}>Tournament Progress</span>
                <span style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--primary-color)" }}>
                  {tournamentProgress.progressPercentage}%
                </span>
              </div>
              <div style={{ width: "100%", backgroundColor: "#e0e0e0", borderRadius: "10px", height: "8px", marginBottom: "0.5rem" }}>
                <div style={{ 
                  width: `${tournamentProgress.progressPercentage}%`, 
                  background: tournamentProgress.progressPercentage < 30 ? "#dc3545" : 
                             tournamentProgress.progressPercentage < 70 ? "#ffc107" : "#28a745", 
                  height: "8px", 
                  borderRadius: "10px", 
                  transition: "width 0.3s ease" 
                }}></div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-light)" }}>
                <span>{tournamentProgress.currentStage}</span>
                <span>{tournamentStats.completedGames}/{tournamentStats.totalGames} games completed</span>
              </div>
            </div>
          </div>
        )}

        {/* Pool Standings Section */}
        {(pools.length > 0 && Object.keys(poolStandings).length > 0) ? (
          <div style={{ marginBottom: "3rem" }}>
            <h2 style={{ marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              🏊‍♂️ Pool Standings
            </h2>
            <p style={{ color: "var(--text-light)", marginBottom: "2rem" }}>Current pool rankings and qualification status</p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {Object.values(poolStandings).map(({ pool, teams: poolTeams, winner, secondPlace }) => (
                <div key={pool.id} className="content-card">
                  <div style={{ padding: "1.5rem", borderBottom: "1px solid #e0e0e0", backgroundColor: "#f8f9fa" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <h3 style={{ fontSize: "1.125rem", fontWeight: "600", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Users className="w-5 h-5" style={{ color: "var(--primary-color)" }} />
                        {pool.name}
                      </h3>
                      <div style={{ fontSize: "0.875rem", color: "var(--text-light)" }}>
                        {poolTeams.filter(t => t.gamesPlayed > 0).length}/{poolTeams.length} teams active
                      </div>
                    </div>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Pos</th>
                          <th>Team</th>
                          <th style={{ textAlign: "center" }}>GP</th>
                          <th style={{ textAlign: "center" }}>W</th>
                          <th style={{ textAlign: "center" }}>L</th>
                          <th style={{ textAlign: "center" }}>T</th>
                          <th style={{ textAlign: "center" }}>GF</th>
                          <th style={{ textAlign: "center" }}>GA</th>
                          <th style={{ textAlign: "center" }}>GD</th>
                          <th style={{ textAlign: "center" }}>Pts</th>
                          <th style={{ textAlign: "center" }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {poolTeams.map((team, index) => (
                          <tr key={team.id} style={{ backgroundColor: index < 2 ? "rgba(0, 120, 215, 0.05)" : "transparent" }}>
                            <td>
                              <span style={{ fontWeight: "500" }}>{index + 1}</span>
                            </td>
                            <td>
                              <div style={{ fontWeight: "500" }}>{team.name}</div>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {team.gamesPlayed}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {team.wins}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {team.losses}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {team.ties}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {team.goalsFor}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {team.goalsAgainst}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span style={{
                                fontWeight: "500",
                                color: team.goalDifferential > 0 ? "#10b981" : 
                                       team.goalDifferential < 0 ? "#ef4444" : "var(--text-color)"
                              }}>
                                {team.goalDifferential > 0 ? "+" : ""}{team.goalDifferential}
                              </span>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span style={{ fontSize: "1.125rem", fontWeight: "bold", color: "var(--primary-color)" }}>{team.points}</span>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {index === 0 && (
                                <span style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                  padding: "0.25rem 0.5rem",
                                  borderRadius: "9999px",
                                  fontSize: "0.75rem",
                                  fontWeight: "500",
                                  backgroundColor: "#dcfce7",
                                  color: "#166534"
                                }}>
                                  <Trophy className="w-3 h-3" />
                                  Pool Winner
                                </span>
                              )}
                              {index === 1 && (
                                <span style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                  padding: "0.25rem 0.5rem",
                                  borderRadius: "9999px",
                                  fontSize: "0.75rem",
                                  fontWeight: "500",
                                  backgroundColor: "#fef3c7",
                                  color: "#92400e"
                                }}>
                                  <Award className="w-3 h-3" />
                                  2nd Place
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: "2rem", padding: "1rem", background: "#f8f9fa", borderRadius: "8px", fontSize: "0.875rem", color: "#6b7280" }}>
            <strong>Pool Standings Debug:</strong><br />
            - Pools available: {pools.length}<br />
            - Teams available: {teams.length}<br />
            - Pool standings calculated: {Object.keys(poolStandings).length}<br />
            {pools.length > 0 && <span>- Pool names: {pools.map(p => p.name).join(", ")}<br /></span>}
            {teams.length > 0 && <span>- Teams in pools: {teams.filter(t => t.pool_id).length}/{teams.length}</span>}
          </div>
        )}

        {/* Live Action Section */}
        <div style={{ marginBottom: "3rem" }}>
          <h2 style={{ marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            🏃‍♂️ Live Action
          </h2>
          <p style={{ color: "var(--text-light)", marginBottom: "2rem" }}>Current matches and recent results</p>
          
          <div className="content-wrapper">
            {/* Recent Matches Card */}
            <div className="col-two-thirds">
              <div className="content-card">
                <div style={{ marginBottom: "1.5rem" }}>
                  <h3 style={{ marginBottom: "1rem" }}>⚽ Recent Matches</h3>
                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                    {['recent', 'live', 'upcoming'].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setMatchesTab(tab)}
                        className="btn"
                        style={{
                          backgroundColor: matchesTab === tab ? "var(--primary-color)" : "#e0e0e0",
                          color: matchesTab === tab ? "white" : "#333",
                          fontSize: "0.875rem",
                          padding: "0.5rem 1rem"
                        }}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div>
                  {matchesTab === "recent" && (recentGames.length > 0 ? recentGames.slice(0, 4).map((game, index) => (
                    <div key={game.id} style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "center", 
                      padding: "1rem", 
                      borderBottom: index < recentGames.slice(0, 4).length - 1 ? "1px solid #e0e0e0" : "none"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <div style={{ 
                          width: "40px", 
                          height: "40px", 
                          backgroundColor: "var(--primary-color)", 
                          color: "white", 
                          borderRadius: "50%", 
                          display: "flex", 
                          alignItems: "center", 
                          justifyContent: "center", 
                          fontSize: "0.75rem", 
                          fontWeight: "bold" 
                        }}>
                          {game.home_team_name ? game.home_team_name.split(' ').map(w => w[0]).join('').substring(0,2) : 'H'}
                        </div>
                        <div>
                          <div style={{ fontWeight: "500" }}>{game.home_team_name} vs {game.away_team_name}</div>
                          <div style={{ fontSize: "0.875rem", color: "var(--text-light)" }}>{game.pool_name}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <div style={{ fontWeight: "bold", fontSize: "1.125rem" }}>{game.home_score} - {game.away_score}</div>
                        <div style={{ color: "#10b981" }}>✓</div>
                      </div>
                    </div>
                  )) : (
                    <div style={{ textAlign: "center", padding: "2rem" }}>
                      <Trophy className="w-12 h-12" style={{ color: "var(--text-light)", margin: "0 auto 1rem", display: "block" }} />
                      <p>No recent matches</p>
                    </div>
                  ))}
                  
                  {matchesTab === "upcoming" && (schedule.length > 0 ? schedule.map((game, index) => (
                    <div key={game.id} style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "center", 
                      padding: "1rem", 
                      borderBottom: index < schedule.length - 1 ? "1px solid #e0e0e0" : "none"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <div style={{ 
                          width: "40px", 
                          height: "40px", 
                          backgroundColor: "var(--accent-color)", 
                          color: "#333", 
                          borderRadius: "50%", 
                          display: "flex", 
                          alignItems: "center", 
                          justifyContent: "center", 
                          fontSize: "0.75rem", 
                          fontWeight: "bold" 
                        }}>
                          {game.home_team_name ? game.home_team_name.split(' ').map(w => w[0]).join('').substring(0,2) : 'H'}
                        </div>
                        <div>
                          <div style={{ fontWeight: "500" }}>{game.home_team_name} vs {game.away_team_name}</div>
                          <div style={{ fontSize: "0.875rem", color: "var(--text-light)" }}>{game.pool_name}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <div style={{ fontWeight: "bold" }}>{game.scheduled_start_time || 'TBD'}</div>
                        <div style={{ color: "var(--accent-color)" }}>⏰</div>
                      </div>
                    </div>
                  )) : (
                    <div style={{ textAlign: "center", padding: "2rem" }}>
                      <Calendar className="w-12 h-12" style={{ color: "var(--text-light)", margin: "0 auto 1rem", display: "block" }} />
                      <p>No upcoming matches</p>
                    </div>
                  ))}
                  
                  {matchesTab === "live" && (
                    <div style={{ textAlign: "center", padding: "2rem" }}>
                      <Trophy className="w-12 h-12" style={{ color: "var(--text-light)", margin: "0 auto 1rem", display: "block" }} />
                      <p>No live matches</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Announcements Card */}
            <div className="col-one-third">
              <div className="content-card">
                <h3 style={{ marginBottom: "1rem" }}>📢 Latest Updates</h3>
                <div>
                  {announcements.length > 0 ? announcements.slice(0, 3).map((announcement, index) => (
                    <div key={announcement.id} style={{ 
                      padding: "1rem", 
                      borderBottom: index < announcements.slice(0, 3).length - 1 ? "1px solid #e0e0e0" : "none"
                    }}>
                      <h4 style={{ fontSize: "0.9375rem", fontWeight: "600", marginBottom: "0.5rem" }}>
                        {announcement.title}
                      </h4>
                      <p style={{ fontSize: "0.875rem", color: "var(--text-color)", marginBottom: "0.5rem" }}>
                        {announcement.message.substring(0, 100)}...
                      </p>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ 
                          fontSize: "0.75rem", 
                          backgroundColor: "var(--primary-color)", 
                          color: "white", 
                          padding: "0.25rem 0.5rem", 
                          borderRadius: "4px" 
                        }}>
                          New
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-light)" }}>
                          {new Date(announcement.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  )) : (
                    <div style={{ textAlign: "center", padding: "2rem" }}>
                      <Calendar className="w-12 h-12" style={{ color: "var(--text-light)", margin: "0 auto 1rem", display: "block" }} />
                      <p>No announcements</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Performance Section */}
        <div style={{ marginBottom: "3rem" }}>
          <h2 style={{ marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            🏆 Standings & Stats
          </h2>
          <p style={{ color: "var(--text-light)", marginBottom: "2rem" }}>Current tournament rankings and statistics</p>
          
          <div className="content-wrapper">
            {/* Tournament Standings Card */}
            <div className="col-three-quarters">
              <div className="content-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                  <h3>📊 Tournament Standings</h3>
                  <span style={{ 
                    fontSize: "0.875rem", 
                    backgroundColor: "#d4edda", 
                    color: "#155724", 
                    padding: "0.25rem 0.75rem", 
                    borderRadius: "15px" 
                  }}>
                    Live
                  </span>
                </div>
                <div>
                  {overallStandings.length > 0 ? (
                    <table>
                      <thead>
                        <tr>
                          <th>Pos</th>
                          <th>Team</th>
                          <th>Pool</th>
                          <th>P</th>
                          <th>W</th>
                          <th>D</th>
                          <th>L</th>
                          <th>GF</th>
                          <th>GA</th>
                          <th>GD</th>
                          <th>Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overallStandings.slice(0, 10).map((team, index) => (
                          <tr key={team.id}>
                            <td style={{ fontWeight: "600" }}>{index + 1}</td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <div style={{ 
                                  width: "24px", 
                                  height: "24px", 
                                  backgroundColor: "var(--primary-color)", 
                                  color: "white", 
                                  borderRadius: "50%", 
                                  display: "flex", 
                                  alignItems: "center", 
                                  justifyContent: "center", 
                                  fontSize: "0.625rem", 
                                  fontWeight: "bold" 
                                }}>
                                  {team.name ? team.name.split(' ').map(w => w[0]).join('').substring(0,2) : 'T'}
                                </div>
                                {team.name}
                              </div>
                            </td>
                            <td>{team.pool_name}</td>
                            <td>{team.games_played}</td>
                            <td>{team.wins}</td>
                            <td>{team.draws}</td>
                            <td>{team.losses}</td>
                            <td>{team.goals_for}</td>
                            <td>{team.goals_against}</td>
                            <td style={{ color: team.goals_for - team.goals_against >= 0 ? '#10b981' : '#ef4444' }}>
                              {team.goals_for - team.goals_against > 0 ? '+' : ''}{team.goals_for - team.goals_against}
                            </td>
                            <td style={{ fontWeight: "bold" }}>{team.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ textAlign: "center", padding: "2rem" }}>
                      <Trophy className="w-12 h-12" style={{ color: "var(--text-light)", margin: "0 auto 1rem", display: "block" }} />
                      <p>No standings available</p>
                      <p style={{ fontSize: "0.875rem" }}>Set up teams and start playing games</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tournament Stats Card */}
            <div className="col-quarter">
              <div className="content-card">
                <h3 style={{ marginBottom: "1.5rem" }}>📈 Tournament Stats</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.75rem", fontWeight: "bold", color: "var(--primary-color)" }}>
                      {tournamentStats.completedGames}/{tournamentStats.totalGames}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-light)" }}>Games Completed</div>
                  </div>
                  
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.75rem", fontWeight: "bold", color: "var(--primary-color)" }}>
                      {tournamentStats.activeTeams}/{tournamentStats.totalTeams}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-light)" }}>Active Teams</div>
                  </div>
                  
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.75rem", fontWeight: "bold", color: "var(--accent-color)" }}>
                      {tournamentStats.totalGoals}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-light)" }}>Total Goals</div>
                  </div>
                  
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.75rem", fontWeight: "bold", color: "var(--accent-color)" }}>
                      {tournamentStats.avgGoalsPerGame}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-light)" }}>Goals/Game</div>
                  </div>

                  {/* Tournament Leader */}
                  {tournamentStats.tournamentLeader && (
                    <div style={{ 
                      textAlign: "center", 
                      padding: "0.75rem", 
                      backgroundColor: "rgba(0, 120, 215, 0.1)", 
                      borderRadius: "8px",
                      marginTop: "0.5rem"
                    }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-light)", marginBottom: "0.25rem" }}>🏆 Leader</div>
                      <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--primary-color)" }}>
                        {tournamentStats.tournamentLeader.name}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-light)" }}>
                        {tournamentStats.tournamentLeader.points} pts
                      </div>
                    </div>
                  )}

                  {/* Highest Scoring Game */}
                  {tournamentStats.highestScoringGame?.home_team_name && (
                    <div style={{ 
                      textAlign: "center", 
                      padding: "0.75rem", 
                      backgroundColor: "rgba(255, 193, 7, 0.1)", 
                      borderRadius: "8px"
                    }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-light)", marginBottom: "0.25rem" }}>⚽ Top Game</div>
                      <div style={{ fontSize: "0.8rem", fontWeight: "600", color: "#f59e0b" }}>
                        {tournamentStats.highestScoringGame.home_score}-{tournamentStats.highestScoringGame.away_score}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-light)" }}>
                        {tournamentStats.highestScoringGame.home_team_name} vs {tournamentStats.highestScoringGame.away_team_name}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default DisplayScreen;
