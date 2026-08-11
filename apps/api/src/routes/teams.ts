import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { recordAudit } from '../auth/audit.js';
import { HttpError, requireAuth, requireRole } from '../auth/middleware.js';
import { generateJoinCode } from '../auth/password.js';

const createTeamSchema = z.object({
  divisionId: z.string().uuid(),
  name: z.string().min(1).max(120),
  coachUserId: z.string().uuid().optional(),
});

/** Join codes are unique; retry on the rare collision rather than failing. */
async function insertTeamWithJoinCode(
  db: Db,
  divisionId: string,
  name: string,
  coachUserId: string | null,
): Promise<{ id: string; joinCode: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const joinCode = generateJoinCode();
    try {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO teams (division_id, name, join_code, coach_user_id)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [divisionId, name, joinCode, coachUserId],
      );
      return { id: rows[0]!.id, joinCode };
    } catch (error) {
      const code = (error as { code?: string }).code;
      // 23505 = unique violation. Only retry when it was the join code that
      // collided; a duplicate team name is the caller's problem to fix.
      const detail = (error as { detail?: string }).detail ?? '';
      if (code === '23505' && detail.includes('join_code')) continue;
      if (code === '23505') {
        throw new HttpError(409, 'A team with that name already exists.', 'team_exists');
      }
      throw error;
    }
  }
  throw new HttpError(500, 'Could not allocate a join code.', 'join_code_exhausted');
}

export function teamRoutes(db: Db): Router {
  const router = Router();

  router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
    const parsed = createTeamSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Check the division and team name.', 'invalid_input');
    }

    const team = await insertTeamWithJoinCode(
      db,
      parsed.data.divisionId,
      parsed.data.name,
      parsed.data.coachUserId ?? null,
    );

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'team',
      entityId: team.id,
      action: 'create',
      after: { name: parsed.data.name },
    });

    res.status(201).json(team);
  });

  /** Admin view: every team with its join code, for handing to coaches. */
  router.get('/', requireAuth, requireRole('admin'), async (_req, res) => {
    const { rows } = await db.query(
      `SELECT t.id, t.name, t.join_code AS "joinCode", t.division_id AS "divisionId",
              t.coach_user_id AS "coachUserId",
              (SELECT count(*) FROM players p WHERE p.team_id = t.id)::int AS "playerCount"
         FROM teams t
        ORDER BY t.name`,
    );
    res.json({ teams: rows });
  });

  /** Rotate a leaked join code without disturbing anyone already registered. */
  router.post('/:id/join-code', requireAuth, requireRole('admin'), async (req, res) => {
    const teamId = req.params.id;
    if (!teamId) throw new HttpError(400, 'No team specified.', 'invalid_input');

    const joinCode = generateJoinCode();
    const { rowCount } = await db.query('UPDATE teams SET join_code = $1 WHERE id = $2', [
      joinCode,
      teamId,
    ]);
    if (!rowCount) throw new HttpError(404, 'No such team.', 'not_found');

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'team',
      entityId: teamId,
      action: 'rotate_join_code',
    });

    res.json({ joinCode });
  });

  return router;
}
