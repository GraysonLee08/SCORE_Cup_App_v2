import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { recordAudit } from '../auth/audit.js';
import { HttpError, requireAuth } from '../auth/middleware.js';

/**
 * Joining a team when you already have an account.
 *
 * Registering with a join code makes an account and a roster row together, and
 * refuses an address that already has an account -- which is right, but left
 * anybody who already had one with nowhere to go. They entered the code, were
 * told to sign in instead, signed in, and arrived at a page with no team on it.
 *
 * That is today's captains, whose accounts were made for them. Next year it is
 * every returning player, because the accounts persist and the tournament does
 * not. For something meant to be used again, this is the door that has to
 * exist.
 */
const joinSchema = z.object({
  joinCode: z.string().min(1).max(20),
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
});

/** Split a display name into two, for a roster that wants both halves. */
function splitName(displayName: string): { firstName: string; lastName: string } {
  const trimmed = displayName.trim();
  const gap = trimmed.indexOf(' ');
  if (gap === -1) return { firstName: trimmed || 'Player', lastName: '' };
  return { firstName: trimmed.slice(0, gap), lastName: trimmed.slice(gap + 1) };
}

export function joinRoutes(db: Db): Router {
  const router = Router();

  router.post('/', requireAuth, async (req, res) => {
    const parsed = joinSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Enter your team code.', 'invalid_input');

    const user = req.session.user!;
    const { rows: teamRows } = await db.query<{ id: string; name: string }>(
      'SELECT id, name FROM teams WHERE upper(join_code) = upper($1)',
      [parsed.data.joinCode],
    );
    const team = teamRows[0];
    if (!team) throw new HttpError(404, 'That team code was not recognised.', 'unknown_code');

    // Already on a roster somewhere. Moving them on the strength of a code
    // someone forwarded would take them off a team without anyone deciding to.
    const { rows: existing } = await db.query<{ team_id: string; team_name: string }>(
      `SELECT p.team_id, t.name AS team_name
         FROM players p JOIN teams t ON t.id = p.team_id
        WHERE p.user_id = $1 LIMIT 1`,
      [user.id],
    );
    const already = existing[0];
    if (already) {
      if (already.team_id === team.id) {
        res.json({ teamId: team.id, teamName: team.name, claimed: false, alreadyThere: true });
        return;
      }
      throw new HttpError(
        409,
        `You are already on ${already.team_name}. Ask an organizer to move you.`,
        'already_on_a_roster',
      );
    }

    // A row a coach typed from a paper list, waiting for its person.
    const { rows: waiting } = await db.query<{ id: string }>(
      `SELECT id FROM players
        WHERE team_id = $1 AND lower(email) = lower($2) AND user_id IS NULL`,
      [team.id, user.email],
    );

    let playerId: string;
    let claimed = false;

    if (waiting[0]) {
      await db.query('UPDATE players SET user_id = $1, updated_at = now() WHERE id = $2', [
        user.id,
        waiting[0].id,
      ]);
      playerId = waiting[0].id;
      claimed = true;
    } else {
      const name = splitName(user.displayName);
      const { rows: inserted } = await db.query<{ id: string }>(
        `INSERT INTO players (team_id, user_id, first_name, last_name, email)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [
          team.id,
          user.id,
          parsed.data.firstName ?? name.firstName,
          parsed.data.lastName ?? name.lastName,
          user.email,
        ],
      );
      playerId = inserted[0]!.id;
    }

    await recordAudit(db, {
      actorUserId: user.id,
      entityType: 'player',
      entityId: playerId,
      action: claimed ? 'join_claimed' : 'join_created',
      after: { teamId: team.id, teamName: team.name },
    });

    res.status(201).json({ teamId: team.id, teamName: team.name, claimed, alreadyThere: false });
  });

  return router;
}
