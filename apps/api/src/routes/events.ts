import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { recordAudit } from '../auth/audit.js';
import { HttpError, requireAuth, requireRole } from '../auth/middleware.js';
import {
  DEFAULT_BRACKET_CONFIG,
  DEFAULT_POOL_CONFIG,
  stageConfigSchema,
} from '../services/stageConfig.js';

const timePattern = /^\d{2}:\d{2}(:\d{2})?$/;

const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  season: z.string().max(100).optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(timePattern),
  endTime: z.string().regex(timePattern),
  minRestMinutes: z.number().int().min(0).max(240).optional(),
  timezone: z.string().max(60).optional(),
  location: z.string().max(200).optional(),
});

const createDivisionSchema = z.object({
  name: z.string().min(1).max(120),
  sortOrder: z.number().int().optional(),
  /** Omit to let this division use every field on the event. */
  fieldIds: z.array(z.string().uuid()).optional(),
});

const createStageSchema = z.object({
  kind: z.enum(['pool', 'bracket']),
  name: z.string().min(1).max(120),
  sequence: z.number().int().positive(),
  config: stageConfigSchema.optional(),
});

export function eventRoutes(db: Db): Router {
  const router = Router();
  const admin = [requireAuth, requireRole('admin')];

  router.post('/', ...admin, async (req, res) => {
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Check the dates and times.', 'invalid_input');
    }
    const d = parsed.data;

    if (d.endTime <= d.startTime) {
      throw new HttpError(400, 'The end time must be after the start time.', 'invalid_window');
    }

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO events (name, season, event_date, start_time, end_time,
                           min_rest_minutes, timezone, location)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,5),COALESCE($7,'America/Chicago'),$8) RETURNING id`,
      [
        d.name,
        d.season ?? null,
        d.eventDate,
        d.startTime,
        d.endTime,
        d.minRestMinutes ?? null,
        d.timezone ?? null,
        d.location ?? null,
      ],
    );

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'event',
      entityId: rows[0]!.id,
      action: 'create',
      after: d,
    });

    res.status(201).json({ id: rows[0]!.id });
  });

  router.get('/', ...admin, async (_req, res) => {
    const { rows } = await db.query(
      `SELECT id, name, season, event_date AS "eventDate", start_time AS "startTime",
              end_time AS "endTime", min_rest_minutes AS "minRestMinutes",
              timezone, status, location
         FROM events ORDER BY event_date DESC`,
    );
    res.json({ events: rows });
  });

  router.post('/:eventId/fields', ...admin, async (req, res) => {
    const eventId = req.params.eventId;
    const schema = z.object({
      name: z.string().min(1).max(80),
      sortOrder: z.number().int().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!eventId || !parsed.success) {
      throw new HttpError(400, 'A field name is required.', 'invalid_input');
    }

    try {
      const { rows } = await db.query<{ id: string }>(
        'INSERT INTO fields (event_id, name, sort_order) VALUES ($1,$2,COALESCE($3,0)) RETURNING id',
        [eventId, parsed.data.name, parsed.data.sortOrder ?? null],
      );
      res.status(201).json({ id: rows[0]!.id });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new HttpError(409, 'That field name is already used.', 'duplicate_field');
      }
      throw error;
    }
  });

  router.post('/:eventId/divisions', ...admin, async (req, res) => {
    const eventId = req.params.eventId;
    const parsed = createDivisionSchema.safeParse(req.body);
    if (!eventId || !parsed.success) {
      throw new HttpError(400, 'A division name is required.', 'invalid_input');
    }

    const { rows } = await db.query<{ id: string }>(
      'INSERT INTO divisions (event_id, name, sort_order) VALUES ($1,$2,COALESCE($3,0)) RETURNING id',
      [eventId, parsed.data.name, parsed.data.sortOrder ?? null],
    );
    const divisionId = rows[0]!.id;

    for (const fieldId of parsed.data.fieldIds ?? []) {
      await db.query(
        'INSERT INTO division_fields (division_id, field_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [divisionId, fieldId],
      );
    }

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'division',
      entityId: divisionId,
      action: 'create',
      after: parsed.data,
    });

    res.status(201).json({ id: divisionId });
  });

  router.post('/divisions/:divisionId/stages', ...admin, async (req, res) => {
    const divisionId = req.params.divisionId;
    const parsed = createStageSchema.safeParse(req.body);
    if (!divisionId || !parsed.success) {
      throw new HttpError(400, 'Check the stage settings.', 'invalid_input');
    }

    const config =
      parsed.data.config ??
      (parsed.data.kind === 'pool' ? DEFAULT_POOL_CONFIG : DEFAULT_BRACKET_CONFIG);

    if (config.kind !== parsed.data.kind) {
      throw new HttpError(400, 'Stage settings do not match the stage type.', 'invalid_input');
    }

    try {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO stages (division_id, kind, name, sequence, config)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [divisionId, parsed.data.kind, parsed.data.name, parsed.data.sequence, config],
      );

      // A pool stage needs its pools to exist before teams can be assigned.
      if (config.kind === 'pool') {
        for (let i = 0; i < config.poolCount; i++) {
          await db.query(
            'INSERT INTO pools (stage_id, name, sort_order) VALUES ($1,$2,$3)',
            [rows[0]!.id, `Pool ${String.fromCharCode(65 + i)}`, i],
          );
        }
      }

      res.status(201).json({ id: rows[0]!.id });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new HttpError(409, 'That stage order is already used.', 'duplicate_sequence');
      }
      throw error;
    }
  });

  /**
   * Spread teams across the stage's pools. Snake order (1,2,2,1,1,2...) rather
   * than blocks, so if the admin has entered teams strongest-first the pools
   * come out balanced instead of stacking one.
   */
  router.post('/divisions/:divisionId/auto-assign-pools', ...admin, async (req, res) => {
    const divisionId = req.params.divisionId;
    if (!divisionId) throw new HttpError(400, 'No division specified.', 'invalid_input');

    const { rows: pools } = await db.query<{ id: string }>(
      `SELECT p.id FROM pools p
         JOIN stages s ON s.id = p.stage_id
        WHERE s.division_id = $1 AND s.kind = 'pool'
        ORDER BY s.sequence, p.sort_order`,
      [divisionId],
    );
    if (pools.length === 0) {
      throw new HttpError(400, 'This division has no pools yet.', 'no_pools');
    }

    const { rows: teams } = await db.query<{ id: string }>(
      'SELECT id FROM teams WHERE division_id = $1 ORDER BY name',
      [divisionId],
    );
    if (teams.length === 0) {
      throw new HttpError(400, 'This division has no teams yet.', 'no_teams');
    }

    const assignments: { teamId: string; poolId: string }[] = [];
    teams.forEach((team, index) => {
      const round = Math.floor(index / pools.length);
      const withinRound = index % pools.length;
      const poolIndex = round % 2 === 0 ? withinRound : pools.length - 1 - withinRound;
      assignments.push({ teamId: team.id, poolId: pools[poolIndex]!.id });
    });

    for (const a of assignments) {
      await db.query('UPDATE teams SET pool_id = $1 WHERE id = $2', [a.poolId, a.teamId]);
    }

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'division',
      entityId: divisionId,
      action: 'auto_assign_pools',
      after: { teams: teams.length, pools: pools.length },
    });

    res.json({ assigned: assignments.length, pools: pools.length });
  });

  /** Manual override: drag a team into a specific pool. */
  router.patch('/teams/:teamId/pool', ...admin, async (req, res) => {
    const teamId = req.params.teamId;
    const parsed = z.object({ poolId: z.string().uuid().nullable() }).safeParse(req.body);
    if (!teamId || !parsed.success) {
      throw new HttpError(400, 'A pool id is required.', 'invalid_input');
    }

    const { rowCount } = await db.query('UPDATE teams SET pool_id = $1 WHERE id = $2', [
      parsed.data.poolId,
      teamId,
    ]);
    if (!rowCount) throw new HttpError(404, 'No such team.', 'not_found');

    res.status(204).end();
  });

  /** Event settings are editable after creation -- a day window or rest gap
   *  frequently changes once the organisers firm up the plan. */
  router.patch('/:eventId', ...admin, async (req, res) => {
    const eventId = req.params.eventId;
    const parsed = createEventSchema.partial().safeParse(req.body);
    if (!eventId || !parsed.success) {
      throw new HttpError(400, 'Check the values.', 'invalid_input');
    }
    const d = parsed.data;

    const { rows: current } = await db.query<{ start_time: string; end_time: string }>(
      'SELECT start_time, end_time FROM events WHERE id = $1',
      [eventId],
    );
    if (!current[0]) throw new HttpError(404, 'No such event.', 'not_found');

    const startTime = d.startTime ?? current[0].start_time;
    const endTime = d.endTime ?? current[0].end_time;
    if (endTime <= startTime) {
      throw new HttpError(400, 'The end time must be after the start time.', 'invalid_window');
    }

    await db.query(
      `UPDATE events
          SET name = COALESCE($1, name),
              season = COALESCE($2, season),
              event_date = COALESCE($3::date, event_date),
              start_time = COALESCE($4::time, start_time),
              end_time = COALESCE($5::time, end_time),
              min_rest_minutes = COALESCE($6, min_rest_minutes),
              timezone = COALESCE($7, timezone),
              location = COALESCE($8, location)
        WHERE id = $9`,
      [
        d.name ?? null, d.season ?? null, d.eventDate ?? null,
        d.startTime ?? null, d.endTime ?? null,
        d.minRestMinutes ?? null, d.timezone ?? null,
        d.location ?? null, eventId,
      ],
    );

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'event', entityId: eventId, action: 'update', after: d,
    });

    res.status(204).end();
  });

  /** Removing a field would silently orphan any game scheduled on it, so
   *  refuse while fixtures still reference it. */
  router.delete('/fields/:fieldId', ...admin, async (req, res) => {
    const fieldId = req.params.fieldId;
    if (!fieldId) throw new HttpError(400, 'No field specified.', 'invalid_input');

    const { rows } = await db.query<{ n: string }>(
      'SELECT count(*) AS n FROM fixtures WHERE field_id = $1',
      [fieldId],
    );
    if (Number(rows[0]!.n) > 0) {
      throw new HttpError(
        409,
        `${rows[0]!.n} game(s) are scheduled on this field. Regenerate the schedule without it first.`,
        'field_in_use',
      );
    }

    const { rowCount } = await db.query('DELETE FROM fields WHERE id = $1', [fieldId]);
    if (!rowCount) throw new HttpError(404, 'No such field.', 'not_found');
    res.status(204).end();
  });

  router.delete('/divisions/:divisionId', ...admin, async (req, res) => {
    const divisionId = req.params.divisionId;
    if (!divisionId) throw new HttpError(400, 'No division specified.', 'invalid_input');

    const { rowCount } = await db.query('DELETE FROM divisions WHERE id = $1', [divisionId]);
    if (!rowCount) throw new HttpError(404, 'No such tournament.', 'not_found');

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'division', entityId: divisionId, action: 'delete',
    });
    res.status(204).end();
  });

  return router;
}
