import { Router } from 'express';
import { z } from 'zod';
import { FixtureGenerationError, SchedulingError } from '@scores-cup/engine';
import type { Db } from '../db.js';
import { recordAudit } from '../auth/audit.js';
import { HttpError, requireAuth, requireRole } from '../auth/middleware.js';
import {
  buildSchedule,
  divisionFeasibility,
  loadDivisionPlan,
  persistSchedule,
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

    let build;
    try {
      build = buildSchedule(plan);
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
    });
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
