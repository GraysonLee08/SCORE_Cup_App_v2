import { describe, it, expect } from 'vitest';
import {
  generatePoolFixtures,
  generateBracketFixtures,
  FixtureGenerationError,
} from '../src/fixtures.js';
import type { Fixture, TeamId } from '../src/types.js';

const teams = (n: number): TeamId[] =>
  Array.from({ length: n }, (_, i) => `t${i + 1}`);

function gamesPerTeamCount(fixtures: Fixture[]): Map<TeamId, number> {
  const counts = new Map<TeamId, number>();
  for (const f of fixtures) {
    for (const side of [f.home, f.away]) {
      if (side.kind !== 'team') continue;
      counts.set(side.teamId, (counts.get(side.teamId) ?? 0) + 1);
    }
  }
  return counts;
}

function pairKey(f: Fixture): string {
  if (f.home.kind !== 'team' || f.away.kind !== 'team') return f.id;
  return [f.home.teamId, f.away.teamId].sort().join('|');
}

describe('generatePoolFixtures', () => {
  it('gives every team exactly 3 games in a 10-team pool (the 2026 format)', () => {
    const fixtures = generatePoolFixtures('stage1', [{ id: 'A', teamIds: teams(10) }], 3);

    // 10 teams x 3 games / 2 = 15 fixtures.
    expect(fixtures).toHaveLength(15);

    const counts = gamesPerTeamCount(fixtures);
    expect(counts.size).toBe(10);
    for (const [teamId, count] of counts) {
      expect(count, `${teamId} should play exactly 3`).toBe(3);
    }
  });

  it('never schedules a team against itself or repeats a pairing', () => {
    const fixtures = generatePoolFixtures('stage1', [{ id: 'A', teamIds: teams(10) }], 3);

    for (const f of fixtures) {
      expect(f.home).not.toEqual(f.away);
    }

    const keys = fixtures.map(pairKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('produces a full round robin when gamesPerTeam is one less than the pool size', () => {
    const fixtures = generatePoolFixtures('stage1', [{ id: 'A', teamIds: teams(5) }], 4);

    // C(5,2) = 10
    expect(fixtures).toHaveLength(10);
    for (const count of gamesPerTeamCount(fixtures).values()) {
      expect(count).toBe(4);
    }
  });

  it('rejects an impossible schedule rather than producing a lopsided one', () => {
    // 5 teams x 3 games = 15, which is not divisible by 2. No such schedule exists.
    expect(() =>
      generatePoolFixtures('stage1', [{ id: 'A', teamIds: teams(5) }], 3),
    ).toThrow(FixtureGenerationError);
  });

  it('explains why an odd pairing count is impossible', () => {
    expect(() =>
      generatePoolFixtures('stage1', [{ id: 'A', teamIds: teams(5) }], 3),
    ).toThrow(/not a whole number/);
  });

  it('rejects asking for more games than there are opponents', () => {
    expect(() =>
      generatePoolFixtures('stage1', [{ id: 'A', teamIds: teams(4) }], 4),
    ).toThrow(/at most 3 games/);
  });

  it('supports an odd number of teams when games per team is even', () => {
    // 11 teams x 4 games = 44 game-slots = 22 fixtures. Valid.
    const fixtures = generatePoolFixtures('stage1', [{ id: 'A', teamIds: teams(11) }], 4);

    expect(fixtures).toHaveLength(22);

    const counts = gamesPerTeamCount(fixtures);
    expect(counts.size).toBe(11);
    for (const [teamId, count] of counts) {
      expect(count, `${teamId} should play exactly 4`).toBe(4);
    }

    const keys = fixtures.map(pairKey);
    expect(new Set(keys).size, 'no repeated pairings').toBe(keys.length);
  });

  it('refuses an odd team count with an odd games-per-team', () => {
    // 11 teams x 3 games = 33 game-slots. Every fixture consumes 2, so no
    // schedule exists -- byes cannot fix this, since a bye is not a game.
    expect(() =>
      generatePoolFixtures('stage1', [{ id: 'A', teamIds: teams(11) }], 3),
    ).toThrow(/not a whole number/);
  });

  it('handles odd team counts at every even game count', () => {
    for (const gamesPerTeam of [2, 4, 6, 8, 10]) {
      const fixtures = generatePoolFixtures('stage1', [{ id: 'A', teamIds: teams(11) }], gamesPerTeam);
      expect(fixtures).toHaveLength((11 * gamesPerTeam) / 2);
      for (const count of gamesPerTeamCount(fixtures).values()) {
        expect(count).toBe(gamesPerTeam);
      }
    }
  });

  it('handles multiple pools independently', () => {
    const fixtures = generatePoolFixtures(
      'stage1',
      [
        { id: 'A', teamIds: teams(4) },
        { id: 'B', teamIds: ['x1', 'x2', 'x3', 'x4'] },
      ],
      2,
    );

    expect(fixtures).toHaveLength(8);
    expect(fixtures.filter((f) => f.poolId === 'A')).toHaveLength(4);
    expect(fixtures.filter((f) => f.poolId === 'B')).toHaveLength(4);
  });
});

describe('generateBracketFixtures', () => {
  it('builds semis and a final for a playoff of 4', () => {
    const fixtures = generateBracketFixtures('ko', ['A', 'B'], 4);

    expect(fixtures).toHaveLength(3);
    expect(fixtures.filter((f) => f.round === 'Semi-final')).toHaveLength(2);
    expect(fixtures.filter((f) => f.round === 'Final')).toHaveLength(1);
  });

  it('keeps teams from the same pool apart in the first round', () => {
    const fixtures = generateBracketFixtures('ko', ['A', 'B'], 4);
    const semis = fixtures.filter((f) => f.round === 'Semi-final');

    for (const semi of semis) {
      if (semi.home.kind !== 'poolPosition' || semi.away.kind !== 'poolPosition') {
        throw new Error('expected pool-position references in round 1');
      }
      expect(semi.home.poolId).not.toBe(semi.away.poolId);
    }
  });

  it('references earlier fixtures rather than teams in later rounds', () => {
    const fixtures = generateBracketFixtures('ko', ['A', 'B'], 4);
    const final = fixtures.find((f) => f.round === 'Final');

    expect(final?.home.kind).toBe('fixtureWinner');
    expect(final?.away.kind).toBe('fixtureWinner');
  });

  it('adds a third-place game between the losing semi-finalists', () => {
    const fixtures = generateBracketFixtures('ko', ['A', 'B'], 4, { thirdPlaceGame: true });
    const third = fixtures.find((f) => f.round === 'Third-place game');

    expect(third).toBeDefined();
    expect(third?.home.kind).toBe('fixtureLoser');
    expect(third?.away.kind).toBe('fixtureLoser');
  });

  it('pads a playoff that is not a power of two, rather than refusing it', () => {
    // 6 qualifiers play a bracket of 8: two byes for the top seeds, so two
    // first-round games instead of four, and 5 games in total.
    const fixtures = generateBracketFixtures('ko', ['A', 'B', 'C'], 6);

    expect(fixtures.filter((f) => f.round === 'Quarter-final')).toHaveLength(2);
    expect(fixtures.filter((f) => f.round === 'Semi-final')).toHaveLength(2);
    expect(fixtures).toHaveLength(5);
  });
});
