import { describe, it, expect } from 'vitest';
import { generatePoolFixtures } from '../src/fixtures.js';
import {
  alternatingReservations,
  reservationsFrom,
  scheduleFixtures,
  SchedulingError,
} from '../src/scheduling.js';
import { SCORE_CUP_2026_GROUP_TIMING } from '../src/presets.js';
import { slotMinutes } from '../src/types.js';
import type { ScheduledFixture, TeamId } from '../src/types.js';

/**
 * Two tournaments, one venue.
 *
 * A field is owned by the venue, not by a division, so anything that schedules
 * one division at a time has to be told what the other one already took. These
 * tests are the guard on that: the failure they describe -- both divisions
 * kicking off on Field 1 at 9:00 -- is unplayable, not merely untidy.
 */

const TIMING = SCORE_CUP_2026_GROUP_TIMING;
const SLOT = slotMinutes(TIMING);

const teams = (n: number, prefix: string): TeamId[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

function fixturesFor(prefix: string, teamCount: number, gamesPerTeam = 3) {
  return generatePoolFixtures(
    `${prefix}-pool`,
    [{ id: `${prefix}-A`, teamIds: teams(teamCount, prefix) }],
    gamesPerTeam,
  );
}

/** Every (field, slot) pair used, to catch two games in one place at once. */
function occupancy(scheduled: ScheduledFixture[]): string[] {
  return scheduled.map((f) => `${f.fieldId}@${f.kickoffOffsetMinutes}`);
}

describe('two divisions sharing a venue', () => {
  const fields = ['f1', 'f2', 'f3', 'f4'];

  it('double-books every field when each division is scheduled blind', () => {
    // This is the bug, written down. Both divisions independently believe they
    // own the venue at 9:00.
    const a = scheduleFixtures({ fixtures: fixturesFor('a', 8), fields, timing: TIMING, minRestMinutes: 5 });
    const b = scheduleFixtures({ fixtures: fixturesFor('b', 8), fields, timing: TIMING, minRestMinutes: 5 });

    const clashes = occupancy(a.scheduled).filter((slot) => occupancy(b.scheduled).includes(slot));
    expect(clashes.length).toBeGreaterThan(0);
  });

  it('never reuses a field another division has taken', () => {
    const a = scheduleFixtures({ fixtures: fixturesFor('a', 8), fields, timing: TIMING, minRestMinutes: 5 });
    const b = scheduleFixtures({
      fixtures: fixturesFor('b', 8),
      fields,
      timing: TIMING,
      minRestMinutes: 5,
      busy: reservationsFrom(a.scheduled, TIMING),
    });

    const shared = occupancy(a.scheduled).filter((slot) => occupancy(b.scheduled).includes(slot));
    expect(shared).toEqual([]);
  });

  it('still schedules every game of both divisions', () => {
    const a = scheduleFixtures({ fixtures: fixturesFor('a', 8), fields, timing: TIMING, minRestMinutes: 5 });
    const b = scheduleFixtures({
      fixtures: fixturesFor('b', 12),
      fields,
      timing: TIMING,
      minRestMinutes: 5,
      busy: reservationsFrom(a.scheduled, TIMING),
    });

    expect(a.scheduled).toHaveLength(12);
    expect(b.scheduled).toHaveLength(18);
  });

  it('leaves a division alone when the other one is on different fields', () => {
    const a = scheduleFixtures({
      fixtures: fixturesFor('a', 8),
      fields: ['f1', 'f2'],
      timing: TIMING,
      minRestMinutes: 5,
    });
    const b = scheduleFixtures({
      fixtures: fixturesFor('b', 8),
      fields: ['f3', 'f4'],
      timing: TIMING,
      minRestMinutes: 5,
      busy: reservationsFrom(a.scheduled, TIMING),
    });

    // Partitioned fields cannot interact, so knowing about each other changes
    // nothing: both still start at the first slot.
    expect(a.startMinutes).toBe(0);
    expect(b.scheduled[0]!.kickoffOffsetMinutes).toBe(0);
  });

  it('takes turns when slots are held back for the other division', () => {
    const shared = ['f1', 'f2'];
    const horizon = 8 * 60;

    const first = scheduleFixtures({
      fixtures: fixturesFor('a', 8),
      fields: shared,
      timing: TIMING,
      minRestMinutes: 5,
      busy: alternatingReservations({ fields: shared, timing: TIMING, turn: 0, turns: 2, horizonMinutes: horizon }),
    });
    const second = scheduleFixtures({
      fixtures: fixturesFor('b', 8),
      fields: shared,
      timing: TIMING,
      minRestMinutes: 5,
      busy: [
        ...alternatingReservations({ fields: shared, timing: TIMING, turn: 1, turns: 2, horizonMinutes: horizon }),
        ...reservationsFrom(first.scheduled, TIMING),
      ],
    });

    // Even slots belong to the first division, odd slots to the second.
    for (const f of first.scheduled) expect((f.kickoffOffsetMinutes / SLOT) % 2).toBe(0);
    for (const f of second.scheduled) expect((f.kickoffOffsetMinutes / SLOT) % 2).toBe(1);
    expect(occupancy(first.scheduled).filter((s) => occupancy(second.scheduled).includes(s))).toEqual([]);
  });

  it('gives teams more rest when divisions alternate than when they split fields', () => {
    // Taking turns means a team physically cannot be called back out in the
    // next slot -- their division is not on the pitch then.
    const split = scheduleFixtures({
      fixtures: fixturesFor('a', 8),
      fields: ['f1', 'f2'],
      timing: TIMING,
      minRestMinutes: 5,
    });
    const alternating = scheduleFixtures({
      fixtures: fixturesFor('a', 8),
      fields: ['f1', 'f2', 'f3', 'f4'],
      timing: TIMING,
      minRestMinutes: 5,
      busy: alternatingReservations({
        fields: ['f1', 'f2', 'f3', 'f4'],
        timing: TIMING,
        turn: 0,
        turns: 2,
        horizonMinutes: 8 * 60,
      }),
    });

    expect(alternating.quality.backToBackCount).toBeLessThanOrEqual(split.quality.backToBackCount);
    expect(alternating.endMinutes).toBeLessThanOrEqual(split.endMinutes);
  });

  it('says so plainly when the venue is full for the rest of the day', () => {
    const blocked = Array.from({ length: 200 }, (_, i) => ({
      fieldId: 'f1',
      startMinutes: i * SLOT,
      endMinutes: (i + 1) * SLOT,
    }));

    expect(() =>
      scheduleFixtures({
        fixtures: fixturesFor('a', 8),
        fields: ['f1'],
        timing: TIMING,
        minRestMinutes: 5,
        busy: blocked,
      }),
    ).toThrow(SchedulingError);
  });
});
