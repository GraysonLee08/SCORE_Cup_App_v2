// frontend/src/components/tabs/PlayoffsTab.js
// Playoff management tab component for tournament bracket generation and management

import React, { useState, useEffect } from "react";
import { Trophy, Users, Target, Award, AlertCircle, AlertTriangle, Clock, CheckCircle } from "lucide-react";
import { fetchPlayoffs, generatePlayoffBracket, submitPlayoffResult, showMessage } from "../../utils/api";
import BracketBuilder from "../BracketBuilder";

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
  const [showBracketBuilder, setShowBracketBuilder] = useState(false);
  const [poolStandings, setPoolStandings] = useState({});
  const [wildcards, setWildcards] = useState([]);
  const [seeds, setSeeds] = useState([]);
  const [bracket, setBracket] = useState({});
  const [playoffGames, setPlayoffGames] = useState([]);
  const [wildcardTies, setWildcardTies] = useState([]);
  const [manualWildcards] = useState({});
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, games, pools]);

  useEffect(() => {
    if (Object.keys(poolStandings).length > 0) {
      determineWildcards();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolStandings]);

  useEffect(() => {
    if (Object.keys(poolStandings).length > 0 && wildcards.length >= 0) {
      calculateSeeds();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // Debug logging for pool standings
      console.log(`🏊 Pool ${pool.name} Results:`, {
        winner: teamStats[0]?.name,
        secondPlace: teamStats[1]?.name,
        allTeams: teamStats.map(t => `${t.name} (${t.points}pts, ${t.goalDifferential}gd)`)
      });
    });

    console.log('🏆 All Pool Winners:', Object.values(standings).map(s => s.winner?.name));
    setPoolStandings(standings);
  };

  // Check if teams are completely tied (all tiebreakers equal)
  const areTeamsCompletelyTied = (teamA, teamB) => {
    return teamA.points === teamB.points &&
           teamA.goalDifferential === teamB.goalDifferential &&
           teamA.goalsFor === teamB.goalsFor &&
           teamA.headToHead === teamB.headToHead; // Assuming head-to-head is calculated elsewhere
  };

  // Determine the 2 best second-place teams (wildcards)
  const determineWildcards = () => {
    const allSecondPlace = Object.values(poolStandings)
      .map(standing => standing.secondPlace)
      .filter(team => team && team.gamesPlayed > 0);

    console.log('🔍 All Second Place Teams:', allSecondPlace.map(t => `${t.name} (${t.points}pts, ${t.goalDifferential}gd)`));

    // Sort second-place teams using same criteria
    allSecondPlace.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifferential !== a.goalDifferential) return b.goalDifferential - a.goalDifferential;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      if (a.goalsAgainst !== b.goalsAgainst) return a.goalsAgainst - b.goalsAgainst;
      if (a.fairPlayPoints !== b.fairPlayPoints) return a.fairPlayPoints - b.fairPlayPoints;
      return a.name.localeCompare(b.name);
    });

    // Check for ties in wildcard positions (positions 1 and 2 in sorted order = 1st and 2nd wildcards)
    const ties = [];
    
    if (allSecondPlace.length >= 3) {
      // Check 1st wildcard position (index 0) - is it tied with 2nd place (index 1) or beyond?
      const firstWildcardTies = [allSecondPlace[0]];
      for (let j = 1; j < allSecondPlace.length; j++) {
        if (areTeamsCompletelyTied(allSecondPlace[0], allSecondPlace[j])) {
          firstWildcardTies.push(allSecondPlace[j]);
        }
      }
      if (firstWildcardTies.length > 1) {
        ties.push({
          position: 1, // 1st wildcard
          teams: firstWildcardTies
        });
      }

      // Check 2nd wildcard position (index 1) - is it tied with teams at index 2+?
      if (!firstWildcardTies.some(t => t.id === allSecondPlace[1]?.id)) {
        const secondWildcardTies = [allSecondPlace[1]];
        for (let j = 2; j < allSecondPlace.length; j++) {
          if (areTeamsCompletelyTied(allSecondPlace[1], allSecondPlace[j])) {
            secondWildcardTies.push(allSecondPlace[j]);
          }
        }
        if (secondWildcardTies.length > 1) {
          ties.push({
            position: 2, // 2nd wildcard
            teams: secondWildcardTies
          });
        }
      }
    }

    setWildcardTies(ties);
    
    // Use manual selections if available, otherwise use sorted order
    let selectedWildcards = allSecondPlace.slice(0, 3); // Take top 3 wildcard teams
    
    // Apply manual selections if they exist
    if (Object.keys(manualWildcards).length > 0) {
      selectedWildcards = [
        manualWildcards.first || selectedWildcards[0],
        manualWildcards.second || selectedWildcards[1],
        manualWildcards.third || selectedWildcards[2]
      ].filter(Boolean);
    }

    console.log('🃏 Selected Wildcards:', selectedWildcards.map(t => t?.name));
    console.log('⚠️ Wildcard Ties Detected:', ties.length > 0 ? ties.map(t => `Position ${t.position}: ${t.teams.map(team => team.name).join(', ')}`) : 'None');

    setWildcards(selectedWildcards);
  };


  // Calculate overall seeding (1-8) for qualified teams
  const calculateSeeds = () => {
    const poolWinners = Object.values(poolStandings)
      .map(standing => standing.winner)
      .filter(winner => winner && winner.gamesPlayed > 0);
    
    const wildcardTeams = wildcards;
    
    console.log('🏆 Pool Winners:', poolWinners.length, poolWinners.map(w => w.name));
    console.log('⚡ Wildcards:', wildcardTeams.length, wildcardTeams.map(w => w.name));
    
    // Sort pool winners (seeds 1-6) and wildcards (seeds 7-8) separately
    poolWinners.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifferential !== a.goalDifferential) return b.goalDifferential - a.goalDifferential;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      if (a.goalsAgainst !== b.goalsAgainst) return a.goalsAgainst - b.goalsAgainst;
      if (a.fairPlayPoints !== b.fairPlayPoints) return a.fairPlayPoints - b.fairPlayPoints;
      return a.name.localeCompare(b.name);
    });

    wildcardTeams.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifferential !== a.goalDifferential) return b.goalDifferential - a.goalDifferential;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      if (a.goalsAgainst !== b.goalsAgainst) return a.goalsAgainst - b.goalsAgainst;
      if (a.fairPlayPoints !== b.fairPlayPoints) return a.fairPlayPoints - b.fairPlayPoints;
      return a.name.localeCompare(b.name);
    });

    // Combine: Pool winners get seeds 1-6, Wildcards get seeds 7-9
    // But we only use 8 teams for the bracket (top 2 wildcards by default)
    const allQualified = [...poolWinners, ...wildcardTeams];
    console.log('🎯 All Qualified Teams:', allQualified.length, allQualified.map(t => t.name));

    // For automatic bracket generation, use 6 pool winners + 2 wildcards
    const bracketTeams = [...poolWinners, ...wildcardTeams.slice(0, 2)];
    
    const seededTeams = bracketTeams.map((team, index) => ({
      ...team,
      seed: index + 1,
      isPoolWinner: poolWinners.some(winner => winner && winner.id === team.id),
      isWildcard: wildcardTeams.some(wildcard => wildcard.id === team.id)
    }));

    console.log('🔢 Final Seeds for Bracket:', seededTeams.length, seededTeams.map(t => `#${t.seed} ${t.name}`));
    console.log('🎲 All Wildcards Available:', wildcardTeams.map(t => t.name));
    setSeeds(seededTeams);
  };


  // Handle saving bracket from BracketBuilder
  const handleSaveBracketFromBuilder = async (bracketTeams) => {
    if (!tournament || bracketTeams.length !== 8) {
      showMessage(setError, setSuccess, "Invalid bracket configuration", true);
      return;
    }

    try {
      setLoading(true);

      // Update seeds with the manually selected bracket
      const manualSeeds = bracketTeams.map((team, index) => ({
        ...team,
        seed: index + 1,
        isPoolWinner: Object.values(poolStandings).some(s => s.winner?.id === team.id),
        isWildcard: !Object.values(poolStandings).some(s => s.winner?.id === team.id)
      }));

      setSeeds(manualSeeds);
      
      // Store the manual seeds for bracket generation
      localStorage.setItem('manualBracketSeeds', JSON.stringify(manualSeeds));
      
      // Immediately generate the playoff bracket with the custom seeding
      const customSeeding = manualSeeds.map(team => ({
        teamId: team.id,
        seed: team.seed
      }));
      
      console.log('🎯 Sending custom seeding to backend:', customSeeding);
      const response = await generatePlayoffBracket(tournament.id, customSeeding);
      
      if (response.success) {
        setShowBracketBuilder(false);
        showMessage(setError, setSuccess, "Custom bracket generated successfully! Check the Tournament tab.");
        fetchPlayoffData(); // Refresh playoff data
        onDataChange(); // Refresh parent data
      } else {
        showMessage(setError, setSuccess, "Failed to generate bracket: " + response.error, true);
      }
    } catch (error) {
      console.error("Error generating custom bracket:", error);
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
      const response = await fetch(process.env.REACT_APP_API_URL + `/api/tournaments/${tournament.id}/playoffs/auto-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
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
        onClick={() => {
          setActiveView("qualification");
          setShowBracketBuilder(false);
        }}
        className={`tournament-tab ${activeView === "qualification" && !showBracketBuilder ? "active" : ""}`}
      >
        <Users className="w-4 h-4" />
        <span>Qualification</span>
      </button>
      <button
        onClick={() => {
          setActiveView("qualification");
          setShowBracketBuilder(true);
        }}
        className={`tournament-tab ${showBracketBuilder ? "active" : ""}`}
      >
        <Target className="w-4 h-4" />
        <span>Bracket Builder</span>
      </button>
      <button
        onClick={() => {
          setActiveView("bracket");
          setShowBracketBuilder(false);
        }}
        className={`tournament-tab ${activeView === "bracket" ? "active" : ""}`}
        disabled={seeds.length < 8}
      >
        <Trophy className="w-4 h-4" />
        <span>Tournament</span>
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
      
      {/* Warning for wildcard ties requiring manual selection */}
      {wildcardTies.length > 0 && (
        <div style={{
          backgroundColor: '#fff3cd',
          border: '1px solid #ffeaa7',
          borderRadius: '6px',
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <AlertTriangle style={{ color: '#d68910', flexShrink: 0 }} className="w-5 h-5" />
          <div>
            <div style={{ fontWeight: '600', color: '#b7791f', marginBottom: '0.25rem' }}>
              Manual Wildcard Selection Required
            </div>
            <div style={{ color: '#856404', fontSize: '0.875rem' }}>
              {wildcardTies.length > 1 ? 'Multiple wildcard positions have' : 'A wildcard position has'} completely tied teams. 
              Please manually select the wildcard team{wildcardTies.length > 1 ? 's' : ''} in the Bracket tab below.
            </div>
          </div>
        </div>
      )}
      
      <ViewToggle />

      {/* Bracket Builder View */}
      {showBracketBuilder && (
        <BracketBuilder
          poolStandings={poolStandings}
          teams={teams}
          games={games}
          onSaveBracket={handleSaveBracketFromBuilder}
          loading={loading}
          setLoading={setLoading}
          setError={setError}
          setSuccess={setSuccess}
        />
      )}

      {activeView === "qualification" && !showBracketBuilder && (
        <div className="space-y-6">
          
          {/* Tournament Format Info */}
          <div className="content-card">
            <h3 style={{ marginBottom: "1rem", color: "var(--primary-color)" }}>Tournament Format</h3>
            <div className="content-wrapper">
              <div className="col-half">
                <h4 style={{ fontWeight: "500", marginBottom: "0.5rem" }}>Pool Stage</h4>
                <ul style={{ fontSize: "0.875rem", color: "var(--text-light)", listStyle: "none", padding: 0, margin: 0 }}>
                  <li style={{ marginBottom: "0.25rem" }}>• 6 pools (A–F) with 3 teams each</li>
                  <li style={{ marginBottom: "0.25rem" }}>• 3 games per team (2 pool + 1 crossover)</li>
                  <li style={{ marginBottom: "0.25rem" }}>• Points: Win = 3, Draw = 1, Loss = 0</li>
                </ul>
              </div>
              <div className="col-half">
                <h4 style={{ fontWeight: "500", marginBottom: "0.5rem" }}>Playoff Qualification</h4>
                <ul style={{ fontSize: "0.875rem", color: "var(--text-light)", listStyle: "none", padding: 0, margin: 0 }}>
                  <li style={{ marginBottom: "0.25rem" }}>• 6 pool winners advance automatically</li>
                  <li style={{ marginBottom: "0.25rem" }}>• 2 best second-place teams (wildcards)</li>
                  <li style={{ marginBottom: "0.25rem" }}>• Total: 8 teams in playoff bracket</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Pool Standings */}
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

          {/* Simple Qualification Status */}
          {Object.values(poolStandings).filter(s => s.winner && s.winner.gamesPlayed > 0).length + wildcards.length < 8 && (
            <div className="content-card" style={{ textAlign: "center", padding: "2rem" }}>
              <AlertCircle className="w-12 h-12" style={{ color: "#f59e0b", margin: "0 auto 1rem", display: "block" }} />
              <h3 style={{ color: "#f59e0b", marginBottom: "0.5rem" }}>Not Ready for Playoffs</h3>
              <p style={{ color: "var(--text-light)" }}>
                Complete more pool games to qualify the full 8 teams needed for playoffs.
              </p>
              <div style={{ marginTop: "1rem", fontSize: "0.875rem", color: "var(--text-light)" }}>
                Currently qualified: {Object.values(poolStandings).filter(s => s.winner && s.winner.gamesPlayed > 0).length + wildcards.length} / 8 teams
              </div>
            </div>
          )}
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
              <div className="content-card" style={{ textAlign: "center", padding: "2rem" }}>
                <h4 style={{ fontSize: "1.125rem", fontWeight: "600", color: "var(--primary-color)", marginBottom: "1rem" }}>⚡ Quick Actions</h4>
                <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
                  <button
                    onClick={handleAutoSchedule}
                    disabled={loading || !playoffGames || playoffGames.length === 0}
                    className="btn"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.75rem 1.5rem",
                      fontSize: "1rem",
                      fontWeight: "500",
                      opacity: (loading || !playoffGames || playoffGames.length === 0) ? 0.6 : 1,
                      cursor: (loading || !playoffGames || playoffGames.length === 0) ? "not-allowed" : "pointer"
                    }}
                  >
                    <Clock className="w-4 h-4" />
                    {loading ? "Scheduling..." : "Auto-Schedule All Games"}
                  </button>
                </div>
                <p style={{ fontSize: "0.875rem", color: "var(--text-light)", marginTop: "1rem" }}>
                  Automatically assigns fields and times following tournament progression rules
                </p>
              </div>

              {/* Game Management Section */}
              <div className="content-wrapper">
                {/* Available Games List */}
                <div className="col-half">
                  <h4 style={{ fontSize: "1.125rem", fontWeight: "600", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Clock className="w-5 h-5" style={{ color: "#f59e0b" }} />
                    Playoff Games
                  </h4>
                  
                  {playoffGames.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-light)", border: "2px dashed #e0e0e0", borderRadius: "8px" }}>
                      <CheckCircle className="w-12 h-12" style={{ color: "#10b981", margin: "0 auto 0.5rem", display: "block" }} />
                      <p>No playoff games available</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "24rem", overflowY: "auto" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-light)", marginBottom: "0.5rem", padding: "0 0.25rem" }}>
                        👆 Click on any game to enter/edit results
                      </div>
                      {playoffGames
                        .filter(game => game.home_team_id && game.away_team_id) // Only show games with both teams
                        .map((game) => (
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
                                {game.round === 'quarterfinal' && `Quarterfinal ${game.position}`}
                                {game.round === 'semifinal' && `Semifinal ${game.position}`}
                                {game.round === 'final' && 'Championship Final'}
                                {game.field && ` • ${game.field}`}
                                {game.scheduled_start_time && ` • ${game.scheduled_start_time}`}
                                {game.status === 'completed' && ` • Final: ${game.home_score}-${game.away_score}`}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{
                                fontSize: "0.75rem",
                                fontWeight: "500",
                                color: game.status === 'completed' ? "#10b981" : "var(--primary-color)"
                              }}>
                                {game.status === 'completed' ? 'Completed' : 'Click to enter'}
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

                {/* Champions League Style Score Entry Form */}
                <div className="col-half">
                  <h4 style={{ fontSize: "1.125rem", fontWeight: "600", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Target className="w-5 h-5" style={{ color: "var(--primary-color)" }} />
                    {selectedGame && selectedGame.status === 'completed' ? 'Edit Game Result' : 'Enter Game Result'}
                  </h4>
                  
                  {selectedGame && selectedGame.home_team_id && selectedGame.away_team_id ? (
                    <div style={{ 
                      background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #1e40af 100%)",
                      color: "white",
                      borderRadius: "12px",
                      padding: "1.5rem",
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
                          {selectedGame.round === 'quarterfinal' && `Quarterfinal ${selectedGame.position}`}
                          {selectedGame.round === 'semifinal' && `Semifinal ${selectedGame.position}`}
                          {selectedGame.round === 'final' && 'Championship Final'}
                        </div>
                        <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>
                          {selectedGame.status === 'completed' ? 'EDITING RESULT' : 'ENTER RESULT'}
                        </div>
                      </div>

                      {/* Field and Time Selection */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "2rem", position: "relative", zIndex: 2 }}>
                        <div>
                          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "500", marginBottom: "0.5rem", color: "rgba(255,255,255,0.9)" }}>
                            Field
                          </label>
                          <select
                            value={gameResult.field}
                            onChange={(e) => setGameResult({ ...gameResult, field: e.target.value })}
                            style={{
                              width: "100%",
                              padding: "0.75rem",
                              border: "1px solid rgba(255,255,255,0.3)",
                              borderRadius: "4px",
                              fontSize: "0.875rem",
                              backgroundColor: "rgba(255,255,255,0.1)",
                              color: "white",
                              backdropFilter: "blur(10px)"
                            }}
                          >
                            <option value="" style={{ color: "#333" }}>Select Field</option>
                            {fieldNames.map(field => (
                              <option key={field} value={field} style={{ color: "#333" }}>{field}</option>
                            ))}
                          </select>
                        </div>
                        
                        <div>
                          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "500", marginBottom: "0.5rem", color: "rgba(255,255,255,0.9)" }}>
                            Kick-off Time
                          </label>
                          <select
                            value={gameResult.scheduled_start_time}
                            onChange={(e) => setGameResult({ ...gameResult, scheduled_start_time: e.target.value })}
                            style={{
                              width: "100%",
                              padding: "0.75rem",
                              border: "1px solid rgba(255,255,255,0.3)",
                              borderRadius: "4px",
                              fontSize: "0.875rem",
                              backgroundColor: "rgba(255,255,255,0.1)",
                              color: "white",
                              backdropFilter: "blur(10px)"
                            }}
                          >
                            <option value="" style={{ color: "#333" }}>Select Time</option>
                            {availableKickOffTimes.map(time => (
                              <option key={time} value={time} style={{ color: "#333" }}>{time}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Main Scoreboard Layout */}
                      <div style={{ 
                        display: "grid", 
                        gridTemplateColumns: "1fr auto 1fr", 
                        gap: "2rem", 
                        alignItems: "center", 
                        marginBottom: "1.5rem",
                        position: "relative",
                        zIndex: 2
                      }}>
                        {/* Home Team */}
                        <div style={{ textAlign: "center" }}>
                          <div style={{ 
                            fontSize: "1rem", 
                            fontWeight: "bold", 
                            textTransform: "uppercase", 
                            letterSpacing: "0.05em",
                            marginBottom: "1rem",
                            color: "white"
                          }}>
                            {selectedGame.home_team_name}
                          </div>
                          <input
                            type="number"
                            min="0"
                            value={gameResult.home_score}
                            onChange={(e) => setGameResult({ ...gameResult, home_score: e.target.value })}
                            style={{
                              width: "70px",
                              height: "70px",
                              padding: "0",
                              border: "3px solid rgba(255,255,255,0.3)",
                              borderRadius: "12px",
                              fontSize: "2rem",
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
                          fontSize: "1.25rem", 
                          fontWeight: "bold", 
                          color: "rgba(255,255,255,0.8)",
                          letterSpacing: "0.1em"
                        }}>VS</div>
                        
                        {/* Away Team */}
                        <div style={{ textAlign: "center" }}>
                          <div style={{ 
                            fontSize: "1rem", 
                            fontWeight: "bold", 
                            textTransform: "uppercase", 
                            letterSpacing: "0.05em",
                            marginBottom: "1rem",
                            color: "white"
                          }}>
                            {selectedGame.away_team_name}
                          </div>
                          <input
                            type="number"
                            min="0"
                            value={gameResult.away_score}
                            onChange={(e) => setGameResult({ ...gameResult, away_score: e.target.value })}
                            style={{
                              width: "70px",
                              height: "70px",
                              padding: "0",
                              border: "3px solid rgba(255,255,255,0.3)",
                              borderRadius: "12px",
                              fontSize: "2rem",
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

                      {/* Warning Message */}
                      <div style={{ textAlign: "center", fontSize: "0.875rem", color: "#fbbf24", marginBottom: "1.5rem", position: "relative", zIndex: 2 }}>
                        ⚠️ Playoff games cannot end in a tie. If tied, go directly to penalty shootout.
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: "flex", gap: "0.75rem", position: "relative", zIndex: 2 }}>
                        <button
                          onClick={handleSubmitPlayoffResult}
                          disabled={loading || !gameResult.home_score || !gameResult.away_score || gameResult.home_score === gameResult.away_score}
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
                            cursor: (loading || !gameResult.home_score || !gameResult.away_score || gameResult.home_score === gameResult.away_score) ? "not-allowed" : "pointer",
                            opacity: (loading || !gameResult.home_score || !gameResult.away_score || gameResult.home_score === gameResult.away_score) ? 0.5 : 1,
                            transition: "all 0.2s ease"
                          }}
                          onMouseEnter={(e) => {
                            if (!loading && gameResult.home_score && gameResult.away_score && gameResult.home_score !== gameResult.away_score) {
                              e.target.style.backgroundColor = "rgba(255,255,255,0.25)";
                              e.target.style.borderColor = "rgba(255,255,255,0.5)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.backgroundColor = "rgba(255,255,255,0.15)";
                            e.target.style.borderColor = "rgba(255,255,255,0.3)";
                          }}
                        >
                          {loading ? "Submitting..." : selectedGame.status === 'completed' ? 'Update Result' : 'Submit Result'}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedGame(null);
                            setGameResult({ home_score: "", away_score: "", field: "", scheduled_start_time: "" });
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
                        {playoffGames.filter(g => g.home_team_id && g.away_team_id).length > 0 
                          ? "👈 Click on any game from the list to enter/edit scores"
                          : "Complete more playoff games to unlock semifinals and finals"
                        }
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Modern Visual Tournament Bracket */}
              {(bracket.quarterfinals && bracket.quarterfinals.length > 0) && (
                <div className="content-card" style={{ 
                  marginTop: "2rem",
                  background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
                  padding: "2rem",
                  borderRadius: "16px"
                }}>
                  <h4 style={{ 
                    fontSize: "1.5rem", 
                    fontWeight: "700", 
                    marginBottom: "3rem", 
                    textAlign: "center", 
                    color: "#1e293b",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em"
                  }}>
                    Tournament Bracket
                  </h4>
                  
                  <div style={{ 
                    display: "grid", 
                    gridTemplateColumns: "1fr 1fr 1fr", 
                    gap: "3rem", 
                    alignItems: "center",
                    minHeight: "700px",
                    position: "relative"
                  }}>
                    
                    {/* Quarterfinals Column */}
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", height: "100%" }}>
                      <div style={{ 
                        textAlign: "center", 
                        marginBottom: "2rem", 
                        fontSize: "0.875rem",
                        fontWeight: "600", 
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em"
                      }}>
                        Quarterfinals
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
                        {bracket.quarterfinals?.slice(0, 4).map((game, index) => (
                          <div key={game.id} style={{ position: "relative" }}>
                            <div style={{
                              background: "white",
                              borderRadius: "12px",
                              boxShadow: game.status === 'completed' 
                                ? "0 4px 6px -1px rgba(34, 197, 94, 0.2), 0 2px 4px -1px rgba(34, 197, 94, 0.1)"
                                : "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                              padding: "0",
                              minHeight: "90px",
                              overflow: "hidden",
                              transition: "all 0.3s ease",
                              cursor: "pointer"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = "translateY(-2px)";
                              e.currentTarget.style.boxShadow = "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "translateY(0)";
                              e.currentTarget.style.boxShadow = game.status === 'completed' 
                                ? "0 4px 6px -1px rgba(34, 197, 94, 0.2), 0 2px 4px -1px rgba(34, 197, 94, 0.1)"
                                : "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
                            }}
                            >
                              {/* Match Header */}
                              <div style={{ 
                                padding: "0.5rem 1rem",
                                background: game.status === 'completed' 
                                  ? "linear-gradient(90deg, #22c55e 0%, #16a34a 100%)"
                                  : "linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)",
                                color: "white",
                                fontSize: "0.75rem",
                                fontWeight: "600",
                                textAlign: "center"
                              }}>
                                MATCH {game.position}
                              </div>
                              
                              {/* Teams Container */}
                              <div style={{ padding: "0.75rem 1rem" }}>
                                {/* Home Team */}
                                <div style={{ 
                                  display: "flex", 
                                  justifyContent: "space-between", 
                                  alignItems: "center",
                                  padding: "0.5rem 0",
                                  borderBottom: "1px solid #f1f5f9"
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <div style={{
                                      width: "24px",
                                      height: "24px",
                                      borderRadius: "50%",
                                      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      color: "white",
                                      fontSize: "0.625rem",
                                      fontWeight: "bold"
                                    }}>
                                      {(index * 2) + 1}
                                    </div>
                                    <span style={{ 
                                      fontSize: "0.875rem",
                                      fontWeight: game.status === 'completed' && game.winner_team_id === game.home_team_id ? "700" : "500",
                                      color: game.status === 'completed' && game.winner_team_id === game.home_team_id ? "#16a34a" : "#1e293b"
                                    }}>
                                      {game.home_team_name || `Seed ${(index * 2) + 1}`}
                                    </span>
                                  </div>
                                  <span style={{ 
                                    fontSize: "1rem", 
                                    fontWeight: "700",
                                    color: game.status === 'completed' && game.winner_team_id === game.home_team_id ? "#16a34a" : "#1e293b",
                                    minWidth: "24px",
                                    textAlign: "center"
                                  }}>
                                    {game.home_score !== null ? game.home_score : '-'}
                                  </span>
                                </div>
                                
                                {/* Away Team */}
                                <div style={{ 
                                  display: "flex", 
                                  justifyContent: "space-between", 
                                  alignItems: "center",
                                  padding: "0.5rem 0"
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <div style={{
                                      width: "24px",
                                      height: "24px",
                                      borderRadius: "50%",
                                      background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      color: "white",
                                      fontSize: "0.625rem",
                                      fontWeight: "bold"
                                    }}>
                                      {8 - (index * 2)}
                                    </div>
                                    <span style={{ 
                                      fontSize: "0.875rem",
                                      fontWeight: game.status === 'completed' && game.winner_team_id === game.away_team_id ? "700" : "500",
                                      color: game.status === 'completed' && game.winner_team_id === game.away_team_id ? "#16a34a" : "#1e293b"
                                    }}>
                                      {game.away_team_name || `Seed ${8 - (index * 2)}`}
                                    </span>
                                  </div>
                                  <span style={{ 
                                    fontSize: "1rem", 
                                    fontWeight: "700",
                                    color: game.status === 'completed' && game.winner_team_id === game.away_team_id ? "#16a34a" : "#1e293b",
                                    minWidth: "24px",
                                    textAlign: "center"
                                  }}>
                                    {game.away_score !== null ? game.away_score : '-'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Modern Connection Line */}
                            <svg style={{
                              position: "absolute",
                              right: "-3rem",
                              top: "50%",
                              transform: "translateY(-50%)",
                              width: "3rem",
                              height: "2px",
                              zIndex: 1
                            }}>
                              <line 
                                x1="0" y1="1" 
                                x2="48" y2="1" 
                                stroke={game.status === 'completed' ? "#22c55e" : "#cbd5e1"}
                                strokeWidth="2"
                                strokeDasharray={game.status === 'completed' ? "0" : "5,5"}
                              />
                            </svg>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Semifinals Column */}
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", position: "relative" }}>
                      <div style={{ 
                        textAlign: "center", 
                        marginBottom: "2rem", 
                        fontSize: "0.875rem",
                        fontWeight: "600", 
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em"
                      }}>
                        Semifinals
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6rem" }}>
                        {bracket.semifinals?.slice(0, 2).map((game, index) => {
                          // Find the corresponding QF games that feed into this SF
                          const qf1 = bracket.quarterfinals?.[index * 2];
                          const qf2 = bracket.quarterfinals?.[index * 2 + 1];
                          
                          return (
                            <div key={game.id} style={{ position: "relative" }}>
                              <div style={{
                                background: "white",
                                borderRadius: "12px",
                                boxShadow: game.status === 'completed' 
                                  ? "0 4px 6px -1px rgba(34, 197, 94, 0.2), 0 2px 4px -1px rgba(34, 197, 94, 0.1)"
                                  : "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                                padding: "0",
                                minHeight: "90px",
                                overflow: "hidden",
                                transition: "all 0.3s ease",
                                cursor: "pointer"
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = "translateY(-2px)";
                                e.currentTarget.style.boxShadow = "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = "translateY(0)";
                                e.currentTarget.style.boxShadow = game.status === 'completed' 
                                  ? "0 4px 6px -1px rgba(34, 197, 94, 0.2), 0 2px 4px -1px rgba(34, 197, 94, 0.1)"
                                  : "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
                              }}
                              >
                                {/* Match Header */}
                                <div style={{ 
                                  padding: "0.5rem 1rem",
                                  background: game.status === 'completed' 
                                    ? "linear-gradient(90deg, #22c55e 0%, #16a34a 100%)"
                                    : "linear-gradient(90deg, #6366f1 0%, #4f46e5 100%)",
                                  color: "white",
                                  fontSize: "0.75rem",
                                  fontWeight: "600",
                                  textAlign: "center"
                                }}>
                                  SEMIFINAL {game.position}
                                </div>
                                
                                {/* Teams Container */}
                                <div style={{ padding: "0.75rem 1rem" }}>
                                  {/* Home Team */}
                                  <div style={{ 
                                    display: "flex", 
                                    justifyContent: "space-between", 
                                    alignItems: "center",
                                    padding: "0.5rem 0",
                                    borderBottom: "1px solid #f1f5f9"
                                  }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                      <div style={{
                                        width: "20px",
                                        height: "20px",
                                        borderRadius: "50%",
                                        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "white",
                                        fontSize: "0.625rem",
                                        fontWeight: "bold"
                                      }}>
                                        W{(index * 2) + 1}
                                      </div>
                                      <span style={{ 
                                        fontSize: "0.875rem",
                                        fontWeight: game.status === 'completed' && game.winner_team_id === game.home_team_id ? "700" : "500",
                                        color: game.status === 'completed' && game.winner_team_id === game.home_team_id ? "#16a34a" : "#1e293b"
                                      }}>
                                        {game.home_team_name || (qf1?.status === 'completed' ? 
                                          (qf1.winner_team_id === qf1.home_team_id ? qf1.home_team_name : qf1.away_team_name) : 
                                          'QF Winner'
                                        )}
                                      </span>
                                    </div>
                                    <span style={{ 
                                      fontSize: "1rem", 
                                      fontWeight: "700",
                                      color: game.status === 'completed' && game.winner_team_id === game.home_team_id ? "#16a34a" : "#1e293b",
                                      minWidth: "24px",
                                      textAlign: "center"
                                    }}>
                                      {game.home_score !== null ? game.home_score : '-'}
                                    </span>
                                  </div>
                                  
                                  {/* Away Team */}
                                  <div style={{ 
                                    display: "flex", 
                                    justifyContent: "space-between", 
                                    alignItems: "center",
                                    padding: "0.5rem 0"
                                  }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                      <div style={{
                                        width: "20px",
                                        height: "20px",
                                        borderRadius: "50%",
                                        background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "white",
                                        fontSize: "0.625rem",
                                        fontWeight: "bold"
                                      }}>
                                        W{(index * 2) + 2}
                                      </div>
                                      <span style={{ 
                                        fontSize: "0.875rem",
                                        fontWeight: game.status === 'completed' && game.winner_team_id === game.away_team_id ? "700" : "500",
                                        color: game.status === 'completed' && game.winner_team_id === game.away_team_id ? "#16a34a" : "#1e293b"
                                      }}>
                                        {game.away_team_name || (qf2?.status === 'completed' ? 
                                          (qf2.winner_team_id === qf2.home_team_id ? qf2.home_team_name : qf2.away_team_name) : 
                                          'QF Winner'
                                        )}
                                      </span>
                                    </div>
                                    <span style={{ 
                                      fontSize: "1rem", 
                                      fontWeight: "700",
                                      color: game.status === 'completed' && game.winner_team_id === game.away_team_id ? "#16a34a" : "#1e293b",
                                      minWidth: "24px",
                                      textAlign: "center"
                                    }}>
                                      {game.away_score !== null ? game.away_score : '-'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Modern Connection Line to Final */}
                              <svg style={{
                                position: "absolute",
                                right: "-3rem",
                                top: "50%",
                                transform: "translateY(-50%)",
                                width: "3rem",
                                height: "2px",
                                zIndex: 1
                              }}>
                                <line 
                                  x1="0" y1="1" 
                                  x2="48" y2="1" 
                                  stroke={game.status === 'completed' ? "#22c55e" : "#cbd5e1"}
                                  strokeWidth="2"
                                  strokeDasharray={game.status === 'completed' ? "0" : "5,5"}
                                />
                              </svg>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Final Column */}
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
                      <div style={{ 
                        textAlign: "center", 
                        marginBottom: "2rem", 
                        fontSize: "0.875rem",
                        fontWeight: "600", 
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em"
                      }}>
                        Championship Final
                      </div>
                      
                      {bracket.final?.map((game) => {
                        // Find the corresponding SF games that feed into the Final
                        const sf1 = bracket.semifinals?.[0];
                        const sf2 = bracket.semifinals?.[1];
                        
                        return (
                          <div key={game.id} style={{ position: "relative" }}>
                            <div style={{
                              background: game.status === 'completed' 
                                ? "linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fbbf24 100%)"
                                : "white",
                              borderRadius: "16px",
                              border: game.status === 'completed' 
                                ? "3px solid #f59e0b" 
                                : "2px solid #e5e7eb",
                              padding: "0",
                              minHeight: "110px",
                              overflow: "hidden",
                              boxShadow: game.status === 'completed' 
                                ? "0 10px 15px -3px rgba(251, 191, 36, 0.3), 0 4px 6px -2px rgba(251, 191, 36, 0.2)"
                                : "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                              transition: "all 0.3s ease",
                              cursor: "pointer"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = "translateY(-2px)";
                              e.currentTarget.style.boxShadow = "0 15px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "translateY(0)";
                              e.currentTarget.style.boxShadow = game.status === 'completed' 
                                ? "0 10px 15px -3px rgba(251, 191, 36, 0.3), 0 4px 6px -2px rgba(251, 191, 36, 0.2)"
                                : "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
                            }}
                            >
                              {/* Championship Header */}
                              <div style={{ 
                                padding: "0.75rem 1rem",
                                background: game.status === 'completed' 
                                  ? "linear-gradient(90deg, #d97706 0%, #b45309 100%)"
                                  : "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)",
                                color: "white",
                                fontSize: "0.8rem",
                                fontWeight: "bold",
                                textAlign: "center",
                                textTransform: "uppercase",
                                letterSpacing: "0.1em",
                                position: "relative"
                              }}>
                                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                                  🏆 Championship Final 🏆
                                </span>
                              </div>
                              
                              {/* Teams Container */}
                              <div style={{ 
                                padding: "1rem",
                                background: game.status === 'completed' 
                                  ? "rgba(255, 255, 255, 0.95)"
                                  : "white",
                                backdropFilter: "blur(10px)"
                              }}>
                                {/* Home Team */}
                                <div style={{ 
                                  display: "flex", 
                                  justifyContent: "space-between", 
                                  alignItems: "center",
                                  padding: "0.75rem 0",
                                  borderBottom: "1px solid #f1f5f9"
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                    <div style={{
                                      width: "24px",
                                      height: "24px",
                                      borderRadius: "50%",
                                      background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      color: "white",
                                      fontSize: "0.625rem",
                                      fontWeight: "bold"
                                    }}>
                                      W1
                                    </div>
                                    <span style={{ 
                                      fontSize: "0.95rem",
                                      fontWeight: game.status === 'completed' && game.winner_team_id === game.home_team_id ? "700" : "500",
                                      color: game.status === 'completed' && game.winner_team_id === game.home_team_id ? "#92400e" : "#1e293b"
                                    }}>
                                      {game.home_team_name || (sf1?.status === 'completed' ? 
                                        (sf1.winner_team_id === sf1.home_team_id ? sf1.home_team_name : sf1.away_team_name) : 
                                        'SF Winner'
                                      )}
                                      {game.status === 'completed' && game.winner_team_id === game.home_team_id && (
                                        <span style={{ marginLeft: "0.5rem", fontSize: "1.25rem" }}>👑</span>
                                      )}
                                    </span>
                                  </div>
                                  <span style={{ 
                                    fontSize: "1.25rem", 
                                    fontWeight: "700",
                                    color: game.status === 'completed' && game.winner_team_id === game.home_team_id ? "#92400e" : "#1e293b",
                                    minWidth: "30px",
                                    textAlign: "center"
                                  }}>
                                    {game.home_score !== null ? game.home_score : '-'}
                                  </span>
                                </div>
                                
                                {/* Away Team */}
                                <div style={{ 
                                  display: "flex", 
                                  justifyContent: "space-between", 
                                  alignItems: "center",
                                  padding: "0.75rem 0"
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                    <div style={{
                                      width: "24px",
                                      height: "24px",
                                      borderRadius: "50%",
                                      background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      color: "white",
                                      fontSize: "0.625rem",
                                      fontWeight: "bold"
                                    }}>
                                      W2
                                    </div>
                                    <span style={{ 
                                      fontSize: "0.95rem",
                                      fontWeight: game.status === 'completed' && game.winner_team_id === game.away_team_id ? "700" : "500",
                                      color: game.status === 'completed' && game.winner_team_id === game.away_team_id ? "#92400e" : "#1e293b"
                                    }}>
                                      {game.away_team_name || (sf2?.status === 'completed' ? 
                                        (sf2.winner_team_id === sf2.home_team_id ? sf2.home_team_name : sf2.away_team_name) : 
                                        'SF Winner'
                                      )}
                                      {game.status === 'completed' && game.winner_team_id === game.away_team_id && (
                                        <span style={{ marginLeft: "0.5rem", fontSize: "1.25rem" }}>👑</span>
                                      )}
                                    </span>
                                  </div>
                                  <span style={{ 
                                    fontSize: "1.25rem", 
                                    fontWeight: "700",
                                    color: game.status === 'completed' && game.winner_team_id === game.away_team_id ? "#92400e" : "#1e293b",
                                    minWidth: "30px",
                                    textAlign: "center"
                                  }}>
                                    {game.away_score !== null ? game.away_score : '-'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Modern Champion Display */}
                      {bracket.final?.[0]?.status === 'completed' && (
                        <div style={{
                          marginTop: "2rem",
                          textAlign: "center",
                          padding: "1.5rem",
                          background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                          border: "2px solid #f59e0b",
                          borderRadius: "12px",
                          boxShadow: "0 4px 12px rgba(245, 158, 11, 0.3)"
                        }}>
                          <div style={{ fontSize: "0.875rem", color: "#92400e", marginBottom: "0.75rem", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            🏆 Tournament Champion 🏆
                          </div>
                          <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#92400e", textShadow: "0 1px 3px rgba(146, 64, 14, 0.3)" }}>
                            {bracket.final[0].winner_team_name || 
                             (bracket.final[0].winner_team_id === bracket.final[0].home_team_id ? 
                              bracket.final[0].home_team_name : bracket.final[0].away_team_name)}
                          </div>
                          <div style={{ fontSize: "0.875rem", color: "#b45309", marginTop: "0.5rem" }}>
                            Final Score: {bracket.final[0].home_score} - {bracket.final[0].away_score}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}

    </div>
  );
};

export default PlayoffsTab;