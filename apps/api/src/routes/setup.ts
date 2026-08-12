import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { recordAudit } from '../auth/audit.js';
import { HttpError, requireAuth, requireRole } from '../auth/middleware.js';

/**
 * Setup endpoints that work in the units an organiser thinks in.
 *
 * They say "we have four pitches" and "two pools", not "insert a field record".
 * These take a count and reconcile the underlying rows, while refusing any
 * removal that would silently orphan games or unassign teams.
 */
export function setupRoutes(db: Db): Router {
  const router = Router();
  const admin = [requireAuth, requireRole('admin')];

  router.put('/events/:eventId/field-count', ...admin, async (req, res) => {
    const eventId = req.params.eventId;
    const parsed = z.object({ count: z.number().int().min(0).max(40) }).safeParse(req.body);
    if (!eventId || !parsed.success) {
      throw new HttpError(400, 'A field count is required.', 'invalid_input');
    }

    const { rows: existing } = await db.query<{ id: string; name: string }>(
      'SELECT id, name FROM fields WHERE event_id = $1 ORDER BY sort_order, name',
      [eventId],
    );

    if (parsed.data.count > existing.length) {
      for (let i = existing.length; i < parsed.data.count; i++) {
        await db.query(
          `INSERT INTO fields (event_id, name, sort_order) VALUES ($1,$2,$3)
           ON CONFLICT (event_id, name) DO NOTHING`,
          [eventId, `Field ${i + 1}`, i + 1],
        );
      }
    } else if (parsed.data.count < existing.length) {
      // Remove from the end, and stop rather than orphan scheduled games.
      for (const field of existing.slice(parsed.data.count).reverse()) {
        const { rows } = await db.query<{ n: string }>(
          'SELECT count(*) AS n FROM fixtures WHERE field_id = $1',
          [field.id],
        );
        if (Number(rows[0]!.n) > 0) {
          throw new HttpError(
            409,
            `${field.name} has ${rows[0]!.n} game(s) scheduled. Regenerate the schedule before removing it.`,
            'field_in_use',
          );
        }
        await db.query('DELETE FROM fields WHERE id = $1', [field.id]);
      }
    }

    const { rows: after } = await db.query<{ n: string }>(
      'SELECT count(*) AS n FROM fields WHERE event_id = $1',
      [eventId],
    );
    res.json({ count: Number(after[0]!.n) });
  });

  router.patch('/fields/:fieldId', ...admin, async (req, res) => {
    const fieldId = req.params.fieldId;
    const parsed = z.object({ name: z.string().min(1).max(80) }).safeParse(req.body);
    if (!fieldId || !parsed.success) {
      throw new HttpError(400, 'A field name is required.', 'invalid_input');
    }
    const { rowCount } = await db.query('UPDATE fields SET name = $1 WHERE id = $2', [
      parsed.data.name,
      fieldId,
    ]);
    if (!rowCount) throw new HttpError(404, 'No such field.', 'not_found');
    res.status(204).end();
  });

  /** Rename a tournament, or change which fields it may use. */
  router.patch('/divisions/:divisionId', ...admin, async (req, res) => {
    const divisionId = req.params.divisionId;
    const parsed = z
      .object({
        name: z.string().min(1).max(120).optional(),
        fieldIds: z.array(z.string().uuid()).optional(),
      })
      .safeParse(req.body);
    if (!divisionId || !parsed.success) {
      throw new HttpError(400, 'Check the values.', 'invalid_input');
    }

    if (parsed.data.name) {
      await db.query('UPDATE divisions SET name = $1 WHERE id = $2', [
        parsed.data.name,
        divisionId,
      ]);
    }

    if (parsed.data.fieldIds) {
      await db.query('DELETE FROM division_fields WHERE division_id = $1', [divisionId]);
      for (const fieldId of parsed.data.fieldIds) {
        await db.query(
          'INSERT INTO division_fields (division_id, field_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [divisionId, fieldId],
        );
      }
    }

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'division',
      entityId: divisionId,
      action: 'update',
      after: parsed.data,
    });

    res.status(204).end();
  });

  router.put('/divisions/:divisionId/pool-count', ...admin, async (req, res) => {
    const divisionId = req.params.divisionId;
    const parsed = z.object({ count: z.number().int().min(1).max(26) }).safeParse(req.body);
    if (!divisionId || !parsed.success) {
      throw new HttpError(400, 'A pool count is required.', 'invalid_input');
    }

    const { rows: stages } = await db.query<{ id: string }>(
      `SELECT id FROM stages WHERE division_id = $1 AND kind = 'pool'
        ORDER BY sequence LIMIT 1`,
      [divisionId],
    );
    const stage = stages[0];
    if (!stage) {
      throw new HttpError(400, 'This tournament has no pool stage yet.', 'no_stage');
    }

    const { rows: pools } = await db.query<{ id: string; name: string }>(
      'SELECT id, name FROM pools WHERE stage_id = $1 ORDER BY sort_order',
      [stage.id],
    );

    if (parsed.data.count > pools.length) {
      for (let i = pools.length; i < parsed.data.count; i++) {
        await db.query('INSERT INTO pools (stage_id, name, sort_order) VALUES ($1,$2,$3)', [
          stage.id,
          `Pool ${String.fromCharCode(65 + i)}`,
          i,
        ]);
      }
    } else if (parsed.data.count < pools.length) {
      for (const pool of pools.slice(parsed.data.count).reverse()) {
        const { rows } = await db.query<{ n: string }>(
          'SELECT count(*) AS n FROM teams WHERE pool_id = $1',
          [pool.id],
        );
        if (Number(rows[0]!.n) > 0) {
          throw new HttpError(
            409,
            `${pool.name} still has ${rows[0]!.n} team(s) in it. Move them to another pool first.`,
            'pool_in_use',
          );
        }
        await db.query('DELETE FROM pools WHERE id = $1', [pool.id]);
      }
    }

    // Keep the stage config in step, since that is what the engine reads.
    await db.query(
      `UPDATE stages SET config = jsonb_set(config, '{poolCount}', to_jsonb($1::int))
        WHERE id = $2`,
      [parsed.data.count, stage.id],
    );

    res.json({ count: parsed.data.count });
  });

  /** Games each team plays in pool play. Drives fixture generation. */
  router.put('/divisions/:divisionId/games-per-team', ...admin, async (req, res) => {
    const divisionId = req.params.divisionId;
    const parsed = z.object({ count: z.number().int().min(1).max(30) }).safeParse(req.body);
    if (!divisionId || !parsed.success) {
      throw new HttpError(400, 'A game count is required.', 'invalid_input');
    }

    const { rowCount } = await db.query(
      `UPDATE stages SET config = jsonb_set(config, '{gamesPerTeam}', to_jsonb($1::int))
        WHERE division_id = $2 AND kind = 'pool'`,
      [parsed.data.count, divisionId],
    );
    if (!rowCount) throw new HttpError(400, 'This tournament has no pool stage.', 'no_stage');

    res.json({ count: parsed.data.count });
  });

  return router;
}
