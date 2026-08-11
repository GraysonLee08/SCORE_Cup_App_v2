import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createPool } from './db.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Apply any migration files not yet recorded, in filename order, each in its
 * own transaction. Deliberately tiny: a migration tool that fails during
 * tournament week is worse than no migration tool.
 */
export async function migrate(connectionString: string): Promise<string[]> {
  const db = createPool(connectionString);
  const applied: string[] = [];

  try {
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
    await db.end();
  }
}

// Allow `npm run migrate` as well as importing this from tests.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const config = loadConfig();
  migrate(config.DATABASE_URL)
    .then((applied) => {
      console.log(
        applied.length ? `Applied: ${applied.join(', ')}` : 'Already up to date.',
      );
    })
    .catch((error: Error) => {
      console.error(error.message);
      process.exit(1);
    });
}
