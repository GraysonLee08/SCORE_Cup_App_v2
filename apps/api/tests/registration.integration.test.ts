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
    delete: (p: string) => send('DELETE', p),
    clearCookie() {
      cookie = '';
    },
    async loginAs(email: string, password: string) {
      this.clearCookie();
      return send('POST', '/api/auth/login', { email, password });
    },
  };
}

suite('registration and rosters', () => {
  let db: Db;
  let client: ReturnType<typeof makeClient>;
  let teamId = '';
  let joinCode = '';
  let coachId = '';

  const ADMIN_PW = 'an excellent admin password';
  const COACH_PW = 'an excellent coach password';

  beforeAll(async () => {
    await migrate(url!);
    db = createPool(url!);

    for (const table of ['audit_log', 'players', 'teams', 'divisions', 'events', 'users']) {
      await db.query(`DELETE FROM ${table}`);
    }

    await db.query(
      `INSERT INTO users (email, password_hash, role, display_name)
       VALUES ($1, $2, 'admin', 'Admin')`,
      ['admin@example.com', await hashPassword(ADMIN_PW)],
    );
    const { rows: coach } = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, display_name)
       VALUES ($1, $2, 'coach', 'Coach') RETURNING id`,
      ['coach@example.com', await hashPassword(COACH_PW)],
    );
    coachId = coach[0]!.id;

    const { rows: event } = await db.query<{ id: string }>(
      `INSERT INTO events (name, event_date, start_time, end_time)
       VALUES ('Test Cup', '2026-08-29', '09:00', '17:00') RETURNING id`,
    );
    const { rows: division } = await db.query<{ id: string }>(
      `INSERT INTO divisions (event_id, name) VALUES ($1, 'Competitive') RETURNING id`,
      [event[0]!.id],
    );

    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: url,
      SESSION_SECRET: 'test-secret-that-is-definitely-long-enough',
    } as NodeJS.ProcessEnv);

    client = makeClient(createApp(config, db));
    await client.start();

    await client.loginAs('admin@example.com', ADMIN_PW);
    const created = await client.post('/api/teams', {
      divisionId: division[0]!.id,
      name: 'Test Team',
      coachUserId: coachId,
    });
    teamId = created.body.id;
    joinCode = created.body.joinCode;
  });

  afterAll(async () => {
    await client?.stop();
    await db?.end();
  });

  it('gives a team a join code that avoids easily-misread characters', () => {
    expect(joinCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(joinCode).not.toMatch(/[0O1lI5S]/);
  });

  it('looks up a team from its code, case-insensitively', async () => {
    client.clearCookie();
    const res = await client.get(`/api/register/team-by-code/${joinCode.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.team.name).toBe('Test Team');
  });

  it('rejects an unrecognised code', async () => {
    const res = await client.get('/api/register/team-by-code/ZZZZZZ');
    expect(res.status).toBe(404);
  });

  it('registers a participant onto the right team', async () => {
    const res = await client.post('/api/register', {
      joinCode,
      firstName: 'Sam',
      lastName: 'Player',
      email: 'sam@example.com',
      password: 'a good long password',
    });
    expect(res.status).toBe(201);
    expect(res.body.teamName).toBe('Test Team');
    expect(res.body.merged).toBe(false);
  });

  it('refuses registration without a valid team code', async () => {
    const res = await client.post('/api/register', {
      joinCode: 'BADCOD',
      firstName: 'No',
      lastName: 'Entry',
      email: 'no@example.com',
      password: 'a good long password',
    });
    expect(res.status).toBe(404);
  });

  it('refuses a weak password', async () => {
    const res = await client.post('/api/register', {
      joinCode,
      firstName: 'Weak',
      lastName: 'Password',
      email: 'weak@example.com',
      password: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('weak_password');
  });

  it('merges a self-registration into the row a coach already entered', async () => {
    await client.loginAs('coach@example.com', COACH_PW);
    const added = await client.post(`/api/rosters/${teamId}/players`, {
      firstName: 'Alex',
      lastName: 'Fromroster',
      email: 'alex@example.com',
    });
    expect(added.status).toBe(201);

    client.clearCookie();
    const registered = await client.post('/api/register', {
      joinCode,
      firstName: 'Alex',
      lastName: 'Fromroster',
      email: 'alex@example.com',
      password: 'another good password',
      jerseySize: 'L',
    });
    expect(registered.status).toBe(201);
    expect(registered.body.merged).toBe(true);

    // The key assertion: one Alex, not two.
    const { rows } = await db.query<{ count: string }>(
      "SELECT count(*) FROM players WHERE lower(email) = 'alex@example.com'",
    );
    expect(Number(rows[0]!.count)).toBe(1);
  });

  it('keeps roster detail the coach entered when merging', async () => {
    const { rows } = await db.query<{ jersey_size: string; user_id: string }>(
      "SELECT jersey_size, user_id FROM players WHERE lower(email) = 'alex@example.com'",
    );
    expect(rows[0]!.jersey_size).toBe('L');
    expect(rows[0]!.user_id).not.toBeNull();
  });

  it('lets the coach see and edit their own roster', async () => {
    await client.loginAs('coach@example.com', COACH_PW);
    const list = await client.get(`/api/rosters/${teamId}/players`);
    expect(list.status).toBe(200);
    expect(list.body.players.length).toBeGreaterThanOrEqual(2);

    const player = list.body.players[0];
    const patched = await client.patch(`/api/rosters/${teamId}/players/${player.id}`, {
      jerseySize: 'XL',
      isCaptain: true,
    });
    expect(patched.status).toBe(204);
  });

  it('saves partial roster entries, so an interrupted coach loses nothing', async () => {
    await client.loginAs('coach@example.com', COACH_PW);
    const res = await client.post(`/api/rosters/${teamId}/players`, {
      firstName: 'Partial',
      lastName: 'Entry',
    });
    expect(res.status).toBe(201);
  });

  it('stops a coach reading another team’s roster', async () => {
    const { rows: division } = await db.query<{ id: string }>('SELECT id FROM divisions LIMIT 1');
    await client.loginAs('admin@example.com', ADMIN_PW);
    const other = await client.post('/api/teams', {
      divisionId: division[0]!.id,
      name: 'Other Team',
    });

    await client.loginAs('coach@example.com', COACH_PW);
    const res = await client.get(`/api/rosters/${other.body.id}/players`);
    expect(res.status).toBe(403);
  });

  it('stops a participant editing the roster', async () => {
    await client.loginAs('sam@example.com', 'a good long password');
    const res = await client.post(`/api/rosters/${teamId}/players`, {
      firstName: 'Sneaky',
      lastName: 'Addition',
    });
    expect(res.status).toBe(403);
  });

  it('lets a participant see their own team roster', async () => {
    await client.loginAs('sam@example.com', 'a good long password');
    const res = await client.get(`/api/rosters/${teamId}/players`);
    expect(res.status).toBe(200);
  });

  it('tells a participant which details are still missing', async () => {
    await client.loginAs('sam@example.com', 'a good long password');
    const res = await client.get('/api/register/my-profile');
    expect(res.status).toBe(200);
    expect(res.body.missingFields).toContain('emergencyContactPhone');
  });

  it('lets a participant correct what a coach entered about them', async () => {
    await client.loginAs('sam@example.com', 'a good long password');
    const patched = await client.patch('/api/register/my-profile', {
      emergencyContactFirstName: 'Jo',
      emergencyContactPhone: '555-0100',
    });
    expect(patched.status).toBe(204);

    const after = await client.get('/api/register/my-profile');
    expect(after.body.profile.emergencyContactPhone).toBe('555-0100');
    expect(after.body.missingFields).not.toContain('emergencyContactPhone');
  });

  it('rotates a leaked join code without disturbing registered players', async () => {
    await client.loginAs('admin@example.com', ADMIN_PW);
    const res = await client.post(`/api/teams/${teamId}/join-code`);
    expect(res.status).toBe(200);
    expect(res.body.joinCode).not.toBe(joinCode);

    const stale = await client.get(`/api/register/team-by-code/${joinCode}`);
    expect(stale.status).toBe(404);

    const { rows } = await db.query<{ count: string }>(
      'SELECT count(*) FROM players WHERE team_id = $1',
      [teamId],
    );
    expect(Number(rows[0]!.count)).toBeGreaterThan(0);
  });
});
