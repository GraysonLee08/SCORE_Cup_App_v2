import { describe, it, expect } from 'vitest';
import { bracketRounds } from '../src/components/admin/setup/PlayoffsWidget.js';

/**
 * How many games each knockout round holds.
 *
 * This drives the "time slots needed" figure, which is what a day is planned
 * around -- minimising slots is the real constraint at a venue with four
 * pitches and a sunset. A number that is quietly wrong here is worse than no
 * number at all, so the shapes are pinned against the 2026 schedule.
 */
describe('bracketRounds', () => {
  it('matches the 2026 Community bracket — 11 teams, byes for the top 3', () => {
    // 6v11, 7v10, 8v9 · then the four quarters · then two semis · then a final.
    expect(bracketRounds(11)).toEqual([3, 4, 2, 1]);
  });

  it('matches the 2026 Competitive bracket — 4 teams, two semis and a final', () => {
    expect(bracketRounds(4)).toEqual([2, 1]);
  });

  it('is a straight final when only two qualify', () => {
    expect(bracketRounds(2)).toEqual([1]);
  });

  /**
   * A single-elimination bracket always takes one game per team eliminated,
   * whatever the byes do to the first round.
   */
  it('always totals one game fewer than the teams that qualified', () => {
    for (let qualifiers = 2; qualifiers <= 64; qualifiers++) {
      const total = bracketRounds(qualifiers).reduce((n, games) => n + games, 0);
      expect(total, `${qualifiers} qualifiers`).toBe(qualifiers - 1);
    }
  });

  /**
   * Only the first round is irregular, because that is where the byes land.
   * From the second onwards the bracket is full, so each round is exactly half
   * the one before it and the last is the final.
   */
  it('halves the field every round after the second', () => {
    for (let qualifiers = 2; qualifiers <= 64; qualifiers++) {
      const rounds = bracketRounds(qualifiers);

      for (let i = 2; i < rounds.length; i++) {
        expect(rounds[i], `${qualifiers} qualifiers, round ${i + 1}`).toBe(rounds[i - 1]! / 2);
      }
      expect(rounds[rounds.length - 1], `${qualifiers} qualifiers`).toBe(1);
    }
  });

  it('never reports a negative or fractional round', () => {
    for (let qualifiers = 2; qualifiers <= 64; qualifiers++) {
      for (const games of bracketRounds(qualifiers)) {
        expect(Number.isInteger(games)).toBe(true);
        expect(games).toBeGreaterThan(0);
      }
    }
  });
});
