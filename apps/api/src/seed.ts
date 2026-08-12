import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';
import { hashPassword, generateJoinCode } from './auth/password.js';
import { DEFAULT_BRACKET_CONFIG, DEFAULT_POOL_CONFIG } from './services/stageConfig.js';
import { buildSchedule, loadDivisionPlan, persistSchedule } from './services/scheduleBuilder.js';

/**
 * Development seed: a complete, believable tournament in one command.
 *
 * Exists so the four views can be exercised without hand-entering a day's
 * worth of setup, and so a rehearsal on staging starts from something
 * realistic rather than an empty database.
 */
async function seed() {
  const config = loadConfig();
  await migrate(config.DATABASE_URL);
  const db = createPool(config.DATABASE_URL);

  try {
    for (const table of [
      'audit_log', 'match_signoffs', 'cards', 'fixtures', 'players',
      'ref_field_assignments', 'teams', 'pools', 'stages', 'division_fields',
      'divisions', 'fields', 'announcements', 'rules_pages', 'events', 'users',
    ]) {
      await db.query(`DELETE FROM ${table}`);
    }

    const password = await hashPassword('scores cup 2026 demo');
    const users: Record<string, string> = {};
    for (const [key, email, role, name] of [
      ['admin', 'admin@chicagoscores.org', 'admin', 'Tournament Admin'],
      ['ref1', 'ref1@chicagoscores.org', 'ref', 'Morgan Reyes'],
      ['ref2', 'ref2@chicagoscores.org', 'ref', 'Sam Okafor'],
      ['coach', 'coach@chicagoscores.org', 'coach', 'Jordan Blake'],
    ] as const) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, role, display_name)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [email, password, role, name],
      );
      users[key] = rows[0]!.id;
    }

    const { rows: eventRows } = await db.query<{ id: string }>(
      `INSERT INTO events (name, season, event_date, start_time, end_time, min_rest_minutes)
       VALUES ('SCORES Cup', '2026', '2026-08-29', '09:00', '17:00', 5) RETURNING id`,
    );
    const eventId = eventRows[0]!.id;

    const fieldIds: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const { rows } = await db.query<{ id: string }>(
        'INSERT INTO fields (event_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id',
        [eventId, `Field ${i}`, i],
      );
      fieldIds.push(rows[0]!.id);
    }

    // Referees cover two fields each, mirroring the real day.
    await db.query(
      'INSERT INTO ref_field_assignments (user_id, field_id) VALUES ($1,$2), ($1,$3)',
      [users.ref1, fieldIds[0], fieldIds[1]],
    );
    await db.query(
      'INSERT INTO ref_field_assignments (user_id, field_id) VALUES ($1,$2), ($1,$3)',
      [users.ref2, fieldIds[2], fieldIds[3]],
    );

    const divisionNames = ['Competitive', 'Community'] as const;
    for (const [index, divisionName] of divisionNames.entries()) {
      const { rows: divRows } = await db.query<{ id: string }>(
        'INSERT INTO divisions (event_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id',
        [eventId, divisionName, index],
      );
      const divisionId = divRows[0]!.id;

      // Two fields each, running concurrently.
      for (const fieldId of fieldIds.slice(index * 2, index * 2 + 2)) {
        await db.query(
          'INSERT INTO division_fields (division_id, field_id) VALUES ($1,$2)',
          [divisionId, fieldId],
        );
      }

      const { rows: poolStage } = await db.query<{ id: string }>(
        `INSERT INTO stages (division_id, kind, name, sequence, config)
         VALUES ($1,'pool','Pool Play',1,$2) RETURNING id`,
        [divisionId, { ...DEFAULT_POOL_CONFIG, poolCount: 2, gamesPerTeam: 3 }],
      );
      await db.query(
        `INSERT INTO stages (division_id, kind, name, sequence, config)
         VALUES ($1,'bracket','Knockout',2,$2)`,
        [divisionId, DEFAULT_BRACKET_CONFIG],
      );

      const poolIds: string[] = [];
      for (const [i, name] of ['Pool A', 'Pool B'].entries()) {
        const { rows } = await db.query<{ id: string }>(
          'INSERT INTO pools (stage_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id',
          [poolStage[0]!.id, name, i],
        );
        poolIds.push(rows[0]!.id);
      }

      const teamNames = [
        'Lakeview Lions', 'Pilsen Pumas', 'Hyde Park Hawks', 'Logan Square Larks',
        'Bronzeville Bolts', 'Uptown United', 'Wicker Park Wolves', 'Humboldt Herons',
      ];
      for (const [i, name] of teamNames.entries()) {
        const { rows } = await db.query<{ id: string }>(
          `INSERT INTO teams (division_id, pool_id, name, join_code, coach_user_id)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [
            divisionId,
            poolIds[i % 2],
            `${name}${index === 1 ? ' II' : ''}`,
            generateJoinCode(),
            i === 0 ? users.coach : null,
          ],
        );
        if (i === 0) {
          await db.query(
            `INSERT INTO players (team_id, first_name, last_name, is_captain)
             VALUES ($1,'Jordan','Blake',true)`,
            [rows[0]!.id],
          );
        }
      }

      const plan = await loadDivisionPlan(db, divisionId);
      const build = buildSchedule(plan);
      const result = await persistSchedule(db, plan, build, { force: true });
      console.log(`${divisionName}: ${result.inserted} fixtures scheduled`);
    }

    console.log('\nSeeded. Sign in with any of these (password: "scores cup 2026 demo"):');
    console.log('  admin@chicagoscores.org  — admin');
    console.log('  ref1@chicagoscores.org   — referee, Fields 1 and 2');
    console.log('  ref2@chicagoscores.org   — referee, Fields 3 and 4');
    console.log('  coach@chicagoscores.org  — coach');
  } finally {
    await db.end();
  }
}

seed().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
