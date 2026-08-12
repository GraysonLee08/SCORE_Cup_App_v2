import type { FieldId, FixtureId, TeamId } from './types.js';

/**
 * Conflict detection for a hand-edited schedule.
 *
 * The generator produces a valid schedule, but an admin moving games around on
 * the day can break it in four ways. This finds all of them, and is pure so
 * the same check runs in the browser as the admin drags a game and on the
 * server before the change is saved.
 */

export interface ScheduleEntry {
  id: FixtureId;
  label?: string;
  fieldId: FieldId | null;
  /** Absolute minutes on the day. Null means not yet placed. */
  startMinutes: number | null;
  /** Playing time, excluding any changeover after it. */
  durationMinutes: number;
  homeTeamId: TeamId | null;
  awayTeamId: TeamId | null;
  /** Fixtures that must finish before this one starts (knockout feeders). */
  dependsOn?: FixtureId[];
}

export type ConflictKind =
  | 'field_double_booked'
  | 'team_double_booked'
  | 'insufficient_rest'
  | 'out_of_order'
  | 'unscheduled';

export interface ScheduleConflict {
  kind: ConflictKind;
  /** Written for an admin to act on, not for a log. */
  message: string;
  fixtureIds: FixtureId[];
  /** A rest gap that is merely tight is a warning; a clash is an error. */
  severity: 'error' | 'warning';
}

export interface ConflictOptions {
  minRestMinutes: number;
  /** Look up a display name, so messages name teams rather than ids. */
  teamName?: (teamId: TeamId) => string;
  fieldName?: (fieldId: FieldId) => string;
}

function overlaps(a: ScheduleEntry, b: ScheduleEntry): boolean {
  if (a.startMinutes === null || b.startMinutes === null) return false;
  const aEnd = a.startMinutes + a.durationMinutes;
  const bEnd = b.startMinutes + b.durationMinutes;
  return a.startMinutes < bEnd && b.startMinutes < aEnd;
}

function sharedTeams(a: ScheduleEntry, b: ScheduleEntry): TeamId[] {
  const first = [a.homeTeamId, a.awayTeamId].filter((t): t is TeamId => t !== null);
  const second = new Set([b.homeTeamId, b.awayTeamId].filter((t): t is TeamId => t !== null));
  return first.filter((t) => second.has(t));
}

export function detectConflicts(
  entries: ScheduleEntry[],
  options: ConflictOptions,
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const team = (id: TeamId) => options.teamName?.(id) ?? id;
  const field = (id: FieldId) => options.fieldName?.(id) ?? id;
  const describe = (e: ScheduleEntry) => e.label ?? e.id;

  for (const entry of entries) {
    if (entry.startMinutes === null || entry.fieldId === null) {
      conflicts.push({
        kind: 'unscheduled',
        severity: 'warning',
        message: `${describe(entry)} has no field or kickoff time.`,
        fixtureIds: [entry.id],
      });
    }
  }

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]!;
      const b = entries[j]!;
      if (!overlaps(a, b)) continue;

      if (a.fieldId !== null && a.fieldId === b.fieldId) {
        conflicts.push({
          kind: 'field_double_booked',
          severity: 'error',
          message: `${field(a.fieldId)} has two games at once: ${describe(a)} and ${describe(b)}.`,
          fixtureIds: [a.id, b.id],
        });
      }

      for (const teamId of sharedTeams(a, b)) {
        conflicts.push({
          kind: 'team_double_booked',
          severity: 'error',
          message: `${team(teamId)} is in two games at once: ${describe(a)} and ${describe(b)}.`,
          fixtureIds: [a.id, b.id],
        });
      }
    }
  }

  // Rest between a team's consecutive games.
  const byTeam = new Map<TeamId, ScheduleEntry[]>();
  for (const entry of entries) {
    if (entry.startMinutes === null) continue;
    for (const teamId of [entry.homeTeamId, entry.awayTeamId]) {
      if (!teamId) continue;
      const list = byTeam.get(teamId) ?? [];
      list.push(entry);
      byTeam.set(teamId, list);
    }
  }

  for (const [teamId, played] of byTeam) {
    const sorted = [...played].sort((a, b) => a.startMinutes! - b.startMinutes!);
    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i - 1]!;
      const current = sorted[i]!;
      const gap = current.startMinutes! - (previous.startMinutes! + previous.durationMinutes);
      // A negative gap is an overlap, already reported above as a clash.
      if (gap >= 0 && gap < options.minRestMinutes) {
        conflicts.push({
          kind: 'insufficient_rest',
          severity: 'warning',
          message:
            `${team(teamId)} gets only ${gap} min between ${describe(previous)} and ` +
            `${describe(current)} (${options.minRestMinutes} min required).`,
          fixtureIds: [previous.id, current.id],
        });
      }
    }
  }

  // Knockout games cannot precede the games that feed them.
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const entry of entries) {
    for (const dependencyId of entry.dependsOn ?? []) {
      const dependency = byId.get(dependencyId);
      if (!dependency || dependency.startMinutes === null || entry.startMinutes === null) {
        continue;
      }
      const dependencyEnd = dependency.startMinutes + dependency.durationMinutes;
      if (entry.startMinutes < dependencyEnd) {
        conflicts.push({
          kind: 'out_of_order',
          severity: 'error',
          message: `${describe(entry)} starts before ${describe(dependency)} finishes, but depends on its result.`,
          fixtureIds: [entry.id, dependency.id],
        });
      }
    }
  }

  return dedupe(conflicts);
}

/** The same clash can be found from either side of a pair. */
function dedupe(conflicts: ScheduleConflict[]): ScheduleConflict[] {
  const seen = new Set<string>();
  return conflicts.filter((c) => {
    const key = `${c.kind}:${[...c.fixtureIds].sort().join(',')}:${c.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
