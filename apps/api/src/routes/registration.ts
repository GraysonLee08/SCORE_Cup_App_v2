import { Router } from 'express';
import { z } from 'zod';
import { withTransaction, type Db } from '../db.js';
import { recordAudit } from '../auth/audit.js';
import { HttpError, requireAuth } from '../auth/middleware.js';
import { checkPasswordPolicy, hashPassword } from '../auth/password.js';

/**
 * Only the fields needed to create an account are required. Everything else is
 * optional and editable later, because a registration form that demands an
 * emergency contact before it will save is a form people abandon. Admins can
 * chase incomplete profiles; they cannot chase people who never signed up.
 */
const registrationSchema = z.object({
  joinCode: z.string().min(1).max(20),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(1),

  phone: z.string().max(40).optional(),
  emergencyContactFirstName: z.string().max(80).optional(),
  emergencyContactLastName: z.string().max(80).optional(),
  emergencyContactPhone: z.string().max(40).optional(),
  jerseySize: z.string().max(20).optional(),
  genderIdentity: z.string().max(80).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priorParticipation: z.boolean().optional(),
});

const profileSchema = registrationSchema
  .omit({ joinCode: true, password: true, email: true })
  .partial();

/** Fields the organizers want on file. Used to nudge, never to block. */
const COMPLETENESS_FIELDS = [
  'phone',
  'emergency_contact_first_name',
  'emergency_contact_last_name',
  'emergency_contact_phone',
  'jersey_size',
  'gender_identity',
  'date_of_birth',
] as const;

export function registrationRoutes(db: Db): Router {
  const router = Router();

  /** Public: look up a team from a join code so the form can confirm it. */
  router.get('/team-by-code/:code', async (req, res) => {
    const code = req.params.code;
    if (!code) throw new HttpError(400, 'No code supplied.', 'invalid_input');

    const { rows } = await db.query<{ id: string; name: string; division: string }>(
      `SELECT t.id, t.name, d.name AS division
         FROM teams t JOIN divisions d ON d.id = t.division_id
        WHERE upper(t.join_code) = upper($1)`,
      [code],
    );

    const team = rows[0];
    if (!team) throw new HttpError(404, 'That team code was not recognised.', 'unknown_code');

    res.json({ team });
  });

  router.post('/', async (req, res) => {
    const parsed = registrationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        'Check your name, email, password and team code.',
        'invalid_input',
      );
    }
    const input = parsed.data;

    const policy = checkPasswordPolicy(input.password);
    if (!policy.ok) throw new HttpError(400, policy.problems.join(' '), 'weak_password');

    const { rows: teamRows } = await db.query<{ id: string; name: string }>(
      'SELECT id, name FROM teams WHERE upper(join_code) = upper($1)',
      [input.joinCode],
    );
    const team = teamRows[0];
    if (!team) throw new HttpError(404, 'That team code was not recognised.', 'unknown_code');

    const { rows: existingUser } = await db.query<{ id: string }>(
      'SELECT id FROM users WHERE lower(email) = lower($1)',
      [input.email],
    );
    if (existingUser[0]) {
      throw new HttpError(
        409,
        'That email already has an account. Sign in instead.',
        'email_taken',
      );
    }

    const passwordHash = await hashPassword(input.password);

    const result = await withTransaction(db, async (client) => {
      const { rows: userRows } = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, role, display_name)
         VALUES ($1, $2, 'participant', $3) RETURNING id`,
        [input.email, passwordHash, `${input.firstName} ${input.lastName}`],
      );
      const userId = userRows[0]!.id;

      // A coach may already have entered this person from a paper roster.
      // Claim that row rather than creating a duplicate, so the team does not
      // end up with two of the same player.
      const { rows: claimed } = await client.query<{ id: string }>(
        `UPDATE players
            SET user_id = $1,
                first_name = $2,
                last_name = $3,
                phone = COALESCE($4, phone),
                emergency_contact_first_name = COALESCE($5, emergency_contact_first_name),
                emergency_contact_last_name  = COALESCE($6, emergency_contact_last_name),
                emergency_contact_phone      = COALESCE($7, emergency_contact_phone),
                jersey_size        = COALESCE($8, jersey_size),
                gender_identity    = COALESCE($9, gender_identity),
                date_of_birth      = COALESCE($10::date, date_of_birth),
                prior_participation = COALESCE($11, prior_participation),
                updated_at = now()
          WHERE team_id = $12 AND lower(email) = lower($13) AND user_id IS NULL
          RETURNING id`,
        [
          userId,
          input.firstName,
          input.lastName,
          input.phone ?? null,
          input.emergencyContactFirstName ?? null,
          input.emergencyContactLastName ?? null,
          input.emergencyContactPhone ?? null,
          input.jerseySize ?? null,
          input.genderIdentity ?? null,
          input.dateOfBirth ?? null,
          input.priorParticipation ?? null,
          team.id,
          input.email,
        ],
      );

      if (claimed[0]) return { userId, playerId: claimed[0].id, merged: true };

      const { rows: inserted } = await client.query<{ id: string }>(
        `INSERT INTO players (team_id, user_id, first_name, last_name, email, phone,
                              emergency_contact_first_name, emergency_contact_last_name,
                              emergency_contact_phone, jersey_size, gender_identity,
                              date_of_birth, prior_participation)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::date,$13) RETURNING id`,
        [
          team.id,
          userId,
          input.firstName,
          input.lastName,
          input.email,
          input.phone ?? null,
          input.emergencyContactFirstName ?? null,
          input.emergencyContactLastName ?? null,
          input.emergencyContactPhone ?? null,
          input.jerseySize ?? null,
          input.genderIdentity ?? null,
          input.dateOfBirth ?? null,
          input.priorParticipation ?? null,
        ],
      );

      return { userId, playerId: inserted[0]!.id, merged: false };
    });

    await recordAudit(db, {
      actorUserId: result.userId,
      entityType: 'player',
      entityId: result.playerId,
      action: result.merged ? 'register_merged' : 'register',
      after: { teamId: team.id, email: input.email },
    });

    res.status(201).json({
      teamName: team.name,
      merged: result.merged,
      message: 'You are registered. Sign in to see your team.',
    });
  });

  /** A participant correcting what a coach entered about them. */
  router.get('/my-profile', requireAuth, async (req, res) => {
    const { rows } = await db.query(
      `SELECT p.id, p.first_name AS "firstName", p.last_name AS "lastName", p.email,
              p.phone, p.jersey_size AS "jerseySize", p.gender_identity AS "genderIdentity",
              p.date_of_birth AS "dateOfBirth", p.prior_participation AS "priorParticipation",
              p.emergency_contact_first_name AS "emergencyContactFirstName",
              p.emergency_contact_last_name AS "emergencyContactLastName",
              p.emergency_contact_phone AS "emergencyContactPhone",
              t.name AS "teamName", t.id AS "teamId"
         FROM players p JOIN teams t ON t.id = p.team_id
        WHERE p.user_id = $1`,
      [req.session.user!.id],
    );

    const profile = rows[0];
    if (!profile) throw new HttpError(404, 'You are not on a roster yet.', 'not_found');

    const missing = COMPLETENESS_FIELDS.filter(
      (f) => (profile as Record<string, unknown>)[toCamel(f)] == null,
    );
    res.json({ profile, missingFields: missing.map(toCamel) });
  });

  router.patch('/my-profile', requireAuth, async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Check the values.', 'invalid_input');

    const d = parsed.data;
    const { rowCount } = await db.query(
      `UPDATE players
          SET first_name = COALESCE($1, first_name),
              last_name  = COALESCE($2, last_name),
              phone      = COALESCE($3, phone),
              emergency_contact_first_name = COALESCE($4, emergency_contact_first_name),
              emergency_contact_last_name  = COALESCE($5, emergency_contact_last_name),
              emergency_contact_phone      = COALESCE($6, emergency_contact_phone),
              jersey_size     = COALESCE($7, jersey_size),
              gender_identity = COALESCE($8, gender_identity),
              date_of_birth   = COALESCE($9::date, date_of_birth),
              prior_participation = COALESCE($10, prior_participation),
              updated_at = now()
        WHERE user_id = $11`,
      [
        d.firstName ?? null,
        d.lastName ?? null,
        d.phone ?? null,
        d.emergencyContactFirstName ?? null,
        d.emergencyContactLastName ?? null,
        d.emergencyContactPhone ?? null,
        d.jerseySize ?? null,
        d.genderIdentity ?? null,
        d.dateOfBirth ?? null,
        d.priorParticipation ?? null,
        req.session.user!.id,
      ],
    );

    if (!rowCount) throw new HttpError(404, 'You are not on a roster yet.', 'not_found');
    res.status(204).end();
  });

  return router;
}

function toCamel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}
