// frontend/src/components/DisplayScreen.js
// Tournament Dashboard - matches the target design with mock data

import React, { useState, useEffect } from "react";
import axios from "axios";
import { Trophy, Users, Calendar, Target, ChevronRight } from "lucide-react";
import '../styles/tournament.css';
import AnnouncementsDisplay from "./AnnouncementsDisplay";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3002";

const DisplayScreen = () => {
  const [tournament, setTournament] = useState(null);
  const [standings, setStandings] = useState([]);
  const [recentGames, setRecentGames] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
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

        const [standingsRes, gamesRes, announcementsRes] = await Promise.all([
          axios.get(`${API_URL}/api/tournaments/${latestTournament.id}/standings`),
          axios.get(`${API_URL}/api/tournaments/${latestTournament.id}/games`),
          axios.get(`${API_URL}/api/tournaments/${latestTournament.id}/announcements`)
        ]);

        setStandings(standingsRes.data);
        setAnnouncements(announcementsRes.data);
        
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

  const topTeams = standings
    .sort((a, b) => b.points - a.points || (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against))
    .slice(0, 5);

  // Sort all teams by overall tournament performance (like MLB standings)
  const overallStandings = standings.sort((a, b) => {
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
  });

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
                  <span>📅 Start: {new Date(tournament.start_date).toLocaleDateString()}</span>
                  <span>📅 End: {new Date(tournament.end_date).toLocaleDateString()}</span>
                  <span style={{ padding: "0.25rem 0.75rem", backgroundColor: "var(--accent-color)", color: "#333", borderRadius: "4px" }}>
                    Status: {tournament.status}
                  </span>
                </div>
              </div>
              <div>
                <span style={{ fontSize: "0.875rem", backgroundColor: "#d4edda", color: "#155724", padding: "0.5rem 1rem", borderRadius: "20px" }}>
                  🟢 Live
                </span>
              </div>
            </div>
            <div style={{ width: "100%", backgroundColor: "#e0e0e0", borderRadius: "10px", height: "8px", marginBottom: "0.5rem" }}>
              <div style={{ width: "70%", background: "var(--primary-color)", height: "8px", borderRadius: "10px", transition: "width 0.3s ease" }}></div>
            </div>
            <p style={{ fontSize: "0.875rem", color: "var(--text-light)" }}>Tournament Progress: Pool Play Stage</p>
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
                <h3 style={{ marginBottom: "1.5rem" }}>📈 Quick Stats</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--primary-color)" }}>{standings.length}</div>
                    <div style={{ fontSize: "0.875rem", color: "var(--text-light)" }}>Teams</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--primary-color)" }}>{recentGames.length}</div>
                    <div style={{ fontSize: "0.875rem", color: "var(--text-light)" }}>Games Played</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--primary-color)" }}>
                      {standings.filter(team => team.games_played > 0).length}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "var(--text-light)" }}>Active Teams</div>
                  </div>
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
