// frontend/src/components/tabs/ResultsTab.js
// Results management tab component with game entry and standings

import React, { useState, useEffect } from "react";
import { Trophy, Target, Award, TrendingUp, Clock, Users, CheckCircle } from "lucide-react";
import { submitGameResult, calculateStandings, showMessage } from "../../utils/api";

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
  useEffect(() => {
    // Calculate standings whenever games or teams change - handled per pool below
  }, [teams, games]);

  const handleGameSelect = (game) => {
    setSelectedGame(game);
    setGameResult({
      home_score: game.home_score !== null ? game.home_score.toString() : "",
      away_score: game.away_score !== null ? game.away_score.toString() : "",
    });
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
    <div className="flex space-x-2 mb-6">
      <button
        onClick={() => setActiveView("entry")}
        className={`tournament-tab ${activeView === "entry" ? "active" : ""}`}
      >
        <Target className="w-4 h-4" />
        <span>Enter Results</span>
      </button>
      <button
        onClick={() => setActiveView("standings")}
        className={`tournament-tab ${activeView === "standings" ? "active" : ""}`}
      >
        <Trophy className="w-4 h-4" />
        <span>Standings</span>
      </button>
    </div>
  );

  if (games.length === 0) {
    return (
      <div>
        <h2 className="text-2xl font-semibold mb-6">Game Results & Standings</h2>
        <div className="text-center text-gray-500 py-12">
          <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-xl">No games scheduled yet</p>
          <p>Generate schedules first to start entering results</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">Game Results & Standings</h2>
      
      <ViewToggle />

      {activeView === "entry" && (
        <div className="space-y-6">
          {/* Tournament Overview */}
          <div className="tournament-card">
            <h3 className="font-medium text-blue-800 mb-3">Tournament Progress</h3>
            <div className="grid md:grid-cols-4 gap-4 text-sm">
              <div className="progress-card">
                <div className="progress-stat primary">
                  <div className="number">{games.length}</div>
                  <div className="label">Total Games</div>
                </div>
              </div>
              <div className="progress-card">
                <div className="progress-stat success">
                  <div className="number">{completedGames.length}</div>
                  <div className="label">Completed</div>
                </div>
              </div>
              <div className="progress-card">
                <div className="progress-stat warning">
                  <div className="number">{uncompletedGames.length}</div>
                  <div className="label">Remaining</div>
                </div>
              </div>
              <div className="progress-card">
                <div className="progress-stat primary">
                  <div className="number">{Math.round((completedGames.length / games.length) * 100)}%</div>
                  <div className="label">Progress</div>
                </div>
              </div>
            </div>
          </div>

          {/* Game Result Entry */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Uncompleted Games List */}
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Clock className="w-5 h-5 mr-2 text-orange-500" />
                Games Awaiting Results ({uncompletedGames.length})
              </h3>
              
              {uncompletedGames.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-400" />
                  <p>All games completed!</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  <div className="text-xs text-gray-500 mb-2 px-1">
                    👆 Click on any game below to enter results
                  </div>
                  {uncompletedGames.map((game) => (
                    <div
                      key={game.id}
                      onClick={() => handleGameSelect(game)}
                      className={`game-card ${
                        selectedGame?.id === game.id ? "selected" : ""
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium text-gray-900">
                            {game.home_team_name} vs {game.away_team_name}
                          </div>
                          <div className="text-sm text-gray-500 mt-1">
                            {game.pool_name} • {game.scheduled_start_time || "Time TBD"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-blue-600 font-medium">
                            Click to select
                          </div>
                          {selectedGame?.id === game.id && (
                            <div className="text-xs text-blue-700 font-bold mt-1">
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
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Target className="w-5 h-5 mr-2 text-blue-500" />
                Enter Game Result
              </h3>
              
              {selectedGame ? (
                <div className="tournament-card">
                  <div className="text-center mb-6">
                    <h4 className="text-xl font-bold text-gray-800 mb-2">
                      {selectedGame.home_team_name} vs {selectedGame.away_team_name}
                    </h4>
                    <p className="text-gray-600">
                      {selectedGame.pool_name} • {selectedGame.scheduled_start_time || "Time TBD"}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4 items-center mb-6">
                    <div className="text-center">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {selectedGame.home_team_name}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={gameResult.home_score}
                        onChange={(e) => setGameResult({ ...gameResult, home_score: e.target.value })}
                        className="tournament-input large"
                        placeholder="0"
                      />
                    </div>
                    
                    <div className="text-center text-2xl font-bold text-gray-400">VS</div>
                    
                    <div className="text-center">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {selectedGame.away_team_name}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={gameResult.away_score}
                        onChange={(e) => setGameResult({ ...gameResult, away_score: e.target.value })}
                        className="tournament-input large"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={handleSubmitResult}
                      disabled={loading || !gameResult.home_score || !gameResult.away_score}
                      className="btn-secondary flex-1"
                    >
                      {loading ? "Submitting..." : "Submit Result"}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedGame(null);
                        setGameResult({ home_score: "", away_score: "" });
                      }}
                      className="btn-accent"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                  <Target className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p className="text-lg font-medium mb-2">Ready to Enter Results</p>
                  <p className="text-sm">
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
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                Recent Results
              </h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedGames.slice(-6).map((game) => (
                  <div key={game.id} className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-center">
                      <div className="font-medium text-gray-800 mb-2">
                        {game.home_team_name} vs {game.away_team_name}
                      </div>
                      <div className="text-2xl font-bold text-blue-600 mb-1">
                        {game.home_score} - {game.away_score}
                      </div>
                      <div className="text-sm text-gray-500">{game.pool_name}</div>
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