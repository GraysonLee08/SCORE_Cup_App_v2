import { Router } from 'express';
import type { Db } from '../db.js';
import { HttpError, requireAuth } from '../auth/middleware.js';
import { unclaimedRosterCount } from '../services/rosterLink.js';

/**
 * The participant's own bundle: which team they are on, their teammates, and
 * messages aimed at that team.
 *
 * This is the only place teammate contact details are exposed, and only to
 * someone on that roster. Everything else a participant sees -- schedule,
 * standings, bracket -- comes from the public endpoints, because it is the
 * same data a spectator gets.
 */
export function participantRoutes(db: Db): Router {
  const router = Router();

  router.get('/me', requireAuth, async (req, res) => {
    const userId = req.session.user!.id;

    const { rows: membership } = await db.query<{
      player_id: string;
      team_id: string;
      team_name: string;
      division_id: string;
      division_name: string;
      event_id: string;
    }>(
      `SELECT p.id AS player_id, t.id AS team_id, t.name AS team_name,
              d.id AS division_id, d.name AS division_name, d.event_id
         FROM players p
         JOIN teams t ON t.id = p.team_id
         JOIN divisions d ON d.id = t.division_id
        WHERE p.user_id = $1
        LIMIT 1`,
      [userId],
    );

    // A coach has a team but no player row; fall back to the team they own.
    let team = membership[0];
    if (!team) {
      const { rows: coached } = await db.query<typeof membership[number]>(
        `SELECT NULL::uuid AS player_id, t.id AS team_id, t.name AS team_name,
                d.id AS division_id, d.name AS division_name, d.event_id
           FROM teams t JOIN divisions d ON d.id = t.division_id
          WHERE t.coach_user_id = $1 LIMIT 1`,
        [userId],
      );
      team = coached[0];
    }

    if (!team) {
      // Being on several rosters under one address is a different problem from
      // being on none, and sending someone off for a team code they already
      // used would be the wrong advice twice over.
      const unclaimed = await unclaimedRosterCount(db, req.session.user!.email);
      if (unclaimed > 1) {
        throw new HttpError(
          409,
          `Your email appears on ${unclaimed} rosters, so we cannot tell which team is yours. ` +
            'Ask an organizer to remove the duplicates.',
          'duplicate_roster_rows',
        );
      }
      throw new HttpError(
        404,
        'You are not on a roster yet. Ask your coach for your team code.',
        'no_team',
      );
    }

    const { rows: teammates } = await db.query(
      `SELECT p.id, p.first_name AS "firstName", p.last_name AS "lastName",
              p.email, p.phone, p.is_captain AS "isCaptain",
              (p.user_id IS NOT NULL) AS "registered"
         FROM players p
        WHERE p.team_id = $1
        ORDER BY p.is_captain DESC, p.last_name, p.first_name`,
      [team.team_id],
    );

    const { rows: messages } = await db.query(
      // Same reveal rule as the public board: a scheduled message is invisible
      // to a team until its time, and both surfaces agree because both apply
      // the filter rather than one of them being told by the other.
      `SELECT id, title, message, COALESCE(publish_at, created_at) AS "createdAt"
         FROM announcements
        WHERE event_id = $1
          AND (team_id = $2 OR division_id = $3 OR (team_id IS NULL AND division_id IS NULL))
          AND (publish_at IS NULL OR publish_at <= now())
        ORDER BY COALESCE(publish_at, created_at) DESC
        LIMIT 20`,
      [team.event_id, team.team_id, team.division_id],
    );

    // Whether this person may change the roster, answered the same way the
    // roster routes answer it. Not isCoach, which only says they have no
    // player row of their own -- a captain who runs the team and plays in it
    // has one, and may still edit.
    const { rowCount: owns } = await db.query(
      'SELECT 1 FROM teams WHERE id = $1 AND coach_user_id = $2',
      [team.team_id, userId],
    );
    const canEditRoster = req.session.user!.role === 'admin' || (owns ?? 0) > 0;

    res.json({
      canEditRoster,
      team: { id: team.team_id, name: team.team_name },
      division: { id: team.division_id, name: team.division_name },
      eventId: team.event_id,
      teammates,
      messages,
      isCoach: membership.length === 0,
    });
  });

  return router;
}
