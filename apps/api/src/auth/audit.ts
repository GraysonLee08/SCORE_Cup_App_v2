import type { Db } from '../db.js';

/**
 * Record a mutation. Every write path calls this, so "who changed this score
 * and when" has an answer when a result is disputed at the awards table.
 *
 * Deliberately fire-and-forget on failure: an audit write that throws must not
 * roll back a referee's score submission mid-tournament.
 */
export async function recordAudit(
  db: Db,
  entry: {
    actorUserId: string | null;
    entityType: string;
    entityId: string;
    action: string;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_log (actor_user_id, entity_type, entity_id, action, before, after)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.actorUserId,
        entry.entityType,
        entry.entityId,
        entry.action,
        entry.before === undefined ? null : JSON.stringify(entry.before),
        entry.after === undefined ? null : JSON.stringify(entry.after),
      ],
    );
  } catch (error) {
    console.error('Audit write failed (continuing):', error);
  }
}
