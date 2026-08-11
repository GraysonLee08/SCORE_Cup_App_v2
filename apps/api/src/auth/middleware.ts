import type { NextFunction, Request, Response } from 'express';
import type { Db } from '../db.js';

export type UserRole = 'admin' | 'ref' | 'coach' | 'participant';

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
  mustChangePassword: boolean;
}

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = 'error',
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session.user) {
    throw new HttpError(401, 'You need to sign in.', 'unauthenticated');
  }
  next();
}

/**
 * Role gate. Admins are deliberately NOT auto-granted other roles: a ref
 * endpoint that silently accepts an admin hides bugs in field scoping.
 * Routes that admins genuinely need are listed explicitly.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.session.user;
    if (!user) throw new HttpError(401, 'You need to sign in.', 'unauthenticated');
    if (!roles.includes(user.role)) {
      throw new HttpError(403, 'You do not have access to that.', 'forbidden');
    }
    next();
  };
}

/** A password due for change may only reach logout and change-password. */
export function requirePasswordCurrent(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.session.user?.mustChangePassword) {
    throw new HttpError(
      403,
      'Set a new password before continuing.',
      'password_change_required',
    );
  }
  next();
}

/**
 * A referee may only write to fixtures on a field they are assigned to.
 *
 * Checked against the database on every request rather than trusted from the
 * session, so reassigning a ref mid-day takes effect immediately and a stale
 * session cannot keep writing to the wrong field.
 */
export async function refCanAccessField(
  db: Db,
  userId: string,
  fieldId: string,
): Promise<boolean> {
  const { rowCount } = await db.query(
    'SELECT 1 FROM ref_field_assignments WHERE user_id = $1 AND field_id = $2',
    [userId, fieldId],
  );
  return (rowCount ?? 0) > 0;
}

/** Coaches may only touch their own team. */
export async function coachOwnsTeam(
  db: Db,
  userId: string,
  teamId: string,
): Promise<boolean> {
  const { rowCount } = await db.query(
    'SELECT 1 FROM teams WHERE id = $1 AND coach_user_id = $2',
    [teamId, userId],
  );
  return (rowCount ?? 0) > 0;
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }

  // Never leak internals to a client; the detail goes to the log instead.
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Something went wrong.', code: 'internal_error' });
}
