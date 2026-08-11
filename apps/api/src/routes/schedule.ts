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
              f.home_ref AS "homeRef", f.away_ref AS "awayRef"
         FROM fixtures f
         JOIN stages s ON s.id = f.stage_id
         LEFT JOIN fields fl ON fl.id = f.field_id
         LEFT JOIN pools p ON p.id = f.pool_id
         LEFT JOIN teams home ON home.id = f.home_team_id
         LEFT JOIN teams away ON away.id = f.away_team_id
        WHERE s.division_id = $1
        ORDER BY f.kickoff_at, fl.sort_order, fl.name`,
      [divisionId],
    );

    res.json({ fixtures: rows });
  });

  return router;
}
