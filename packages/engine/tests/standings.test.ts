import { describe, it, expect } from 'vitest';
import { computeStandings, type StandingsInput } from '../src/standings.js';
import {
  SCORE_CUP_2026_SCORING,
  SCORE_CUP_2026_PENALTY_POINTS,
  SCORE_CUP_2026_TIEBREAKERS,
} from '../src/presets.js';
import type { Card, Result } from '../src/types.js';

function result(
  id: string,
  home: string,
  homeScore: number,
  awayScore: number,
  away: string,
): Result {
  return { fixtureId: id, homeTeamId: home, homeScore, awayTeamId: away, awayScore };
}

function standings(
  teamIds: string[],
  results: Result[],
  overrides: Partial<StandingsInput> = {},
) {
  return computeStandings({
    teamIds,
    results,
    scoring: SCORE_CUP_2026_SCORING,
    penaltyPoints: SCORE_CUP_2026_PENALTY_POINTS,
    tiebreakers: SCORE_CUP_2026_TIEBREAKERS,
    ...overrides,
  });
}

const row = (table: ReturnType<typeof standings>, teamId: string) => {
  const found = table.find((r) => r.teamId === teamId);
  if (!found) throw new Error(`no row for ${teamId}`);
  return found;
};

describe('computeStandings — scoring', () => {
  it('awards 3 for a win, 1 for a draw, 0 for a loss', () => {
    const table = standings(
      ['a', 'b', 'c'],
      [result('f1', 'a', 2, 1, 'b'), result('f2', 'b', 1, 1, 'c')],
    );

    // 'a' won 2-1, conceding one, so the shutout bonus does not apply.
    expect(row(table, 'a').points).toBe(3);
    expect(row(table, 'b').points).toBe(1);
    expect(row(table, 'c').points).toBe(1);
  });

  it('adds the shutout bonus when a team wins without conceding', () => {
    const table = standings(['a', 'b'], [result('f1', 'a', 2, 0, 'b')]);

    expect(row(table, 'a').shutoutWins).toBe(1);
    expect(row(table, 'a').points).toBe(4); // 3 for the win + 1 shutout bonus
    expect(row(table, 'b').points).toBe(0);
  });

  it('does NOT award a shutout bonus for a 0-0 draw', () => {
    const table = standings(['a', 'b'], [result('f1', 'a', 0, 0, 'b')]);

    expect(row(table, 'a').shutoutWins).toBe(0);
    expect(row(table, 'b').shutoutWins).toBe(0);
    expect(row(table, 'a').points).toBe(1);
    expect(row(table, 'b').points).toBe(1);
  });

  it('tracks goals for, against and difference', () => {
    const table = standings(
      ['a', 'b'],
      [result('f1', 'a', 3, 1, 'b'), result('f2', 'b', 2, 0, 'a')],
    );

    const a = row(table, 'a');
    expect(a.goalsFor).toBe(3);
    expect(a.goalsAgainst).toBe(3);
    expect(a.goalDifference).toBe(0);
    expect(a.played).toBe(2);
  });
});

describe('computeStandings — tiebreakers', () => {
  it('separates level teams on head-to-head first', () => {
    // a and b both beat c; a beat b, so a ranks above b despite identical records.
    const table = standings(
      ['a', 'b', 'c'],
      [
        result('f1', 'a', 1, 0, 'c'),
        result('f2', 'b', 1, 0, 'c'),
        result('f3', 'a', 1, 0, 'b'),
      ],
    );

    expect(table[0]?.teamId).toBe('a');
    expect(row(table, 'a').rank).toBeLessThan(row(table, 'b').rank);
  });

  it('falls through to goals for when two tied teams never met', () => {
    // A 3-game pool means tied teams may not have played each other. b scored
    // more overall, so b wins the tiebreak on goals for.
    const table = standings(
      ['a', 'b', 'c', 'd'],
      [result('f1', 'a', 1, 0, 'c'), result('f2', 'b', 3, 0, 'd')],
    );

    expect(row(table, 'b').rank).toBeLessThan(row(table, 'a').rank);
  });

  it('uses fewest cards when goals cannot separate teams', () => {
    const results = [result('f1', 'a', 1, 0, 'c'), result('f2', 'b', 1, 0, 'd')];
    const cards: Card[] = [
      { fixtureId: 'f1', teamId: 'a', type: 'yellow' },
      { fixtureId: 'f1', teamId: 'a', type: 'yellow' },
    ];

    const table = standings(['a', 'b', 'c', 'd'], results, { cards });

    expect(row(table, 'a').penaltyPoints).toBe(2);
    expect(row(table, 'b').penaltyPoints).toBe(0);
    expect(row(table, 'b').rank).toBeLessThan(row(table, 'a').rank);
  });

  it('flags teams that no computable tiebreaker can separate', () => {
    // Identical records, never met, no cards -- 2026 resolves this with
    // rock-paper-scissors, so the app must surface it rather than pick.
    const table = standings(
      ['a', 'b', 'c', 'd'],
      [result('f1', 'a', 1, 0, 'c'), result('f2', 'b', 1, 0, 'd')],
    );

    expect(row(table, 'a').needsManualTiebreak).toBe(true);
    expect(row(table, 'b').needsManualTiebreak).toBe(true);
    expect(row(table, 'a').rank).toBe(row(table, 'b').rank);
  });
});

describe('computeStandings — adjustments', () => {
  it('folds an admin points deduction into the table', () => {
    const table = standings(['a', 'b'], [result('f1', 'a', 2, 0, 'b')], {
      adjustments: [{ teamId: 'a', points: -3, reason: 'Forfeit' }],
    });

    const a = row(table, 'a');
    expect(a.adjustmentPoints).toBe(-3);
    expect(a.points).toBe(1); // 4 earned - 3 deducted
    // The deduction is visible rather than hidden inside the earned total.
    expect(a.won).toBe(1);
  });
});

describe('computeStandings — teams with no games', () => {
  it('includes teams that have not played yet', () => {
    const table = standings(['a', 'b', 'c'], []);

    expect(table).toHaveLength(3);
    for (const r of table) {
      expect(r.played).toBe(0);
      expect(r.points).toBe(0);
    }
  });
});
