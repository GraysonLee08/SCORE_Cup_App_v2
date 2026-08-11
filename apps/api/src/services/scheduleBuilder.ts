import {
  checkFeasibility,
  generateBracketFixtures,
  generatePoolFixtures,
  scheduleFixtures,
  slotMinutes,
  type Fixture,
  type FeasibilityReport,
  type ScheduledFixture,
} from '@scores-cup/engine';
import { withTransaction, type Db } from '../db.js';
import { HttpError } from '../auth/middleware.js';
import { stageConfigSchema, type StageConfigInput } from './stageConfig.js';

interface DivisionPlan {
  divisionId: string;
  eventId: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  minRestMinutes: number;
  fieldIds: string[];
  stages: StagePlan[];
}

interface StagePlan {
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
    event_id: string;
    event_date: string;
    start_time: string;
    end_time: string;
    timezone: string;
    min_rest_minutes: number;
  }>(
    `SELECT d.event_id, e.event_date, e.start_time, e.end_time, e.timezone, e.min_rest_minutes
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
    eventId: division.event_id,
    eventDate: division.event_date,
    startTime: division.start_time,
    endTime: division.end_time,
    timezone: division.timezone,
    minRestMinutes: division.min_rest_minutes,
    fieldIds: fieldRows.map((f) => f.id),
    stages,
  };
}

/** Minutes between the event's start and end time. */
function windowMinutes(startTime: string, endTime: string): number {
  const toMinutes = (t: string) => {
    const [h = '0', m = '0'] = t.split(':');
    return Number(h) * 60 + Number(m);
  };
  return toMinutes(endTime) - toMinutes(startTime);
}

function buildFixtures(stage: StagePlan, previousPoolIds: string[]): Fixture[] {
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

  return generateBracketFixtures(stage.id, previousPoolIds, stage.config.advancePerPool, {
    thirdPlaceGame: stage.config.thirdPlaceGame,
  });
}

export interface BuildResult {
  scheduled: ScheduledFixture[];
  totalMinutes: number;
  perStage: { stageId: string; fixtures: number; waves: number; endMinutes: number }[];
}

/**
 * Run every stage through the engine, in sequence, sharing one clock. A
 * bracket cannot start before its pools have finished, so each stage begins
 * after the previous one ends plus a short gap for standings and seeding.
 */
export function buildSchedule(plan: DivisionPlan, gapBetweenStagesMinutes = 15): BuildResult {
  const scheduled: ScheduledFixture[] = [];
  const perStage: BuildResult['perStage'] = [];
  let cursor = 0;
  let previousPoolIds: string[] = [];

  for (const stage of plan.stages) {
    const fixtures = buildFixtures(stage, previousPoolIds);

    const result = scheduleFixtures({
      fixtures,
      fields: plan.fieldIds,
      timing: stage.config.timing,
      minRestMinutes: plan.minRestMinutes,
      startOffsetMinutes: cursor,
    });

    scheduled.push(...result.scheduled);
    perStage.push({
      stageId: stage.id,
      fixtures: fixtures.length,
      waves: result.waves,
      endMinutes: result.endMinutes,
    });

    cursor = result.endMinutes + gapBetweenStagesMinutes;
    if (stage.kind === 'pool') previousPoolIds = stage.pools.map((p) => p.id);
  }

  return {
    scheduled,
    totalMinutes: Math.max(0, cursor - gapBetweenStagesMinutes),
    perStage,
  };
}

export interface DivisionFeasibility extends FeasibilityReport {
  divisionId: string;
  perStage: BuildResult['perStage'];
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
