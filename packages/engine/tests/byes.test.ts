import { describe, it, expect } from 'vitest';
import {
  bracketSlots,
  byeCount,
  generateBracketFixtures,
  nextPowerOfTwo,
  FixtureGenerationError,
} from '../src/fixtures.js';
import { resolveTeamRef, type ResolutionContext } from '../src/resolve.js';
import type { StandingsRow, TeamRef } from '../src/types.js';

/**
 * Playoffs of any size.
 *
 * The number of teams reaching the knockout is whatever the organisers decide,
 * which is usually not a power of two. The bracket is padded up and the top
 * seeds sit out the first round -- so these tests are mostly about who gets
 * the bye, and about seeds 1 and 2 not meeting before the final.
 */

const POOLS = ['A', 'B'];

function bracket(qualifiers: number, pools = POOLS, thirdPlaceGame = false) {
  return generateBracketFixtures('kb', pools, qualifiers, { thirdPlaceGame });
}

/** Which seed a ref stands for, for a 2-pool bracket with no wildcards. */
function seedOf(ref: TeamRef, pools = POOLS): number | string {
  if (ref.kind === 'poolPosition') {
    return (ref.position - 1) * pools.length + pools.indexOf(ref.poolId) + 1;
  }
  if (ref.kind === 'bestOfPosition') return `wildcard${ref.rank}`;
  if (ref.kind === 'fixtureWinner') return `winner:${ref.fixtureId}`;
  return 'other';
}

describe('bracket sizing', () => {
  it('pads up to the next power of two', () => {
    expect([2, 3, 4, 5, 6, 7, 8, 9].map(nextPowerOfTwo)).toEqual([2, 4, 4, 8, 8, 8, 8, 16]);
  });

  it('gives a bye to everyone the padding leaves without an opponent', () => {
    expect([2, 3, 4, 5, 6, 7, 8].map(byeCount)).toEqual([0, 1, 0, 3, 2, 1, 0]);
  });
});

describe('seeding', () => {
  it('keeps the top two seeds apart until the final', () => {
    // The old bracket paired 1v8, 2v7 and then those two winners, which put
    // the best two teams in the same semi-final.
    expect(bracketSlots(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(bracketSlots(4)).toEqual([1, 4, 2, 3]);
  });

  it('pairs each seed with its mirror in the first round', () => {
    const first = bracket(8).filter((f) => f.round === 'Quarter-final');
    const pairs = first.map((f) => [seedOf(f.home), seedOf(f.away)]);
    expect(pairs).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
  });

  it('ranks every pool winner above every runner-up', () => {
    const first = bracket(4);
    const opening = first.filter((f) => f.round === 'Semi-final');
    // Seeds 1 and 2 are the pool winners, 3 and 4 the runners-up.
    expect(opening.map((f) => [seedOf(f.home), seedOf(f.away)])).toEqual([
      [1, 4],
      [2, 3],
    ]);
  });
});

describe('byes', () => {
  it('sits the top seeds out of the first round', () => {
    // 6 qualifiers, bracket of 8, so seeds 1 and 2 go straight to the semis.
    const fixtures = bracket(6);
    const first = fixtures.filter((f) => f.round === 'Quarter-final');

    expect(first).toHaveLength(2);
    expect(first.map((f) => [seedOf(f.home), seedOf(f.away)])).toEqual([
      [4, 5],
      [3, 6],
    ]);

    const semis = fixtures.filter((f) => f.round === 'Semi-final');
    // Seed 1 waits for the 4v5 winner; seed 2 for the 3v6 winner.
    expect(seedOf(semis[0]!.home)).toBe(1);
    expect(semis[0]!.away.kind).toBe('fixtureWinner');
    expect(seedOf(semis[1]!.home)).toBe(2);
    expect(semis[1]!.away.kind).toBe('fixtureWinner');
  });

  it('handles a bracket that is only one game plus a bye', () => {
    const fixtures = bracket(3);
    expect(fixtures.filter((f) => f.round === 'Semi-final')).toHaveLength(1);
    const final = fixtures.find((f) => f.round === 'Final')!;
    expect(seedOf(final.home)).toBe(1);
    expect(final.away.kind).toBe('fixtureWinner');
  });

  it('plays a full bracket when the count is already a power of two', () => {
    expect(bracket(8).filter((f) => f.round === 'Quarter-final')).toHaveLength(4);
    expect(bracket(4).filter((f) => f.round === 'Semi-final')).toHaveLength(2);
    expect(bracket(2)).toHaveLength(1);
    expect(bracket(2)[0]!.round).toBe('Final');
  });

  it('never leaves a branch with nobody in it, for any size', () => {
    for (let q = 2; q <= 32; q++) {
      const fixtures = bracket(q);
      const finals = fixtures.filter((f) => f.round === 'Final');
      expect(finals).toHaveLength(1);
      // Every qualifier appears exactly once as an entrant.
      const entrants = fixtures.flatMap((f) =>
        [f.home, f.away].filter((r) => r.kind === 'poolPosition' || r.kind === 'bestOfPosition'),
      );
      expect(entrants).toHaveLength(q);
    }
  });

  it('refuses a playoff of fewer than two teams', () => {
    expect(() => bracket(1)).toThrow(FixtureGenerationError);
  });

  it('skips the third-place game when there is only one semi-final', () => {
    // With 3 qualifiers the semi-final loser is third; there is nothing to play.
    expect(bracket(3, POOLS, true).some((f) => f.round === 'Third-place game')).toBe(false);
    expect(bracket(4, POOLS, true).some((f) => f.round === 'Third-place game')).toBe(true);
  });
});

describe('wildcard places', () => {
  it('uses a wildcard when the qualifiers do not divide by the pools', () => {
    // 5 from 2 pools: top two of each, plus the better third-placed team.
    const entrants = bracket(5).flatMap((f) =>
      [f.home, f.away].filter((r) => r.kind === 'poolPosition' || r.kind === 'bestOfPosition'),
    );
    const wildcards = entrants.filter((r) => r.kind === 'bestOfPosition');
    expect(wildcards).toHaveLength(1);
    expect(wildcards[0]).toMatchObject({ position: 3, rank: 1, poolIds: POOLS });
  });

  it('takes two wildcards from four pools when six qualify', () => {
    const entrants = bracket(6, ['A', 'B', 'C', 'D']).flatMap((f) =>
      [f.home, f.away].filter((r) => r.kind === 'bestOfPosition'),
    );
    expect(entrants.map((r) => (r as { rank: number }).rank).sort()).toEqual([1, 2]);
  });

  it('picks the wildcard on record, not on pool order', () => {
    const row = (teamId: string, points: number, gd: number, gf: number): StandingsRow => ({
      teamId, played: 3, won: 0, drawn: 0, lost: 0,
      goalsFor: gf, goalsAgainst: gf - gd, goalDifference: gd,
      shutoutWins: 0, yellowCards: 0, redCards: 0, penaltyPoints: 0,
      adjustmentPoints: 0, points, rank: 3, needsManualTiebreak: false,
    });

    const ctx: ResolutionContext = {
      // Pool A's third-placed team is worse, so Pool B's must be chosen even
      // though Pool A is listed first.
      standingsByPool: new Map([
        ['A', [row('a1', 9, 5, 6), row('a2', 6, 2, 4), row('aThird', 3, -2, 2)]],
        ['B', [row('b1', 9, 6, 7), row('b2', 6, 1, 3), row('bThird', 4, 0, 5)]],
      ]),
      outcomes: new Map(),
      poolComplete: new Set(['A', 'B']),
    };

    const ref: TeamRef = { kind: 'bestOfPosition', poolIds: ['A', 'B'], position: 3, rank: 1 };
    expect(resolveTeamRef(ref, ctx).teamId).toBe('bThird');
  });

  it('names the place rather than a team while a pool is still playing', () => {
    const ctx: ResolutionContext = {
      standingsByPool: new Map(),
      outcomes: new Map(),
      poolComplete: new Set(['A']),
    };
    const resolved = resolveTeamRef(
      { kind: 'bestOfPosition', poolIds: ['A', 'B'], position: 3, rank: 1 },
      ctx,
    );
    expect(resolved.teamId).toBeNull();
    expect(resolved.label).toBe('Best 3rd place');
  });
});
