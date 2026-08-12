import { describe, it, expect } from 'vitest';
import { generatePoolFixtures } from '../src/fixtures.js';
import { scheduleFixtures } from '../src/scheduling.js';
import { SCORE_CUP_2026_GROUP_TIMING } from '../src/presets.js';
import type { TeamId } from '../src/types.js';

const teams = (n: number): TeamId[] => Array.from({ length: n }, (_, i) => `t${i + 1}`);
const fields = (n: number) => Array.from({ length: n }, (_, i) => `f${i + 1}`);

function schedule(teamCount: number, gamesPerTeam: number, fieldCount: number, spreadTeams: boolean) {
  const fixtures = generatePoolFixtures(
    'pool',
    [{ id: 'A', teamIds: teams(teamCount) }],
    gamesPerTeam,
  );
  return scheduleFixtures({
    fixtures,
    fields: fields(fieldCount),
    timing: SCORE_CUP_2026_GROUP_TIMING,
    // 5 minutes is the changeover gap, so back-to-back play is *permitted*.
    // The point of spreading is to avoid it anyway, where possible.
    minRestMinutes: 5,
    spreadTeams,
  });
}

describe('preferring rested teams', () => {
  it('reduces back-to-back games for a 10-team pool', () => {
    const plain = schedule(10, 3, 4, false);
    const spread = schedule(10, 3, 4, true);

    expect(spread.quality.backToBackCount).toBeLessThan(plain.quality.backToBackCount);
  });

  it('costs no extra time', () => {
    const plain = schedule(10, 3, 4, false);
    const spread = schedule(10, 3, 4, true);

    // The whole point: kinder to teams, same finish.
    expect(spread.endMinutes).toBeLessThanOrEqual(plain.endMinutes);
    expect(spread.waves).toBeLessThanOrEqual(plain.waves);
  });

  it('gives teams more rest on average', () => {
    const plain = schedule(10, 3, 4, false);
    const spread = schedule(10, 3, 4, true);

    expect(spread.quality.averageRestMinutes).toBeGreaterThanOrEqual(
      plain.quality.averageRestMinutes,
    );
  });

  it('still schedules every game', () => {
    for (const [teamCount, games, fieldCount] of [
      [8, 3, 2],
      [10, 3, 4],
      [11, 4, 4],
      [16, 3, 3],
    ] as const) {
      const result = schedule(teamCount, games, fieldCount, true);
      expect(result.scheduled).toHaveLength((teamCount * games) / 2);
    }
  });

  it('never breaks the hard rest floor while spreading', () => {
    const fixtures = generatePoolFixtures('pool', [{ id: 'A', teamIds: teams(10) }], 3);
    const result = scheduleFixtures({
      fixtures,
      fields: fields(4),
      timing: SCORE_CUP_2026_GROUP_TIMING,
      minRestMinutes: 20,
      spreadTeams: true,
    });
    expect(result.quality.minRestObserved).toBeGreaterThanOrEqual(20);
  });

  it('reports zero rest statistics when nobody plays twice', () => {
    const fixtures = generatePoolFixtures('pool', [{ id: 'A', teamIds: teams(4) }], 1);
    const result = scheduleFixtures({
      fixtures,
      fields: fields(2),
      timing: SCORE_CUP_2026_GROUP_TIMING,
      minRestMinutes: 5,
    });
    expect(result.quality.backToBackCount).toBe(0);
    expect(result.quality.averageRestMinutes).toBe(0);
  });

  it('is deterministic — the same input gives the same schedule', () => {
    const a = schedule(10, 3, 4, true);
    const b = schedule(10, 3, 4, true);
    expect(a.scheduled.map((f) => `${f.id}@${f.fieldId}:${f.kickoffOffsetMinutes}`)).toEqual(
      b.scheduled.map((f) => `${f.id}@${f.fieldId}:${f.kickoffOffsetMinutes}`),
    );
  });
});
