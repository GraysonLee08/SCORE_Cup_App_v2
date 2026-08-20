import type { Db } from '../db.js';

/**
 * Join a roster row to the account that belongs to it.
 *
 * A roster row and an account are two different things: staff type the row
 * from a paper list, the person makes the account themselves. Until now only
 * two events ever connected them -- registering with a join code, and being put
 * in charge of a team. Anything else left them side by side and unaware of each
 * other, so an account with a roster row bearing its own address still signed
 * in to "you are not on a roster yet".
 *
 * The email is the join, exactly as it already is when registration claims a
 * row a coach typed earlier. Nothing is guessed: with more than one unclaimed
 * row on that address, which team the person belongs to is a real question and
 * the answer is somebody else's to give.
 */
export interface RosterLinkResult {
  /** Rows newly attached to the account. At most one. */
  linked: number;
  /** Unclaimed rows carrying this address, whether or not one was taken. */
  candidates: number;
}

export async function linkRosterByEmail(
  db: Db,
  email: string | null | undefined,
): Promise<RosterLinkResult> {
  if (!email || !email.trim()) return { linked: 0, candidates: 0 };

  const { rows: users } = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE lower(email) = lower($1)',
    [email],
  );
  const userId = users[0]?.id;
  if (!userId) return { linked: 0, candidates: 0 };

  // Someone already attached to a roster stays there. Without this, a second
  // row bearing the same address would be claimed as well, leaving one person
  // on two teams and the lookup picking between them with LIMIT 1 -- which is
  // the same guessing this refuses to do anywhere else.
  const { rows: held } = await db.query(
    'SELECT 1 FROM players WHERE user_id = $1 LIMIT 1',
    [userId],
  );
  if (held.length > 0) return { linked: 0, candidates: 0 };

  const { rows: candidates } = await db.query<{ id: string }>(
    'SELECT id FROM players WHERE lower(email) = lower($1) AND user_id IS NULL',
    [email],
  );
  if (candidates.length !== 1) return { linked: 0, candidates: candidates.length };

  const { rowCount } = await db.query(
    'UPDATE players SET user_id = $1, updated_at = now() WHERE id = $2 AND user_id IS NULL',
    [userId, candidates[0]!.id],
  );

  return { linked: rowCount ?? 0, candidates: candidates.length };
}

/**
 * How many rosters an account could be claiming but has not.
 *
 * Only asked once the usual lookups have found nothing, to tell "nobody has put
 * you on a roster" apart from "you are on several and no one can tell which".
 * The second is a duplicate to be cleaned up, and saying so beats repeating an
 * invitation to go and find a team code.
 */
export async function unclaimedRosterCount(db: Db, email: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    'SELECT count(*) AS n FROM players WHERE lower(email) = lower($1) AND user_id IS NULL',
    [email],
  );
  return Number(rows[0]?.n ?? 0);
}
