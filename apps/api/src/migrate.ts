import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './db.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Apply any migration files not yet recorded, in filename order, each in its
 * own transaction. Deliberately tiny: a migration tool that fails during
 * tournament week is worse than no migration tool.
 */
/**
 * Arbitrary but fixed: any process running migrations uses this same lock id.
 * Two API containers starting together would otherwise race on CREATE TYPE and
 * one would crash on a duplicate-key error from the system catalogue.
 */
const MIGRATION_LOCK_ID = 8_291_026;

export async function migrate(connectionString: string): Promise<string[]> {
  const db = createPool(connectionString);
  const applied: string[] = [];

  // Advisory locks are held by a connection, so this must be one checked-out
  // client rather than pool.query, which may hand back a different connection.
  const lockClient = await db.connect();

  try {
    await lockClient.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);

    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
    const { rows } = await db.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations',
    );
    const done = new Set(rows.map((r) => r.filename));

    for (const file of files) {
      if (done.has(file)) continue;

      const sql = await readFile(join(migrationsDir, file), 'utf8');
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      } finally {
        client.release();
      }
    }

    return applied;
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    lockClient.release();
    await db.end();
  }
}
