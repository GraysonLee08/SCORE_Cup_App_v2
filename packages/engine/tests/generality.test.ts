import { describe, it, expect } from 'vitest';
import { generatePoolFixtures, generateBracketFixtures } from '../src/fixtures.js';
import { scheduleFixtures } from '../src/scheduling.js';
import { SCORE_CUP_2026_GROUP_TIMING } from '../src/presets.js';
import type { Fixture, TeamId } from '../src/types.js';

/**
 * Nothing in the engine may be tuned to a particular tournament. These tests
 * sweep the whole space rather than checking the shapes we happen to expect
 * this year, so a format we have not thought of still works.
 */

const teams = (n: number): TeamId[] =>
  Array.from({ length: n }, (_, i) => `t${i + 1}`);

const fields = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `f${i + 1}`);

function inspect(fixtures: Fixture[]) {
  const counts = new Map<TeamId, number>();
  const pairs = new Set<string>();
  let selfPlay = 0;

  for (const f of fixtures) {
    if (f.home.kind !== 'team' || f.away.kind !== 'team') continue;
    if (f.home.teamId === f.away.teamId) selfPlay++;
    pairs.add([f.home.teamId, f.away.teamId].sort().join('|'));
    counts.set(f.home.teamId, (counts.get(f.home.teamId) ?? 0) + 1);
    counts.set(f.away.teamId, (counts.get(f.away.teamId) ?? 0) + 1);
  }

  return { counts, uniquePairs: pairs.size, selfPlay };
}

describe('pool generation is general across every team count', () => {
  it('handles 2 through 30 teams at every valid games-per-team', () => {
    const generated: string[] = [];
    const rejected: string[] = [];

    for (let teamCount = 2; teamCount <= 30; teamCount++) {
      for (let gamesPerTeam = 1; gamesPerTeam <= teamCount - 1; gamesPerTeam++) {
        const label = `${teamCount} teams x ${gamesPerTeam} games`;
        const parityImpossible = (teamCount * gamesPerTeam) % 2 !== 0;

        if (parityImpossible) {
          expect(
            () => generatePoolFixtures('s', [{ id: 'A', teamIds: teams(teamCount) }], gamesPerTeam),
            `${label} should be rejected`,
          ).toThrow();
          rejected.push(label);
          continue;
        }

        const fixtures = generatePoolFixtures(
          's',
          [{ id: 'A', teamIds: teams(teamCount) }],
          gamesPerTeam,
        );
        const { counts, uniquePairs, selfPlay } = inspect(fixtures);

        expect(fixtures, `${label}: fixture count`).toHaveLength(
          (teamCount * gamesPerTeam) / 2,
        );
        expect(selfPlay, `${label}: no team plays itself`).toBe(0);
        expect(uniquePairs, `${label}: no repeated pairings`).toBe(fixtures.length);
        expect(counts.size, `${label}: every team appears`).toBe(teamCount);
        for (const [teamId, count] of counts) {
          expect(count, `${label}: ${teamId} plays exactly ${gamesPerTeam}`).toBe(gamesPerTeam);
        }

        generated.push(label);
      }
    }

    // Sanity: the sweep actually exercised both branches meaningfully.
    expect(generated.length).toBeGreaterThan(200);
    expect(rejected.length).toBeGreaterThan(50);
  });

  it('rejects only when the maths makes it impossible, never arbitrarily', () => {
    // Every rejection must be explained by odd parity or too few opponents.
    for (let teamCount = 2; teamCount <= 20; teamCount++) {
      for (let gamesPerTeam = 1; gamesPerTeam <= teamCount + 2; gamesPerTeam++) {
        const tooManyOpponents = gamesPerTeam > teamCount - 1;
        const parityImpossible = (teamCount * gamesPerTeam) % 2 !== 0;
        const shouldThrow = tooManyOpponents || parityImpossible;

        let threw = false;
        try {
          generatePoolFixtures('s', [{ id: 'A', teamIds: teams(teamCount) }], gamesPerTeam);
        } catch {
          threw = true;
        }

        expect(threw, `${teamCount} teams x ${gamesPerTeam} games`).toBe(shouldThrow);
      }
    }
  });

  it('handles any number of pools of any size', () => {
    const shapes = [
      [4, 4],
      [5, 5],
      [6, 4, 4],
      [3, 3, 3, 3],
      [10],
      [8, 8, 8, 8, 8],
    ];

    for (const shape of shapes) {
      const pools = shape.map((size, i) => ({
        id: `P${i}`,
        teamIds: teams(size).map((t) => `p${i}-${t}`),
      }));

      const fixtures = generatePoolFixtures('s', pools, 2);
      const expected = shape.reduce((sum, size) => sum + (size * 2) / 2, 0);
      expect(fixtures, `pools of ${shape.join('+')}`).toHaveLength(expected);

      for (let i = 0; i < shape.length; i++) {
        const poolFixtures = fixtures.filter((f) => f.poolId === `P${i}`);
        expect(poolFixtures).toHaveLength(shape[i]!);
      }
    }
  });
});

describe('bracket generation is general across every valid size', () => {
  it('builds a bracket for any number of qualifiers, not just powers of two', () => {
    for (let qualifiers = 2; qualifiers <= 32; qualifiers++) {
      const poolIds = ['P0', 'P1', 'P2', 'P3'];
      const fixtures = generateBracketFixtures('ko', poolIds, qualifiers);

      // A single-elimination knockout of N teams always takes N-1 games to
      // leave one standing, byes or not.
      expect(fixtures, `playoff of ${qualifiers}`).toHaveLength(qualifiers - 1);
    }
  });
});

describe('scheduling is general across field counts', () => {
  it('schedules any team count on any field count without clashes', () => {
    for (const teamCount of [4, 7, 10, 11, 16, 23]) {
      const gamesPerTeam = teamCount % 2 === 0 ? 3 : 4;
      const fixtures = generatePoolFixtures(
        's',
        [{ id: 'A', teamIds: teams(teamCount) }],
        gamesPerTeam,
      );

      for (const fieldCount of [1, 2, 3, 4, 6]) {
        const result = scheduleFixtures({
          fixtures,
          fields: fields(fieldCount),
          timing: SCORE_CUP_2026_GROUP_TIMING,
          minRestMinutes: 10,
        });

        const label = `${teamCount} teams on ${fieldCount} fields`;
        expect(result.scheduled, `${label}: all scheduled`).toHaveLength(fixtures.length);

        const used = new Set<string>();
        for (const f of result.scheduled) {
          const slotKey = `${f.fieldId}@${f.kickoffOffsetMinutes}`;
          expect(used.has(slotKey), `${label}: ${slotKey} double-booked`).toBe(false);
          used.add(slotKey);
        }
      }
    }
  });
});
