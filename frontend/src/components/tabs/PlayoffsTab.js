// frontend/src/components/tabs/PlayoffsTab.js
// Playoff management tab component for tournament bracket generation and management

import React, { useState, useEffect } from "react";
import { Trophy, Users, Target, Calendar, Award, Zap, AlertCircle, Play, Clock, CheckCircle } from "lucide-react";
import { fetchPlayoffs, generatePlayoffBracket, submitPlayoffResult, schedulePlayoffGame, showMessage } from "../../utils/api";

const PlayoffsTab = ({ 
  teams, 
  pools, 
  games, 
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
  const [activeView, setActiveView] = useState("qualification");
  const [poolStandings, setPoolStandings] = useState({});
  const [wildcards, setWildcards] = useState([]);
  const [seeds, setSeeds] = useState([]);
  const [bracket, setBracket] = useState({});
  const [playoffGames, setPlayoffGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameResult, setGameResult] = useState({ 
    home_score: "", 
    away_score: "", 
    field: "", 
    scheduled_start_time: "" 
  });

  useEffect(() => {
    calculatePoolStandings();
    fetchPlayoffData();
  }, [teams, games, pools]);

  useEffect(() => {
    if (Object.keys(poolStandings).length > 0) {
      determineWildcards();
    }
  }, [poolStandings]);

  useEffect(() => {
    if (Object.keys(poolStandings).length > 0 && wildcards.length >= 0) {
      calculateSeeds();
    }
  }, [poolStandings, wildcards]);

  const fetchPlayoffData = async () => {
    if (!tournament) return;
    
    try {
      const response = await fetchPlayoffs(tournament.id);
      if (response.success) {
        setPlayoffGames(response.data.playoff_games || []);
        // Process bracket data if available
        const games = response.data.playoff_games || [];
        if (games.length > 0) {
          organizeBracketGames(games);
        }
      }
    } catch (error) {
      console.error("Error fetching playoff data:", error);
    }
  };

  const organizeBracketGames = (games) => {
    const organizedBracket = {
      quarterfinals: games.filter(g => g.round === 'quarterfinal'),
      semifinals: games.filter(g => g.round === 'semifinal'),
      final: games.filter(g => g.round === 'final')
    };
    setBracket(organizedBracket);
  };

  // Calculate pool standings with proper tournament format criteria
  const calculatePoolStandings = () => {
    const standings = {};
    
    pools.forEach(pool => {
      const poolTeams = teams.filter(team => team.pool_id === pool.id);
      const poolGames = games.filter(game => 
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

    setPoolStandings(standings);
  };

  // Determine the 2 best second-place teams (wildcards)
  const determineWildcards = () => {
    const allSecondPlace = Object.values(poolStandings)
      .map(standing => standing.secondPlace)
      .filter(team => team && team.gamesPlayed > 0);

    // Sort second-place teams using same criteria
    allSecondPlace.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifferential !== a.goalDifferential) return b.goalDifferential - a.goalDifferential;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      if (a.goalsAgainst !== b.goalsAgainst) return a.goalsAgainst - b.goalsAgainst;
      if (a.fairPlayPoints !== b.fairPlayPoints) return a.fairPlayPoints - b.fairPlayPoints;
      return a.name.localeCompare(b.name);
    });

    setWildcards(allSecondPlace.slice(0, 2));
  };

  // Calculate overall seeding (1-8) for qualified teams
  const calculateSeeds = () => {
    const poolWinners = Object.values(poolStandings)
      .map(standing => standing.winner)
      .filter(winner => winner && winner.gamesPlayed > 0);
    
    const wildcardTeams = wildcards;
    
    console.log('🏆 Pool Winners:', poolWinners.length, poolWinners.map(w => w.name));
    console.log('⚡ Wildcards:', wildcardTeams.length, wildcardTeams.map(w => w.name));
    
    const allQualified = [...poolWinners, ...wildcardTeams];
    console.log('🎯 All Qualified Teams:', allQualified.length, allQualified.map(t => t.name));

    // Sort all qualified teams using same criteria to determine seeds 1-8
    allQualified.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifferential !== a.goalDifferential) return b.goalDifferential - a.goalDifferential;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      if (a.goalsAgainst !== b.goalsAgainst) return a.goalsAgainst - b.goalsAgainst;
      if (a.fairPlayPoints !== b.fairPlayPoints) return a.fairPlayPoints - b.fairPlayPoints;
      return a.name.localeCompare(b.name);
    });

    const seededTeams = allQualified.map((team, index) => ({
      ...team,
      seed: index + 1,
      isPoolWinner: poolWinners.some(winner => winner && winner.id === team.id),
      isWildcard: wildcardTeams.some(wildcard => wildcard.id === team.id)
    }));

    console.log('🔢 Final Seeds:', seededTeams.length, seededTeams.map(t => `#${t.seed} ${t.name}`));
    setSeeds(seededTeams);
  };

  // Generate playoff bracket using backend API
  const handleGenerateBracket = async () => {
    if (!tournament || seeds.length !== 8) {
      showMessage(setError, setSuccess, "Need 8 qualified teams to generate bracket", true);
      return;
    }

    try {
      setLoading(true);
      const response = await generatePlayoffBracket(tournament.id);
      
      if (response.success) {
        showMessage(setError, setSuccess, "Playoff bracket generated successfully!");
        fetchPlayoffData(); // Refresh data
        onDataChange(); // Refresh parent data
      } else {
        showMessage(setError, setSuccess, "Failed to generate bracket: " + response.error, true);
      }
    } catch (error) {
      console.error("Error generating bracket:", error);
      showMessage(setError, setSuccess, "Error generating bracket: " + error.message, true);
    } finally {
      setLoading(false);
    }
  };

  // Handle playoff game result submission
  const handleSubmitPlayoffResult = async () => {
    if (!selectedGame) return;

    const homeScore = parseInt(gameResult.home_score);
    const awayScore = parseInt(gameResult.away_score);

    if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
      showMessage(setError, setSuccess, "Please enter valid scores (0 or higher)", true);
      return;
    }

    if (homeScore === awayScore) {
      showMessage(setError, setSuccess, "Playoff games cannot end in a tie - go to penalties!", true);
      return;
    }

    try {
      setLoading(true);
      const response = await submitPlayoffResult(selectedGame.id, {
        home_score: homeScore,
        away_score: awayScore,
        field: gameResult.field,
        scheduled_start_time: gameResult.scheduled_start_time
      });

      if (response.success) {
        showMessage(setError, setSuccess, 
          `Playoff result recorded: ${selectedGame.home_team_name} ${homeScore} - ${awayScore} ${selectedGame.away_team_name}`
        );
        setSelectedGame(null);
        setGameResult({ home_score: "", away_score: "", field: "", scheduled_start_time: "" });
        fetchPlayoffData(); // Refresh playoff data
        onDataChange(); // Refresh parent data
      } else {
        showMessage(setError, setSuccess, "Failed to submit result: " + response.error, true);
      }
    } catch (error) {
      console.error("Error submitting playoff result:", error);
      showMessage(setError, setSuccess, "Error submitting result: " + error.message, true);
    } finally {
      setLoading(false);
    }
  };

  // Auto-schedule all playoff games
  const handleAutoSchedule = async () => {
    if (!tournament) {
      showMessage(setError, setSuccess, "No tournament selected", true);
      return;
    }

    if (!playoffGames || playoffGames.length === 0) {
      showMessage(setError, setSuccess, "No playoff games found. Generate bracket first.", true);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/tournaments/${tournament.id}/playoffs/auto-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      
      if (response.ok) {
        showMessage(setError, setSuccess, 
          `✅ ${data.message}\n\n` +
          `🥊 Quarterfinals: ${data.schedule.quarterfinals.length} games at ${data.schedule.quarterfinals[0]?.time || 'N/A'}\n` +
          `🥈 Semifinals: ${data.schedule.semifinals.length} games at ${data.schedule.semifinals[0]?.time || 'N/A'}\n` +
          `🏆 Final: ${data.schedule.final.length} game at ${data.schedule.final[0]?.time || 'N/A'}`
        );
        fetchPlayoffData(); // Refresh playoff data
        onDataChange(); // Refresh parent data
      } else {
        showMessage(setError, setSuccess, "Failed to auto-schedule: " + data.error, true);
      }
    } catch (error) {
      console.error("Error auto-scheduling playoff games:", error);
      showMessage(setError, setSuccess, "Error auto-scheduling playoff games: " + error.message, true);
    } finally {
      setLoading(false);
    }
  };

  // Get field names and available times from tournament settings
  const fieldNames = tournamentSettings?.field_names || ["Field 1", "Field 2", "Field 3", "Field 4"];
  const gameDuration = tournamentSettings?.game_duration || 45; // minutes
  const breakDuration = tournamentSettings?.break_duration || 10; // minutes
  const startTime = tournamentSettings?.start_time || "09:00";
  const endTime = tournamentSettings?.end_time || "17:00";

  // Calculate available kick-off times based on tournament schedule
  const calculateAvailableKickOffTimes = () => {
    const times = [];
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;
    const slotDuration = gameDuration + breakDuration; // Total time per game slot
    
    let currentMinutes = startTotalMinutes;
    
    while (currentMinutes + gameDuration <= endTotalMinutes) {
      const hours = Math.floor(currentMinutes / 60);
      const minutes = currentMinutes % 60;
      const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      times.push(timeString);
      currentMinutes += slotDuration;
    }
    
    return times;
  };

  const availableKickOffTimes = calculateAvailableKickOffTimes();

  const handleGameSelect = (game) => {
    setSelectedGame(game);
    setGameResult({
      home_score: game.home_score !== null ? game.home_score.toString() : "",
      away_score: game.away_score !== null ? game.away_score.toString() : "",
      field: game.field || "",
      scheduled_start_time: game.scheduled_start_time || "",
    });
  };

  const ViewToggle = () => (
    <div className="flex space-x-2 mb-6">
      <button
        onClick={() => setActiveView("qualification")}
        className={`tournament-tab ${activeView === "qualification" ? "active" : ""}`}
      >
        <Users className="w-4 h-4" />
        <span>Qualification</span>
      </button>
      <button
        onClick={() => setActiveView("bracket")}
        className={`tournament-tab ${activeView === "bracket" ? "active" : ""}`}
        disabled={seeds.length < 8}
      >
        <Trophy className="w-4 h-4" />
        <span>Bracket</span>
      </button>
      <button
        onClick={() => setActiveView("schedule")}
        className={`tournament-tab ${activeView === "schedule" ? "active" : ""}`}
        disabled={Object.keys(bracket).length === 0}
      >
        <Calendar className="w-4 h-4" />
        <span>Schedule</span>
      </button>
    </div>
  );

  if (pools.length === 0 || teams.length === 0) {
    return (
      <div>
        <h2 className="text-2xl font-semibold mb-6">Playoff Management</h2>
        <div className="text-center text-gray-500 py-12">
          <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-xl">No tournament data available</p>
          <p>Create pools and teams first to manage playoffs</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">Playoff Management</h2>
      
      <ViewToggle />

      {activeView === "qualification" && (
        <div className="space-y-6">
          {/* Tournament Format Info */}
          <div className="tournament-card">
            <h3 className="font-medium text-blue-800 mb-4">Tournament Format</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-gray-800 mb-2">Pool Stage</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• 6 pools (A–F) with 3 teams each</li>
                  <li>• 3 games per team (2 pool + 1 crossover)</li>
                  <li>• Points: Win = 3, Draw = 1, Loss = 0</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-gray-800 mb-2">Playoff Qualification</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• 6 pool winners advance automatically</li>
                  <li>• 2 best second-place teams (wildcards)</li>
                  <li>• Total: 8 teams in playoff bracket</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Pool Standings */}
          <div className="space-y-6">
            {Object.values(poolStandings).map(({ pool, teams: poolTeams, winner, secondPlace }) => (
              <div key={pool.id} className="tournament-card">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center">
                      <Users className="w-5 h-5 mr-2 text-blue-500" />
                      {pool.name}
                    </h3>
                    <div className="text-sm text-gray-500">
                      {poolTeams.filter(t => t.gamesPlayed > 0).length}/{poolTeams.length} teams active
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="standings-table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pos</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Team</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">GP</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">W</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">L</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">T</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">GF</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">GA</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">GD</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Pts</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {poolTeams.map((team, index) => (
                        <tr key={team.id} className={index < 2 ? "leader" : ""}>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-gray-900">{index + 1}</span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{team.name}</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                            {team.gamesPlayed}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                            {team.wins}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                            {team.losses}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                            {team.ties}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                            {team.goalsFor}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                            {team.goalsAgainst}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm">
                            <span className={`font-medium ${
                              team.goalDifferential > 0 ? "text-green-600" : 
                              team.goalDifferential < 0 ? "text-red-600" : "text-gray-900"
                            }`}>
                              {team.goalDifferential > 0 ? "+" : ""}{team.goalDifferential}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center">
                            <span className="text-lg font-bold text-blue-600">{team.points}</span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center">
                            {index === 0 && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <Trophy className="w-3 h-3 mr-1" />
                                Pool Winner
                              </span>
                            )}
                            {index === 1 && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                <Award className="w-3 h-3 mr-1" />
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

          {/* Wildcard Selection */}
          {wildcards.length > 0 && (
            <div className="tournament-card">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Zap className="w-5 h-5 mr-2 text-orange-500" />
                Wildcard Selection (Best Second-Place Teams)
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                {wildcards.map((team, index) => (
                  <div key={team.id} className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-900">{team.name}</h4>
                        <p className="text-sm text-gray-600">From {team.pool_name || `Pool ${pools.find(p => p.id === team.pool_id)?.name}`}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-orange-600">{team.points} pts</div>
                        <div className="text-sm text-gray-500">GD: {team.goalDifferential}</div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        <Zap className="w-3 h-3 mr-1" />
                        Wildcard #{index + 1}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overall Seeding */}
          {seeds.length === 8 && (
            <div className="tournament-card">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Target className="w-5 h-5 mr-2 text-purple-500" />
                Playoff Seeding (1-8)
              </h3>
              <div className="grid md:grid-cols-4 gap-4">
                {seeds.map((team, index) => (
                  <div key={team.id} className={`border-2 rounded-lg p-4 ${
                    team.seed <= 4 ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'
                  }`}>
                    <div className="text-center">
                      <div className={`text-2xl font-bold mb-2 ${
                        team.seed <= 4 ? 'text-green-600' : 'text-blue-600'
                      }`}>
                        #{team.seed}
                      </div>
                      <h4 className="font-semibold text-gray-900 mb-1">{team.name}</h4>
                      <div className="text-sm text-gray-600 mb-2">
                        {team.points} pts • GD: {team.goalDifferential}
                      </div>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        team.isPoolWinner 
                          ? 'bg-green-100 text-green-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}>
                        {team.isPoolWinner ? (
                          <>
                            <Trophy className="w-3 h-3 mr-1" />
                            Pool Winner
                          </>
                        ) : (
                          <>
                            <Zap className="w-3 h-3 mr-1" />
                            Wildcard
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 text-center">
                <button
                  onClick={handleGenerateBracket}
                  disabled={loading || seeds.length !== 8}
                  className="btn-primary"
                >
                  {loading ? "Generating..." : "Generate Playoff Bracket"}
                </button>
              </div>
            </div>
          )}

          {/* Qualification Status */}
          <div className="tournament-card">
            <h3 className="text-lg font-semibold mb-4">Qualification Status</h3>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600 mb-2">
                  {Object.values(poolStandings).filter(s => s.winner && s.winner.gamesPlayed > 0).length}
                </div>
                <div className="text-gray-600">Pool Winners Qualified</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600 mb-2">{wildcards.length}</div>
                <div className="text-gray-600">Wildcards Qualified</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600 mb-2">
                  {Object.values(poolStandings).filter(s => s.winner && s.winner.gamesPlayed > 0).length + wildcards.length}
                </div>
                <div className="text-gray-600">Total Qualified</div>
              </div>
            </div>
            
            {/* Debug info - temporary */}
            <div className="mt-4 p-3 bg-gray-100 rounded text-sm">
              <p><strong>Debug Info:</strong></p>
              <p>Seeds calculated: {seeds.length}</p>
              <p>Pool winners: {Object.values(poolStandings).filter(s => s.winner && s.winner.gamesPlayed > 0).length}</p>
              <p>Wildcards: {wildcards.length}</p>
              <p>Should show seeding section: {seeds.length === 8 ? 'YES' : 'NO'}</p>
            </div>
            
            {Object.values(poolStandings).filter(s => s.winner && s.winner.gamesPlayed > 0).length + wildcards.length < 8 && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-yellow-800">Not Ready for Playoffs</h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      Complete more pool games to qualify the full 8 teams needed for playoffs.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === "bracket" && (
        <div>
          <h3 className="text-xl font-semibold mb-4">Playoff Bracket</h3>
          {(!bracket.quarterfinals || bracket.quarterfinals.length === 0) ? (
            <div className="text-center py-12 text-gray-500">
              <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-xl">Generate bracket first</p>
              <p>Complete qualification to generate the playoff bracket</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Auto-Schedule Button */}
              <div className="text-center py-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="text-lg font-medium text-blue-800 mb-2">⚡ Quick Actions</h4>
                <div className="flex justify-center space-x-4">
                  <button
                    onClick={handleAutoSchedule}
                    disabled={loading || !playoffGames || playoffGames.length === 0}
                    className="btn-secondary flex items-center"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    {loading ? "Scheduling..." : "Auto-Schedule All Games"}
                  </button>
                </div>
                <p className="text-sm text-blue-600 mt-2">
                  Automatically assigns fields and times following tournament progression rules
                </p>
              </div>

              {/* Game Management Section */}
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Available Games List */}
                <div>
                  <h4 className="text-lg font-semibold mb-4 flex items-center">
                    <Clock className="w-5 h-5 mr-2 text-orange-500" />
                    Playoff Games
                  </h4>
                  
                  {playoffGames.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                      <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-400" />
                      <p>No playoff games available</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      <div className="text-xs text-gray-500 mb-2 px-1">
                        👆 Click on any game to enter/edit results
                      </div>
                      {playoffGames
                        .filter(game => game.home_team_id && game.away_team_id) // Only show games with both teams
                        .map((game) => (
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
                                {game.round === 'quarterfinal' && `Quarterfinal ${game.position}`}
                                {game.round === 'semifinal' && `Semifinal ${game.position}`}
                                {game.round === 'final' && 'Championship Final'}
                                {game.field && ` • ${game.field}`}
                                {game.scheduled_start_time && ` • ${game.scheduled_start_time}`}
                                {game.status === 'completed' && ` • Final: ${game.home_score}-${game.away_score}`}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-xs font-medium ${
                                game.status === 'completed' ? 'text-green-600' : 'text-blue-600'
                              }`}>
                                {game.status === 'completed' ? 'Completed' : 'Click to enter'}
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
                  <h4 className="text-lg font-semibold mb-4 flex items-center">
                    <Target className="w-5 h-5 mr-2 text-blue-500" />
                    {selectedGame && selectedGame.status === 'completed' ? 'Edit Game Result' : 'Enter Game Result'}
                  </h4>
                  
                  {selectedGame && selectedGame.home_team_id && selectedGame.away_team_id ? (
                    <div className="tournament-card">
                      <div className="text-center mb-6">
                        <h5 className="text-xl font-bold text-gray-800 mb-2">
                          {selectedGame.home_team_name} vs {selectedGame.away_team_name}
                        </h5>
                        <p className="text-gray-600">
                          {selectedGame.round === 'quarterfinal' && `Quarterfinal ${selectedGame.position}`}
                          {selectedGame.round === 'semifinal' && `Semifinal ${selectedGame.position}`}
                          {selectedGame.round === 'final' && 'Championship Final'}
                        </p>
                      </div>

                      {/* Field and Time Selection */}
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Field
                          </label>
                          <select
                            value={gameResult.field}
                            onChange={(e) => setGameResult({ ...gameResult, field: e.target.value })}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">Select Field</option>
                            {fieldNames.map(field => (
                              <option key={field} value={field}>{field}</option>
                            ))}
                          </select>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Kick-off Time
                          </label>
                          <select
                            value={gameResult.scheduled_start_time}
                            onChange={(e) => setGameResult({ ...gameResult, scheduled_start_time: e.target.value })}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">Select Time</option>
                            {availableKickOffTimes.map(time => (
                              <option key={time} value={time}>{time}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Score Entry */}
                      <div className="grid grid-cols-3 gap-4 items-center mb-6">
                        <div className="text-center">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {selectedGame.home_team_name} Score
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
                            {selectedGame.away_team_name} Score
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

                      <div className="text-center text-sm text-orange-600 mb-4">
                        ⚠️ Playoff games cannot end in a tie. If tied, go directly to penalty shootout.
                      </div>

                      <div className="flex space-x-3">
                        <button
                          onClick={handleSubmitPlayoffResult}
                          disabled={loading || !gameResult.home_score || !gameResult.away_score || gameResult.home_score === gameResult.away_score}
                          className="btn-secondary flex-1"
                        >
                          {loading ? "Submitting..." : selectedGame.status === 'completed' ? 'Update Result' : 'Submit Result'}
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
                        {playoffGames.filter(g => g.home_team_id && g.away_team_id).length > 0 
                          ? "👈 Click on any game from the list to enter/edit scores"
                          : "Complete more playoff games to unlock semifinals and finals"
                        }
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Bracket Visualization */}
          {(bracket.quarterfinals && bracket.quarterfinals.length > 0) && (
            <div className="tournament-card">
                <h4 className="text-lg font-semibold mb-6 text-center">Tournament Bracket</h4>
                
                <div className="grid lg:grid-cols-3 gap-8">
                  {/* Quarterfinals */}
                  <div>
                    <h5 className="text-md font-medium mb-4 text-center text-blue-700">Quarterfinals</h5>
                    <div className="space-y-4">
                      {bracket.quarterfinals?.map((game) => (
                        <div key={game.id} className={`border rounded-lg p-4 ${
                          game.status === 'completed' ? 'bg-green-50 border-green-200' : 
                          game.home_team_id && game.away_team_id ? 'bg-white border-gray-200' : 
                          'bg-gray-50 border-gray-200'
                        }`}>
                          <div className="text-center">
                            <div className="text-xs text-gray-500 mb-2">QF{game.position}</div>
                            <div className="space-y-2">
                              <div className={`text-sm ${
                                game.status === 'completed' && game.winner_team_id === game.home_team_id 
                                  ? 'font-bold text-green-700' : 'text-gray-700'
                              }`}>
                                {game.home_team_name || 'TBD'}
                                {game.home_score !== null && ` (${game.home_score})`}
                              </div>
                              <div className="text-xs text-gray-400">vs</div>
                              <div className={`text-sm ${
                                game.status === 'completed' && game.winner_team_id === game.away_team_id 
                                  ? 'font-bold text-green-700' : 'text-gray-700'
                              }`}>
                                {game.away_team_name || 'TBD'}
                                {game.away_score !== null && ` (${game.away_score})`}
                              </div>
                            </div>
                            {game.status === 'completed' && (
                              <div className="mt-2">
                                <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Semifinals */}
                  <div>
                    <h5 className="text-md font-medium mb-4 text-center text-blue-700">Semifinals</h5>
                    <div className="space-y-6 mt-8">
                      {bracket.semifinals?.map((game) => (
                        <div key={game.id} className={`border rounded-lg p-4 ${
                          game.status === 'completed' ? 'bg-green-50 border-green-200' : 
                          game.home_team_id && game.away_team_id ? 'bg-white border-gray-200' : 
                          'bg-gray-50 border-gray-200'
                        }`}>
                          <div className="text-center">
                            <div className="text-xs text-gray-500 mb-2">SF{game.position}</div>
                            <div className="space-y-2">
                              <div className={`text-sm ${
                                game.status === 'completed' && game.winner_team_id === game.home_team_id 
                                  ? 'font-bold text-green-700' : 'text-gray-700'
                              }`}>
                                {game.home_team_name || 'QF Winner'}
                                {game.home_score !== null && ` (${game.home_score})`}
                              </div>
                              <div className="text-xs text-gray-400">vs</div>
                              <div className={`text-sm ${
                                game.status === 'completed' && game.winner_team_id === game.away_team_id 
                                  ? 'font-bold text-green-700' : 'text-gray-700'
                              }`}>
                                {game.away_team_name || 'QF Winner'}
                                {game.away_score !== null && ` (${game.away_score})`}
                              </div>
                            </div>
                            {game.status === 'completed' && (
                              <div className="mt-2">
                                <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Final */}
                  <div>
                    <h5 className="text-md font-medium mb-4 text-center text-blue-700">Final</h5>
                    <div className="mt-16">
                      {bracket.final?.map((game) => (
                        <div key={game.id} className={`border-2 rounded-lg p-6 ${
                          game.status === 'completed' ? 'bg-yellow-50 border-yellow-400' : 
                          game.home_team_id && game.away_team_id ? 'bg-white border-yellow-300' : 
                          'bg-gray-50 border-gray-200'
                        }`}>
                          <div className="text-center">
                            <div className="text-sm font-medium text-yellow-700 mb-4">CHAMPIONSHIP</div>
                            <div className="space-y-3">
                              <div className={`text-lg ${
                                game.status === 'completed' && game.winner_team_id === game.home_team_id 
                                  ? 'font-bold text-yellow-700' : 'text-gray-700'
                              }`}>
                                {game.home_team_name || 'SF Winner'}
                                {game.home_score !== null && ` (${game.home_score})`}
                                {game.status === 'completed' && game.winner_team_id === game.home_team_id && (
                                  <Trophy className="w-5 h-5 inline ml-2 text-yellow-600" />
                                )}
                              </div>
                              <div className="text-sm text-gray-400">vs</div>
                              <div className={`text-lg ${
                                game.status === 'completed' && game.winner_team_id === game.away_team_id 
                                  ? 'font-bold text-yellow-700' : 'text-gray-700'
                              }`}>
                                {game.away_team_name || 'SF Winner'}
                                {game.away_score !== null && ` (${game.away_score})`}
                                {game.status === 'completed' && game.winner_team_id === game.away_team_id && (
                                  <Trophy className="w-5 h-5 inline ml-2 text-yellow-600" />
                                )}
                              </div>
                            </div>
                            {game.status === 'completed' && (
                              <div className="mt-4">
                                <div className="text-sm font-bold text-yellow-700">CHAMPION</div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
        </div>
      )}

      {activeView === "schedule" && (
        <div>
          <h3 className="text-xl font-semibold mb-4">Playoff Schedule</h3>
          {(!bracket.quarterfinals || bracket.quarterfinals.length === 0) ? (
            <div className="text-center py-12 text-gray-500">
              <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-xl">Generate bracket first</p>
              <p>Create the playoff bracket to view scheduling options</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Tournament Rules */}
              <div className="tournament-card">
                <h4 className="text-lg font-semibold mb-4">Tournament Format & Rules</h4>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h5 className="font-medium text-gray-800 mb-2">Match Schedule</h5>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• All playoff games in one day</li>
                      <li>• Pool games & QFs: 2×20 minutes + 5 min halftime</li>
                      <li>• Semis & Final: 2×25 minutes + 5 min halftime</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-medium text-gray-800 mb-2">Tiebreaker Rules</h5>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• No extra time in playoffs</li>
                      <li>• If tied: go directly to penalty shootout</li>
                      <li>• Winner advances to next round</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Match Schedule Overview */}
              <div className="tournament-card">
                <h4 className="text-lg font-semibold mb-4">Match Schedule Overview</h4>
                <div className="space-y-4">
                  
                  {/* Quarterfinals */}
                  <div>
                    <h5 className="font-medium text-blue-700 mb-2">Quarterfinals</h5>
                    <div className="grid md:grid-cols-2 gap-4">
                      {bracket.quarterfinals?.map((game) => (
                        <div key={game.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="font-medium text-sm">QF{game.position}</div>
                              <div className="text-sm text-gray-600">
                                {game.home_team_name || 'TBD'} vs {game.away_team_name || 'TBD'}
                              </div>
                            </div>
                            <div className="text-right text-sm">
                              {game.scheduled_start_time || 'Time TBD'}
                              {game.field && <div className="text-gray-500">{game.field}</div>}
                            </div>
                          </div>
                          {game.status === 'completed' && (
                            <div className="mt-2 text-sm font-medium text-green-600">
                              Final: {game.home_score} - {game.away_score}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Semifinals */}
                  <div>
                    <h5 className="font-medium text-blue-700 mb-2">Semifinals</h5>
                    <div className="grid md:grid-cols-2 gap-4">
                      {bracket.semifinals?.map((game) => (
                        <div key={game.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="font-medium text-sm">SF{game.position}</div>
                              <div className="text-sm text-gray-600">
                                {game.home_team_name || 'QF Winner'} vs {game.away_team_name || 'QF Winner'}
                              </div>
                            </div>
                            <div className="text-right text-sm">
                              {game.scheduled_start_time || 'Time TBD'}
                              {game.field && <div className="text-gray-500">{game.field}</div>}
                            </div>
                          </div>
                          {game.status === 'completed' && (
                            <div className="mt-2 text-sm font-medium text-green-600">
                              Final: {game.home_score} - {game.away_score}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Final */}
                  <div>
                    <h5 className="font-medium text-blue-700 mb-2">Championship Final</h5>
                    {bracket.final?.map((game) => (
                      <div key={game.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                        <div className="text-center">
                          <div className="font-bold text-yellow-700 mb-2">CHAMPIONSHIP MATCH</div>
                          <div className="text-lg text-gray-700 mb-2">
                            {game.home_team_name || 'SF Winner'} vs {game.away_team_name || 'SF Winner'}
                          </div>
                          <div className="text-gray-600">
                            {game.scheduled_start_time || 'Time TBD'}
                            {game.field && ` • ${game.field}`}
                          </div>
                          {game.status === 'completed' && (
                            <div className="mt-3">
                              <div className="text-lg font-bold text-yellow-700">
                                Champion: {game.winner_team_name}
                              </div>
                              <div className="text-sm text-gray-600">
                                Final Score: {game.home_score} - {game.away_score}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Playoff Progress */}
              <div className="tournament-card">
                <h4 className="text-lg font-semibold mb-4">Playoff Progress</h4>
                <div className="grid md:grid-cols-4 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600 mb-2">
                      {bracket.quarterfinals?.filter(g => g.status === 'completed').length || 0}/4
                    </div>
                    <div className="text-gray-600">Quarterfinals Complete</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600 mb-2">
                      {bracket.semifinals?.filter(g => g.status === 'completed').length || 0}/2
                    </div>
                    <div className="text-gray-600">Semifinals Complete</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600 mb-2">
                      {bracket.final?.filter(g => g.status === 'completed').length || 0}/1
                    </div>
                    <div className="text-gray-600">Final Complete</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600 mb-2">
                      {bracket.final?.some(g => g.status === 'completed') ? '1' : '0'}
                    </div>
                    <div className="text-gray-600">Champion Crowned</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PlayoffsTab;