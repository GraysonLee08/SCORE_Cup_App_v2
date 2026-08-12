import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { recordAudit } from '../auth/audit.js';
import {
  HttpError,
  requireAuth,
  requireRole,
  type SessionUser,
  type UserRole,
} from '../auth/middleware.js';
import {
  checkPasswordPolicy,
  generateTempPassword,
  hashPassword,
  tempPasswordExpiry,
  verifyPassword,
} from '../auth/password.js';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  display_name: string;
  must_change_password: boolean;
  temp_password_expires_at: Date | null;
  disabled: boolean;
}

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

/**
 * Admin is deliberately absent. Escalating someone to full control should be a
 * conscious act outside a running tournament, not a dropdown on a busy screen
 * -- and enforcing it only in the UI would not be enforcing it at all.
 */
const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  role: z.enum(['ref', 'coach', 'participant']),
});

function toSessionUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    displayName: row.display_name,
    mustChangePassword: row.must_change_password,
  };
}

export function authRoutes(db: Db): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Enter your email and password.', 'invalid_input');
    }

    const { rows } = await db.query<UserRow>(
      'SELECT * FROM users WHERE lower(email) = lower($1)',
      [parsed.data.email],
    );
    const user = rows[0];

    // Hash even when the user does not exist, so response time does not
    // reveal which emails are registered.
    const hash = user?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
    const passwordOk = await verifyPassword(parsed.data.password, hash);

    if (!user || !passwordOk || user.disabled) {
      throw new HttpError(401, 'Email or password is incorrect.', 'invalid_credentials');
    }

    // A temporary password stops working once it expires, so an old one
    // sitting in an inbox is not a live credential.
    if (
      user.must_change_password &&
      user.temp_password_expires_at &&
      user.temp_password_expires_at < new Date()
    ) {
      throw new HttpError(
        401,
        'That temporary password has expired. Request a new one.',
        'temp_password_expired',
      );
    }

    // New session id on login, so a session fixated before sign-in is useless.
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    req.session.user = toSessionUser(user);
    await recordAudit(db, {
      actorUserId: user.id,
      entityType: 'user',
      entityId: user.id,
      action: 'login',
    });

    res.json({ user: req.session.user });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.status(204).end();
    });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.session.user });
  });

  router.post('/change-password', requireAuth, async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Enter your current and new password.', 'invalid_input');
    }

    const sessionUser = req.session.user!;
    const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [
      sessionUser.id,
    ]);
    const user = rows[0];
    if (!user) throw new HttpError(401, 'You need to sign in.', 'unauthenticated');

    if (!(await verifyPassword(parsed.data.currentPassword, user.password_hash))) {
      throw new HttpError(403, 'Your current password is incorrect.', 'invalid_credentials');
    }

    const policy = checkPasswordPolicy(parsed.data.newPassword);
    if (!policy.ok) {
      throw new HttpError(400, policy.problems.join(' '), 'weak_password');
    }

    await db.query(
      `UPDATE users
         SET password_hash = $1, must_change_password = FALSE, temp_password_expires_at = NULL
       WHERE id = $2`,
      [await hashPassword(parsed.data.newPassword), user.id],
    );

    req.session.user = { ...sessionUser, mustChangePassword: false };
    await recordAudit(db, {
      actorUserId: user.id,
      entityType: 'user',
      entityId: user.id,
      action: 'change_password',
    });

    res.json({ user: req.session.user });
  });

  // --- Admin-only user management -----------------------------------------

  router.post('/users', requireAuth, requireRole('admin'), async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Check the email, name and role.', 'invalid_input');
    }

    const tempPassword = generateTempPassword();
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, display_name,
                          must_change_password, temp_password_expires_at)
       VALUES ($1, $2, $3, $4, TRUE, $5)
       ON CONFLICT (lower(email)) DO NOTHING
       RETURNING id`,
      [
        parsed.data.email,
        await hashPassword(tempPassword),
        parsed.data.role,
        parsed.data.displayName,
        tempPasswordExpiry(),
      ],
    );

    const created = rows[0];
    if (!created) {
      throw new HttpError(409, 'Someone already uses that email.', 'email_taken');
    }

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'user',
      entityId: created.id,
      action: 'create',
      after: { email: parsed.data.email, role: parsed.data.role },
    });

    // Shown to the admin exactly once, to paste into their reply.
    res.status(201).json({ id: created.id, tempPassword });
  });

  router.post('/users/:id/temp-password', requireAuth, requireRole('admin'), async (req, res) => {
    const userId = req.params.id;
    if (!userId) throw new HttpError(400, 'No user specified.', 'invalid_input');

    const tempPassword = generateTempPassword();

    const { rowCount } = await db.query(
      `UPDATE users
         SET password_hash = $1, must_change_password = TRUE, temp_password_expires_at = $2
       WHERE id = $3`,
      [await hashPassword(tempPassword), tempPasswordExpiry(), userId],
    );

    if (!rowCount) throw new HttpError(404, 'No such user.', 'not_found');

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'user',
      entityId: userId,
      action: 'issue_temp_password',
    });

    res.json({ tempPassword });
  });

  return router;
}
