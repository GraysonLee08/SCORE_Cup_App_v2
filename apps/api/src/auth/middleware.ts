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

/**
 * Ends the session of an account that has since been disabled.
 *
 * Sign-in checks the flag, but a session already open would otherwise carry on
 * until it expired -- up to a full tournament day. Revoking access to a login
 * that has been shared around is worth nothing if the person holding it stays
 * signed in, so the check runs per request rather than only at the door.
 *
 * One primary-key lookup, and only for requests that carry a session at all --
 * the public board never reaches the database for this.
 */
export function rejectDisabled(db: Db) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const user = req.session?.user;
    if (!user) return next();

    const { rows } = await db.query<{ disabled: boolean }>(
      'SELECT disabled FROM users WHERE id = $1',
      [user.id],
    );

    // Deleted or disabled: either way the session no longer stands for anyone.
    if (!rows[0] || rows[0].disabled) {
      req.session.destroy(() => undefined);
      throw new HttpError(401, 'That account is no longer active.', 'account_disabled');
    }

    next();
  };
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
