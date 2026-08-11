import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { recordAudit } from '../auth/audit.js';
import { coachOwnsTeam, HttpError, requireAuth } from '../auth/middleware.js';

/**
 * Coach-managed rosters. Deliberately save-as-you-go with everything except a
 * name optional: a coach entering fifteen people on a phone at a bar will be
 * interrupted, and a form that only saves when complete loses the lot.
 */
const playerSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  emergencyContactFirstName: z.string().max(80).optional(),
  emergencyContactLastName: z.string().max(80).optional(),
  emergencyContactPhone: z.string().max(40).optional(),
  jerseySize: z.string().max(20).optional(),
  genderIdentity: z.string().max(80).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priorParticipation: z.boolean().optional(),
  isCaptain: z.boolean().optional(),
});

const PLAYER_COLUMNS = `
  p.id, p.first_name AS "firstName", p.last_name AS "lastName", p.email, p.phone,
  p.jersey_size AS "jerseySize", p.gender_identity AS "genderIdentity",
  p.date_of_birth AS "dateOfBirth", p.prior_participation AS "priorParticipation",
  p.emergency_contact_first_name AS "emergencyContactFirstName",
  p.emergency_contact_last_name AS "emergencyContactLastName",
  p.emergency_contact_phone AS "emergencyContactPhone",
  p.is_captain AS "isCaptain",
  (p.user_id IS NOT NULL) AS "selfRegistered"
`;

/**
 * Roster data is contact information, so access is narrow: an admin, the team's
 * own coach, or someone on that team. Checked against the database per request
 * rather than trusted from the session.
 */
async function assertCanSeeRoster(db: Db, userId: string, role: string, teamId: string) {
  if (role === 'admin') return;
  if (role === 'coach' && (await coachOwnsTeam(db, userId, teamId))) return;

  const { rowCount } = await db.query(
    'SELECT 1 FROM players WHERE team_id = $1 AND user_id = $2',
    [teamId, userId],
  );
  if (rowCount) return;

  throw new HttpError(403, 'That is not your team.', 'forbidden');
}

async function assertCanEditRoster(db: Db, userId: string, role: string, teamId: string) {
  if (role === 'admin') return;
  if (role === 'coach' && (await coachOwnsTeam(db, userId, teamId))) return;
  throw new HttpError(403, 'Only the coach or an admin can change this roster.', 'forbidden');
}

export function rosterRoutes(db: Db): Router {
  const router = Router();

  router.get('/:teamId/players', requireAuth, async (req, res) => {
    const teamId = req.params.teamId;
    if (!teamId) throw new HttpError(400, 'No team specified.', 'invalid_input');

    const user = req.session.user!;
    await assertCanSeeRoster(db, user.id, user.role, teamId);

    const { rows } = await db.query(
      `SELECT ${PLAYER_COLUMNS} FROM players p
        WHERE p.team_id = $1
        ORDER BY p.last_name, p.first_name`,
      [teamId],
    );
    res.json({ players: rows });
  });

  router.post('/:teamId/players', requireAuth, async (req, res) => {
    const teamId = req.params.teamId;
    if (!teamId) throw new HttpError(400, 'No team specified.', 'invalid_input');

    const user = req.session.user!;
    await assertCanEditRoster(db, user.id, user.role, teamId);

    const parsed = playerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'A first and last name are required.', 'invalid_input');
    }
    const d = parsed.data;

    try {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO players (team_id, first_name, last_name, email, phone,
                              emergency_contact_first_name, emergency_contact_last_name,
                              emergency_contact_phone, jersey_size, gender_identity,
                              date_of_birth, prior_participation, is_captain)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::date,$12,$13) RETURNING id`,
        [
          teamId,
          d.firstName,
          d.lastName,
          d.email ?? null,
          d.phone ?? null,
          d.emergencyContactFirstName ?? null,
          d.emergencyContactLastName ?? null,
          d.emergencyContactPhone ?? null,
          d.jerseySize ?? null,
          d.genderIdentity ?? null,
          d.dateOfBirth ?? null,
          d.priorParticipation ?? null,
          d.isCaptain ?? false,
        ],
      );

      await recordAudit(db, {
        actorUserId: user.id,
        entityType: 'player',
        entityId: rows[0]!.id,
        action: 'roster_add',
        after: { teamId, name: `${d.firstName} ${d.lastName}` },
      });

      res.status(201).json({ id: rows[0]!.id });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new HttpError(
          409,
          'Someone with that email is already on this roster.',
          'duplicate_player',
        );
      }
      throw error;
    }
  });

  router.patch('/:teamId/players/:playerId', requireAuth, async (req, res) => {
    const { teamId, playerId } = req.params;
    if (!teamId || !playerId) throw new HttpError(400, 'Missing ids.', 'invalid_input');

    const user = req.session.user!;
    await assertCanEditRoster(db, user.id, user.role, teamId);

    const parsed = playerSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Check the values.', 'invalid_input');
    const d = parsed.data;

    const { rowCount } = await db.query(
      `UPDATE players
          SET first_name = COALESCE($1, first_name),
              last_name  = COALESCE($2, last_name),
              email      = COALESCE($3, email),
              phone      = COALESCE($4, phone),
              emergency_contact_first_name = COALESCE($5, emergency_contact_first_name),
              emergency_contact_last_name  = COALESCE($6, emergency_contact_last_name),
              emergency_contact_phone      = COALESCE($7, emergency_contact_phone),
              jersey_size     = COALESCE($8, jersey_size),
              gender_identity = COALESCE($9, gender_identity),
              date_of_birth   = COALESCE($10::date, date_of_birth),
              prior_participation = COALESCE($11, prior_participation),
              is_captain      = COALESCE($12, is_captain),
              updated_at = now()
        WHERE id = $13 AND team_id = $14`,
      [
        d.firstName ?? null,
        d.lastName ?? null,
        d.email ?? null,
        d.phone ?? null,
        d.emergencyContactFirstName ?? null,
        d.emergencyContactLastName ?? null,
        d.emergencyContactPhone ?? null,
        d.jerseySize ?? null,
        d.genderIdentity ?? null,
        d.dateOfBirth ?? null,
        d.priorParticipation ?? null,
        d.isCaptain ?? null,
        playerId,
        teamId,
      ],
    );

    if (!rowCount) throw new HttpError(404, 'No such player on this team.', 'not_found');

    await recordAudit(db, {
      actorUserId: user.id,
      entityType: 'player',
      entityId: playerId,
      action: 'roster_update',
      after: d,
    });

    res.status(204).end();
  });

  router.delete('/:teamId/players/:playerId', requireAuth, async (req, res) => {
    const { teamId, playerId } = req.params;
    if (!teamId || !playerId) throw new HttpError(400, 'Missing ids.', 'invalid_input');

    const user = req.session.user!;
    await assertCanEditRoster(db, user.id, user.role, teamId);

    const { rows } = await db.query(
      'DELETE FROM players WHERE id = $1 AND team_id = $2 RETURNING first_name, last_name',
      [playerId, teamId],
    );
    if (!rows[0]) throw new HttpError(404, 'No such player on this team.', 'not_found');

    await recordAudit(db, {
      actorUserId: user.id,
      entityType: 'player',
      entityId: playerId,
      action: 'roster_remove',
      before: rows[0],
    });

    res.status(204).end();
  });

  return router;
}
