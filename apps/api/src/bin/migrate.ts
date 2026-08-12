import { loadConfig } from '../config.js';
import { migrate } from '../migrate.js';

/**
 * Dedicated entry point for running migrations.
 *
 * This exists because detecting "am I the entry module?" from inside
 * migrate.ts was unreliable across platforms -- it silently did nothing on
 * Windows, so the schema quietly fell behind the code and every query against
 * a new column failed at runtime. An explicit file cannot be ambiguous.
 */
const config = loadConfig();

migrate(config.DATABASE_URL)
  .then((applied) => {
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Already up to date.');
  })
  .catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
