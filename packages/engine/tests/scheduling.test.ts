import { describe, it, expect } from 'vitest';
import { generatePoolFixtures, generateBracketFixtures } from '../src/fixtures.js';
import { scheduleFixtures, checkFeasibility, SchedulingError } from '../src/scheduling.js';
import { SCORE_CUP_2026_GROUP_TIMING } from '../src/presets.js';
import type { ScheduledFixture, TeamId } from '../src/types.js';

const teams = (n: number): TeamId[] =>
  Array.from({ length: n }, (_, i) => `t${i + 1}`);

const fields = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `field${i + 1}`);

/** Every (field, kickoff) pair must be unique, and no team may be in two places at once. */
function assertNoClashes(scheduled: ScheduledFixture[]): void {
  const fieldSlots = new Set<string>();
  const teamSlots = new Set<string>();

  for (const f of scheduled) {
    const fieldKey = `${f.fieldId}@${f.kickoffOffsetMinutes}`;
    expect(fieldSlots.has(fieldKey), `two games on ${fieldKey}`).toBe(false);
    fieldSlots.add(fieldKey);

    for (const ref of [f.home, f.away]) {
      if (ref.kind !== 'team') continue;
      const teamKey = `${ref.teamId}@${f.kickoffOffsetMinutes}`;
      expect(teamSlots.has(teamKey), `${ref.teamId} double-booked`).toBe(false);
      teamSlots.add(teamKey);
    }
  }
}

describe('scheduleFixtures', () => {
  it('schedules 11 teams x 4 games across 4 fields without clashes', () => {
    const fixtures = generatePoolFixtures('pool', [{ id: 'A', teamIds: teams(11) }], 4);
    const result = scheduleFixtures({
      fixtures,
      fields: fields(4),
      timing: SCORE_CUP_2026_GROUP_TIMING,
      minRestMinutes: 20,
    });

    expect(result.scheduled).toHaveLength(22);
    assertNoClashes(result.scheduled);
  });

  it('uses fewer waves when more fields are available', () => {
    const fixtures = generatePoolFixtures('pool', [{ id: 'A', teamIds: teams(11) }], 4);
    const common = { fixtures, timing: SCORE_CUP_2026_GROUP_TIMING, minRestMinutes: 0 };

    const onTwo = scheduleFixtures({ ...common, fields: fields(2) });
    const onFour = scheduleFixtures({ ...common, fields: fields(4) });

    expect(onFour.waves).toBeLessThan(onTwo.waves);
    expect(onFour.endMinutes).toBeLessThan(onTwo.endMinutes);
  });

  it('never uses a field outside the allocated set', () => {
    const fixtures = generatePoolFixtures('pool', [{ id: 'A', teamIds: teams(10) }], 3);
    const allowed = ['field3', 'field4'];
    const result = scheduleFixtures({
      fixtures,
      fields: allowed,
      timing: SCORE_CUP_2026_GROUP_TIMING,
      minRestMinutes: 15,
    });

    for (const f of result.scheduled) {
      expect(allowed).toContain(f.fieldId);
    }
  });

  it('gives every team the required rest between their games', () => {
    const minRestMinutes = 30;
    const fixtures = generatePoolFixtures('pool', [{ id: 'A', teamIds: teams(10) }], 3);
    const result = scheduleFixtures({
      fixtures,
      fields: fields(4),
      timing: SCORE_CUP_2026_GROUP_TIMING,
      minRestMinutes,
    });

    const play =
      SCORE_CUP_2026_GROUP_TIMING.halfMinutes * 2 + SCORE_CUP_2026_GROUP_TIMING.halftimeMinutes;
    const byTeam = new Map<TeamId, number[]>();

    for (const f of result.scheduled) {
      for (const ref of [f.home, f.away]) {
        if (ref.kind !== 'team') continue;
        const kickoffs = byTeam.get(ref.teamId) ?? [];
        kickoffs.push(f.kickoffOffsetMinutes);
        byTeam.set(ref.teamId, kickoffs);
      }
    }

    for (const [teamId, kickoffs] of byTeam) {
      const sorted = [...kickoffs].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        const previous = sorted[i - 1]!;
        const current = sorted[i]!;
        expect(current - (previous + play), `${teamId} rest gap`).toBeGreaterThanOrEqual(
          minRestMinutes,
        );
      }
    }
  });

  it('never schedules a bracket game before the games feeding it', () => {
    const bracket = generateBracketFixtures('ko', ['A', 'B'], 2);
    const result = scheduleFixtures({
      fixtures: bracket,
      fields: fields(4),
      timing: SCORE_CUP_2026_GROUP_TIMING,
      minRestMinutes: 0,
    });

    const kickoffById = new Map(
      result.scheduled.map((f) => [f.id, f.kickoffOffsetMinutes]),
    );

    for (const f of result.scheduled) {
      for (const ref of [f.home, f.away]) {
        if (ref.kind !== 'fixtureWinner' && ref.kind !== 'fixtureLoser') continue;
        const feederKickoff = kickoffById.get(ref.fixtureId)!;
        expect(f.kickoffOffsetMinutes).toBeGreaterThan(feederKickoff);
      }
    }
  });

  it('refuses to schedule with no fields', () => {
    expect(() =>
      scheduleFixtures({
        fixtures: [],
        fields: [],
        timing: SCORE_CUP_2026_GROUP_TIMING,
        minRestMinutes: 0,
      }),
    ).toThrow(SchedulingError);
  });
});

describe('checkFeasibility', () => {
  it('reports a comfortable fit', () => {
    const fixtures = generatePoolFixtures('pool', [{ id: 'A', teamIds: teams(11) }], 4);
    const report = checkFeasibility({
      fixtures,
      fields: fields(4),
      timing: SCORE_CUP_2026_GROUP_TIMING,
      minRestMinutes: 20,
      availableMinutes: 360, // 6 hours
    });

    expect(report.fits).toBe(true);
    expect(report.overByMinutes).toBe(0);
    expect(report.summary).toContain('to spare');
  });

  it('reports an overrun with the shortfall in the summary', () => {
    const fixtures = generatePoolFixtures('pool', [{ id: 'A', teamIds: teams(11) }], 4);
    const report = checkFeasibility({
      fixtures,
      fields: fields(2),
      timing: SCORE_CUP_2026_GROUP_TIMING,
      minRestMinutes: 20,
      availableMinutes: 240, // 4 hours
    });

    expect(report.fits).toBe(false);
    expect(report.overByMinutes).toBeGreaterThan(0);
    expect(report.summary).toContain('over by');
  });
});
