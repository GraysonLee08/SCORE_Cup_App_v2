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

  /**
   * Put someone in charge of a team, or take them off it.
   *
   * The column has been there from the beginning, but it was only ever written
   * when a team was first created and nothing ever sent it -- so there was no
   * way, anywhere in the app, to say who runs a team that already exists. An
   * account made for exactly that purpose could sign in and be told it was not
   * on a roster, with no admin action able to fix it.
   */
  router.put('/:id/coach', requireAuth, requireRole('admin'), async (req, res) => {
    const teamId = req.params.id;
    const parsed = z.object({ userId: z.string().uuid().nullable() }).safeParse(req.body);
    if (!teamId || !parsed.success) {
      throw new HttpError(400, 'Say who should run this team, or null for nobody.', 'invalid_input');
    }
    const { userId } = parsed.data;

    const { rows: teamRows } = await db.query<{ name: string }>(
      'SELECT name FROM teams WHERE id = $1',
      [teamId],
    );
    const team = teamRows[0];
    if (!team) throw new HttpError(404, 'No such team.', 'not_found');

    if (userId === null) {
      await db.query('UPDATE teams SET coach_user_id = NULL WHERE id = $1', [teamId]);
      await recordAudit(db, {
        actorUserId: req.session.user!.id,
        entityType: 'team',
        entityId: teamId,
        action: 'clear_coach',
        before: { team: team.name },
      });
      res.json({ coachUserId: null, claimedPlayer: false });
      return;
    }

    const { rows: userRows } = await db.query<{
      email: string;
      role: string;
      display_name: string;
      disabled: boolean;
    }>('SELECT email, role, display_name, disabled FROM users WHERE id = $1', [userId]);
    const user = userRows[0];
    if (!user) throw new HttpError(404, 'No such person.', 'not_found');
    if (user.disabled) {
      throw new HttpError(400, 'That account is turned off.', 'account_disabled');
    }

    // A referee's sign-in lands on the referee screen, which has no team on it,
    // so naming one here would put them in charge of something they cannot see.
    if (user.role === 'ref') {
      throw new HttpError(
        400,
        'A referee account cannot run a team. Give them a coach or participant account instead.',
        'role_cannot_coach',
      );
    }

    // One team each. The team a coach is shown is chosen with LIMIT 1, so a
    // second team would not appear -- better to refuse than to hand someone a
    // team they can never reach.
    const { rows: already } = await db.query<{ name: string }>(
      'SELECT name FROM teams WHERE coach_user_id = $1 AND id <> $2',
      [userId, teamId],
    );
    if (already[0]) {
      throw new HttpError(
        409,
        `${user.display_name} already runs ${already[0].name}. Take them off that team first.`,
        'already_running_a_team',
      );
    }

    await db.query('UPDATE teams SET coach_user_id = $1 WHERE id = $2', [userId, teamId]);

    // Being named on the team is not enough on its own: editing a roster asks
    // for the coach role *and* ownership of the team. Someone who registered
    // with the join code is a participant, so without this they would be put in
    // charge of a roster they still could not touch. Not reversed on removal --
    // taking someone off a team should not quietly change what their account is.
    const promoted = user.role === 'participant';
    if (promoted) {
      await db.query("UPDATE users SET role = 'coach' WHERE id = $1", [userId]);
    }

    // If they are also on the roster under the same address, join the two up.
    // Registering is what normally does this, and it is closed to them: their
    // email already has an account, so registration refuses it -- which is how
    // a captain ends up ticked on a roster row that belongs to nobody.
    const { rowCount: claimed } = await db.query(
      `UPDATE players SET user_id = $1, updated_at = now()
        WHERE team_id = $2 AND lower(email) = lower($3) AND user_id IS NULL`,
      [userId, teamId, user.email],
    );

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'team',
      entityId: teamId,
      action: 'set_coach',
      after: {
        team: team.name,
        coach: user.display_name,
        claimedPlayer: (claimed ?? 0) > 0,
        promotedToCoach: promoted,
      },
    });

    res.json({
      coachUserId: userId,
      claimedPlayer: (claimed ?? 0) > 0,
      promotedToCoach: promoted,
    });
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

  /** A team dropping out is normal. Refuse if games already reference it --
   *  removing it would leave fixtures pointing at nothing. */
  router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const teamId = req.params.id;
    if (!teamId) throw new HttpError(400, 'No team specified.', 'invalid_input');

    const { rows: played } = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM fixtures
        WHERE (home_team_id = $1 OR away_team_id = $1) AND home_score IS NOT NULL`,
      [teamId],
    );
    if (Number(played[0]!.n) > 0) {
      throw new HttpError(
        409,
        `This team has ${played[0]!.n} played game(s). Removing it would delete those results.`,
        'team_has_results',
      );
    }

    const { rows } = await db.query<{ name: string }>(
      'DELETE FROM teams WHERE id = $1 RETURNING name',
      [teamId],
    );
    if (!rows[0]) throw new HttpError(404, 'No such team.', 'not_found');

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'team',
      entityId: teamId,
      action: 'delete',
      before: rows[0],
    });

    res.status(204).end();
  });

  return router;
}
