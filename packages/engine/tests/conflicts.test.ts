import { describe, it, expect } from 'vitest';
import { detectConflicts, type ScheduleEntry } from '../src/conflicts.js';

const entry = (over: Partial<ScheduleEntry> & { id: string }): ScheduleEntry => ({
  fieldId: 'f1',
  startMinutes: 0,
  durationMinutes: 30,
  homeTeamId: 'a',
  awayTeamId: 'b',
  ...over,
});

const opts = { minRestMinutes: 5 };

describe('detectConflicts', () => {
  it('finds nothing wrong with a clean schedule', () => {
    const conflicts = detectConflicts(
      [
        entry({ id: '1', startMinutes: 0 }),
        entry({ id: '2', startMinutes: 35, homeTeamId: 'c', awayTeamId: 'd' }),
      ],
      opts,
    );
    expect(conflicts).toHaveLength(0);
  });

  it('catches two games on one field at the same time', () => {
    const conflicts = detectConflicts(
      [
        entry({ id: '1', startMinutes: 0 }),
        entry({ id: '2', startMinutes: 15, homeTeamId: 'c', awayTeamId: 'd' }),
      ],
      opts,
    );
    expect(conflicts.map((c) => c.kind)).toContain('field_double_booked');
    expect(conflicts[0]!.severity).toBe('error');
  });

  it('catches a team playing two games at once on different fields', () => {
    const conflicts = detectConflicts(
      [
        entry({ id: '1', fieldId: 'f1', startMinutes: 0 }),
        entry({ id: '2', fieldId: 'f2', startMinutes: 10, homeTeamId: 'a', awayTeamId: 'z' }),
      ],
      opts,
    );
    const team = conflicts.find((c) => c.kind === 'team_double_booked');
    expect(team).toBeDefined();
    expect(team!.severity).toBe('error');
  });

  it('names teams and fields when it can, so the message is actionable', () => {
    const conflicts = detectConflicts(
      [
        entry({ id: '1', fieldId: 'f1', startMinutes: 0, label: 'Lions v Pumas' }),
        entry({
          id: '2', fieldId: 'f2', startMinutes: 10,
          homeTeamId: 'a', awayTeamId: 'z', label: 'Lions v Hawks',
        }),
      ],
      {
        ...opts,
        teamName: (id) => (id === 'a' ? 'Lakeview Lions' : id),
        fieldName: (id) => (id === 'f1' ? 'Field 1' : id),
      },
    );
    const message = conflicts.find((c) => c.kind === 'team_double_booked')!.message;
    expect(message).toContain('Lakeview Lions');
    expect(message).toContain('Lions v Pumas');
  });

  it('warns when a team gets too little rest, without calling it a clash', () => {
    const conflicts = detectConflicts(
      [
        entry({ id: '1', startMinutes: 0 }),
        entry({ id: '2', fieldId: 'f2', startMinutes: 32 }),
      ],
      { minRestMinutes: 10 },
    );
    const rest = conflicts.find((c) => c.kind === 'insufficient_rest');
    expect(rest).toBeDefined();
    expect(rest!.severity).toBe('warning');
    expect(rest!.message).toContain('2 min');
  });

  it('accepts a gap exactly equal to the required rest', () => {
    const conflicts = detectConflicts(
      [
        entry({ id: '1', startMinutes: 0 }),
        entry({ id: '2', fieldId: 'f2', startMinutes: 40 }),
      ],
      { minRestMinutes: 10 },
    );
    expect(conflicts.filter((c) => c.kind === 'insufficient_rest')).toHaveLength(0);
  });

  it('catches a knockout game placed before the game feeding it', () => {
    const conflicts = detectConflicts(
      [
        entry({ id: 'semi', startMinutes: 60, fieldId: 'f1' }),
        entry({
          id: 'final', startMinutes: 30, fieldId: 'f2',
          homeTeamId: null, awayTeamId: null, dependsOn: ['semi'],
        }),
      ],
      opts,
    );
    const order = conflicts.find((c) => c.kind === 'out_of_order');
    expect(order).toBeDefined();
    expect(order!.severity).toBe('error');
  });

  it('accepts a knockout game placed after its feeder', () => {
    const conflicts = detectConflicts(
      [
        entry({ id: 'semi', startMinutes: 0, fieldId: 'f1' }),
        entry({
          id: 'final', startMinutes: 35, fieldId: 'f1',
          homeTeamId: null, awayTeamId: null, dependsOn: ['semi'],
        }),
      ],
      opts,
    );
    expect(conflicts.filter((c) => c.kind === 'out_of_order')).toHaveLength(0);
  });

  it('flags a game with no field or kickoff as unscheduled', () => {
    const conflicts = detectConflicts(
      [entry({ id: '1', startMinutes: null, fieldId: null })],
      opts,
    );
    expect(conflicts[0]!.kind).toBe('unscheduled');
    expect(conflicts[0]!.severity).toBe('warning');
  });

  it('reports a clash once, not once from each side', () => {
    const conflicts = detectConflicts(
      [
        entry({ id: '1', startMinutes: 0 }),
        entry({ id: '2', startMinutes: 5, homeTeamId: 'c', awayTeamId: 'd' }),
      ],
      opts,
    );
    expect(conflicts.filter((c) => c.kind === 'field_double_booked')).toHaveLength(1);
  });

  it('does not double-report an overlap as a rest problem too', () => {
    // Overlapping games are a clash; calling them a rest warning as well would
    // just be noise on top of a bigger problem.
    const conflicts = detectConflicts(
      [
        entry({ id: '1', fieldId: 'f1', startMinutes: 0 }),
        entry({ id: '2', fieldId: 'f2', startMinutes: 10 }),
      ],
      { minRestMinutes: 10 },
    );
    expect(conflicts.filter((c) => c.kind === 'insufficient_rest')).toHaveLength(0);
  });
});
