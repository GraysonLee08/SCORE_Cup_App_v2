// frontend/src/components/BracketBuilder.js
// Drag-and-drop bracket builder for playoff seeding

import React, { useState, useEffect } from 'react';
import { Trophy, Users, Target, Shuffle, Save, AlertCircle } from 'lucide-react';

const BracketBuilder = ({ 
  poolStandings, 
  teams, 
  games,
  onSaveBracket,
  loading,
  setLoading,
  setError,
  setSuccess
}) => {
  const [tournamentLocks, setTournamentLocks] = useState([]);
  const [wildcardEligible, setWildcardEligible] = useState([]);
  const [allOthers, setAllOthers] = useState([]);
  const [bracketSlots, setBracketSlots] = useState(Array(8).fill(null));
  const [draggedTeam, setDraggedTeam] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(null);

  useEffect(() => {
    categorizeTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolStandings, teams, games]); // Added games dependency

  useEffect(() => {
    // Pre-populate bracket with tournament locks only
    // Leave empty slots when there are wildcard eligible teams (ties)
    if (tournamentLocks.length > 0) {
      const recommendedBracket = Array(8).fill(null);
      // Fill in the tournament locks in their seed positions
      tournamentLocks.forEach((team, index) => {
        if (index < 8) {
          recommendedBracket[index] = team;
        }
      });
      setBracketSlots(recommendedBracket);
    }
  }, [tournamentLocks]);

  const categorizeTeams = () => {
    console.log('🔍 BracketBuilder - Pool Standings:', poolStandings);
    
    // Get pool winners
    const winners = Object.values(poolStandings)
      .map(standing => standing.winner)
      .filter(winner => winner && winner.gamesPlayed > 0)
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDifferential !== a.goalDifferential) return b.goalDifferential - a.goalDifferential;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        return a.name.localeCompare(b.name);
      });

    // Get all second-place teams sorted by points and goal differential
    const allSecondPlace = Object.values(poolStandings)
      .map(standing => standing.secondPlace)
      .filter(team => team && team.gamesPlayed > 0)
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDifferential !== a.goalDifferential) return b.goalDifferential - a.goalDifferential;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        return a.name.localeCompare(b.name);
      });
    
    // Determine tournament locks vs wildcard eligible
    // We need 2 wildcard spots (positions 7-8) to fill after 6 pool winners
    const tournamentLocks = [...winners]; // Start with pool winners
    const wildcardEligible = [];
    
    if (allSecondPlace.length > 0) {
      // Check for ties at the cutoff point (2nd wildcard position)
      let lockedWildcards = 0;
      let i = 0;
      
      while (i < allSecondPlace.length && lockedWildcards < 2) {
        const currentTeam = allSecondPlace[i];
        const tiedTeams = [currentTeam];
        
        // Find all teams tied with this one
        let j = i + 1;
        while (j < allSecondPlace.length && 
               allSecondPlace[j].points === currentTeam.points && 
               allSecondPlace[j].goalDifferential === currentTeam.goalDifferential) {
          tiedTeams.push(allSecondPlace[j]);
          j++;
        }
        
        // Check how many wildcard spots are remaining
        const remainingSpots = 2 - lockedWildcards;
        
        if (tiedTeams.length === 1 && remainingSpots > 0) {
          // No tie, this team is a lock
          tournamentLocks.push(currentTeam);
          lockedWildcards++;
          i++;
        } else if (tiedTeams.length > 1 && tiedTeams.length <= remainingSpots) {
          // All tied teams fit within remaining spots, they're all locks
          tournamentLocks.push(...tiedTeams);
          lockedWildcards += tiedTeams.length;
          i = j;
        } else if (tiedTeams.length > remainingSpots && remainingSpots > 0) {
          // More tied teams than remaining spots - these are wildcard eligible
          wildcardEligible.push(...tiedTeams);
          break; // Stop here, we found the tied teams competing for the last spot(s)
        } else {
          // No more spots available
          break;
        }
      }
    }
    
    console.log('🏆 Tournament Locks:', tournamentLocks.map(w => `${w.name} (${w.points}pts, ${w.goalDifferential}GD)`));
    console.log('🎯 Wildcard Eligible:', wildcardEligible.map(s => `${s.name} (${s.points}pts, ${s.goalDifferential}GD)`));
    console.log('📊 All Second Place Teams:', allSecondPlace.map(s => `${s.name} (${s.points}pts, ${s.goalDifferential}GD)`));

    // Get all other teams (teams that are neither tournament locks nor wildcard eligible)
    const tournamentLockIds = tournamentLocks.map(t => t.id);
    const wildcardEligibleIds = wildcardEligible.map(t => t.id);
    
    const others = teams.filter(team => {
      const isLock = tournamentLockIds.includes(team.id);
      const isEligible = wildcardEligibleIds.includes(team.id);
      const hasPlayed = team.games_played > 0;
      // Exclude tournament locks and wildcard eligible teams
      return !isLock && !isEligible && hasPlayed;
    }).map(team => {
      // Calculate team stats for display
      const teamGames = games.filter(g => 
        (g.home_team_id === team.id || g.away_team_id === team.id) && 
        g.status === 'completed'
      );
      
      let points = 0, goalsFor = 0, goalsAgainst = 0;
      teamGames.forEach(game => {
        if (game.home_team_id === team.id) {
          goalsFor += game.home_score || 0;
          goalsAgainst += game.away_score || 0;
          if (game.home_score > game.away_score) points += 3;
          else if (game.home_score === game.away_score) points += 1;
        } else {
          goalsFor += game.away_score || 0;
          goalsAgainst += game.home_score || 0;
          if (game.away_score > game.home_score) points += 3;
          else if (game.away_score === game.home_score) points += 1;
        }
      });

      return {
        ...team,
        points,
        goalsFor,
        goalsAgainst,
        goalDifferential: goalsFor - goalsAgainst,
        gamesPlayed: teamGames.length
      };
    }).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifferential !== a.goalDifferential) return b.goalDifferential - a.goalDifferential;
      return a.name.localeCompare(b.name);
    });
    
    console.log('🗂️ All Others:', others.map(t => `${t.name} (ID:${t.id})`));

    setTournamentLocks(tournamentLocks);
    setWildcardEligible(wildcardEligible);
    setAllOthers(others);
  };

  const handleDragStart = (e, team) => {
    setDraggedTeam(team);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, slotIndex) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDraggingOver(slotIndex);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(null);
  };

  const handleDrop = (e, slotIndex) => {
    e.preventDefault();
    setIsDraggingOver(null);
    
    if (!draggedTeam) return;

    const newBracketSlots = [...bracketSlots];
    
    // Check if team is already in bracket
    const existingIndex = bracketSlots.findIndex(team => team?.id === draggedTeam.id);
    if (existingIndex !== -1) {
      // Swap positions if already in bracket
      const temp = newBracketSlots[slotIndex];
      newBracketSlots[slotIndex] = draggedTeam;
      newBracketSlots[existingIndex] = temp;
    } else {
      // Add to bracket
      newBracketSlots[slotIndex] = draggedTeam;
    }
    
    setBracketSlots(newBracketSlots);
    setDraggedTeam(null);
  };

  const removeFromBracket = (slotIndex) => {
    const newBracketSlots = [...bracketSlots];
    newBracketSlots[slotIndex] = null;
    setBracketSlots(newBracketSlots);
  };

  const resetBracket = () => {
    // Reset to tournament locks only
    if (tournamentLocks.length > 0) {
      const recommendedBracket = Array(8).fill(null);
      // Fill in the tournament locks in their seed positions
      tournamentLocks.forEach((team, index) => {
        if (index < 8) {
          recommendedBracket[index] = team;
        }
      });
      setBracketSlots(recommendedBracket);
      if (wildcardEligible.length > 0) {
        setSuccess(`Bracket reset to ${tournamentLocks.length} tournament locks. Select wildcard team(s) to complete bracket.`);
      } else {
        setSuccess('Bracket reset to tournament locks');
      }
    }
  };

  const saveBracket = async () => {
    // Validate bracket
    const filledSlots = bracketSlots.filter(team => team !== null);
    if (filledSlots.length !== 8) {
      setError(`Please fill all 8 bracket positions. Currently ${filledSlots.length}/8 filled.`);
      return;
    }

    // Check for duplicates
    const teamIds = filledSlots.map(team => team.id);
    const uniqueIds = new Set(teamIds);
    if (uniqueIds.size !== 8) {
      setError('Each team can only appear once in the bracket');
      return;
    }

    // Save the bracket and generate tournament
    await onSaveBracket(bracketSlots);
  };

  const TeamCard = ({ team, isDraggable = true }) => (
    <div
      draggable={isDraggable}
      onDragStart={(e) => handleDragStart(e, team)}
      style={{
        padding: '0.5rem 0.75rem',
        backgroundColor: '#e2e8f0',
        borderRadius: '6px',
        cursor: isDraggable ? 'grab' : 'default',
        fontSize: '0.875rem',
        fontWeight: '500',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        border: '2px solid transparent',
        transition: 'all 0.2s',
        opacity: bracketSlots.some(slot => slot?.id === team.id) ? 0.6 : 1
      }}
      onMouseEnter={(e) => {
        if (isDraggable) e.currentTarget.style.backgroundColor = '#cbd5e1';
      }}
      onMouseLeave={(e) => {
        if (isDraggable) e.currentTarget.style.backgroundColor = '#e2e8f0';
      }}
    >
      <span>{team.name}</span>
      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
        {team.points}pts | {team.goalDifferential > 0 ? '+' : ''}{team.goalDifferential}GD
      </span>
    </div>
  );

  const BracketSlot = ({ index, team }) => (
    <div
      onDragOver={(e) => handleDragOver(e, index)}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, index)}
      style={{
        border: '2px dashed #94a3b8',
        borderRadius: '8px',
        padding: team ? '0' : '1rem',
        minHeight: '50px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDraggingOver === index ? '#f0f9ff' : team ? '#f8fafc' : '#ffffff',
        transition: 'all 0.2s',
        position: 'relative'
      }}
    >
      {team ? (
        <div style={{ width: '100%', position: 'relative' }}>
          <TeamCard team={team} isDraggable={false} />
          <button
            onClick={() => removeFromBracket(index)}
            style={{
              position: 'absolute',
              top: '50%',
              right: '8px',
              transform: 'translateY(-50%)',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '2px 6px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              opacity: 0.8,
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
          >
            ×
          </button>
        </div>
      ) : (
        <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
          Seed #{index + 1} - Drag team here
        </span>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: '2rem', padding: '1rem' }}>
      {/* Left side - Available Teams */}
      <div style={{ flex: '0 0 40%' }}>
        {/* Tournament Locks */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            backgroundColor: '#0078d7',
            color: 'white',
            padding: '0.75rem',
            borderRadius: '8px 8px 0 0',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Trophy className="w-4 h-4" />
            Tournament Locks ({tournamentLocks.length})
          </div>
          <div style={{
            backgroundColor: '#f8fafc',
            border: '2px solid #0078d7',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            padding: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}>
            {tournamentLocks.map(team => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        </div>

        {/* Wildcard Eligible */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            backgroundColor: '#0891b2',
            color: 'white',
            padding: '0.75rem',
            borderRadius: '8px 8px 0 0',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Target className="w-4 h-4" />
            Wildcard Eligible
          </div>
          <div style={{
            backgroundColor: '#f8fafc',
            border: '2px solid #0891b2',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            padding: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}>
            {wildcardEligible.map(team => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        </div>

        {/* All Others */}
        {allOthers.length > 0 && (
          <div>
            <div style={{
              backgroundColor: '#64748b',
              color: 'white',
              padding: '0.75rem',
              borderRadius: '8px 8px 0 0',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <Users className="w-4 h-4" />
              All Others
            </div>
            <div style={{
              backgroundColor: '#f8fafc',
              border: '2px solid #64748b',
              borderTop: 'none',
              borderRadius: '0 0 8px 8px',
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              {allOthers.map(team => (
                <TeamCard key={team.id} team={team} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right side - Bracket */}
      <div style={{ flex: '1' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1e293b' }}>
            Playoff Bracket
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={resetBracket}
              className="btn"
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                backgroundColor: '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <Shuffle className="w-4 h-4" />
              Reset to Recommended
            </button>
            <button
              onClick={saveBracket}
              className="btn"
              disabled={loading || bracketSlots.filter(team => team !== null).length !== 8}
              style={{
                padding: '0.5rem 1.5rem',
                fontSize: '0.875rem',
                backgroundColor: bracketSlots.filter(team => team !== null).length !== 8 ? '#94a3b8' : '#f97316',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                opacity: (loading || bracketSlots.filter(team => team !== null).length !== 8) ? 0.6 : 1,
                cursor: (loading || bracketSlots.filter(team => team !== null).length !== 8) ? 'not-allowed' : 'pointer'
              }}
            >
              <Save className="w-4 h-4" />
              {loading ? 'Generating...' : 
                bracketSlots.filter(team => team !== null).length !== 8 ? 
                  `Fill All Slots (${bracketSlots.filter(team => team !== null).length}/8)` : 
                  'Save & Generate Tournament'
              }
            </button>
          </div>
        </div>

        {/* Bracket visualization */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(2, 1fr)', 
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          {/* Quarterfinals */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#64748b', marginBottom: '0.25rem' }}>
              Quarterfinal 1
            </h4>
            <BracketSlot index={0} team={bracketSlots[0]} />
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>vs</div>
            <BracketSlot index={7} team={bracketSlots[7]} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#64748b', marginBottom: '0.25rem' }}>
              Quarterfinal 2
            </h4>
            <BracketSlot index={3} team={bracketSlots[3]} />
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>vs</div>
            <BracketSlot index={4} team={bracketSlots[4]} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#64748b', marginBottom: '0.25rem' }}>
              Quarterfinal 3
            </h4>
            <BracketSlot index={2} team={bracketSlots[2]} />
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>vs</div>
            <BracketSlot index={5} team={bracketSlots[5]} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#64748b', marginBottom: '0.25rem' }}>
              Quarterfinal 4
            </h4>
            <BracketSlot index={1} team={bracketSlots[1]} />
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>vs</div>
            <BracketSlot index={6} team={bracketSlots[6]} />
          </div>
        </div>

        {/* Tournament Format Explanation */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '8px',
            padding: '1rem'
          }}>
            <h4 style={{ fontSize: '1rem', fontWeight: '600', color: '#0369a1', marginBottom: '0.75rem' }}>
              How Tournament Seeding Works
            </h4>
            <div style={{ fontSize: '0.875rem', color: '#0c4a6e', lineHeight: '1.5' }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <strong>Automatic Seeding:</strong> Teams are ranked by points, then goal difference, then goals scored. 
                Pool winners get seeds 1-6, top wildcards get seeds 7-8.
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <strong>Quarterfinal Matchups:</strong> 1st vs 8th, 2nd vs 7th, 3rd vs 6th, 4th vs 5th. 
                Higher seeds get home advantage.
              </div>
              <div>
                <strong>Custom Seeding:</strong> Drag teams to override automatic rankings. 
                Useful for avoiding rematches or strategic placement.
              </div>
            </div>
          </div>
        </div>

        {/* Usage Instructions */}
        <div style={{
          backgroundColor: '#fef3c7',
          border: '1px solid #fde68a',
          borderRadius: '8px',
          padding: '1rem',
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'flex-start'
        }}>
          <AlertCircle className="w-5 h-5" style={{ color: '#f59e0b', flexShrink: 0 }} />
          <div style={{ fontSize: '0.875rem', color: '#92400e' }}>
            <strong>Bracket Builder:</strong> Tournament Locks are teams that have automatically qualified (pool winners + non-tied wildcards).
            {wildcardEligible.length > 0 ? 
              ` Wildcard Eligible teams are tied for the final spot(s). You must select which team(s) to include in the bracket.` :
              ` All 8 qualifying teams are locked in with no ties.`
            }
            {' '}All 8 slots must be filled before you can generate the tournament.
          </div>
        </div>
      </div>
    </div>
  );
};

export default BracketBuilder;