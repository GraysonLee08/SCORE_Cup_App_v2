/**
 * Rebuild a tournament's whole schedule from the command line.
 *
 * The same code path as "Build the whole day" in the admin screen, for the
 * cases where clicking is not available: a stored schedule that predates a fix
 * to how it is stored, or a rehearsal being reset between run-throughs.
 *
 * The whole day rather than one division at a time, because divisions share
 * pitches -- generating one on its own can only fit around whatever is already
 * there, and rebuilding them one by one puts two games on one pitch.
 *
 *   npm run rebuild-schedule --workspace @scores-cup/api -- --force
 *
 * Refuses without --force whenever anything would be lost, and says what:
 * results and referee assignments both go, because rebuilding is a delete and
 * a fresh insert. Deliberately noisy about it -- the schedule looks identical
 * afterwards, so nobody would think to check the referee column.
 */
import { createPool } from '../db.js';
import {
  buildEventSchedule,
  loadEventPlans,
  persistSchedule,
} from '../services/scheduleBuilder.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const force = process.argv.includes('--force');
const eventArg = process.argv.find((a) => a.startsWith('--event='))?.split('=')[1];

const db = createPool(databaseUrl);

try {
  let eventId = eventArg;
  if (!eventId) {
    const { rows } = await db.query<{ id: string; name: string }>(
      'SELECT id, name FROM events ORDER BY event_date DESC LIMIT 2',
    );
    if (rows.length === 0) {
      console.error('No tournaments in the database.');
      process.exit(1);
    }
    if (rows.length > 1) {
      console.error('More than one tournament. Name one with --event=<id>:');
      for (const r of rows) console.error(`  ${r.id}  ${r.name}`);
      process.exit(1);
    }
    eventId = rows[0]!.id;
    console.log(`Tournament: ${rows[0]!.name}`);
  }

  // Said before anything is touched, so the cost is on screen even when the
  // command is run with --force already set.
  const { rows: standing } = await db.query<{
    division: string;
    games: string;
    with_results: string;
    with_referee: string;
  }>(
    `SELECT d.name AS division, count(*) AS games,
            count(*) FILTER (WHERE f.home_score IS NOT NULL) AS with_results,
            count(*) FILTER (WHERE f.referee_user_id IS NOT NULL) AS with_referee
       FROM fixtures f
       JOIN stages s ON s.id = f.stage_id
       JOIN divisions d ON d.id = s.division_id
      WHERE d.event_id = $1
      GROUP BY d.name
      ORDER BY d.name`,
    [eventId],
  );

  for (const row of standing) {
    console.log(
      `  ${row.division}: ${row.games} games, ${row.with_results} with results, ` +
        `${row.with_referee} with a referee named`,
    );
  }

  const plans = await loadEventPlans(db, eventId);
  const event = buildEventSchedule(plans);

  for (const { plan, build } of event.perDivision) {
    const result = await persistSchedule(db, plan, build, { force });
    console.log(
      `  ${plan.divisionName}: ${result.inserted} games built, ${result.replaced} replaced`,
    );
  }

  for (const note of event.notes) console.log(`  note: ${note}`);
  console.log('Done.');
} catch (error) {
  // persistSchedule refuses loudly when something would be lost; pass that
  // straight through rather than dressing it up as a crash.
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.end();
}
