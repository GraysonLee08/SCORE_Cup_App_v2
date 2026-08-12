import type {
  FieldId,
  Fixture,
  FixtureId,
  MatchTiming,
  ScheduledFixture,
  TeamId,
} from './types.js';
import { slotMinutes } from './types.js';

export class SchedulingError extends Error {
  override name = 'SchedulingError';
}

/**
 * A field already spoken for, between two offsets on the day.
 *
 * A field is a physical thing owned by the venue, not by a tournament. When two
 * divisions run at once they compete for the same grass, so whoever schedules
 * second has to be told what the first one took.
 */
export interface FieldReservation {
  fieldId: FieldId;
  startMinutes: number;
  endMinutes: number;
}

export interface ScheduleInput {
  fixtures: Fixture[];
  /** Fields this stage may use. A division pinned to 2 of 4 fields passes only those. */
  fields: FieldId[];
  timing: MatchTiming;
  /** Minimum gap between the end of a team's game and the start of their next. */
  minRestMinutes: number;
  /** Minutes from the event start before this stage may begin. */
  startOffsetMinutes?: number;
  /**
   * Prefer the teams who have rested longest when filling each slot.
   *
   * `minRestMinutes` is a hard floor and an expensive one -- raising it above
   * the changeover gap forces every team to sit out a whole round and can add
   * over an hour. This is the soft version: among the fixtures that are legal
   * right now, play the teams who have been waiting longest, so back-to-back
   * games are avoided when there is any alternative and permitted when there
   * is not. Costs nothing in wall-clock time.
   *
   * Defaults to true; set false to reproduce a strictly in-order schedule.
   */
  spreadTeams?: boolean;
  /**
   * Fields already committed to something else -- another division's games,
   * or slots deliberately held back so two tournaments can take turns.
   *
   * Without this, scheduling each division on its own puts both of them on
   * Field 1 at 9:00, which is not a schedule anyone can play.
   */
  busy?: FieldReservation[];
}

export interface ScheduleQuality {
  /** Teams sent straight back out in the next slot. Lower is kinder. */
  backToBackCount: number;
  /** Shortest actual gap any team got, in minutes. */
  minRestObserved: number;
  /** Mean gap between a team's games. */
  averageRestMinutes: number;
}

export interface ScheduleResult {
  scheduled: ScheduledFixture[];
  /** Time slots that actually hosted games. */
  waves: number;
  /**
   * Total slots spanned, including ones left empty because every team was
   * resting. `slotsElapsed - waves` is dead time -- if that number is large,
   * the rest gap is costing more than the field count is buying.
   */
  slotsElapsed: number;
  /** Offset of the first kickoff. */
  startMinutes: number;
  /** Offset at which the last game finishes. */
  endMinutes: number;
  /** How kind the schedule is to teams, for reporting to an admin. */
  quality: ScheduleQuality;
}

/** Actual playing time, excluding the changeover gap before the next game. */
function playMinutes(timing: MatchTiming): number {
  return timing.halfMinutes * 2 + timing.halftimeMinutes;
}

/** Teams we actually know. Unresolved bracket references constrain nothing yet. */
function concreteTeams(fixture: Fixture): TeamId[] {
  const teams: TeamId[] = [];
  for (const ref of [fixture.home, fixture.away]) {
    if (ref.kind === 'team') teams.push(ref.teamId);
  }
  return teams;
}

/** Fixtures that must finish before this one can be played. */
function dependencies(fixture: Fixture): FixtureId[] {
  const deps: FixtureId[] = [];
  for (const ref of [fixture.home, fixture.away]) {
    if (ref.kind === 'fixtureWinner' || ref.kind === 'fixtureLoser') {
      deps.push(ref.fixtureId);
    }
  }
  return deps;
}

/**
 * Assign every fixture a field and a kickoff time.
 *
 * Greedy, wave by wave: at each time slot, fill the available fields with any
 * fixture whose teams are rested and whose prerequisites have finished. This
 * is deliberately simple and predictable -- an admin can override any game
 * afterwards, and a schedule a human can follow beats an optimal one they
 * cannot.
 *
 * Constraints honoured:
 *  - a team never plays two games at once
 *  - a team gets `minRestMinutes` between their games
 *  - a bracket game never precedes the games feeding it
 *  - only the given fields are used
 */
export function scheduleFixtures(input: ScheduleInput): ScheduleResult {
  if (input.fields.length === 0) {
    throw new SchedulingError('Cannot schedule with no fields available.');
  }

  const slot = slotMinutes(input.timing);
  const play = playMinutes(input.timing);
  const startMinutes = input.startOffsetMinutes ?? 0;

  const remaining = [...input.fixtures];
  const scheduled: ScheduledFixture[] = [];
  const teamFreeAt = new Map<TeamId, number>();
  const teamLastEnded = new Map<TeamId, number>();
  const fixtureEndsAt = new Map<FixtureId, number>();
  const spreadTeams = input.spreadTeams ?? true;

  /**
   * How long the fresher of the two sides has been waiting. Larger means this
   * fixture is more deserving of the slot.
   */
  const idleness = (fixture: Fixture, at: number): number => {
    const teams = concreteTeams(fixture);
    if (teams.length === 0) return Number.POSITIVE_INFINITY;
    let worst = Number.POSITIVE_INFINITY;
    for (const team of teams) {
      const lastEnd = teamLastEnded.get(team);
      // A team that has not played yet is maximally rested.
      worst = Math.min(worst, lastEnd === undefined ? Number.POSITIVE_INFINITY : at - lastEnd);
    }
    return worst;
  };

  let now = startMinutes;
  let waves = 0;
  let slotsElapsed = 0;
  let emptyWaves = 0;
  // A fixture can be blocked only by rest or by a prerequisite, both of which
  // resolve as time advances. This bound is generous but stops a genuine
  // deadlock (e.g. a bracket cycle) from looping forever.
  const emptyWaveLimit = input.fixtures.length + 10;

  const busy = input.busy ?? [];
  /** Is this field free for a whole game starting now? */
  const fieldFree = (fieldId: FieldId, at: number): boolean =>
    !busy.some(
      (r) => r.fieldId === fieldId && at < r.endMinutes && r.startMinutes < at + play,
    );

  while (remaining.length > 0) {
    const waveFixtures: Fixture[] = [];
    const teamsThisWave = new Set<TeamId>();

    // Only the fields actually free for this slot. When two divisions share a
    // venue this is what stops the second one being scheduled on top of the
    // first.
    const openFields = input.fields.filter((f) => fieldFree(f, now));

    if (openFields.length === 0) {
      emptyWaves += 1;
      slotsElapsed += 1;
      if (emptyWaves > emptyWaveLimit) {
        throw new SchedulingError(
          `Could not schedule ${remaining.length} remaining fixture(s): every field is ` +
            `taken by another division for the rest of the day.`,
        );
      }
      now += slot;
      continue;
    }

    // Rested teams first. Ties keep the original order, so the schedule stays
    // deterministic and reproducible.
    const candidates = spreadTeams
      ? [...remaining].sort((a, b) => idleness(b, now) - idleness(a, now))
      : remaining;

    for (const fixture of candidates) {
      if (waveFixtures.length >= openFields.length) break;

      const teams = concreteTeams(fixture);
      if (teams.some((t) => teamsThisWave.has(t))) continue;
      if (teams.some((t) => (teamFreeAt.get(t) ?? -Infinity) > now)) continue;

      const deps = dependencies(fixture);
      const depsReady = deps.every((id) => {
        const endsAt = fixtureEndsAt.get(id);
        return endsAt !== undefined && endsAt <= now;
      });
      if (!depsReady) continue;

      waveFixtures.push(fixture);
      for (const team of teams) teamsThisWave.add(team);
    }

    if (waveFixtures.length === 0) {
      emptyWaves += 1;
      slotsElapsed += 1;
      if (emptyWaves > emptyWaveLimit) {
        throw new SchedulingError(
          `Could not schedule ${remaining.length} remaining fixture(s). ` +
            `This usually means a bracket references a fixture that does not exist, ` +
            `or the rest gap (${input.minRestMinutes} min) cannot be satisfied.`,
        );
      }
      now += slot;
      continue;
    }

    emptyWaves = 0;
    waves += 1;
    slotsElapsed += 1;

    waveFixtures.forEach((fixture, index) => {
      const fieldId = openFields[index];
      if (fieldId === undefined) {
        throw new SchedulingError(`Field index ${index} out of range.`);
      }

      scheduled.push({ ...fixture, fieldId, kickoffOffsetMinutes: now });
      fixtureEndsAt.set(fixture.id, now + play);

      for (const team of concreteTeams(fixture)) {
        teamFreeAt.set(team, now + play + input.minRestMinutes);
        teamLastEnded.set(team, now + play);
      }

      const at = remaining.indexOf(fixture);
      if (at >= 0) remaining.splice(at, 1);
    });

    now += slot;
  }

  const endMinutes = scheduled.reduce(
    (latest, f) => Math.max(latest, f.kickoffOffsetMinutes + play),
    startMinutes,
  );

  return {
    scheduled,
    waves,
    slotsElapsed,
    startMinutes,
    endMinutes,
    quality: measureQuality(scheduled, play, slot),
  };
}

/**
 * Turn a finished schedule into reservations, so the next division to be
 * scheduled knows which grass is already spoken for.
 */
export function reservationsFrom(
  scheduled: ScheduledFixture[],
  timing: MatchTiming,
): FieldReservation[] {
  const play = playMinutes(timing);
  return scheduled.map((f) => ({
    fieldId: f.fieldId,
    startMinutes: f.kickoffOffsetMinutes,
    // Reserve the changeover too. A field is not ready for the next game the
    // instant the whistle goes.
    endMinutes: f.kickoffOffsetMinutes + slotMinutes(timing),
  }));
}

/**
 * Hold back every slot that does not belong to this division, so divisions
 * sharing a field take turns: Community at 9:00, Competitive at 9:35,
 * Community at 10:10.
 *
 * Expressed as reservations rather than as a special case inside the scheduler,
 * because "someone else has this field right now" is the same fact whether the
 * someone is another division's game or a turn it has not taken yet.
 */
export function alternatingReservations(input: {
  fields: FieldId[];
  timing: MatchTiming;
  /** Which turn in the rotation this division has, from 0. */
  turn: number;
  /** How many divisions are taking turns. */
  turns: number;
  /** How far ahead to reserve. */
  horizonMinutes: number;
  startOffsetMinutes?: number;
}): FieldReservation[] {
  const slot = slotMinutes(input.timing);
  const start = input.startOffsetMinutes ?? 0;
  const reservations: FieldReservation[] = [];
  if (input.turns <= 1 || slot <= 0) return reservations;

  const slots = Math.ceil(input.horizonMinutes / slot) + input.turns;
  for (let i = 0; i < slots; i++) {
    if (i % input.turns === input.turn % input.turns) continue;
    const at = start + i * slot;
    for (const fieldId of input.fields) {
      reservations.push({ fieldId, startMinutes: at, endMinutes: at + slot });
    }
  }
  return reservations;
}

export interface FeasibilityInput extends ScheduleInput {
  /** Total minutes available, e.g. 9am-3pm is 360. */
  availableMinutes: number;
}

export interface FeasibilityReport {
  fits: boolean;
  requiredMinutes: number;
  availableMinutes: number;
  /** Positive when the schedule overruns the window. */
  overByMinutes: number;
  waves: number;
  fixtureCount: number;
  fieldCount: number;
  /** Plain-language summary for the admin setup screen. */
  summary: string;
}

/**
 * Answer "does this tournament fit in the day?" before anyone commits to it.
 *
 * Pure, and cheap enough to re-run on every keystroke in the setup form, so an
 * admin can adjust slot length, fields or pool structure until it fits --
 * three weeks out rather than at 2pm on tournament day.
 */
export function checkFeasibility(input: FeasibilityInput): FeasibilityReport {
  const result = scheduleFixtures(input);
  const requiredMinutes = result.endMinutes - result.startMinutes;
  const overByMinutes = requiredMinutes - input.availableMinutes;
  const fits = overByMinutes <= 0;

  return {
    fits,
    requiredMinutes,
    availableMinutes: input.availableMinutes,
    overByMinutes: Math.max(0, overByMinutes),
    waves: result.waves,
    fixtureCount: input.fixtures.length,
    fieldCount: input.fields.length,
    summary: fits
      ? `${input.fixtures.length} games across ${input.fields.length} field(s) needs ` +
        `${formatDuration(requiredMinutes)}. You have ${formatDuration(input.availableMinutes)} — ` +
        `${formatDuration(-overByMinutes)} to spare.`
      : `${input.fixtures.length} games across ${input.fields.length} field(s) needs ` +
        `${formatDuration(requiredMinutes)}, but you only have ` +
        `${formatDuration(input.availableMinutes)} — over by ${formatDuration(overByMinutes)}.`,
  };
}

export function formatDuration(minutes: number): string {
  const abs = Math.abs(Math.round(minutes));
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h${String(mins).padStart(2, '0')}m`;
}


/**
 * Report how much rest the schedule actually gives teams, so an admin can see
 * the cost of a change rather than having to count games by hand.
 */
export function measureQuality(
  scheduled: ScheduledFixture[],
  playMinutes: number,
  slotMinutes: number,
): ScheduleQuality {
  const byTeam = new Map<TeamId, number[]>();

  for (const fixture of scheduled) {
    for (const ref of [fixture.home, fixture.away]) {
      if (ref.kind !== 'team') continue;
      const kickoffs = byTeam.get(ref.teamId) ?? [];
      kickoffs.push(fixture.kickoffOffsetMinutes);
      byTeam.set(ref.teamId, kickoffs);
    }
  }

  let backToBackCount = 0;
  let minRestObserved = Number.POSITIVE_INFINITY;
  let totalRest = 0;
  let gaps = 0;

  for (const kickoffs of byTeam.values()) {
    const sorted = [...kickoffs].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const rest = sorted[i]! - (sorted[i - 1]! + playMinutes);
      totalRest += rest;
      gaps += 1;
      minRestObserved = Math.min(minRestObserved, rest);
      // Consecutive slots: the team walks off and straight back on.
      if (sorted[i]! - sorted[i - 1]! <= slotMinutes) backToBackCount += 1;
    }
  }

  return {
    backToBackCount,
    minRestObserved: gaps === 0 ? 0 : minRestObserved,
    averageRestMinutes: gaps === 0 ? 0 : Math.round(totalRest / gaps),
  };
}
