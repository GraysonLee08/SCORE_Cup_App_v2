import { describe, it, expect } from 'vitest';
import {
  buildEventSchedule,
  buildSchedule,
  type DivisionPlan,
} from '../src/services/scheduleBuilder.js';

/**
 * The wait between the last pool game and the first playoff game.
 *
 * It is the tightest transition of the day -- teams have to learn they
 * qualified, walk to another pitch and restart -- and it used to be a
 * hardcoded 15 with no way to change it. These pin that it is now per
 * division, and that the old default still applies when nothing is set.
 */

const TIMING = { halfMinutes: 14, halftimeMinutes: 2, changeoverMinutes: 5 };

function plan(gapBeforeMinutes?: number): DivisionPlan {
  return {
    divisionId: 'd1',
    divisionName: 'Competitive',
    eventId: 'e1',
    eventDate: '2026-08-29',
    startTime: '09:00',
    endTime: '18:00',
    timezone: 'America/Chicago',
    minRestMinutes: 0,
    sequencing: 'separate_fields',
    startOffsetMinutes: null,
    fieldIds: ['f1', 'f2'],
    stages: [
      {
        id: 'pool',
        kind: 'pool',
        sequence: 1,
        config: {
          kind: 'pool',
          poolCount: 1,
          gamesPerTeam: 3,
          scoring: { win: 3, draw: 1, loss: 0, shutoutWinBonus: 1 },
          penaltyPoints: { yellow: 1, red: 1 },
          tiebreakers: ['goalsFor'],
          timing: TIMING,
        },
        pools: [{ id: 'p1', teamIds: ['t1', 't2', 't3', 't4'] }],
      },
      {
        id: 'bracket',
        kind: 'bracket',
        sequence: 2,
        config: {
          kind: 'bracket',
          qualifiers: 2,
          thirdPlaceGame: false,
          drawResolution: 'penalties',
          timing: TIMING,
          ...(gapBeforeMinutes === undefined ? {} : { gapBeforeMinutes }),
        },
        pools: [],
      },
    ],
  };
}

/** Six round-robin games over two pitches: waves at 0, 35 and 70. */
const POOL_END = 70 + TIMING.halfMinutes * 2 + TIMING.halftimeMinutes;

describe('the wait before the playoffs', () => {
  it('starts the bracket the configured number of minutes after pool play', () => {
    const build = buildSchedule(plan(20));
    const first = build.scheduled.find((f) => f.stageId === 'bracket');

    expect(POOL_END).toBe(100);
    expect(first?.kickoffOffsetMinutes).toBe(POOL_END + 20);
  });

  it('falls back to 15 minutes when a division has not set one', () => {
    const build = buildSchedule(plan());
    const first = build.scheduled.find((f) => f.stageId === 'bracket');

    expect(first?.kickoffOffsetMinutes).toBe(POOL_END + 15);
  });

  /**
   * Asking for no gap at all does not get one. The pitch is still occupied for
   * its changeover after the last pool game, and the setting must not be able
   * to book a playoff onto grass that has not been cleared -- a field hosts one
   * game at a time whatever the timings say.
   */
  it('never starts the playoffs before the pitch is clear, however small the gap', () => {
    const build = buildSchedule(plan(0));
    const first = build.scheduled.find((f) => f.stageId === 'bracket');

    const pitchClearAt = POOL_END + TIMING.changeoverMinutes;
    expect(first!.kickoffOffsetMinutes).toBeGreaterThanOrEqual(pitchClearAt);
  });

  /**
   * The gap is dead time on the pitches, so it has to land in the day's total
   * -- otherwise "check it fits" reports a day shorter than the one that gets
   * played. Both figures here clear the changeover, so the difference is the
   * gap itself rather than the scheduler waiting for a pitch.
   */
  it('counts the wait towards the length of the day', () => {
    const short = buildSchedule(plan(20)).totalMinutes;
    const long = buildSchedule(plan(65)).totalMinutes;

    expect(long - short).toBe(45);
  });
});

/**
 * A division whose start time has already been published to teams -- 2026's
 * Community division kicks off at 1:30 PM -- is a fixed point the schedule has
 * to honour, not something derived from how the morning went.
 */
describe('per-division start times', () => {
  /** Two divisions on the same two pitches, so they genuinely compete for grass. */
  function twoDivisions(secondStartOffset: number | null): DivisionPlan[] {
    const first: DivisionPlan = {
      ...plan(20),
      divisionId: 'd1',
      divisionName: 'Competitive',
      sequencing: 'sequential',
    };
    const second: DivisionPlan = {
      ...plan(15),
      divisionId: 'd2',
      divisionName: 'Community',
      sequencing: 'sequential',
      startOffsetMinutes: secondStartOffset,
      stages: plan(15).stages.map((s) => ({ ...s, id: `d2-${s.id}` })),
    };
    return [first, second];
  }

  it('starts a division exactly when it was told to', () => {
    // 270 minutes past a 9:00 start is 1:30 PM, and the morning is long done.
    const event = buildEventSchedule(twoDivisions(270));
    const community = event.perDivision.find((d) => d.plan.divisionId === 'd2')!;

    const firstKickoff = Math.min(
      ...community.build.scheduled.map((f) => f.kickoffOffsetMinutes),
    );
    expect(firstKickoff).toBe(270);
  });

  /**
   * The important one. A pinned start is a floor, not a licence -- if the
   * pitches are still occupied the games get fitted in after them, exactly as
   * they were before start times existed.
   */
  it('never double-books a pitch, even when the start times overlap', () => {
    const event = buildEventSchedule(twoDivisions(0));

    const occupied = new Map<string, number[]>();
    for (const division of event.perDivision) {
      for (const f of division.build.scheduled) {
        const key = `${f.fieldId}@${f.kickoffOffsetMinutes}`;
        occupied.set(key, [...(occupied.get(key) ?? []), 1]);
      }
    }

    const doubleBooked = [...occupied.entries()].filter(([, games]) => games.length > 1);
    expect(doubleBooked).toEqual([]);
  });

  it('says so when a pinned division had to wait for a pitch', () => {
    const event = buildEventSchedule(twoDivisions(0));

    expect(event.notes.join(' ')).toMatch(/Community was set to start at .* no pitch is free/);
  });

  it('says nothing when the start time is honoured exactly', () => {
    const event = buildEventSchedule(twoDivisions(270));

    expect(event.notes.join(' ')).not.toMatch(/no pitch is free/);
  });
});
