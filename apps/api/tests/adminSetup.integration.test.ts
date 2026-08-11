import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
    get: (p: string) => send('GET', p),
    post: (p: string, b?: unknown) => send('POST', p, b),
    patch: (p: string, b?: unknown) => send('PATCH', p, b),
  };
}

suite('admin setup and schedule generation', () => {
  let db: Db;
  let client: ReturnType<typeof makeClient>;
  let eventId = '';
  let divisionId = '';
  let poolStageId = '';
  const fieldIds: string[] = [];

  const ADMIN_PW = 'an excellent admin password';

  beforeAll(async () => {
    await migrate(url!);
    db = createPool(url!);
    for (const t of ['audit_log', 'fixtures', 'players', 'teams', 'pools', 'stages',
                     'division_fields', 'divisions', 'fields', 'events', 'users']) {
      await db.query(`DELETE FROM ${t}`);
    }
    await db.query(
      `INSERT INTO users (email, password_hash, role, display_name)
       VALUES ($1,$2,'admin','Admin')`,
      ['admin@example.com', await hashPassword(ADMIN_PW)],
    );

    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: url,
      SESSION_SECRET: 'test-secret-that-is-definitely-long-enough',
    } as NodeJS.ProcessEnv);
    client = makeClient(createApp(config, db));
    await client.start();
    await client.post('/api/auth/login', { email: 'admin@example.com', password: ADMIN_PW });
  });

  afterAll(async () => {
    await client?.stop();
    await db?.end();
  });

  it('creates an event with a day window', async () => {
    const res = await client.post('/api/events', {
      name: 'SCORE Cup 2026',
      eventDate: '2026-08-29',
      startTime: '09:00',
      endTime: '17:00',
      minRestMinutes: 5,
    });
    expect(res.status).toBe(201);
    eventId = res.body.id;
  });

  it('rejects an event that ends before it starts', async () => {
    const res = await client.post('/api/events', {
      name: 'Backwards',
      eventDate: '2026-08-29',
      startTime: '17:00',
      endTime: '09:00',
    });
    expect(res.status).toBe(400);
  });

  it('adds four fields', async () => {
    for (const name of ['Field 1', 'Field 2', 'Field 3', 'Field 4']) {
      const res = await client.post(`/api/events/${eventId}/fields`, { name });
      expect(res.status).toBe(201);
      fieldIds.push(res.body.id);
    }
  });

  it('pins a division to two of the four fields', async () => {
    const res = await client.post(`/api/events/${eventId}/divisions`, {
      name: 'Competitive',
      fieldIds: fieldIds.slice(0, 2),
    });
    expect(res.status).toBe(201);
    divisionId = res.body.id;
  });

  it('creates a pool stage and its pools', async () => {
    const res = await client.post(`/api/events/divisions/${divisionId}/stages`, {
      kind: 'pool',
      name: 'Pool Play',
      sequence: 1,
    });
    expect(res.status).toBe(201);
    poolStageId = res.body.id;

    const { rows } = await db.query('SELECT name FROM pools WHERE stage_id = $1', [poolStageId]);
    expect(rows).toHaveLength(2); // default poolCount
  });

  it('auto-assigns teams across pools in snake order', async () => {
    for (let i = 1; i <= 8; i++) {
      await client.post('/api/teams', { divisionId, name: `Team ${String(i).padStart(2, '0')}` });
    }

    const res = await client.post(`/api/events/divisions/${divisionId}/auto-assign-pools`);
    expect(res.status).toBe(200);
    expect(res.body.assigned).toBe(8);

    const { rows } = await db.query<{ pool_id: string; n: string }>(
      'SELECT pool_id, count(*) AS n FROM teams WHERE division_id = $1 GROUP BY pool_id',
      [divisionId],
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(Number(r.n)).toBe(4);
  });

  it('reports feasibility before anything is committed', async () => {
    const res = await client.get(`/api/schedule/divisions/${divisionId}/feasibility`);
    expect(res.status).toBe(200);
    expect(res.body.fixtureCount).toBe(12); // 2 pools of 4, 3 games each
    expect(res.body.fieldCount).toBe(2); // pinned
    expect(typeof res.body.summary).toBe('string');
  });

  it('generates and stores a schedule with real kickoff times', async () => {
    const res = await client.post(`/api/schedule/divisions/${divisionId}/generate`);
    expect(res.status).toBe(201);
    expect(res.body.inserted).toBe(12);

    const fixtures = await client.get(`/api/schedule/divisions/${divisionId}/fixtures`);
    expect(fixtures.body.fixtures).toHaveLength(12);

    const first = fixtures.body.fixtures[0];
    expect(first.homeTeamName).toBeTruthy();
    expect(first.fieldName).toBeTruthy();
    expect(new Date(first.kickoffAt).getTime()).toBeGreaterThan(0);
  });

  it('only uses the fields the division was pinned to', async () => {
    const res = await client.get(`/api/schedule/divisions/${divisionId}/fixtures`);
    const used = new Set(res.body.fixtures.map((f: any) => f.fieldName));
    expect([...used].sort()).toEqual(['Field 1', 'Field 2']);
  });

  it('never double-books a field or a team', async () => {
    const res = await client.get(`/api/schedule/divisions/${divisionId}/fixtures`);
    const fieldSlots = new Set<string>();
    const teamSlots = new Set<string>();

    for (const f of res.body.fixtures) {
      const slot = new Date(f.kickoffAt).toISOString();
      const fieldKey = `${f.fieldName}@${slot}`;
      expect(fieldSlots.has(fieldKey)).toBe(false);
      fieldSlots.add(fieldKey);

      for (const team of [f.homeTeamName, f.awayTeamName]) {
        const teamKey = `${team}@${slot}`;
        expect(teamSlots.has(teamKey)).toBe(false);
        teamSlots.add(teamKey);
      }
    }
  });

  it('refuses to regenerate once results exist', async () => {
    const { rows } = await db.query<{ id: string }>(
      `SELECT f.id FROM fixtures f JOIN stages s ON s.id = f.stage_id
        WHERE s.division_id = $1 LIMIT 1`,
      [divisionId],
    );
    await db.query('UPDATE fixtures SET home_score = 2, away_score = 1 WHERE id = $1', [
      rows[0]!.id,
    ]);

    const res = await client.post(`/api/schedule/divisions/${divisionId}/generate`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('results_would_be_lost');

    // The result must still be there after the refusal.
    const { rows: after } = await db.query<{ home_score: number }>(
      'SELECT home_score FROM fixtures WHERE id = $1',
      [rows[0]!.id],
    );
    expect(after[0]!.home_score).toBe(2);
  });

  it('overwrites only when explicitly forced', async () => {
    const res = await client.post(`/api/schedule/divisions/${divisionId}/generate`, {
      force: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.replaced).toBe(12);
  });

  it('explains an impossible format instead of failing obscurely', async () => {
    const bad = await client.post(`/api/events/${eventId}/divisions`, { name: 'Impossible' });
    const badDivisionId = bad.body.id;

    await client.post(`/api/events/divisions/${badDivisionId}/stages`, {
      kind: 'pool',
      name: 'Bad Pools',
      sequence: 1,
      config: {
        kind: 'pool',
        poolCount: 1,
        gamesPerTeam: 3,
        scoring: { win: 3, draw: 1, loss: 0, shutoutWinBonus: 1 },
        penaltyPoints: { yellow: 1, red: 1 },
        tiebreakers: ['headToHead'],
        timing: { halfMinutes: 14, halftimeMinutes: 2, changeoverMinutes: 5 },
      },
    });

    // 5 teams x 3 games = 7.5 fixtures. No such schedule exists.
    for (let i = 1; i <= 5; i++) {
      await client.post('/api/teams', { divisionId: badDivisionId, name: `Bad ${i}` });
    }
    await client.post(`/api/events/divisions/${badDivisionId}/auto-assign-pools`);

    const res = await client.post(`/api/schedule/divisions/${badDivisionId}/generate`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('schedule_impossible');
    expect(res.body.error).toMatch(/not a whole number/);
  });

  it('rejects stage settings that do not match the stage type', async () => {
    const res = await client.post(`/api/events/divisions/${divisionId}/stages`, {
      kind: 'bracket',
      name: 'Mismatched',
      sequence: 9,
      config: {
        kind: 'pool',
        poolCount: 2,
        gamesPerTeam: 3,
        scoring: { win: 3, draw: 1, loss: 0, shutoutWinBonus: 1 },
        penaltyPoints: { yellow: 1, red: 1 },
        tiebreakers: ['headToHead'],
        timing: { halfMinutes: 14, halftimeMinutes: 2, changeoverMinutes: 5 },
      },
    });
    expect(res.status).toBe(400);
  });
});
