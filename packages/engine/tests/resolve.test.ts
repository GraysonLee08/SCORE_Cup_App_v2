import { describe, it, expect } from 'vitest';
import { resolveTeamRef, decideOutcome, type ResolutionContext } from '../src/resolve.js';
import type { StandingsRow } from '../src/types.js';

const row = (teamId: string, rank: number): StandingsRow => ({
  teamId, played: 3, won: 2, drawn: 0, lost: 1, goalsFor: 5, goalsAgainst: 3,
  goalDifference: 2, shutoutWins: 1, yellowCards: 0, redCards: 0, penaltyPoints: 0,
  adjustmentPoints: 0, points: 6, rank, needsManualTiebreak: false,
});

function context(overrides: Partial<ResolutionContext> = {}): ResolutionContext {
  return {
    standingsByPool: new Map(),
    outcomes: new Map(),
    poolComplete: new Set(),
    ...overrides,
  };
}

describe('resolveTeamRef', () => {
  it('passes a concrete team straight through', () => {
    const result = resolveTeamRef({ kind: 'team', teamId: 't1' }, context());
    expect(result.teamId).toBe('t1');
  });

  it('will not name a pool position until the pool has finished', () => {
    // Resolving early would show a team the next result could displace.
    const ctx = context({
      standingsByPool: new Map([['A', [row('t1', 1), row('t2', 2)]]]),
    });
    const result = resolveTeamRef({ kind: 'poolPosition', poolId: 'A', position: 1 }, ctx);

    expect(result.teamId).toBeNull();
    expect(result.label).toBe('1st in pool');
  });

  it('names the pool position once the pool is complete', () => {
    const ctx = context({
      standingsByPool: new Map([['A', [row('t1', 1), row('t2', 2)]]]),
      poolComplete: new Set(['A']),
    });

    expect(resolveTeamRef({ kind: 'poolPosition', poolId: 'A', position: 1 }, ctx).teamId)
      .toBe('t1');
    expect(resolveTeamRef({ kind: 'poolPosition', poolId: 'A', position: 2 }, ctx).teamId)
      .toBe('t2');
  });

  it('shows a placeholder for an unplayed knockout feeder', () => {
    const result = resolveTeamRef({ kind: 'fixtureWinner', fixtureId: 'sf1' }, context());
    expect(result.teamId).toBeNull();
    expect(result.label).toBe('Winner of earlier match');
  });

  it('resolves winners and losers of a played fixture', () => {
    const ctx = context({
      outcomes: new Map([['sf1', { winnerTeamId: 'tA', loserTeamId: 'tB' }]]),
    });

    expect(resolveTeamRef({ kind: 'fixtureWinner', fixtureId: 'sf1' }, ctx).teamId).toBe('tA');
    expect(resolveTeamRef({ kind: 'fixtureLoser', fixtureId: 'sf1' }, ctx).teamId).toBe('tB');
  });

  it('uses correct ordinals, including the 11th-13th exceptions', () => {
    const positions = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23];
    const labels = positions.map(
      (position) =>
        resolveTeamRef({ kind: 'poolPosition', poolId: 'A', position }, context()).label,
    );

    expect(labels).toEqual([
      '1st in pool', '2nd in pool', '3rd in pool', '4th in pool',
      '11th in pool', '12th in pool', '13th in pool',
      '21st in pool', '22nd in pool', '23rd in pool',
    ]);
  });
});

describe('decideOutcome', () => {
  const teams = { homeTeamId: 'h', awayTeamId: 'a' };

  it('picks the higher score', () => {
    expect(decideOutcome({ ...teams, homeScore: 2, awayScore: 1 }).winnerTeamId).toBe('h');
    expect(decideOutcome({ ...teams, homeScore: 0, awayScore: 3 }).winnerTeamId).toBe('a');
  });

  it('leaves a drawn pool game without a winner', () => {
    expect(decideOutcome({ ...teams, homeScore: 1, awayScore: 1 }).winnerTeamId).toBeNull();
  });

  it('uses penalties when the goals are level', () => {
    const outcome = decideOutcome({
      ...teams, homeScore: 1, awayScore: 1, homePenalties: 4, awayPenalties: 3,
    });
    expect(outcome.winnerTeamId).toBe('h');
    expect(outcome.loserTeamId).toBe('a');
  });

  it('has no winner for an unplayed game', () => {
    expect(decideOutcome({ ...teams, homeScore: null, awayScore: null }).winnerTeamId)
      .toBeNull();
  });
});
