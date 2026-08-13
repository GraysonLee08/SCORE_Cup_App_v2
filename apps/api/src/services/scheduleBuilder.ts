import {
  alternatingReservations,
  checkFeasibility,
  generateBracketFixtures,
  generatePoolFixtures,
  qualifierCount,
  reservationsFrom,
  scheduleFixtures,
  slotMinutes,
  type FieldReservation,
  type Fixture,
  type FeasibilityReport,
  type ScheduledFixture,
} from '@scores-cup/engine';
import { withTransaction, type Db } from '../db.js';
import { HttpError } from '../auth/middleware.js';
import { stageConfigSchema, type StageConfigInput } from './stageConfig.js';

/** How divisions share the venue. See migration 006. */
export type DivisionSequencing = 'separate_fields' | 'sequential' | 'alternating';

export interface DivisionPlan {
  divisionId: string;
  divisionName: string;
  eventId: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  minRestMinutes: number;
  sequencing: DivisionSequencing;
  fieldIds: string[];
  stages: StagePlan[];
}

export interface StagePlan {
  id: string;
  kind: 'pool' | 'bracket';
  sequence: number;
  config: StageConfigInput;
  pools: { id: string; teamIds: string[] }[];
}

/**
 * Load everything the engine needs for one division. Deliberately one read of
 * the whole shape rather than lazy lookups, because the engine is pure and
 * cannot fetch anything mid-calculation.
 */
export async function loadDivisionPlan(db: Db, divisionId: string): Promise<DivisionPlan> {
  const { rows: divisionRows } = await db.query<{
    name: string;
    event_id: string;
    event_date: string;
    start_time: string;
    end_time: string;
    timezone: string;
    min_rest_minutes: number;
    division_sequencing: DivisionSequencing;
  }>(
    `SELECT d.name, d.event_id, e.event_date, e.start_time, e.end_time, e.timezone,
            e.min_rest_minutes, e.division_sequencing
       FROM divisions d JOIN events e ON e.id = d.event_id
      WHERE d.id = $1`,
    [divisionId],
  );
  const division = divisionRows[0];
  if (!division) throw new HttpError(404, 'No such division.', 'not_found');

  // No explicit allocation means the division may use every field on the
  // event. That is what lets divisions share a pool competitively.
  const { rows: fieldRows } = await db.query<{ id: string }>(
    `SELECT f.id
       FROM fields f
      WHERE f.event_id = $1
        AND (NOT EXISTS (SELECT 1 FROM division_fields df WHERE df.division_id = $2)
             OR f.id IN (SELECT field_id FROM division_fields WHERE division_id = $2))
      ORDER BY f.sort_order, f.name`,
    [division.event_id, divisionId],
  );

  if (fieldRows.length === 0) {
    throw new HttpError(
      400,
      'This division has no fields available. Add fields to the event first.',
      'no_fields',
    );
  }

  const { rows: stageRows } = await db.query<{
    id: string;
    kind: 'pool' | 'bracket';
    sequence: number;
    config: unknown;
  }>(
    'SELECT id, kind, sequence, config FROM stages WHERE division_id = $1 ORDER BY sequence',
    [divisionId],
  );

  if (stageRows.length === 0) {
    throw new HttpError(400, 'This division has no stages yet.', 'no_stages');
  }

  const stages: StagePlan[] = [];
  for (const stage of stageRows) {
    const parsed = stageConfigSchema.safeParse(stage.config);
    if (!parsed.success) {
      throw new HttpError(
        400,
        `Stage ${stage.sequence} has invalid settings: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
        'invalid_stage_config',
      );
    }

    const { rows: poolRows } = await db.query<{ id: string; team_ids: string[] | null }>(
      `SELECT p.id, array_remove(array_agg(t.id ORDER BY t.name), NULL) AS team_ids
         FROM pools p LEFT JOIN teams t ON t.pool_id = p.id
        WHERE p.stage_id = $1
        GROUP BY p.id
        ORDER BY p.sort_order, p.name`,
      [stage.id],
    );

    stages.push({
      id: stage.id,
      kind: stage.kind,
      sequence: stage.sequence,
      config: parsed.data,
      pools: poolRows.map((p) => ({ id: p.id, teamIds: p.team_ids ?? [] })),
    });
  }

  return {
    divisionId,
    divisionName: division.name,
    eventId: division.event_id,
    eventDate: division.event_date,
    startTime: division.start_time,
    endTime: division.end_time,
    timezone: division.timezone,
    minRestMinutes: division.min_rest_minutes,
    sequencing: division.division_sequencing,
    fieldIds: fieldRows.map((f) => f.id),
    stages,
  };
}

/** Every division in an event, in the order they are listed. */
export async function loadEventPlans(db: Db, eventId: string): Promise<DivisionPlan[]> {
  const { rows } = await db.query<{ id: string }>(
    'SELECT id FROM divisions WHERE event_id = $1 ORDER BY sort_order, name',
    [eventId],
  );
  if (rows.length === 0) {
    throw new HttpError(400, 'This tournament has no divisions yet.', 'no_divisions');
  }
  return Promise.all(rows.map((d) => loadDivisionPlan(db, d.id)));
}

/**
 * Fields already committed by games that are in the database but not part of
 * this build -- i.e. every other division's fixtures.
 *
 * This is what makes generating one division at a time safe. Without it the
 * second division is scheduled as though the venue were empty.
 */
export async function reservationsFromOtherDivisions(
  db: Db,
  eventId: string,
  exceptDivisionIds: string[],
): Promise<FieldReservation[]> {
  const { rows } = await db.query<{
    field_id: string;
    offset_minutes: string;
    slot_minutes: number;
  }>(
    `SELECT f.field_id,
            EXTRACT(EPOCH FROM (f.kickoff_at - ((e.event_date + e.start_time) AT TIME ZONE e.timezone))) / 60
              AS offset_minutes,
            COALESCE(
              (s.config -> 'timing' ->> 'halfMinutes')::int * 2
                + (s.config -> 'timing' ->> 'halftimeMinutes')::int
                + (s.config -> 'timing' ->> 'changeoverMinutes')::int,
              35
            ) AS slot_minutes
       FROM fixtures f
       JOIN stages s ON s.id = f.stage_id
       JOIN divisions d ON d.id = s.division_id
       JOIN events e ON e.id = d.event_id
      WHERE d.event_id = $1
        AND NOT (d.id = ANY($2::uuid[]))
        AND f.field_id IS NOT NULL
        AND f.kickoff_at IS NOT NULL`,
    [eventId, exceptDivisionIds],
  );

  return rows.map((r) => ({
    fieldId: r.field_id,
    startMinutes: Number(r.offset_minutes),
    endMinutes: Number(r.offset_minutes) + r.slot_minutes,
  }));
}

/** Minutes between the event's start and end time. */
function windowMinutes(startTime: string, endTime: string): number {
  const toMinutes = (t: string) => {
    const [h = '0', m = '0'] = t.split(':');
    return Number(h) * 60 + Number(m);
  };
  return toMinutes(endTime) - toMinutes(startTime);
}

function buildFixtures(
  stage: StagePlan,
  previousPoolIds: string[],
  previousTeamCount: number,
  smallestPreviousPool: number,
): Fixture[] {
  if (stage.config.kind === 'pool') {
    const poolsWithTeams = stage.pools.filter((p) => p.teamIds.length > 0);
    if (poolsWithTeams.length === 0) {
      throw new HttpError(
        400,
        'No teams have been assigned to pools yet.',
        'no_teams_assigned',
      );
    }
    return generatePoolFixtures(stage.id, poolsWithTeams, stage.config.gamesPerTeam);
  }

  if (previousPoolIds.length === 0) {
    throw new HttpError(
      400,
      'A bracket stage needs a pool stage before it to seed from.',
      'no_source_pools',
    );
  }

  const qualifiers = qualifierCount(stage.config, previousPoolIds.length);

  if (qualifiers < 2) {
    throw new HttpError(
      400,
      'Set how many teams reach the playoffs before generating the schedule.',
      'no_qualifiers',
    );
  }

  if (qualifiers > previousTeamCount) {
    throw new HttpError(
      400,
      `You have ${previousTeamCount} teams but ${qualifiers} set to reach the playoffs. ` +
        `Lower the number of teams in the playoffs.`,
      'too_many_qualifiers',
    );
  }

  // Every pool has to be able to supply its share. 6 qualifiers from 2 pools
  // means 3 from each, which a pool of 2 cannot do.
  const guaranteedPerPool = Math.floor(qualifiers / previousPoolIds.length);
  if (guaranteedPerPool > smallestPreviousPool) {
    throw new HttpError(
      400,
      `${qualifiers} teams in the playoffs needs the top ${guaranteedPerPool} from every pool, ` +
        `but the smallest pool has only ${smallestPreviousPool} team(s).`,
      'pool_too_small',
    );
  }

  return generateBracketFixtures(stage.id, previousPoolIds, qualifiers, {
    thirdPlaceGame: stage.config.thirdPlaceGame,
  });
}

export interface BuildResult {
  scheduled: ScheduledFixture[];
  totalMinutes: number;
  perStage: { stageId: string; fixtures: number; waves: number; endMinutes: number }[];
  /** How kind the schedule is to teams, aggregated across stages. */
  quality: { backToBackCount: number; averageRestMinutes: number; minRestObserved: number };
}

/**
 * Run every stage through the engine, in sequence, sharing one clock. A
 * bracket cannot start before its pools have finished, so each stage begins
 * after the previous one ends plus a short gap for standings and seeding.
 */
export interface BuildOptions {
  gapBetweenStagesMinutes?: number;
  /** Fields another division has already taken, and turns held back for them. */
  busy?: FieldReservation[];
  /** Minutes into the day before this division may start at all. */
  startOffsetMinutes?: number;
}

export function buildSchedule(plan: DivisionPlan, options: BuildOptions = {}): BuildResult {
  const gapBetweenStagesMinutes = options.gapBetweenStagesMinutes ?? 15;
  const scheduled: ScheduledFixture[] = [];
  const perStage: BuildResult['perStage'] = [];
  const qualities: { backToBackCount: number; averageRestMinutes: number; minRestObserved: number }[] = [];
  // Reservations grow as we go: a later stage must avoid the fields this
  // division's own earlier stages are still using, as well as other divisions'.
  const busy: FieldReservation[] = [...(options.busy ?? [])];
  let cursor = options.startOffsetMinutes ?? 0;
  let previousPoolIds: string[] = [];
  let previousTeamCount = 0;
  let smallestPreviousPool = 0;
  let previousEnd: number | null = null;

  for (const stage of plan.stages) {
    // The gap belongs to the stage being delayed, not to the one that just
    // finished -- a division that wants 20 minutes before its playoffs is
    // describing the playoffs, and says so on that stage.
    if (previousEnd !== null) {
      cursor = previousEnd + (stage.config.gapBeforeMinutes ?? gapBetweenStagesMinutes);
    }

    const fixtures = buildFixtures(
      stage,
      previousPoolIds,
      previousTeamCount,
      smallestPreviousPool,
    );

    const result = scheduleFixtures({
      fixtures,
      fields: plan.fieldIds,
      timing: stage.config.timing,
      minRestMinutes: plan.minRestMinutes,
      startOffsetMinutes: cursor,
      busy,
    });

    busy.push(...reservationsFrom(result.scheduled, stage.config.timing));

    scheduled.push(...result.scheduled);
    qualities.push(result.quality);
    perStage.push({
      stageId: stage.id,
      fixtures: fixtures.length,
      waves: result.waves,
      endMinutes: result.endMinutes,
    });

    previousEnd = result.endMinutes;
    cursor = result.endMinutes;
    if (stage.kind === 'pool') {
      const withTeams = stage.pools.filter((p) => p.teamIds.length > 0);
      previousPoolIds = withTeams.map((p) => p.id);
      previousTeamCount = withTeams.reduce((n, p) => n + p.teamIds.length, 0);
      smallestPreviousPool = Math.min(...withTeams.map((p) => p.teamIds.length));
    }
  }

  // Pool play dominates; a knockout stage contributes few gaps, so a plain
  // sum understates nothing that matters here.
  const backToBackCount = qualities.reduce((n, q) => n + q.backToBackCount, 0);
  const withGaps = qualities.filter((q) => q.averageRestMinutes > 0);

  return {
    scheduled,
    totalMinutes: Math.max(0, cursor),
    perStage,
    quality: {
      backToBackCount,
      averageRestMinutes:
        withGaps.length === 0
          ? 0
          : Math.round(
              withGaps.reduce((n, q) => n + q.averageRestMinutes, 0) / withGaps.length,
            ),
      minRestObserved:
        withGaps.length === 0 ? 0 : Math.min(...withGaps.map((q) => q.minRestObserved)),
    },
  };
}

/** Divisions that have at least one field in common with another division. */
function sharedFieldPairs(plans: DivisionPlan[]): [DivisionPlan, DivisionPlan][] {
  const pairs: [DivisionPlan, DivisionPlan][] = [];
  for (let i = 0; i < plans.length; i++) {
    for (let j = i + 1; j < plans.length; j++) {
      const a = plans[i]!;
      const b = plans[j]!;
      if (a.fieldIds.some((f) => b.fieldIds.includes(f))) pairs.push([a, b]);
    }
  }
  return pairs;
}

export interface EventBuild {
  sequencing: DivisionSequencing;
  perDivision: { plan: DivisionPlan; build: BuildResult }[];
  /** Offset at which the last game of the day finishes. */
  endMinutes: number;
  /** Anything the admin should know about how the day was laid out. */
  notes: string[];
}

/**
 * Schedule every division in one pass, treating fields as what they are: a
 * resource owned by the venue, not by a tournament.
 *
 * Scheduling divisions independently is what put two games on Field 1 at 9:00.
 * Each division is still built by the same code as before; the difference is
 * that each one is told what the previous ones already took.
 */
export function buildEventSchedule(plans: DivisionPlan[]): EventBuild {
  const sequencing = plans[0]?.sequencing ?? 'separate_fields';
  const overlaps = sharedFieldPairs(plans);
  const notes: string[] = [];

  if (sequencing === 'separate_fields' && overlaps.length > 0) {
    const [a, b] = overlaps[0]!;
    throw new HttpError(
      400,
      `${a.divisionName} and ${b.divisionName} are set to use their own pitches, but they ` +
        `share at least one. A field can only host one game at a time. Either give each ` +
        `division its own fields under Divisions, or change how divisions share the day to ` +
        `"one after another" or "take turns".`,
      'divisions_share_fields',
    );
  }

  if (sequencing !== 'separate_fields' && overlaps.length === 0) {
    notes.push(
      'No two divisions share a pitch, so they run side by side regardless of this setting.',
    );
  }

  const window = plans[0] ? windowMinutes(plans[0].startTime, plans[0].endTime) : 480;
  const sharing = overlaps.length > 0;
  const busy: FieldReservation[] = [];
  const perDivision: EventBuild['perDivision'] = [];
  let cursor = 0;

  plans.forEach((plan, index) => {
    const options: BuildOptions = { busy: [...busy] };

    if (sharing && sequencing === 'sequential') {
      options.startOffsetMinutes = cursor;
    }

    if (sharing && sequencing === 'alternating') {
      const timing = plan.stages[0]?.config.timing;
      if (timing) {
        options.busy = [
          ...busy,
          ...alternatingReservations({
            fields: plan.fieldIds,
            timing,
            turn: index,
            turns: plans.length,
            // Generously past the end of the day, so the rotation does not run
            // out and quietly stop alternating.
            horizonMinutes: window * 2,
          }),
        ];
      }
    }

    const build = buildSchedule(plan, options);
    perDivision.push({ plan, build });

    for (const stage of plan.stages) {
      busy.push(
        ...reservationsFrom(
          build.scheduled.filter((f) => f.stageId === stage.id),
          stage.config.timing,
        ),
      );
    }

    // A short breather before the next division takes the pitches over.
    cursor = Math.max(cursor, build.totalMinutes + 10);
  });

  if (sharing && sequencing === 'alternating') {
    const slots = new Set(
      plans.map((p) => (p.stages[0] ? slotMinutes(p.stages[0].config.timing) : 0)),
    );
    if (slots.size > 1) {
      notes.push(
        'These divisions have different match lengths, so their turns will not line up ' +
          'neatly. Games still never overlap, but the grid will look ragged.',
      );
    }
  }

  return {
    sequencing,
    perDivision,
    endMinutes: perDivision.reduce((latest, d) => Math.max(latest, d.build.totalMinutes), 0),
    notes,
  };
}

export interface DivisionFeasibility extends FeasibilityReport {
  divisionId: string;
  perStage: BuildResult['perStage'];
  quality: BuildResult['quality'];
}

export function divisionFeasibility(plan: DivisionPlan): DivisionFeasibility {
  const build = buildSchedule(plan);
  const available = windowMinutes(plan.startTime, plan.endTime);

  // Re-express the whole division as one feasibility question. Stage-level
  // slot lengths differ, so we report against the combined build rather than
  // calling checkFeasibility per stage.
  const firstStage = plan.stages[0];
  const report = checkFeasibility({
    fixtures: [],
    fields: plan.fieldIds,
    timing: firstStage?.config.timing ?? {
      halfMinutes: 0,
      halftimeMinutes: 0,
      changeoverMinutes: 0,
    },
    minRestMinutes: plan.minRestMinutes,
    availableMinutes: available,
  });

  const requiredMinutes = build.totalMinutes;
  const overByMinutes = Math.max(0, requiredMinutes - available);
  const fixtureCount = build.scheduled.length;

  return {
    ...report,
    divisionId: plan.divisionId,
    fits: overByMinutes === 0,
    requiredMinutes,
    availableMinutes: available,
    overByMinutes,
    waves: build.perStage.reduce((sum, s) => sum + s.waves, 0),
    fixtureCount,
    fieldCount: plan.fieldIds.length,
    perStage: build.perStage,
    quality: build.quality,
    summary:
      overByMinutes === 0
        ? `${fixtureCount} games across ${plan.fieldIds.length} field(s) needs ` +
          `${formatMinutes(requiredMinutes)}. Your window is ${formatMinutes(available)} — ` +
          `${formatMinutes(available - requiredMinutes)} to spare.`
        : `${fixtureCount} games across ${plan.fieldIds.length} field(s) needs ` +
          `${formatMinutes(requiredMinutes)}, but your window is only ` +
          `${formatMinutes(available)} — over by ${formatMinutes(overByMinutes)}.`,
  };
}

function formatMinutes(minutes: number): string {
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}m`;
}

/**
 * Replace a division's fixtures with a freshly generated schedule.
 *
 * Refuses when any existing fixture already has a score, unless explicitly
 * forced. Regenerating mid-tournament and silently discarding results is the
 * single worst thing this endpoint could do.
 */
export async function persistSchedule(
  db: Db,
  plan: DivisionPlan,
  build: BuildResult,
  options: { force?: boolean } = {},
): Promise<{ inserted: number; replaced: number }> {
  return withTransaction(db, async (client) => {
    const { rows: existing } = await client.query<{ total: string; with_scores: string }>(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE f.home_score IS NOT NULL) AS with_scores
         FROM fixtures f JOIN stages s ON s.id = f.stage_id
        WHERE s.division_id = $1`,
      [plan.divisionId],
    );

    const withScores = Number(existing[0]?.with_scores ?? 0);
    if (withScores > 0 && !options.force) {
      throw new HttpError(
        409,
        `${withScores} game(s) already have results. Regenerating would discard them. ` +
          `Pass force to overwrite deliberately.`,
        'results_would_be_lost',
      );
    }

    await client.query(
      `DELETE FROM fixtures
        WHERE stage_id IN (SELECT id FROM stages WHERE division_id = $1)`,
      [plan.divisionId],
    );

    for (const fixture of build.scheduled) {
      await client.query(
        `INSERT INTO fixtures (stage_id, pool_id, field_id, home_ref, away_ref,
                               home_team_id, away_team_id, round, kickoff_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                 (($9::date + $10::time) AT TIME ZONE $11) + make_interval(mins => $12))`,
        [
          fixture.stageId,
          fixture.poolId ?? null,
          fixture.fieldId,
          JSON.stringify(fixture.home),
          JSON.stringify(fixture.away),
          fixture.home.kind === 'team' ? fixture.home.teamId : null,
          fixture.away.kind === 'team' ? fixture.away.teamId : null,
          fixture.round ?? null,
          plan.eventDate,
          plan.startTime,
          plan.timezone,
          fixture.kickoffOffsetMinutes,
        ],
      );
    }

    return {
      inserted: build.scheduled.length,
      replaced: Number(existing[0]?.total ?? 0),
    };
  });
}

export { slotMinutes };
