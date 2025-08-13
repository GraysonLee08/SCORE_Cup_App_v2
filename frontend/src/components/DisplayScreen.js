// frontend/src/components/DisplayScreen.js
// Tournament Dashboard - matches the target design with mock data

import React, { useState, useEffect } from "react";
import axios from "axios";
import { Trophy } from "lucide-react";
import '../styles/tournament.css';
import { fetchPools, fetchTeams } from "../utils/api";

const API_URL = (typeof process !== 'undefined' && process.env?.REACT_APP_API_URL) || "http://localhost:3002";

const DisplayScreen = React.memo(() => {
  const [tournament, setTournament] = useState(null);
  const [standings, setStandings] = useState([]);
  const [recentGames, setRecentGames] = useState([]);
  const [allGames, setAllGames] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [pools, setPools] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState([]);
  const [playoffGames, setPlayoffGames] = useState([]);

  // Function to convert military time to AM/PM format
  const formatTimeToAMPM = (militaryTime) => {
    if (!militaryTime) return '';
    
    const [hours, minutes] = militaryTime.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    
    return `${displayHour}:${minutes} ${ampm}`;
  };

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

        // Fetch playoff games
        let fetchedPlayoffGames = [];
        try {
          const playoffRes = await axios.get(`${API_URL}/api/tournaments/${latestTournament.id}/playoffs`);
          fetchedPlayoffGames = playoffRes.data.playoff_games || [];
          setPlayoffGames(fetchedPlayoffGames);
        } catch (playoffError) {
          console.warn("Failed to fetch playoff games:", playoffError);
          setPlayoffGames([]);
        }

        // Try to fetch pools and teams separately with error handling
        try {
          const [poolsRes, teamsRes] = await Promise.all([
            fetchPools(latestTournament.id),
            fetchTeams(latestTournament.id)
          ]);
          setPools(poolsRes.data || []);
          setTeams(teamsRes.data || []);
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
        
        // Process upcoming games after playoff fetch is complete
        const processUpcomingGames = (currentPlayoffGames) => {
          const poolUpcoming = gamesRes.data
            .filter((game) => game.status === "scheduled" && game.scheduled_start_time)
            .map(game => ({ ...game, gameType: 'pool' }));
          
          const playoffUpcoming = currentPlayoffGames
            .filter((game) => game.status === "scheduled")
            .map(game => ({ ...game, gameType: 'playoff' }));
          
          const allUpcoming = [...poolUpcoming, ...playoffUpcoming]
            .sort((a, b) => {
              // Games without scheduled times go to the end
              if (!a.scheduled_start_time && !b.scheduled_start_time) return 0;
              if (!a.scheduled_start_time) return 1;
              if (!b.scheduled_start_time) return -1;
              // Both have times, sort by time
              return new Date(`2024-01-01T${a.scheduled_start_time}`) - new Date(`2024-01-01T${b.scheduled_start_time}`);
            })
            .slice(0, 6);
          
          setSchedule(allUpcoming);
        };
        
        // Process with fetched playoff games
        processUpcomingGames(fetchedPlayoffGames);
      }
      setLoading(false);
    } catch (error) {
      console.error("Error fetching display data:", error);
      setLoading(false);
    }
  };

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

  // Check if playoff games have been scheduled (auto-schedule has been run)
  const playoffGamesScheduled = playoffGames.length > 0 && playoffGames.some(game => 
    game.status === 'scheduled' && game.scheduled_start_time !== null
  );

  // Organize playoff games into bracket structure for display
  const organizeBracketGames = () => {
    if (!playoffGames || playoffGames.length === 0) return {};
    
    return {
      quarterfinals: playoffGames.filter(g => g.round === 'quarterfinal'),
      semifinals: playoffGames.filter(g => g.round === 'semifinal'),
      final: playoffGames.filter(g => g.round === 'final')
    };
  };

  const bracketData = organizeBracketGames();

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
    <main style={{ height: "100vh", overflow: "hidden", padding: "1rem" }}>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "100%", margin: "0 auto" }}>
        {/* Compact Page Header with Donate Button */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center", 
          marginBottom: "0.5rem",
          position: "relative"
        }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ 
              color: "var(--primary-color)", 
              marginBottom: "0.25rem", 
              fontFamily: "Lubalin, serif",
              fontSize: "1.5rem",
              letterSpacing: "0.02em"
            }}>
              {tournament?.name || 'SCORE Cup Tournament'}
            </h1>
            <p style={{ color: "var(--text-light)", fontSize: "0.875rem", margin: 0 }}>
              Live tournament results and standings
            </p>
          </div>
          <div style={{ position: "absolute", right: 0 }}>
            <a 
              href="https://givebutter.com/ZAf4Uk"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                backgroundColor: "#ff6b35",
                color: "white",
                padding: "0.6rem 1.25rem",
                borderRadius: "8px",
                textDecoration: "none",
                fontSize: "0.95rem",
                fontWeight: "600",
                boxShadow: "0 2px 6px rgba(255, 107, 53, 0.3)",
                transition: "all 0.3s ease-in-out",
                border: "none",
                cursor: "pointer"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#ff5722";
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 4px 10px rgba(255, 107, 53, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#ff6b35";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 2px 6px rgba(255, 107, 53, 0.3)";
              }}
            >
              ❤️ Donate to SCORES
            </a>
          </div>
        </div>


        {/* Main Dashboard Grid - Responsive Layout */}
        <div className="display-dashboard-grid" style={{ 
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 2fr 1fr",
          gap: "1rem",
          overflow: "hidden"
        }}>
          
          {/* Left Column - Overall Standings Only */}
          <div style={{ 
            display: "flex", 
            flexDirection: "column", 
            minHeight: 0
          }}>
            {/* Overall Standings - Full Height */}
            <div className="content-card" style={{ 
              flex: 1, 
              minHeight: 0, 
              display: "flex", 
              flexDirection: "column",
              padding: "1rem"
            }}>
              <h3 style={{ 
                margin: "0 0 0.75rem 0", 
                fontSize: "1.1rem",
                display: "flex", 
                alignItems: "center", 
                gap: "0.5rem" 
              }}>
                🏆 Overall Standings
              </h3>
              <div style={{ 
                flex: 1, 
                overflowY: "auto" 
              }}>
                {overallStandings.length > 0 ? (
                  <table style={{ 
                    width: "auto", 
                    borderRadius: 0, 
                    boxShadow: "none",
                    marginBottom: 0,
                    fontSize: "0.75rem"
                  }}>
                    <thead style={{ fontSize: "0.7rem" }}>
                      <tr>
                        <th className="team-name-header" style={{ padding: "0.4rem 0.5rem", textAlign: "left" }}>Team</th>
                        <th className="number-header" style={{ padding: "0.4rem", textAlign: "center" }}>GP</th>
                        <th className="number-header" style={{ padding: "0.4rem", textAlign: "center" }}>W</th>
                        <th className="number-header" style={{ padding: "0.4rem", textAlign: "center" }}>L</th>
                        <th className="number-header" style={{ padding: "0.4rem", textAlign: "center" }}>T</th>
                        <th className="number-header" style={{ padding: "0.4rem", textAlign: "center" }}>GD</th>
                        <th className="number-header" style={{ padding: "0.4rem", textAlign: "center" }}>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overallStandings.map((team, index) => (
                        <tr key={team.id} style={{ 
                          backgroundColor: index < 3 ? "rgba(255, 215, 0, 0.1)" : "transparent" 
                        }}>
                          <td className="team-name" style={{ 
                            padding: "0.4rem 0.5rem",
                            fontSize: "0.75rem",
                            fontWeight: index < 3 ? "600" : "normal"
                          }}>
                            <span style={{ color: index < 3 ? "#f59e0b" : "inherit" }}>
                              {index + 1}.
                            </span> {team.name}
                          </td>
                          <td className="number-cell" style={{ padding: "0.4rem", textAlign: "center", fontSize: "0.75rem" }}>
                            {team.games_played || 0}
                          </td>
                          <td className="number-cell" style={{ padding: "0.4rem", textAlign: "center", fontSize: "0.75rem" }}>
                            {team.wins || 0}
                          </td>
                          <td className="number-cell" style={{ padding: "0.4rem", textAlign: "center", fontSize: "0.75rem" }}>
                            {team.losses || 0}
                          </td>
                          <td className="number-cell" style={{ padding: "0.4rem", textAlign: "center", fontSize: "0.75rem" }}>
                            {team.draws || 0}
                          </td>
                          <td className="number-cell" style={{ 
                            padding: "0.4rem", 
                            textAlign: "center", 
                            fontSize: "0.75rem",
                            color: ((team.goals_for || 0) - (team.goals_against || 0)) >= 0 ? '#10b981' : '#ef4444',
                            fontWeight: "600"
                          }}>
                            {((team.goals_for || 0) - (team.goals_against || 0)) > 0 ? '+' : ''}{(team.goals_for || 0) - (team.goals_against || 0)}
                          </td>
                          <td className="number-cell" style={{ 
                            padding: "0.4rem", 
                            textAlign: "center", 
                            fontSize: "0.75rem",
                            fontWeight: "bold"
                          }}>
                            {team.points || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ textAlign: "center", color: "var(--text-light)", fontSize: "0.875rem" }}>
                    No standings available
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Middle Column - 2x2 Grid Layout */}
          <div style={{ 
            display: "flex", 
            flexDirection: "column", 
            gap: "0.75rem",
            minHeight: 0,
            flex: 1
          }}>
            
            {/* Top Row - Recent Results and Up Next */}
            <div style={{
              display: "flex",
              gap: "0.75rem",
              flex: "0 1 auto"
            }}>
              
              {/* Recent Results - Left Top */}
              <div className="content-card" style={{ 
                display: "flex", 
                flexDirection: "column",
                padding: "1rem",
                flex: "0 1 auto",
                minWidth: 0
              }}>
                <h3 style={{ 
                  margin: "0 0 0.75rem 0", 
                  fontSize: "1rem",
                  display: "flex", 
                  alignItems: "center", 
                  gap: "0.5rem" 
                }}>
                  ⚽ Recent Results
                </h3>
                <div style={{ 
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  maxHeight: "280px",
                  overflowY: "auto"
                }}>
                  {recentGames.length > 0 ? recentGames.slice(0, 4).map((game, index) => (
                    <div key={index} style={{
                      background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #1e40af 100%)",
                      color: "white",
                      borderRadius: "8px",
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.8rem"
                    }}>
                      <div style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        alignItems: "center"
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "0.75rem", fontWeight: "600" }}>
                            {game.home_team_name}
                          </div>
                          <div style={{ fontSize: "0.75rem", marginTop: "0.125rem" }}>
                            {game.away_team_name}
                          </div>
                        </div>
                        <div style={{ 
                          textAlign: "center", 
                          minWidth: "40px",
                          fontSize: "1.1rem",
                          fontWeight: "bold"
                        }}>
                          <div>{game.home_score}</div>
                          <div>{game.away_score}</div>
                        </div>
                        <div style={{ fontSize: "0.65rem", opacity: 0.8, textAlign: "right" }}>
                          {game.field}<br/>
                          {formatTimeToAMPM(game.scheduled_start_time)}
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div style={{ textAlign: "center", color: "var(--text-light)", fontSize: "0.875rem", padding: "1rem" }}>
                      No completed games yet
                    </div>
                  )}
                </div>
              </div>
              
              {/* Up Next - Right Top */}
              <div className="content-card" style={{ 
                display: "flex", 
                flexDirection: "column",
                padding: "1rem",
                flex: "0 1 auto",
                minWidth: 0
              }}>
                <h3 style={{ 
                  margin: "0 0 0.75rem 0", 
                  fontSize: "1rem",
                  display: "flex", 
                  alignItems: "center", 
                  gap: "0.5rem" 
                }}>
                  📅 Up Next
                </h3>
                <div style={{ 
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  maxHeight: "280px",
                  overflowY: "auto"
                }}>
                  {schedule.length > 0 ? schedule.slice(0, 5).map((game, index) => (
                    <div key={index} style={{
                      border: game.gameType === 'playoff' ? "2px solid #f59e0b" : "1px solid #e0e0e0",
                      borderRadius: "6px",
                      padding: "0.5rem",
                      fontSize: "0.8rem",
                      backgroundColor: index === 0 ? "#fff3cd" : game.gameType === 'playoff' ? "#fef3c7" : "transparent",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "0.75rem", fontWeight: "500", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          {game.gameType === 'playoff' && (
                            <span style={{ fontSize: "0.7rem", backgroundColor: "#f59e0b", color: "white", padding: "0.1rem 0.3rem", borderRadius: "3px", fontWeight: "600" }}>
                              {game.round === 'quarterfinal' && `QF${game.position}`}
                              {game.round === 'semifinal' && `SF${game.position}`}
                              {game.round === 'final' && 'FINAL'}
                            </span>
                          )}
                          {game.home_team_name} vs {game.away_team_name}
                        </div>
                        <div style={{ fontSize: "0.65rem", color: "var(--text-light)" }}>
                          {game.field || "TBD"}
                        </div>
                      </div>
                      <div style={{ 
                        fontSize: "0.9rem",
                        fontWeight: "bold",
                        color: game.gameType === 'playoff' ? "#f59e0b" : "var(--primary-color)"
                      }}>
                        {game.scheduled_start_time ? formatTimeToAMPM(game.scheduled_start_time) : "TBD"}
                      </div>
                    </div>
                  )) : (
                    <div style={{ textAlign: "center", color: "var(--text-light)", fontSize: "0.875rem", padding: "1rem" }}>
                      No upcoming games
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Bottom Row - Overall Standings and Tournament Stats */}
            <div style={{
              display: "flex",
              gap: "0.75rem",
              flex: "1 1 auto"
            }}>
              
              {/* Pool Standings or Tournament Bracket - Left Bottom */}
              {playoffGamesScheduled ? (
                // Tournament Bracket View
                <div className="content-card" style={{ 
                  display: "flex", 
                  flexDirection: "column",
                  padding: "1rem",
                  flex: "1 1 auto",
                  minWidth: 0
                }}>
                  <h3 style={{ 
                    margin: "0 0 0.75rem 0", 
                    fontSize: "1rem",
                    display: "flex", 
                    alignItems: "center", 
                    gap: "0.5rem" 
                  }}>
                    🏆 Tournament Bracket
                  </h3>
                  <div style={{ 
                    flex: 1, 
                    overflowY: "auto", 
                    display: "flex", 
                    flexDirection: "column", 
                    alignItems: "center",
                    padding: "0.5rem",
                    fontSize: "0.65rem"
                  }}>
                    {/* Tournament Bracket Visual Layout */}
                    <div style={{ 
                      display: "grid", 
                      gridTemplateColumns: "1fr 0.5fr 1fr", 
                      gridTemplateRows: "repeat(4, 1fr)",
                      gap: "0.25rem",
                      width: "100%",
                      height: "100%",
                      alignItems: "center"
                    }}>
                      
                      {/* Left Quarterfinals */}
                      <div style={{ gridColumn: 1, gridRow: 1, display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                        {bracketData.quarterfinals?.slice(0, 2).map((game, index) => (
                          <div key={game.id} style={{
                            border: "1px solid #e0e0e0",
                            borderRadius: "3px",
                            padding: "0.2rem 0.4rem",
                            backgroundColor: game.status === 'completed' ? "#f0f9ff" : "white",
                            fontSize: "0.55rem",
                            minHeight: "28px"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "100%" }}>
                              <div style={{ flex: 1, lineHeight: "1.1" }}>
                                <div style={{ 
                                  fontWeight: game.status === 'completed' && game.winner_team_id === game.home_team_id ? "600" : "normal",
                                  whiteSpace: "nowrap", 
                                  overflow: "hidden", 
                                  textOverflow: "ellipsis",
                                  maxWidth: "70px"
                                }}>
                                  {game.home_team_name?.split(' - ')[0] || game.home_team_name}
                                </div>
                                <div style={{ 
                                  fontWeight: game.status === 'completed' && game.winner_team_id === game.away_team_id ? "600" : "normal",
                                  whiteSpace: "nowrap", 
                                  overflow: "hidden", 
                                  textOverflow: "ellipsis",
                                  maxWidth: "70px"
                                }}>
                                  {game.away_team_name?.split(' - ')[0] || game.away_team_name}
                                </div>
                              </div>
                              <div style={{ textAlign: "center", minWidth: "16px", fontSize: "0.5rem" }}>
                                {game.status === 'completed' ? (
                                  <div style={{ lineHeight: "1" }}>
                                    <div>{game.home_score}</div>
                                    <div>{game.away_score}</div>
                                  </div>
                                ) : (
                                  <div style={{ color: "#64748b", fontSize: "0.45rem" }}>
                                    {game.scheduled_start_time ? formatTimeToAMPM(game.scheduled_start_time) : 'TBD'}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Left Semifinal */}
                      <div style={{ gridColumn: 2, gridRow: "1 / 3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {bracketData.semifinals?.[0] && (
                          <div style={{
                            border: "1px solid #e0e0e0",
                            borderRadius: "3px",
                            padding: "0.2rem 0.4rem",
                            backgroundColor: bracketData.semifinals[0].status === 'completed' ? "#f0f9ff" : bracketData.semifinals[0].home_team_id ? "white" : "#f8f9fa",
                            fontSize: "0.55rem",
                            width: "100%",
                            minHeight: "28px"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "100%" }}>
                              <div style={{ flex: 1, lineHeight: "1.1" }}>
                                <div style={{ 
                                  fontWeight: bracketData.semifinals[0].status === 'completed' && bracketData.semifinals[0].winner_team_id === bracketData.semifinals[0].home_team_id ? "600" : "normal",
                                  whiteSpace: "nowrap", 
                                  overflow: "hidden", 
                                  textOverflow: "ellipsis",
                                  maxWidth: "50px"
                                }}>
                                  {bracketData.semifinals[0].home_team_name?.split(' - ')[0] || 'QF Winner'}
                                </div>
                                <div style={{ 
                                  fontWeight: bracketData.semifinals[0].status === 'completed' && bracketData.semifinals[0].winner_team_id === bracketData.semifinals[0].away_team_id ? "600" : "normal",
                                  whiteSpace: "nowrap", 
                                  overflow: "hidden", 
                                  textOverflow: "ellipsis",
                                  maxWidth: "50px"
                                }}>
                                  {bracketData.semifinals[0].away_team_name?.split(' - ')[0] || 'QF Winner'}
                                </div>
                              </div>
                              <div style={{ textAlign: "center", minWidth: "16px", fontSize: "0.5rem" }}>
                                {bracketData.semifinals[0].status === 'completed' ? (
                                  <div style={{ lineHeight: "1" }}>
                                    <div>{bracketData.semifinals[0].home_score}</div>
                                    <div>{bracketData.semifinals[0].away_score}</div>
                                  </div>
                                ) : bracketData.semifinals[0].home_team_id ? (
                                  <div style={{ color: "#64748b", fontSize: "0.45rem" }}>
                                    {bracketData.semifinals[0].scheduled_start_time ? formatTimeToAMPM(bracketData.semifinals[0].scheduled_start_time) : 'TBD'}
                                  </div>
                                ) : (
                                  <div style={{ color: "#94a3b8", fontSize: "0.45rem" }}>-</div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Championship Final */}
                      <div style={{ gridColumn: 3, gridRow: "2 / 4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {bracketData.final?.[0] && (
                          <div style={{
                            border: "2px solid #f59e0b",
                            borderRadius: "4px",
                            padding: "0.3rem 0.5rem",
                            backgroundColor: bracketData.final[0].status === 'completed' ? "#fef3c7" : bracketData.final[0].home_team_id ? "#fffbeb" : "#f8f9fa",
                            fontSize: "0.6rem",
                            width: "100%",
                            minHeight: "32px"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "100%" }}>
                              <div style={{ flex: 1, lineHeight: "1.1" }}>
                                <div style={{ 
                                  fontWeight: bracketData.final[0].status === 'completed' && bracketData.final[0].winner_team_id === bracketData.final[0].home_team_id ? "700" : "500",
                                  color: bracketData.final[0].status === 'completed' && bracketData.final[0].winner_team_id === bracketData.final[0].home_team_id ? "#92400e" : "inherit",
                                  whiteSpace: "nowrap", 
                                  overflow: "hidden", 
                                  textOverflow: "ellipsis",
                                  maxWidth: "60px"
                                }}>
                                  {bracketData.final[0].home_team_name?.split(' - ')[0] || 'SF Winner'} 
                                  {bracketData.final[0].status === 'completed' && bracketData.final[0].winner_team_id === bracketData.final[0].home_team_id && ' 👑'}
                                </div>
                                <div style={{ 
                                  fontWeight: bracketData.final[0].status === 'completed' && bracketData.final[0].winner_team_id === bracketData.final[0].away_team_id ? "700" : "500",
                                  color: bracketData.final[0].status === 'completed' && bracketData.final[0].winner_team_id === bracketData.final[0].away_team_id ? "#92400e" : "inherit",
                                  whiteSpace: "nowrap", 
                                  overflow: "hidden", 
                                  textOverflow: "ellipsis",
                                  maxWidth: "60px"
                                }}>
                                  {bracketData.final[0].away_team_name?.split(' - ')[0] || 'SF Winner'}
                                  {bracketData.final[0].status === 'completed' && bracketData.final[0].winner_team_id === bracketData.final[0].away_team_id && ' 👑'}
                                </div>
                              </div>
                              <div style={{ textAlign: "center", minWidth: "18px", fontSize: "0.55rem" }}>
                                {bracketData.final[0].status === 'completed' ? (
                                  <div style={{ fontWeight: "bold", lineHeight: "1" }}>
                                    <div>{bracketData.final[0].home_score}</div>
                                    <div>{bracketData.final[0].away_score}</div>
                                  </div>
                                ) : bracketData.final[0].home_team_id ? (
                                  <div style={{ color: "#f59e0b", fontWeight: "600", fontSize: "0.5rem" }}>
                                    {bracketData.final[0].scheduled_start_time ? formatTimeToAMPM(bracketData.final[0].scheduled_start_time) : 'TBD'}
                                  </div>
                                ) : (
                                  <div style={{ color: "#94a3b8", fontSize: "0.5rem" }}>-</div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right Semifinal */}
                      <div style={{ gridColumn: 2, gridRow: "3 / 5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {bracketData.semifinals?.[1] && (
                          <div style={{
                            border: "1px solid #e0e0e0",
                            borderRadius: "3px",
                            padding: "0.2rem 0.4rem",
                            backgroundColor: bracketData.semifinals[1].status === 'completed' ? "#f0f9ff" : bracketData.semifinals[1].home_team_id ? "white" : "#f8f9fa",
                            fontSize: "0.55rem",
                            width: "100%",
                            minHeight: "28px"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "100%" }}>
                              <div style={{ flex: 1, lineHeight: "1.1" }}>
                                <div style={{ 
                                  fontWeight: bracketData.semifinals[1].status === 'completed' && bracketData.semifinals[1].winner_team_id === bracketData.semifinals[1].home_team_id ? "600" : "normal",
                                  whiteSpace: "nowrap", 
                                  overflow: "hidden", 
                                  textOverflow: "ellipsis",
                                  maxWidth: "50px"
                                }}>
                                  {bracketData.semifinals[1].home_team_name?.split(' - ')[0] || 'QF Winner'}
                                </div>
                                <div style={{ 
                                  fontWeight: bracketData.semifinals[1].status === 'completed' && bracketData.semifinals[1].winner_team_id === bracketData.semifinals[1].away_team_id ? "600" : "normal",
                                  whiteSpace: "nowrap", 
                                  overflow: "hidden", 
                                  textOverflow: "ellipsis",
                                  maxWidth: "50px"
                                }}>
                                  {bracketData.semifinals[1].away_team_name?.split(' - ')[0] || 'QF Winner'}
                                </div>
                              </div>
                              <div style={{ textAlign: "center", minWidth: "16px", fontSize: "0.5rem" }}>
                                {bracketData.semifinals[1].status === 'completed' ? (
                                  <div style={{ lineHeight: "1" }}>
                                    <div>{bracketData.semifinals[1].home_score}</div>
                                    <div>{bracketData.semifinals[1].away_score}</div>
                                  </div>
                                ) : bracketData.semifinals[1].home_team_id ? (
                                  <div style={{ color: "#64748b", fontSize: "0.45rem" }}>
                                    {bracketData.semifinals[1].scheduled_start_time ? formatTimeToAMPM(bracketData.semifinals[1].scheduled_start_time) : 'TBD'}
                                  </div>
                                ) : (
                                  <div style={{ color: "#94a3b8", fontSize: "0.45rem" }}>-</div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right Quarterfinals */}
                      <div style={{ gridColumn: 1, gridRow: 4, display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                        {bracketData.quarterfinals?.slice(2, 4).map((game, index) => (
                          <div key={game.id} style={{
                            border: "1px solid #e0e0e0",
                            borderRadius: "3px",
                            padding: "0.2rem 0.4rem",
                            backgroundColor: game.status === 'completed' ? "#f0f9ff" : "white",
                            fontSize: "0.55rem",
                            minHeight: "28px"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "100%" }}>
                              <div style={{ flex: 1, lineHeight: "1.1" }}>
                                <div style={{ 
                                  fontWeight: game.status === 'completed' && game.winner_team_id === game.home_team_id ? "600" : "normal",
                                  whiteSpace: "nowrap", 
                                  overflow: "hidden", 
                                  textOverflow: "ellipsis",
                                  maxWidth: "70px"
                                }}>
                                  {game.home_team_name?.split(' - ')[0] || game.home_team_name}
                                </div>
                                <div style={{ 
                                  fontWeight: game.status === 'completed' && game.winner_team_id === game.away_team_id ? "600" : "normal",
                                  whiteSpace: "nowrap", 
                                  overflow: "hidden", 
                                  textOverflow: "ellipsis",
                                  maxWidth: "70px"
                                }}>
                                  {game.away_team_name?.split(' - ')[0] || game.away_team_name}
                                </div>
                              </div>
                              <div style={{ textAlign: "center", minWidth: "16px", fontSize: "0.5rem" }}>
                                {game.status === 'completed' ? (
                                  <div style={{ lineHeight: "1" }}>
                                    <div>{game.home_score}</div>
                                    <div>{game.away_score}</div>
                                  </div>
                                ) : (
                                  <div style={{ color: "#64748b", fontSize: "0.45rem" }}>
                                    {game.scheduled_start_time ? formatTimeToAMPM(game.scheduled_start_time) : 'TBD'}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                    </div>
                  </div>
                </div>
              ) : (pools.length > 0 && Object.keys(poolStandings).length > 0) ? (
                <div className="content-card" style={{ 
                  display: "flex", 
                  flexDirection: "column",
                  padding: "1rem",
                  flex: "1 1 auto",
                  minWidth: 0
                }}>
                  <h3 style={{ 
                    margin: "0 0 0.75rem 0", 
                    fontSize: "1rem",
                    display: "flex", 
                    alignItems: "center", 
                    gap: "0.5rem" 
                  }}>
                    🏊‍♂️ Pool Standings
                  </h3>
                  <div style={{ 
                    flex: 1, 
                    overflowY: "auto", 
                    display: "flex", 
                    flexDirection: "column", 
                    gap: "0.5rem" 
                  }}>
                    {Object.values(poolStandings).map(({ pool, teams: poolTeams }) => (
                      <div key={pool.id} style={{ 
                        border: "1px solid #e0e0e0", 
                        borderRadius: "6px",
                        overflow: "hidden"
                      }}>
                        <div style={{ 
                          padding: "0.25rem 0.5rem", 
                          backgroundColor: "#f8f9fa", 
                          borderBottom: "1px solid #e0e0e0",
                          fontSize: "0.75rem",
                          fontWeight: "600"
                        }}>
                          {pool.name}
                        </div>
                        <div>
                          <table style={{ 
                            width: "auto", 
                            borderRadius: 0, 
                            boxShadow: "none",
                            marginBottom: 0,
                            fontSize: "0.65rem"
                          }}>
                            <thead style={{ fontSize: "0.6rem" }}>
                              <tr>
                                <th className="team-name-header" style={{ padding: "0.2rem 0.4rem", textAlign: "left" }}>Team</th>
                                <th className="number-header" style={{ padding: "0.2rem", textAlign: "center" }}>GP</th>
                                <th className="number-header" style={{ padding: "0.2rem", textAlign: "center" }}>W</th>
                                <th className="number-header" style={{ padding: "0.2rem", textAlign: "center" }}>GD</th>
                                <th className="number-header" style={{ padding: "0.2rem", textAlign: "center" }}>Pts</th>
                              </tr>
                            </thead>
                            <tbody>
                              {poolTeams.slice(0, 4).map((team, index) => (
                                <tr key={team.id} style={{ 
                                  backgroundColor: index < 2 ? "rgba(0, 120, 215, 0.05)" : "transparent" 
                                }}>
                                  <td className="team-name" style={{ 
                                    padding: "0.2rem 0.4rem",
                                    fontSize: "0.65rem",
                                    fontWeight: index === 0 ? "600" : "normal"
                                  }}>
                                    <span style={{ color: index < 2 ? "var(--primary-color)" : "inherit" }}>
                                      {index + 1}.
                                    </span> {team.name}
                                  </td>
                                  <td className="number-cell" style={{ padding: "0.2rem", textAlign: "center", fontSize: "0.65rem" }}>
                                    {team.gamesPlayed}
                                  </td>
                                  <td className="number-cell" style={{ padding: "0.2rem", textAlign: "center", fontSize: "0.65rem" }}>
                                    {team.wins}
                                  </td>
                                  <td className="number-cell" style={{ 
                                    padding: "0.2rem", 
                                    textAlign: "center", 
                                    fontSize: "0.65rem",
                                    color: team.goalDifferential >= 0 ? '#10b981' : '#ef4444',
                                    fontWeight: "600"
                                  }}>
                                    {team.goalDifferential > 0 ? '+' : ''}{team.goalDifferential}
                                  </td>
                                  <td className="number-cell" style={{ 
                                    padding: "0.2rem", 
                                    textAlign: "center", 
                                    fontSize: "0.65rem",
                                    fontWeight: "bold"
                                  }}>
                                    {team.points}
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
                <div className="content-card" style={{ 
                  display: "flex", 
                  flexDirection: "column",
                  padding: "1rem",
                  flex: "1 1 auto",
                  minWidth: 0,
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>🏊‍♂️ Pool Standings</h3>
                  <p style={{ textAlign: "center", color: "var(--text-light)", fontSize: "0.875rem" }}>
                    No pool standings available
                  </p>
                </div>
              )}
              
              {/* Tournament Stats - Right Bottom */}
              <div className="content-card" style={{ 
                display: "flex", 
                flexDirection: "column",
                padding: "1rem",
                flex: "0 1 auto",
                minWidth: 0
              }}>
              <h3 style={{ 
                margin: "0 0 0.75rem 0", 
                fontSize: "1rem",
                display: "flex", 
                alignItems: "center", 
                gap: "0.5rem" 
              }}>
                📈 Tournament Stats
              </h3>
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "1fr 1fr", 
                gap: "0.5rem",
                fontSize: "0.8rem"
              }}>
                <div style={{ textAlign: "center", padding: "0.5rem", backgroundColor: "#f8f9fa", borderRadius: "6px" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--primary-color)" }}>
                    {tournamentStats.completedGames}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-light)" }}>Games Played</div>
                </div>
                
                <div style={{ textAlign: "center", padding: "0.5rem", backgroundColor: "#f8f9fa", borderRadius: "6px" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--primary-color)" }}>
                    {tournamentStats.activeTeams}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-light)" }}>Active Teams</div>
                </div>
                
                <div style={{ textAlign: "center", padding: "0.5rem", backgroundColor: "#f8f9fa", borderRadius: "6px" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--accent-color)" }}>
                    {tournamentStats.totalGoals}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-light)" }}>Total Goals</div>
                </div>
                
                <div style={{ textAlign: "center", padding: "0.5rem", backgroundColor: "#f8f9fa", borderRadius: "6px" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--accent-color)" }}>
                    {tournamentStats.avgGoalsPerGame}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-light)" }}>Goals/Game</div>
                </div>
              </div>
              
              {/* Tournament Leader */}
              {tournamentStats.tournamentLeader && (
                <div style={{ 
                  textAlign: "center", 
                  padding: "0.5rem", 
                  backgroundColor: "rgba(0, 120, 215, 0.1)", 
                  borderRadius: "6px",
                  marginTop: "0.5rem"
                }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-light)" }}>🏆 Tournament Leader</div>
                  <div style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--primary-color)" }}>
                    {tournamentStats.tournamentLeader.name}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-light)" }}>
                    {tournamentStats.tournamentLeader.points} points
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
          
          {/* Right Column - Announcements Only */}
          <div style={{ 
            display: "flex", 
            flexDirection: "column", 
            minHeight: 0
          }}>
            {/* Announcements - Full Height */}
            <div className="content-card" style={{ 
              flex: 1, 
              minHeight: 0, 
              display: "flex", 
              flexDirection: "column",
              padding: "1rem"
            }}>
              <h3 style={{ 
                margin: "0 0 0.75rem 0", 
                fontSize: "1.1rem",
                display: "flex", 
                alignItems: "center", 
                gap: "0.5rem" 
              }}>
                📢 Announcements
              </h3>
              <div style={{ 
                flex: 1, 
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem"
              }}>
                {announcements.length > 0 ? announcements.map((announcement, index) => (
                  <div key={index} style={{
                    border: "1px solid #e0e0e0",
                    borderRadius: "8px",
                    padding: "0.75rem",
                    backgroundColor: index === 0 ? "#e8f4fd" : "transparent"
                  }}>
                    <div style={{ 
                      fontSize: "0.9rem", 
                      fontWeight: "600", 
                      marginBottom: "0.5rem",
                      color: "var(--primary-color)"
                    }}>
                      {announcement.title}
                    </div>
                    <div style={{ 
                      fontSize: "0.8rem", 
                      color: "var(--text-color)",
                      marginBottom: "0.5rem",
                      lineHeight: "1.4"
                    }}>
                      {announcement.message}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-light)" }}>
                      {announcement.created_by} • {new Date(announcement.created_at).toLocaleDateString()}
                    </div>
                  </div>
                )) : (
                  <div style={{ 
                    textAlign: "center", 
                    color: "var(--text-light)", 
                    fontSize: "0.875rem",
                    padding: "2rem" 
                  }}>
                    No announcements
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
});

export default DisplayScreen;
