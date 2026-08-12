import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { recordAudit } from '../auth/audit.js';
import { HttpError, requireAuth, requireRole } from '../auth/middleware.js';

/**
 * Admin read models and the smaller write endpoints. Setup and scheduling live
 * in events.ts and schedule.ts; this is everything the admin screens need
 * around them.
 */
export function adminRoutes(db: Db): Router {
  const router = Router();
  const admin = [requireAuth, requireRole('admin')];

  /** Everything about one event in a single read, for the setup screen. */
  router.get('/events/:eventId', ...admin, async (req, res) => {
    const eventId = req.params.eventId;
    if (!eventId) throw new HttpError(400, 'No event specified.', 'invalid_input');

    const { rows: eventRows } = await db.query(
      `SELECT id, name, season, event_date AS "eventDate", start_time AS "startTime",
              end_time AS "endTime", min_rest_minutes AS "minRestMinutes", timezone,
              status, location
         FROM events WHERE id = $1`,
      [eventId],
    );
    const event = eventRows[0];
    if (!event) throw new HttpError(404, 'No such event.', 'not_found');

    const { rows: fields } = await db.query(
      'SELECT id, name, sort_order AS "sortOrder" FROM fields WHERE event_id = $1 ORDER BY sort_order, name',
      [eventId],
    );

    const { rows: divisions } = await db.query(
      `SELECT d.id, d.name, d.status, d.sort_order AS "sortOrder",
              COALESCE(
                (SELECT json_agg(df.field_id) FROM division_fields df WHERE df.division_id = d.id),
                '[]'::json
              ) AS "fieldIds",
              COALESCE((SELECT json_agg(json_build_object(
                  'id', s.id, 'kind', s.kind, 'name', s.name,
                  'sequence', s.sequence, 'config', s.config
                ) ORDER BY s.sequence)
                FROM stages s WHERE s.division_id = d.id), '[]'::json) AS stages,
              COALESCE((SELECT json_agg(json_build_object(
                  'id', p.id, 'name', p.name, 'stageId', p.stage_id
                ) ORDER BY p.sort_order)
                FROM pools p JOIN stages s2 ON s2.id = p.stage_id
                WHERE s2.division_id = d.id), '[]'::json) AS pools,
              COALESCE((SELECT json_agg(json_build_object(
                  'id', t.id, 'name', t.name, 'poolId', t.pool_id,
                  'joinCode', t.join_code, 'coachUserId', t.coach_user_id,
                  'playerCount', (SELECT count(*) FROM players pl WHERE pl.team_id = t.id)
                ) ORDER BY t.name)
                FROM teams t WHERE t.division_id = d.id), '[]'::json) AS teams,
              (SELECT count(*) FROM fixtures f JOIN stages s3 ON s3.id = f.stage_id
                WHERE s3.division_id = d.id)::int AS "fixtureCount"
         FROM divisions d
        WHERE d.event_id = $1
        ORDER BY d.sort_order, d.name`,
      [eventId],
    );

    res.json({ event, fields, divisions });
  });

  router.get('/users', ...admin, async (_req, res) => {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.role, u.display_name AS "displayName", u.disabled,
              u.must_change_password AS "mustChangePassword",
              COALESCE(
                (SELECT json_agg(rfa.field_id) FROM ref_field_assignments rfa WHERE rfa.user_id = u.id),
                '[]'::json
              ) AS "fieldIds"
         FROM users u ORDER BY u.role, u.display_name`,
    );
    res.json({ users: rows });
  });

  /**
   * Points adjustments. This is how "modify a standing" works without breaking
   * the derived-standings rule: the adjustment is a visible, audited line item
   * folded into the calculation, not an edit to a stored table.
   */
  router.post('/divisions/:divisionId/adjustments', ...admin, async (req, res) => {
    const divisionId = req.params.divisionId;
    const parsed = z
      .object({
        teamId: z.string().uuid(),
        points: z.number().int().min(-100).max(100),
        reason: z.string().min(1).max(300),
      })
      .safeParse(req.body);

    if (!divisionId || !parsed.success) {
      throw new HttpError(400, 'A team, a points value and a reason are required.', 'invalid_input');
    }

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO standings_adjustments (division_id, team_id, points, reason, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [divisionId, parsed.data.teamId, parsed.data.points, parsed.data.reason, req.session.user!.id],
    );

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'standings_adjustment',
      entityId: rows[0]!.id,
      action: 'create',
      after: parsed.data,
    });

    res.status(201).json({ id: rows[0]!.id });
  });

  router.get('/divisions/:divisionId/adjustments', ...admin, async (req, res) => {
    const { rows } = await db.query(
      `SELECT a.id, a.team_id AS "teamId", t.name AS "teamName", a.points, a.reason,
              a.created_at AS "createdAt"
         FROM standings_adjustments a JOIN teams t ON t.id = a.team_id
        WHERE a.division_id = $1 ORDER BY a.created_at DESC`,
      [req.params.divisionId],
    );
    res.json({ adjustments: rows });
  });

  router.delete('/adjustments/:id', ...admin, async (req, res) => {
    const { rowCount } = await db.query('DELETE FROM standings_adjustments WHERE id = $1', [
      req.params.id,
    ]);
    if (!rowCount) throw new HttpError(404, 'No such adjustment.', 'not_found');
    res.status(204).end();
  });

  // --- Announcements -------------------------------------------------------

  router.post('/events/:eventId/announcements', ...admin, async (req, res) => {
    const eventId = req.params.eventId;
    const parsed = z
      .object({
        title: z.string().min(1).max(200),
        message: z.string().min(1).max(2000),
        divisionId: z.string().uuid().nullable().optional(),
        teamId: z.string().uuid().nullable().optional(),
      })
      .safeParse(req.body);

    if (!eventId || !parsed.success) {
      throw new HttpError(400, 'A title and message are required.', 'invalid_input');
    }

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO announcements (event_id, division_id, team_id, title, message, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        eventId,
        parsed.data.divisionId ?? null,
        parsed.data.teamId ?? null,
        parsed.data.title,
        parsed.data.message,
        req.session.user!.id,
      ],
    );

    res.status(201).json({ id: rows[0]!.id });
  });

  router.get('/events/:eventId/announcements', ...admin, async (req, res) => {
    const { rows } = await db.query(
      `SELECT a.id, a.title, a.message, a.created_at AS "createdAt",
              a.division_id AS "divisionId", a.team_id AS "teamId", t.name AS "teamName"
         FROM announcements a LEFT JOIN teams t ON t.id = a.team_id
        WHERE a.event_id = $1 ORDER BY a.created_at DESC`,
      [req.params.eventId],
    );
    res.json({ announcements: rows });
  });

  router.delete('/announcements/:id', ...admin, async (req, res) => {
    const { rowCount } = await db.query('DELETE FROM announcements WHERE id = $1', [
      req.params.id,
    ]);
    if (!rowCount) throw new HttpError(404, 'No such announcement.', 'not_found');
    res.status(204).end();
  });

  /** "Who changed this score, and when" — the question asked when a result is disputed. */
  router.get('/audit', ...admin, async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
    const { rows } = await db.query(
      `SELECT a.id, a.entity_type AS "entityType", a.entity_id AS "entityId",
              a.action, a.before, a.after, a.created_at AS "createdAt",
              u.display_name AS "actorName", u.role AS "actorRole"
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
        ORDER BY a.created_at DESC LIMIT $1`,
      [limit],
    );
    res.json({ entries: rows });
  });

  return router;
}
