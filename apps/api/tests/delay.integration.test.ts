import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Db } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { hashPassword } from '../src/auth/password.js';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

function makeClient(app: Express) {
  let port = 0;
  let cookie = '';
  let server: ReturnType<Express['listen']>;

  const send = async (
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: any }> => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0]!;
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  return {
    async start() {
      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          port = (server.address() as { port: number }).port;
          resolve();
        });
      });
    },
    async stop() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
    post: (p: string, b?: unknown) => send('POST', p, b),
  };
}

/**
 * Pushing the day back when it is running late.
 *
 * The interesting cases are all about what must NOT move: a game that has been
 * played, a game under way, and the half of the day belonging to another
 * division that shares the same pitches.
 */
suite('delaying the rest of the day', () => {
  let db: Db;
  let client: ReturnType<typeof makeClient>;
  let eventId = '';
  const ADMIN_PW = 'an excellent admin password';

  /** 9:00, 9:35 and 10:10 Chicago time on the day of the event. */
  const ROUND = ['2026-08-29T14:00:00.000Z', '2026-08-29T14:35:00.000Z', '2026-08-29T15:10:00.000Z'];

  async function seed() {
    for (const t of ['audit_log', 'fixtures', 'stages', 'divisions', 'fields', 'events']) {
      await db.query(`DELETE FROM ${t}`);
    }

    const { rows: eventRows } = await db.query<{ id: string }>(
      `INSERT INTO events (name, event_date, start_time, end_time, timezone, min_rest_minutes)
       VALUES ('SCORE Cup', '2026-08-29', '09:00', '17:00', 'America/Chicago', 5)
       RETURNING id`,
    );
    eventId = eventRows[0]!.id;

    const { rows: fieldRows } = await db.query<{ id: string }>(
      `INSERT INTO fields (event_id, name, sort_order) VALUES ($1,'Field 1',1) RETURNING id`,
      [eventId],
    );

    // Two divisions sharing the venue, so a delay that stopped at a division
    // boundary would be visible.
    const stageIds: string[] = [];
    for (const name of ['Competitive', 'Community']) {
      const { rows: divisionRows } = await db.query<{ id: string }>(
        `INSERT INTO divisions (event_id, name) VALUES ($1,$2) RETURNING id`,
        [eventId, name],
      );
      const { rows: stageRows } = await db.query<{ id: string }>(
        `INSERT INTO stages (division_id, kind, name, sequence, config)
         VALUES ($1,'pool','Pool play',1,'{}'::jsonb) RETURNING id`,
        [divisionRows[0]!.id],
      );
      stageIds.push(stageRows[0]!.id);
    }

    // One game per round per division, all still to be played.
    for (const stageId of stageIds) {
      for (const kickoff of ROUND) {
        await db.query(
          `INSERT INTO fixtures (stage_id, field_id, kickoff_at, status, home_ref, away_ref)
           VALUES ($1,$2,$3,'scheduled','{"kind":"poolPosition","poolId":"p","position":1}'::jsonb,
                   '{"kind":"poolPosition","poolId":"p","position":2}'::jsonb)`,
          [stageId, fieldRows[0]!.id, kickoff],
        );
      }
    }
  }

  async function kickoffsAt(iso: string): Promise<number> {
    const { rows } = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM fixtures f
         JOIN stages s ON s.id = f.stage_id
         JOIN divisions d ON d.id = s.division_id
        WHERE d.event_id = $1 AND f.kickoff_at = $2`,
      [eventId, iso],
    );
    return Number(rows[0]!.n);
  }

  beforeAll(async () => {
    await migrate(url!);
    db = createPool(url!);
    await db.query('DELETE FROM users');
    await db.query(
      `INSERT INTO users (email, password_hash, role, display_name)
       VALUES ($1,$2,'admin','Admin')`,
      ['delay-admin@example.com', await hashPassword(ADMIN_PW)],
    );

    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: url,
      SESSION_SECRET: 'test-secret-that-is-definitely-long-enough',
    } as NodeJS.ProcessEnv);
    client = makeClient(createApp(config, db));
    await client.start();
    await client.post('/api/auth/login', {
      email: 'delay-admin@example.com',
      password: ADMIN_PW,
    });
  });

  beforeEach(seed);

  afterAll(async () => {
    await client?.stop();
    await db?.end();
  });

  it('moves the chosen round and everything after it, and nothing before', async () => {
    const res = await client.post(`/api/schedule/events/${eventId}/delay`, {
      fromKickoffAt: ROUND[1],
      minutes: 10,
    });

    expect(res.status).toBe(200);
    // Rounds 2 and 3, both divisions.
    expect(res.body.moved).toBe(4);

    expect(await kickoffsAt(ROUND[0]!)).toBe(2); // 9:00 untouched
    expect(await kickoffsAt(ROUND[1]!)).toBe(0); // 9:35 vacated
    expect(await kickoffsAt('2026-08-29T14:45:00.000Z')).toBe(2); // now 9:45
    expect(await kickoffsAt('2026-08-29T15:20:00.000Z')).toBe(2); // now 10:20
  });

  /**
   * Divisions share pitches. Moving only one of them is how you produce two
   * games on the same grass at the same time.
   */
  it('moves both divisions, not just one', async () => {
    await client.post(`/api/schedule/events/${eventId}/delay`, {
      fromKickoffAt: ROUND[0],
      minutes: 15,
    });

    const { rows } = await db.query<{ name: string; n: string }>(
      `SELECT d.name, count(*) AS n FROM fixtures f
         JOIN stages s ON s.id = f.stage_id
         JOIN divisions d ON d.id = s.division_id
        WHERE d.event_id = $1 AND f.kickoff_at = '2026-08-29T14:15:00.000Z'
        GROUP BY d.name ORDER BY d.name`,
      [eventId],
    );

    expect(rows.map((r) => [r.name, Number(r.n)])).toEqual([
      ['Community', 1],
      ['Competitive', 1],
    ]);
  });

  /** A played game's kickoff is a record of when it happened, not a plan. */
  it('leaves finished and in-progress games where they are', async () => {
    await db.query(
      `UPDATE fixtures SET status = 'complete', home_score = 2, away_score = 1
        WHERE kickoff_at = $1`,
      [ROUND[1]],
    );
    await db.query(`UPDATE fixtures SET status = 'in_progress' WHERE kickoff_at = $1`, [
      ROUND[2],
    ]);

    const res = await client.post(`/api/schedule/events/${eventId}/delay`, {
      fromKickoffAt: ROUND[0],
      minutes: 10,
    });

    // Only the two still-scheduled 9:00 games move.
    expect(res.body.moved).toBe(2);
    expect(await kickoffsAt(ROUND[1]!)).toBe(2);
    expect(await kickoffsAt(ROUND[2]!)).toBe(2);
  });

  it('undoes itself when run again with the opposite sign', async () => {
    await client.post(`/api/schedule/events/${eventId}/delay`, {
      fromKickoffAt: ROUND[1],
      minutes: 20,
    });
    await client.post(`/api/schedule/events/${eventId}/delay`, {
      fromKickoffAt: '2026-08-29T14:55:00.000Z',
      minutes: -20,
    });

    for (const round of ROUND) expect(await kickoffsAt(round)).toBe(2);
  });

  it('refuses to pull games back before the tournament opens', async () => {
    const res = await client.post(`/api/schedule/events/${eventId}/delay`, {
      fromKickoffAt: ROUND[0],
      minutes: -30,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('before_event_start');
    expect(await kickoffsAt(ROUND[0]!)).toBe(2);
  });

  it('reports when the day now runs past its finish time', async () => {
    const res = await client.post(`/api/schedule/events/${eventId}/delay`, {
      fromKickoffAt: ROUND[0],
      minutes: 240,
    });

    expect(res.body.overrunsEndTime).toBe(false);

    const second = await client.post(`/api/schedule/events/${eventId}/delay`, {
      fromKickoffAt: '2026-08-29T18:00:00.000Z',
      minutes: 180,
    });
    expect(second.body.overrunsEndTime).toBe(true);
  });

  it('says so when there is nothing left to move', async () => {
    await db.query(`UPDATE fixtures SET status = 'complete'`);

    const res = await client.post(`/api/schedule/events/${eventId}/delay`, {
      fromKickoffAt: ROUND[0],
      minutes: 10,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('nothing_to_move');
  });

  it('refuses a delay of nothing', async () => {
    const res = await client.post(`/api/schedule/events/${eventId}/delay`, {
      fromKickoffAt: ROUND[0],
      minutes: 0,
    });
    expect(res.status).toBe(400);
  });
});
