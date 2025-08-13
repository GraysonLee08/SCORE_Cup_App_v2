// frontend/src/components/tabs/ResultsTab.js
// Results management tab component with game entry and standings

import React, { useState, useEffect } from "react";
import { Trophy, Target, Award, Clock, CheckCircle, Edit2 } from "lucide-react";
import { submitGameResult, showMessage } from "../../utils/api";

const ResultsTab = ({ 
  games, 
  teams, 
  pools, 
  tournament,
  loading, 
  setLoading, 
  error, 
  setError, 
  success, 
  setSuccess, 
  onDataChange 
}) => {
  const [activeView, setActiveView] = useState("entry");
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameResult, setGameResult] = useState({
    home_score: "",
    away_score: "",
  });
  const [editingCompletedGame, setEditingCompletedGame] = useState(null);
  useEffect(() => {
    // Calculate standings whenever games or teams change - handled per pool below
  }, [teams, games]);

  const handleGameSelect = (game) => {
    setSelectedGame(game);
    setEditingCompletedGame(null); // Clear any completed game being edited
    setGameResult({
      home_score: game.home_score !== null ? game.home_score.toString() : "",
      away_score: game.away_score !== null ? game.away_score.toString() : "",
    });
  };

  const handleEditCompletedGame = (game) => {
    console.log("🔧 Editing completed game:", game);
    setEditingCompletedGame(game.id);
    setSelectedGame(null); // Clear any pending game selection
    setGameResult({
      home_score: game.home_score.toString(),
      away_score: game.away_score.toString(),
    });
  };

  const handleUpdateCompletedGame = async () => {
    if (!editingCompletedGame) return;

    const homeScore = parseInt(gameResult.home_score);
    const awayScore = parseInt(gameResult.away_score);

    if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
      showMessage(setError, setSuccess, "Please enter valid scores (0 or higher)", true);
      return;
    }

    try {
      setLoading(true);
      console.log("📊 Updating completed game result:", {
        gameId: editingCompletedGame,
        home_score: homeScore,
        away_score: awayScore,
      });

      await submitGameResult(editingCompletedGame, {
        home_score: homeScore,
        away_score: awayScore,
        status: "completed",
      });

      const editedGame = completedGames.find(g => g.id === editingCompletedGame);
      showMessage(
        setError,
        setSuccess,
        `Score updated: ${editedGame?.home_team_name} ${homeScore} - ${awayScore} ${editedGame?.away_team_name}`
      );

      setEditingCompletedGame(null);
      setGameResult({ home_score: "", away_score: "" });
      onDataChange(); // Refresh all data
    } catch (error) {
      console.error("❌ Error updating result:", error);
      showMessage(
        setError,
        setSuccess,
        "Failed to update result: " + (error.response?.data?.error || error.message),
        true
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitResult = async () => {
    if (!selectedGame) return;

    const homeScore = parseInt(gameResult.home_score);
    const awayScore = parseInt(gameResult.away_score);

    if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
      showMessage(setError, setSuccess, "Please enter valid scores (0 or higher)", true);
      return;
    }

    try {
      setLoading(true);
      console.log("📊 Submitting game result:", {
        gameId: selectedGame.id,
        home_score: homeScore,
        away_score: awayScore,
      });

      await submitGameResult(selectedGame.id, {
        home_score: homeScore,
        away_score: awayScore,
        status: "completed",
      });

      showMessage(
        setError,
        setSuccess,
        `Result recorded: ${selectedGame.home_team_name} ${homeScore} - ${awayScore} ${selectedGame.away_team_name}`
      );

      setSelectedGame(null);
      setGameResult({ home_score: "", away_score: "" });
      onDataChange(); // Refresh all data
    } catch (error) {
      console.error("❌ Error submitting result:", error);
      showMessage(
        setError,
        setSuccess,
        "Failed to submit result: " + (error.response?.data?.error || error.message),
        true
      );
    } finally {
      setLoading(false);
    }
  };

  const uncompletedGames = games.filter(game => game.status !== "completed");
  const completedGames = games.filter(game => game.status === "completed");

  // Calculate overall tournament standings from all games (like MLB)
  const overallStandings = teams
    .map(team => {
      // Get all completed games for this team
      const teamGames = completedGames.filter(game => 
        game.home_team_id === team.id || game.away_team_id === team.id
      );
      
      let wins = 0, losses = 0, ties = 0, goalsFor = 0, goalsAgainst = 0;
      
      teamGames.forEach(game => {
        const isHome = game.home_team_id === team.id;
        const teamScore = isHome ? game.home_score : game.away_score;
        const oppScore = isHome ? game.away_score : game.home_score;
        
        if (teamScore > oppScore) wins++;
        else if (teamScore < oppScore) losses++;
        else ties++;
        
        goalsFor += teamScore;
        goalsAgainst += oppScore;
      });
      
      const points = wins * 3 + ties * 1;
      const gamesPlayed = teamGames.length;
      
      return {
        ...team,
        wins,
        losses,
        ties,
        goals_for: goalsFor,
        goals_against: goalsAgainst,
        goal_differential: goalsFor - goalsAgainst,
        points,
        games_played: gamesPlayed
      };
    })
    .sort((a, b) => {
      // Sort by points, then goal differential, then goals for
      if (b.points !== a.points) return b.points - a.points;
      if (b.goal_differential !== a.goal_differential) return b.goal_differential - a.goal_differential;
      if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;
      return a.goals_against - b.goals_against;
    });

  const ViewToggle = () => (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "2rem" }}>
      <button
        onClick={() => setActiveView("entry")}
        className="btn"
        style={{
          backgroundColor: activeView === "entry" ? "var(--primary-color)" : "#e0e0e0",
          color: activeView === "entry" ? "white" : "#333",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          fontSize: "0.875rem"
        }}
      >
        <Target className="w-4 h-4" />
        <span>Enter Results</span>
      </button>
      <button
        onClick={() => setActiveView("standings")}
        className="btn"
        style={{
          backgroundColor: activeView === "standings" ? "var(--primary-color)" : "#e0e0e0",
          color: activeView === "standings" ? "white" : "#333",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          fontSize: "0.875rem"
        }}
      >
        <Trophy className="w-4 h-4" />
        <span>Standings</span>
      </button>
    </div>
  );

  if (games.length === 0) {
    return (
      <div>
        <h2 style={{ marginBottom: "2rem" }}>Game Results & Standings</h2>
        <div style={{ textAlign: "center", color: "var(--text-light)", padding: "3rem 1rem" }}>
          <Trophy className="w-16 h-16" style={{ color: "var(--text-light)", margin: "0 auto 1rem", display: "block" }} />
          <p style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>No games scheduled yet</p>
          <p>Generate schedules first to start entering results</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: "2rem" }}>Game Results & Standings</h2>
      
      <ViewToggle />

      {activeView === "entry" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Tournament Overview */}
          <div className="content-card">
            <h3 style={{ marginBottom: "1rem", color: "var(--primary-color)" }}>Tournament Progress</h3>
            <div className="content-wrapper">
              <div className="col-quarter" style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--primary-color)", marginBottom: "0.25rem" }}>{games.length}</div>
                <div style={{ fontSize: "0.875rem", color: "var(--text-light)" }}>Total Games</div>
              </div>
              <div className="col-quarter" style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#10b981", marginBottom: "0.25rem" }}>{completedGames.length}</div>
                <div style={{ fontSize: "0.875rem", color: "var(--text-light)" }}>Completed</div>
              </div>
              <div className="col-quarter" style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#f59e0b", marginBottom: "0.25rem" }}>{uncompletedGames.length}</div>
                <div style={{ fontSize: "0.875rem", color: "var(--text-light)" }}>Remaining</div>
              </div>
              <div className="col-quarter" style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--primary-color)", marginBottom: "0.25rem" }}>{Math.round((completedGames.length / games.length) * 100)}%</div>
                <div style={{ fontSize: "0.875rem", color: "var(--text-light)" }}>Progress</div>
              </div>
            </div>
          </div>

          {/* Game Result Entry */}
          <div className="content-wrapper">
            {/* Uncompleted Games List */}
            <div className="col-half">
              <h3 style={{ fontSize: "1.125rem", fontWeight: "600", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Clock className="w-5 h-5" style={{ color: "#f59e0b" }} />
                Games Awaiting Results ({uncompletedGames.length})
              </h3>
              
              {uncompletedGames.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-light)", border: "2px dashed #e0e0e0", borderRadius: "8px" }}>
                  <CheckCircle className="w-12 h-12" style={{ color: "#10b981", margin: "0 auto 0.5rem", display: "block" }} />
                  <p>All games completed!</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "24rem", overflowY: "auto" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-light)", marginBottom: "0.5rem", padding: "0 0.25rem" }}>
                    👆 Click on any game below to enter results
                  </div>
                  {uncompletedGames.map((game) => (
                    <div
                      key={game.id}
                      onClick={() => handleGameSelect(game)}
                      style={{
                        padding: "1rem",
                        border: selectedGame?.id === game.id ? "2px solid var(--primary-color)" : "1px solid #e0e0e0",
                        borderRadius: "8px",
                        backgroundColor: selectedGame?.id === game.id ? "rgba(0, 120, 215, 0.05)" : "#fff",
                        cursor: "pointer",
                        transition: "all 0.2s ease-in-out"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: "500", color: "var(--text-color)" }}>
                            {game.home_team_name} vs {game.away_team_name}
                          </div>
                          <div style={{ fontSize: "0.875rem", color: "var(--text-light)", marginTop: "0.25rem" }}>
                            {game.pool_name} • {game.scheduled_start_time || "Time TBD"}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "0.75rem", color: "var(--primary-color)", fontWeight: "500" }}>
                            Click to select
                          </div>
                          {selectedGame?.id === game.id && (
                            <div style={{ fontSize: "0.75rem", color: "var(--primary-color)", fontWeight: "bold", marginTop: "0.25rem" }}>
                              ✓ Selected
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Score Entry Form */}
            <div className="col-half">
              <h3 style={{ fontSize: "1.125rem", fontWeight: "600", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Target className="w-5 h-5" style={{ color: "var(--primary-color)" }} />
                Enter Game Result
              </h3>
              
              {(selectedGame || editingCompletedGame) ? (
                <div className="content-card" style={{ 
                  background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #1e40af 100%)",
                  color: "white",
                  position: "relative",
                  overflow: "hidden",
                  border: "none"
                }}>
                  {/* Background pattern */}
                  <div style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundImage: "url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><defs><pattern id=%22grain%22 width=%2210%22 height=%2210%22 patternUnits=%22userSpaceOnUse%22><circle cx=%225%22 cy=%225%22 r=%221%22 fill=%22%23ffffff%22 opacity=%220.03%22/></pattern></defs><rect width=%22100%22 height=%22100%22 fill=%22url(%23grain)%22/></svg>')",
                    opacity: 0.3
                  }} />
                  
                  {/* Match Info Header */}
                  <div style={{ textAlign: "center", marginBottom: "2rem", position: "relative", zIndex: 2 }}>
                    <div style={{ fontSize: "0.875rem", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem", opacity: 0.9 }}>
                      {editingCompletedGame ? completedGames.find(g => g.id === editingCompletedGame)?.pool_name : selectedGame?.pool_name}
                    </div>
                    <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>
                      {editingCompletedGame ? "EDITING RESULT" : (selectedGame?.scheduled_start_time || "TIME TBD")}
                    </div>
                  </div>

                  {/* Main Scoreboard Layout */}
                  <div style={{ 
                    display: "grid", 
                    gridTemplateColumns: "1fr auto 1fr", 
                    gap: "2rem", 
                    alignItems: "center", 
                    marginBottom: "2rem",
                    position: "relative",
                    zIndex: 2
                  }}>
                    {/* Home Team */}
                    <div style={{ textAlign: "center" }}>
                      <div style={{ 
                        fontSize: "1.125rem", 
                        fontWeight: "bold", 
                        textTransform: "uppercase", 
                        letterSpacing: "0.05em",
                        marginBottom: "1rem",
                        color: "white"
                      }}>
                        {editingCompletedGame ? completedGames.find(g => g.id === editingCompletedGame)?.home_team_name : selectedGame?.home_team_name}
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={gameResult.home_score}
                        onChange={(e) => setGameResult({ ...gameResult, home_score: e.target.value })}
                        style={{
                          width: "80px",
                          height: "80px",
                          padding: "0",
                          border: "3px solid rgba(255,255,255,0.3)",
                          borderRadius: "12px",
                          fontSize: "2.5rem",
                          textAlign: "center",
                          fontWeight: "bold",
                          backgroundColor: "rgba(255,255,255,0.1)",
                          color: "white",
                          backdropFilter: "blur(10px)",
                          transition: "all 0.2s ease"
                        }}
                        placeholder="0"
                        onFocus={(e) => e.target.style.borderColor = "rgba(255,255,255,0.6)"}
                        onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.3)"}
                      />
                    </div>
                    
                    {/* VS Separator */}
                    <div style={{ 
                      textAlign: "center", 
                      fontSize: "1.5rem", 
                      fontWeight: "bold", 
                      color: "rgba(255,255,255,0.8)",
                      letterSpacing: "0.1em"
                    }}>VS</div>
                    
                    {/* Away Team */}
                    <div style={{ textAlign: "center" }}>
                      <div style={{ 
                        fontSize: "1.125rem", 
                        fontWeight: "bold", 
                        textTransform: "uppercase", 
                        letterSpacing: "0.05em",
                        marginBottom: "1rem",
                        color: "white"
                      }}>
                        {editingCompletedGame ? completedGames.find(g => g.id === editingCompletedGame)?.away_team_name : selectedGame?.away_team_name}
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={gameResult.away_score}
                        onChange={(e) => setGameResult({ ...gameResult, away_score: e.target.value })}
                        style={{
                          width: "80px",
                          height: "80px",
                          padding: "0",
                          border: "3px solid rgba(255,255,255,0.3)",
                          borderRadius: "12px",
                          fontSize: "2.5rem",
                          textAlign: "center",
                          fontWeight: "bold",
                          backgroundColor: "rgba(255,255,255,0.1)",
                          color: "white",
                          backdropFilter: "blur(10px)",
                          transition: "all 0.2s ease"
                        }}
                        placeholder="0"
                        onFocus={(e) => e.target.style.borderColor = "rgba(255,255,255,0.6)"}
                        onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.3)"}
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: "flex", gap: "0.75rem", position: "relative", zIndex: 2 }}>
                    <button
                      onClick={editingCompletedGame ? handleUpdateCompletedGame : handleSubmitResult}
                      disabled={loading || !gameResult.home_score || !gameResult.away_score}
                      style={{
                        flex: 1,
                        padding: "0.875rem 1.5rem",
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderRadius: "8px",
                        fontSize: "1rem",
                        fontWeight: "600",
                        backgroundColor: "rgba(255,255,255,0.15)",
                        color: "white",
                        backdropFilter: "blur(10px)",
                        cursor: loading || (!gameResult.home_score || !gameResult.away_score) ? "not-allowed" : "pointer",
                        opacity: loading || (!gameResult.home_score || !gameResult.away_score) ? 0.5 : 1,
                        transition: "all 0.2s ease"
                      }}
                      onMouseEnter={(e) => {
                        if (!loading && gameResult.home_score && gameResult.away_score) {
                          e.target.style.backgroundColor = "rgba(255,255,255,0.25)";
                          e.target.style.borderColor = "rgba(255,255,255,0.5)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = "rgba(255,255,255,0.15)";
                        e.target.style.borderColor = "rgba(255,255,255,0.3)";
                      }}
                    >
                      {loading ? (editingCompletedGame ? "Updating..." : "Submitting...") : (editingCompletedGame ? "Update Result" : "Submit Result")}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedGame(null);
                        setEditingCompletedGame(null);
                        setGameResult({ home_score: "", away_score: "" });
                      }}
                      style={{
                        padding: "0.875rem 1.5rem",
                        border: "2px solid rgba(255,255,255,0.2)",
                        borderRadius: "8px",
                        fontSize: "1rem",
                        fontWeight: "600",
                        backgroundColor: "rgba(0,0,0,0.2)",
                        color: "rgba(255,255,255,0.8)",
                        backdropFilter: "blur(10px)",
                        cursor: "pointer",
                        transition: "all 0.2s ease"
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.backgroundColor = "rgba(0,0,0,0.3)";
                        e.target.style.color = "white";
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = "rgba(0,0,0,0.2)";
                        e.target.style.color = "rgba(255,255,255,0.8)";
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-light)", border: "2px dashed #e0e0e0", borderRadius: "8px" }}>
                  <Target className="w-12 h-12" style={{ color: "var(--text-light)", margin: "0 auto 0.5rem", display: "block" }} />
                  <p style={{ fontSize: "1.125rem", fontWeight: "500", marginBottom: "0.5rem" }}>Ready to Enter Results</p>
                  <p style={{ fontSize: "0.875rem" }}>
                    {uncompletedGames.length > 0 
                      ? "👈 Click on any game from the list to enter scores"
                      : "No games available for result entry"
                    }
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Results */}
          {completedGames.length > 0 && (
            <div>
              <h3 style={{ fontSize: "1.125rem", fontWeight: "600", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <CheckCircle className="w-5 h-5" style={{ color: "#10b981" }} />
                Recent Results
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
                {completedGames.map((game) => (
                  <div key={game.id} style={{
                    background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #1e40af 100%)",
                    color: "white",
                    borderRadius: "12px",
                    padding: "1.5rem",
                    position: "relative",
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
                  }}>
                    {/* Background pattern */}
                    <div style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundImage: "url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><defs><pattern id=%22grain%22 width=%2210%22 height=%2210%22 patternUnits=%22userSpaceOnUse%22><circle cx=%225%22 cy=%225%22 r=%221%22 fill=%22%23ffffff%22 opacity=%220.03%22/></pattern></defs><rect width=%22100%22 height=%22100%22 fill=%22url(%23grain)%22/></svg>')",
                      opacity: 0.3
                    }} />
                    
                    <div style={{ position: "relative", zIndex: 2 }}>
                      {/* Edit Button */}
                      <div style={{ position: "absolute", top: "8px", right: "8px", zIndex: 10 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            console.log("Edit button clicked for game:", game.id);
                            handleEditCompletedGame(game);
                          }}
                          style={{
                            background: "rgba(255,255,255,0.25)",
                            border: "1px solid rgba(255,255,255,0.4)",
                            borderRadius: "8px",
                            padding: "0.5rem",
                            color: "white",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            backdropFilter: "blur(10px)",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                          title="Edit score"
                          onMouseEnter={(e) => {
                            e.target.style.backgroundColor = "rgba(255,255,255,0.4)";
                            e.target.style.transform = "scale(1.1)";
                            e.target.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.backgroundColor = "rgba(255,255,255,0.25)";
                            e.target.style.transform = "scale(1)";
                            e.target.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Pool and Status */}
                      <div style={{ 
                        textAlign: "center", 
                        fontSize: "0.75rem", 
                        fontWeight: "600", 
                        textTransform: "uppercase", 
                        letterSpacing: "0.1em", 
                        marginBottom: "1rem", 
                        opacity: 0.9 
                      }}>
                        {game.pool_name} • FULL-TIME
                      </div>
                      
                      {/* Field and Time Info */}
                      <div style={{ 
                        textAlign: "center", 
                        fontSize: "0.625rem", 
                        fontWeight: "500", 
                        textTransform: "uppercase", 
                        letterSpacing: "0.05em", 
                        marginBottom: "1rem", 
                        opacity: 0.7,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: "0.5rem"
                      }}>
                        {game.field && (
                          <span>📍 {game.field}</span>
                        )}
                        {game.scheduled_start_time && (
                          <span>🕐 {game.scheduled_start_time}</span>
                        )}
                      </div>
                      
                      {/* Team Names and Score */}
                      <div style={{ 
                        display: "grid", 
                        gridTemplateColumns: "1fr auto 1fr", 
                        gap: "1rem", 
                        alignItems: "center", 
                        textAlign: "center" 
                      }}>
                        <div>
                          <div style={{ 
                            fontSize: "0.875rem", 
                            fontWeight: "bold", 
                            textTransform: "uppercase", 
                            letterSpacing: "0.05em",
                            marginBottom: "0.5rem"
                          }}>
                            {game.home_team_name}
                          </div>
                        </div>
                        
                        <div style={{ 
                          fontSize: "2.5rem", 
                          fontWeight: "bold", 
                          letterSpacing: "0.1em",
                          textShadow: "0 2px 4px rgba(0,0,0,0.3)"
                        }}>
                          {game.home_score} - {game.away_score}
                        </div>
                        
                        <div>
                          <div style={{ 
                            fontSize: "0.875rem", 
                            fontWeight: "bold", 
                            textTransform: "uppercase", 
                            letterSpacing: "0.05em",
                            marginBottom: "0.5rem"
                          }}>
                            {game.away_team_name}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeView === "standings" && (
        <div className="tournament-card">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center">
                <Trophy className="w-5 h-5 mr-2 text-blue-500" />
                Tournament Standings
              </h3>
              <div className="text-sm text-gray-500">
                Overall standings from all games • {overallStandings.filter(t => t.games_played > 0).length} active teams
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="standings-table">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pos
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Team
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pool
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    GP
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    W
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    L
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    T
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    GF
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    GA
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    GD
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pts
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {overallStandings.map((team, index) => (
                  <tr key={team.id} className={index < 3 ? "leader" : ""}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-gray-900">{index + 1}</span>
                        {index === 0 && <Award className="w-4 h-4 ml-1 text-yellow-500" />}
                        {index === 1 && <Award className="w-4 h-4 ml-1 text-gray-400" />}
                        {index === 2 && <Award className="w-4 h-4 ml-1 text-orange-500" />}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{team.name}</div>
                      <div className="text-sm text-gray-500">{team.captain}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{team.pool_name || 'Unassigned'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                      {team.games_played}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                      {team.wins}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                      {team.losses}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                      {team.ties}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                      {team.goals_for}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                      {team.goals_against}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                      <span className={`font-medium ${
                        team.goal_differential > 0 ? "text-green-600" : 
                        team.goal_differential < 0 ? "text-red-600" : "text-gray-900"
                      }`}>
                        {team.goal_differential > 0 ? "+" : ""}{team.goal_differential}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-lg font-bold text-blue-600">{team.points}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {overallStandings.filter(t => t.games_played === 0).length > 0 && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                <strong>{overallStandings.filter(t => t.games_played === 0).length}</strong> teams haven't played any games yet
              </p>
            </div>
          )}
          
          <div className="px-6 py-4 bg-blue-50 border-t border-gray-200">
            <div className="text-xs text-gray-600">
              <p className="font-medium mb-2">🏆 MLB-Style Tournament Rankings:</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p><strong>Points from ALL games:</strong> Win = 3pts • Draw = 1pt • Loss = 0pts</p>
                </div>
                <div>
                  <p><strong>Tiebreakers:</strong> Points → Goal Difference → Goals For → Goals Against</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultsTab;