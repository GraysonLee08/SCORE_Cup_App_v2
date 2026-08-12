import { describe, it, expect } from 'vitest';
import { matchPhase, phaseLabel, isRunning } from '../src/components/spectator/clock.js';
import type { PublicFixture } from '../src/types.js';

/**
 * The spectator clock is inferred, not recorded, so these tests are mostly
 * about it refusing to invent things: no minute count for a game nobody has
 * started, no countdown measured in thousands of minutes.
 */

const KICKOFF = '2026-08-29T14:00:00.000Z';
const at = (minutesAfterKickoff: number) =>
  new Date(KICKOFF).getTime() + minutesAfterKickoff * 60_000;

function fixture(over: Partial<PublicFixture> = {}): PublicFixture {
  return {
    id: 'f1',
    round: null,
    kickoffAt: KICKOFF,
    status: 'in_progress',
    fieldName: 'Field 1',
    poolName: 'Pool A',
    stageName: 'Pool play',
    stageKind: 'pool',
    homeTeamId: 'h',
    homeTeamName: 'Home',
    awayTeamId: 'a',
    awayTeamName: 'Away',
    homeScore: 0,
    awayScore: 0,
    homePenalties: null,
    awayPenalties: null,
    homeCards: { yellow: 0, red: 0 },
    awayCards: { yellow: 0, red: 0 },
    refereeName: null,
    halfMinutes: 14,
    halftimeMinutes: 2,
    ...over,
  };
}

describe('match phase', () => {
  it('counts up through the first half', () => {
    expect(matchPhase(fixture(), at(3))).toEqual({ kind: 'first', minute: 3 });
    expect(matchPhase(fixture(), at(13.5))).toEqual({ kind: 'first', minute: 14 });
  });

  it('shows half time during the interval', () => {
    expect(matchPhase(fixture(), at(15)).kind).toBe('halftime');
  });

  it('keeps counting through the second half, ignoring the interval', () => {
    // 20 minutes of wall clock, 2 of which were half time, is minute 18.
    expect(matchPhase(fixture(), at(20))).toEqual({ kind: 'second', minute: 18 });
  });

  it('stops counting once regulation is up rather than running forever', () => {
    expect(matchPhase(fixture(), at(90))).toEqual({ kind: 'overrunning', minute: 28 });
  });

  it('never shows a minute for a game no referee has started', () => {
    // Kickoff has passed, but the game is still marked scheduled. Showing 12'
    // here would be a claim about a game that may not have kicked off.
    const phase = matchPhase(fixture({ status: 'scheduled' }), at(12));
    expect(phase.kind).toBe('awaiting');
    expect(isRunning(phase)).toBe(false);
  });

  it('counts down only when kickoff is close', () => {
    expect(phaseLabel(matchPhase(fixture({ status: 'scheduled' }), at(-20)))).toBe('in 20 min');
    // A game two days out must not read "in 2880 min".
    expect(phaseLabel(matchPhase(fixture({ status: 'scheduled' }), at(-2880)))).toBe('');
  });

  it('reports full time for a finished game whatever the clock says', () => {
    expect(matchPhase(fixture({ status: 'complete' }), at(2)).kind).toBe('final');
  });

  it('says nothing when it has nothing to go on', () => {
    expect(matchPhase(fixture({ kickoffAt: null }), at(5)).kind).toBe('unknown');
    expect(matchPhase(fixture({ halfMinutes: null }), at(5)).kind).toBe('unknown');
    expect(phaseLabel({ kind: 'unknown' })).toBe('');
  });
});
