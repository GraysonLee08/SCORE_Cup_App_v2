import { Router } from 'express';
import type { Db } from '../db.js';
import { HttpError } from '../auth/middleware.js';
import { loadPublicDivision } from '../services/tournamentView.js';

/**
 * Unauthenticated routes powering the spectator and participant views.
 *
 * Nothing here requires a login, and nothing here returns anything that
 * identifies a person -- no rosters, no contact details, no card
 * attributions. Cards appear only as per-team counts.
 */
export function publicRoutes(db: Db): Router {
  const router = Router();

  /** The event being played now, or the next one scheduled. */
  router.get('/event', async (_req, res) => {
    const { rows } = await db.query<{
      id: string; name: string; season: string | null;
      event_date: string; start_time: string; end_time: string; timezone: string;
      location: string | null;
    }>(
      `SELECT id, name, season, event_date, start_time, end_time, timezone, location
         FROM events
        ORDER BY event_date DESC
        LIMIT 1`,
    );

    const event = rows[0];
    if (!event) throw new HttpError(404, 'No tournament has been set up yet.', 'no_event');

    const { rows: divisions } = await db.query(
      'SELECT id, name FROM divisions WHERE event_id = $1 ORDER BY sort_order, name',
      [event.id],
    );

    const { rows: announcements } = await db.query(
      // `publish_at` in the future is simply not selected yet, which is the
      // whole of the scheduling mechanism -- the board re-reads on a timer, so
      // a message appears within one poll of its time. Ordered by when it went
      // out, not when it was typed, or a message written on Monday for
      // Saturday would surface underneath everything written since.
      `SELECT id, title, message, COALESCE(publish_at, created_at) AS "createdAt"
         FROM announcements
        WHERE event_id = $1 AND team_id IS NULL
          AND (publish_at IS NULL OR publish_at <= now())
        ORDER BY COALESCE(publish_at, created_at) DESC
        LIMIT 20`,
      [event.id],
    );

    res.json({
      event: {
        id: event.id,
        name: event.name,
        season: event.season,
        eventDate: event.event_date,
        startTime: event.start_time,
        endTime: event.end_time,
        timezone: event.timezone,
        location: event.location,
      },
      divisions,
      announcements,
    });
  });

  router.get('/divisions/:divisionId', async (req, res) => {
    const divisionId = req.params.divisionId;
    if (!divisionId) throw new HttpError(400, 'No division specified.', 'invalid_input');

    res.json(await loadPublicDivision(db, divisionId));
  });

  /** The public rules page, admin-editable so it changes without a deploy. */
  router.get('/events/:eventId/rules', async (req, res) => {
    const eventId = req.params.eventId;
    if (!eventId) throw new HttpError(400, 'No event specified.', 'invalid_input');

    const { rows } = await db.query(
      `SELECT id, title, body, sort_order AS "sortOrder"
         FROM rules_pages WHERE event_id = $1 ORDER BY sort_order, title`,
      [eventId],
    );
    res.json({ pages: rows });
  });

  return router;
}
