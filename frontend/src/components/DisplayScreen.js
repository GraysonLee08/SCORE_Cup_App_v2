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
                
                <div className="card-content">
                  {matchesTab === "recent" && (recentGames.length > 0 ? recentGames.slice(0, 4).map((game, index) => (
                    <div key={game.id} className="match-result">
                      <div className="match-teams">
                        <div className={`team-badge ${getTeamCssClass(game.home_team_name)}`}>
                          {game.home_team_name ? game.home_team_name.split(' ').map(w => w[0]).join('').substring(0,2) : 'H'}
                        </div>
                        <div className="match-info">
                          <div className="team-names">{game.home_team_name} vs {game.away_team_name}</div>
                          <div className="pool-name">{game.pool_name}</div>
                        </div>
                      </div>
                      <div className="match-score">
                        <div className="score">{game.home_score} - {game.away_score}</div>
                        <div className="status-completed">✓</div>
                      </div>
                    </div>
                  )) : (
                    <div className="empty-state">
                      <Trophy className="empty-icon" />
                      <p>No recent matches</p>
                    </div>
                  ))}
                  
                  {matchesTab === "upcoming" && (schedule.length > 0 ? schedule.map((game, index) => (
                    <div key={game.id} className="match-result">
                      <div className="match-teams">
                        <div className={`team-badge ${getTeamCssClass(game.home_team_name)}`}>
                          {game.home_team_name ? game.home_team_name.split(' ').map(w => w[0]).join('').substring(0,2) : 'H'}
                        </div>
                        <div className="match-info">
                          <div className="team-names">{game.home_team_name} vs {game.away_team_name}</div>
                          <div className="pool-name">{game.pool_name}</div>
                        </div>
                      </div>
                      <div className="match-score">
                        <div className="score">{game.scheduled_start_time || 'TBD'}</div>
                        <div className="status-scheduled">⏰</div>
                      </div>
                    </div>
                  )) : (
                    <div className="empty-state">
                      <Calendar className="empty-icon" />
                      <p>No upcoming matches</p>
                    </div>
                  ))}
                  
                  {matchesTab === "live" && (
                    <div className="empty-state">
                      <Trophy className="empty-icon" />
                      <p>No live matches</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Announcements Card */}
              <div className="tournament-card card-secondary">
                <div className="card-header">
                  <h3 className="card-title">📢 Latest Updates</h3>
                </div>
                <div className="card-content">
                  {announcements.length > 0 ? announcements.slice(0, 3).map((announcement) => (
                    <div key={announcement.id} className="announcement-item">
                      <div className="announcement-content">
                        <h4 className="announcement-title">{announcement.title}</h4>
                        <p className="announcement-text">{announcement.message.substring(0, 100)}...</p>
                        <div className="announcement-meta">
                          <span className="badge-new">New</span>
                          <span className="announcement-date">
                            {new Date(announcement.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="empty-state">
                      <Calendar className="empty-icon" />
                      <p>No announcements</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Performance Section */}
          <section className="tournament-section">
            <div className="section-header">
              <h2 className="section-title">🏆 Standings & Stats</h2>
              <p className="section-subtitle">Current tournament rankings and statistics</p>
            </div>
            
            <div className="connected-cards-grid-wide">
              {/* Tournament Standings Card */}
              <div className="tournament-card card-wide">
                <div className="card-header">
                  <h3 className="card-title">📊 Tournament Standings</h3>
                  <span className="badge-live">Live</span>
                </div>
                <div className="card-content">
                  {overallStandings.length > 0 ? (
                    <div className="standings-table-container">
                      <table className="standings-table">
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
                              <td className="font-semibold">{index + 1}</td>
                              <td>
                                <div className={`team-badge inline-block mr-2 ${getTeamCssClass(team.name)}`}>
                                  {team.name ? team.name.split(' ').map(w => w[0]).join('').substring(0,2) : 'T'}
                                </div>
                                {team.name}
                              </td>
                              <td>{team.pool_name}</td>
                              <td>{team.games_played}</td>
                              <td>{team.wins}</td>
                              <td>{team.draws}</td>
                              <td>{team.losses}</td>
                              <td>{team.goals_for}</td>
                              <td>{team.goals_against}</td>
                              <td className={team.goals_for - team.goals_against >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {team.goals_for - team.goals_against > 0 ? '+' : ''}{team.goals_for - team.goals_against}
                              </td>
                              <td className="font-bold">{team.points}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <Trophy className="empty-icon" />
                      <p>No standings available</p>
                      <p className="text-sm">Set up teams and start playing games</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Tournament Stats Card */}
              <div className="tournament-card">
                <div className="card-header">
                  <h3 className="card-title">📈 Quick Stats</h3>
                </div>
                <div className="card-content">
                  <div className="space-y-4">
                    <div className="stats-item">
                      <div className="stats-number">{standings.length}</div>
                      <div className="stats-label">Teams</div>
                    </div>
                    <div className="stats-item">
                      <div className="stats-number">{recentGames.length}</div>
                      <div className="stats-label">Games Played</div>
                    </div>
                    <div className="stats-item">
                      <div className="stats-number">{standings.filter(team => team.games_played > 0).length}</div>
                      <div className="stats-label">Active Teams</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Upcoming Schedule Section */}
          <section className="tournament-section">
            <div className="section-header">
              <h2 className="section-title">📅 Upcoming Schedule</h2>
              <p className="section-subtitle">Next games coming up</p>
            </div>
            
            <div className="tournament-card">
              <div className="card-header">
                <h3 className="card-title">Next Matches</h3>
              </div>
              <div className="card-content">
                {schedule.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {schedule.map((game, index) => (
                      <div key={game.id} className="upcoming-game-card">
                        <div className="game-header">
                          <span className="game-time">{game.scheduled_start_time || 'TBD'}</span>
                          <span className="game-field">{game.field}</span>
                        </div>
                        <div className="game-matchup">
                          <div className="team-info">
                            <div className={`team-badge ${getTeamCssClass(game.home_team_name)}`}>
                              {game.home_team_name ? game.home_team_name.split(' ').map(w => w[0]).join('').substring(0,2) : 'H'}
                            </div>
                            <span className="team-name">{game.home_team_name}</span>
                          </div>
                          <div className="vs">vs</div>
                          <div className="team-info">
                            <div className={`team-badge ${getTeamCssClass(game.away_team_name)}`}>
                              {game.away_team_name ? game.away_team_name.split(' ').map(w => w[0]).join('').substring(0,2) : 'A'}
                            </div>
                            <span className="team-name">{game.away_team_name}</span>
                          </div>
                        </div>
                        <div className="game-pool">{game.pool_name}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Calendar className="empty-icon" />
                    <p>No upcoming games scheduled</p>
                    <p className="text-sm">Games will appear here once scheduling is complete</p>
                  </div>
                )}
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};

export default DisplayScreen;
