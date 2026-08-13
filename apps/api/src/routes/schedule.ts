import { Router } from 'express';
import { z } from 'zod';
import { FixtureGenerationError, SchedulingError } from '@scores-cup/engine';
import type { Db } from '../db.js';
import { recordAudit } from '../auth/audit.js';
import { HttpError, requireAuth, requireRole } from '../auth/middleware.js';
import {
  buildEventSchedule,
  buildSchedule,
  divisionFeasibility,
  loadDivisionPlan,
  loadEventPlans,
  persistSchedule,
  reservationsFromOtherDivisions,
} from '../services/scheduleBuilder.js';

/**
 * Engine errors are written for a human running a tournament, so surface them
 * verbatim rather than replacing them with a generic 500. "5 teams each playing
 * 3 games needs 7.5 fixtures" is exactly what the admin needs to read.
 */
function asHttpError(error: unknown): never {
  if (error instanceof FixtureGenerationError || error instanceof SchedulingError) {
    throw new HttpError(400, error.message, 'schedule_impossible');
  }
  throw error;
}

export function scheduleRoutes(db: Db): Router {
  const router = Router();
  const admin = [requireAuth, requireRole('admin')];

  /**
   * Does this fit in the day? Cheap enough to call on every change in the
   * setup form, so an admin discovers an overrun three weeks out rather than
   * at 2pm on tournament day.
   */
  router.get('/divisions/:divisionId/feasibility', ...admin, async (req, res) => {
    const divisionId = req.params.divisionId;
    if (!divisionId) throw new HttpError(400, 'No division specified.', 'invalid_input');

    const plan = await loadDivisionPlan(db, divisionId);
    try {
      res.json(divisionFeasibility(plan));
    } catch (error) {
      asHttpError(error);
    }
  });

  router.post('/divisions/:divisionId/generate', ...admin, async (req, res) => {
    const divisionId = req.params.divisionId;
    if (!divisionId) throw new HttpError(400, 'No division specified.', 'invalid_input');

    const parsed = z
      .object({ force: z.boolean().optional() })
      .safeParse(req.body ?? {});
    const force = parsed.success ? (parsed.data.force ?? false) : false;

    const plan = await loadDivisionPlan(db, divisionId);

    // Whatever the other divisions have already booked. Without this, building
    // one division at a time schedules it as though the venue were empty --
    // which is how two tournaments ended up on Field 1 at 9:00.
    const busy = await reservationsFromOtherDivisions(db, plan.eventId, [divisionId]);

    let build;
    try {
      build = buildSchedule(plan, {
        busy,
        // A division with its own start time keeps it however it is built, so
        // generating one division does not quietly move it to the morning.
        ...(plan.startOffsetMinutes === null
          ? {}
          : { startOffsetMinutes: plan.startOffsetMinutes }),
      });
    } catch (error) {
      asHttpError(error);
    }

    const result = await persistSchedule(db, plan, build, { force });

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'division',
      entityId: divisionId,
      action: force ? 'generate_schedule_forced' : 'generate_schedule',
      after: { inserted: result.inserted, replaced: result.replaced },
    });

    res.status(201).json({
      ...result,
      perStage: build.perStage,
      totalMinutes: build.totalMinutes,
      quality: build.quality,
    });
  });

  /**
   * Build the whole day at once.
   *
   * The only way to lay out divisions that share pitches, because the answer
   * for one depends on what the others took. Generating division by division
   * can only ever be an approximation of this.
   */
  router.post('/events/:eventId/generate', ...admin, async (req, res) => {
    const eventId = req.params.eventId;
    if (!eventId) throw new HttpError(400, 'No tournament specified.', 'invalid_input');

    const parsed = z.object({ force: z.boolean().optional() }).safeParse(req.body ?? {});
    const force = parsed.success ? (parsed.data.force ?? false) : false;

    const plans = await loadEventPlans(db, eventId);

    let event;
    try {
      event = buildEventSchedule(plans);
    } catch (error) {
      asHttpError(error);
    }

    // Persist division by division so one failure -- a division with results
    // already in it, say -- names itself rather than failing anonymously.
    const results: { divisionId: string; divisionName: string; inserted: number; replaced: number }[] = [];
    for (const { plan, build } of event.perDivision) {
      const result = await persistSchedule(db, plan, build, { force });
      results.push({
        divisionId: plan.divisionId,
        divisionName: plan.divisionName,
        ...result,
      });
    }

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'event',
      entityId: eventId,
      action: force ? 'generate_event_schedule_forced' : 'generate_event_schedule',
      after: { sequencing: event.sequencing, divisions: results },
    });

    res.status(201).json({
      sequencing: event.sequencing,
      notes: event.notes,
      endMinutes: event.endMinutes,
      divisions: event.perDivision.map(({ plan, build }, i) => ({
        divisionId: plan.divisionId,
        divisionName: plan.divisionName,
        inserted: results[i]?.inserted ?? 0,
        replaced: results[i]?.replaced ?? 0,
        totalMinutes: build.totalMinutes,
        quality: build.quality,
      })),
    });
  });

  /** Every game at the venue, whichever division it belongs to. */
  router.get('/events/:eventId/fixtures', requireAuth, async (req, res) => {
    const eventId = req.params.eventId;
    if (!eventId) throw new HttpError(400, 'No tournament specified.', 'invalid_input');

    const { rows } = await db.query(
      `SELECT f.id, f.round, f.kickoff_at AS "kickoffAt", f.status,
              f.home_score AS "homeScore", f.away_score AS "awayScore",
              fl.name AS "fieldName", fl.id AS "fieldId",
              p.name AS "poolName", s.name AS "stageName",
              d.id AS "divisionId", d.name AS "divisionName",
              home.id AS "homeTeamId", home.name AS "homeTeamName",
              away.id AS "awayTeamId", away.name AS "awayTeamName",
              f.referee_user_id AS "refereeUserId", ref.display_name AS "refereeName",
              COALESCE(
                (s.config -> 'timing' ->> 'halfMinutes')::int * 2
                  + (s.config -> 'timing' ->> 'halftimeMinutes')::int,
                30
              ) AS "durationMinutes"
         FROM fixtures f
         JOIN stages s ON s.id = f.stage_id
         JOIN divisions d ON d.id = s.division_id
         LEFT JOIN fields fl ON fl.id = f.field_id
         LEFT JOIN pools p ON p.id = f.pool_id
         LEFT JOIN teams home ON home.id = f.home_team_id
         LEFT JOIN teams away ON away.id = f.away_team_id
         LEFT JOIN users ref ON ref.id = f.referee_user_id
        WHERE d.event_id = $1
        ORDER BY f.kickoff_at, fl.sort_order, fl.name`,
      [eventId],
    );

    res.json({ fixtures: rows });
  });

  /** The grid an admin actually looks at: field by kickoff. */
  router.get('/divisions/:divisionId/fixtures', requireAuth, async (req, res) => {
    const divisionId = req.params.divisionId;
    if (!divisionId) throw new HttpError(400, 'No division specified.', 'invalid_input');

    const { rows } = await db.query(
      `SELECT f.id, f.round, f.kickoff_at AS "kickoffAt", f.status,
              f.home_score AS "homeScore", f.away_score AS "awayScore",
              f.home_penalties AS "homePenalties", f.away_penalties AS "awayPenalties",
              fl.name AS "fieldName", fl.id AS "fieldId",
              p.name AS "poolName",
              s.name AS "stageName", s.sequence AS "stageSequence",
              home.name AS "homeTeamName", away.name AS "awayTeamName",
              f.home_ref AS "homeRef", f.away_ref AS "awayRef",
              f.referee_user_id AS "refereeUserId", ref.display_name AS "refereeName"
         FROM fixtures f
         JOIN stages s ON s.id = f.stage_id
         LEFT JOIN fields fl ON fl.id = f.field_id
         LEFT JOIN pools p ON p.id = f.pool_id
         LEFT JOIN teams home ON home.id = f.home_team_id
         LEFT JOIN teams away ON away.id = f.away_team_id
         LEFT JOIN users ref ON ref.id = f.referee_user_id
        WHERE s.division_id = $1
        ORDER BY f.kickoff_at, fl.sort_order, fl.name`,
      [divisionId],
    );

    res.json({ fixtures: rows });
  });

  /** Name a referee for one match. Null clears it back to field coverage. */
  router.put('/fixtures/:fixtureId/referee', ...admin, async (req, res) => {
    const fixtureId = req.params.fixtureId;
    const parsed = z
      .object({ userId: z.string().uuid().nullable() })
      .safeParse(req.body);
    if (!fixtureId || !parsed.success) {
      throw new HttpError(400, 'A referee is required.', 'invalid_input');
    }

    if (parsed.data.userId) {
      const { rows } = await db.query<{ role: string }>(
        'SELECT role FROM users WHERE id = $1',
        [parsed.data.userId],
      );
      if (!rows[0]) throw new HttpError(404, 'No such user.', 'not_found');
      if (rows[0].role !== 'ref') {
        throw new HttpError(400, 'That person is not a referee.', 'not_a_referee');
      }
    }

    const { rowCount } = await db.query(
      'UPDATE fixtures SET referee_user_id = $1, updated_at = now() WHERE id = $2',
      [parsed.data.userId, fixtureId],
    );
    if (!rowCount) throw new HttpError(404, 'No such game.', 'not_found');

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'fixture',
      entityId: fixtureId,
      action: 'assign_referee',
      after: parsed.data,
    });

    res.status(204).end();
  });

  /**
   * Push the rest of the day back, from one round onwards.
   *
   * The only time control that belongs on the day itself. Lightning, a long
   * injury, a first round that overran -- one number, and everything after it
   * shifts by the same amount, so the gaps that were designed into the day are
   * preserved rather than re-typed game by game.
   *
   * Three things it must not do:
   *
   *  - Move a game that has already been played. Its kickoff time is a record
   *    of when it actually happened, not a plan.
   *  - Move a game that is under way. It has already started.
   *  - Stop at a division boundary. Divisions share pitches, so a delay that
   *    moved only one of them would create the exact double-booking the
   *    scheduler exists to prevent.
   *
   * Negative minutes pull the day forward again, which is how you undo this
   * when the rain stops sooner than feared.
   */
  router.post('/events/:eventId/delay', ...admin, async (req, res) => {
    const eventId = req.params.eventId;
    const parsed = z
      .object({
        /** Everything kicking off at or after this moment moves. */
        fromKickoffAt: z.string().datetime(),
        minutes: z.number().int().min(-240).max(240),
      })
      .safeParse(req.body);
    if (!eventId || !parsed.success) {
      throw new HttpError(400, 'Check the delay.', 'invalid_input');
    }
    const { fromKickoffAt, minutes } = parsed.data;

    if (minutes === 0) {
      throw new HttpError(400, 'That would not move anything.', 'no_change');
    }

    const { rows: eventRows } = await db.query<{
      start_time: string;
      end_time: string;
      event_date: string;
      timezone: string;
    }>(
      'SELECT start_time, end_time, event_date, timezone FROM events WHERE id = $1',
      [eventId],
    );
    if (!eventRows[0]) throw new HttpError(404, 'No such tournament.', 'not_found');

    // Pulling the day forward must not push a game before the tournament opens.
    // Everything downstream measures from that instant, so an earlier kickoff
    // is not a schedule, it is a negative offset.
    if (minutes < 0) {
      const { rows: earliest } = await db.query<{ too_early: string }>(
        `SELECT count(*) AS too_early
           FROM fixtures f
           JOIN stages s ON s.id = f.stage_id
           JOIN divisions d ON d.id = s.division_id
           JOIN events e ON e.id = d.event_id
          WHERE d.event_id = $1
            AND f.status = 'scheduled'
            AND f.kickoff_at >= $2
            AND f.kickoff_at + ($3 || ' minutes')::interval
                < ((e.event_date + e.start_time) AT TIME ZONE e.timezone)`,
        [eventId, fromKickoffAt, String(minutes)],
      );
      if (Number(earliest[0]?.too_early ?? 0) > 0) {
        throw new HttpError(
          400,
          `That would start games before the tournament opens at ${eventRows[0].start_time.slice(0, 5)}.`,
          'before_event_start',
        );
      }
    }

    const { rows: moved } = await db.query<{ id: string }>(
      `UPDATE fixtures f
          SET kickoff_at = f.kickoff_at + ($3 || ' minutes')::interval,
              updated_at = now()
         FROM stages s
         JOIN divisions d ON d.id = s.division_id
        WHERE s.id = f.stage_id
          AND d.event_id = $1
          AND f.kickoff_at >= $2
          AND f.kickoff_at IS NOT NULL
          AND f.status = 'scheduled'
        RETURNING f.id`,
      [eventId, fromKickoffAt, String(minutes)],
    );

    if (moved.length === 0) {
      throw new HttpError(
        400,
        'Nothing from that time onwards is still to be played.',
        'nothing_to_move',
      );
    }

    const { rows: after } = await db.query<{ last_kickoff: string | null; overruns: boolean }>(
      `SELECT max(f.kickoff_at) AS last_kickoff,
              max(f.kickoff_at) > ((e.event_date + e.end_time) AT TIME ZONE e.timezone)
                AS overruns
         FROM fixtures f
         JOIN stages s ON s.id = f.stage_id
         JOIN divisions d ON d.id = s.division_id
         JOIN events e ON e.id = d.event_id
        WHERE d.event_id = $1 AND f.kickoff_at IS NOT NULL
        GROUP BY e.event_date, e.end_time, e.timezone`,
      [eventId],
    );

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'event',
      entityId: eventId,
      action: minutes > 0 ? 'delay_schedule' : 'advance_schedule',
      after: { fromKickoffAt, minutes, moved: moved.length },
    });

    res.json({
      moved: moved.length,
      lastKickoffAt: after[0]?.last_kickoff ?? null,
      overrunsEndTime: after[0]?.overruns ?? false,
    });
  });

  /**
   * Move or re-point a single game: its field, kickoff, or either team.
   *
   * Deliberately permissive. Conflicts are surfaced to the admin rather than
   * blocked, because on the day a temporary clash is often a step on the way
   * to a fixed schedule -- refusing the first move would make the grid unusable.
   */
  router.patch('/fixtures/:fixtureId', ...admin, async (req, res) => {
    const fixtureId = req.params.fixtureId;
    const parsed = z
      .object({
        fieldId: z.string().uuid().nullable().optional(),
        kickoffAt: z.string().datetime().nullable().optional(),
        homeTeamId: z.string().uuid().nullable().optional(),
        awayTeamId: z.string().uuid().nullable().optional(),
      })
      .safeParse(req.body);

    if (!fixtureId || !parsed.success) {
      throw new HttpError(400, 'Check the values.', 'invalid_input');
    }
    const d = parsed.data;

    if (
      d.homeTeamId &&
      d.awayTeamId &&
      d.homeTeamId === d.awayTeamId
    ) {
      throw new HttpError(400, 'A team cannot play itself.', 'self_play');
    }

    const { rows: before } = await db.query(
      `SELECT field_id, kickoff_at, home_team_id, away_team_id FROM fixtures WHERE id = $1`,
      [fixtureId],
    );
    if (!before[0]) throw new HttpError(404, 'No such game.', 'not_found');

    // Changing a team means the stored rule no longer describes it, so record
    // the override explicitly rather than leaving a stale reference behind.
    const homeRefUpdate =
      d.homeTeamId !== undefined ? JSON.stringify({ kind: 'team', teamId: d.homeTeamId }) : null;
    const awayRefUpdate =
      d.awayTeamId !== undefined ? JSON.stringify({ kind: 'team', teamId: d.awayTeamId }) : null;

    await db.query(
      `UPDATE fixtures
          SET field_id = CASE WHEN $1::boolean THEN $2::uuid ELSE field_id END,
              kickoff_at = CASE WHEN $3::boolean THEN $4::timestamptz ELSE kickoff_at END,
              home_team_id = CASE WHEN $5::boolean THEN $6::uuid ELSE home_team_id END,
              away_team_id = CASE WHEN $7::boolean THEN $8::uuid ELSE away_team_id END,
              home_ref = CASE WHEN $9::jsonb IS NOT NULL THEN $9::jsonb ELSE home_ref END,
              away_ref = CASE WHEN $10::jsonb IS NOT NULL THEN $10::jsonb ELSE away_ref END,
              updated_at = now()
        WHERE id = $11`,
      [
        d.fieldId !== undefined, d.fieldId ?? null,
        d.kickoffAt !== undefined, d.kickoffAt ?? null,
        d.homeTeamId !== undefined, d.homeTeamId ?? null,
        d.awayTeamId !== undefined, d.awayTeamId ?? null,
        homeRefUpdate, awayRefUpdate,
        fixtureId,
      ],
    );

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'fixture',
      entityId: fixtureId,
      action: 'reschedule',
      before: before[0],
      after: d,
    });

    res.status(204).end();
  });

  return router;
}
