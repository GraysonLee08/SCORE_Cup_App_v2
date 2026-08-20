import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Db } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { hashPassword } from '../src/auth/password.js';

/**
 * Putting one person in charge of a team.
 *
 * Captain and coach are the same person here: whoever is sent the join code and
 * is answerable for the side. The column recording it has existed from the
 * start, but was only ever written when a team was created and nothing ever
 * sent it -- so a team that already existed could not be handed to anybody, and
 * an account made for the job signed in to "you are not on a roster yet".
 *
 * Two things have to be true afterwards or the delegation is decorative: the
 * roster becomes editable by them, and the team shows up when they sign in.
 */
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
    put: (p: string, b?: unknown) => send('PUT', p, b),
    async loginAs(email: string, password: string) {
      cookie = '';
      return send('POST', '/api/auth/login', { email, password });
    },
  };
}

suite('putting someone in charge of a team', () => {
  let db: Db;
  let client: ReturnType<typeof makeClient>;
  let teamId = '';
  let otherTeamId = '';
  let captainId = '';
  let refId = '';
  let divisionId = '';

  const ADMIN_PW = 'an excellent admin password';
  const CAPTAIN_PW = 'an excellent captain password';
  const CAPTAIN_EMAIL = 'captain@example.com';

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

    // Registered with the join code, so a participant -- which is what the
    // registration route hands out, whoever the person turns out to be.
    const { rows: captain } = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, display_name)
       VALUES ($1, $2, 'participant', 'Brianna Captain') RETURNING id`,
      [CAPTAIN_EMAIL, await hashPassword(CAPTAIN_PW)],
    );
    captainId = captain[0]!.id;

    const { rows: ref } = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, display_name)
       VALUES ($1, $2, 'ref', 'Reggie Ref') RETURNING id`,
      ['coachtest-ref@example.com', await hashPassword('an excellent referee password')],
    );
    refId = ref[0]!.id;

    const { rows: event } = await db.query<{ id: string }>(
      `INSERT INTO events (name, event_date, start_time, end_time)
       VALUES ('Test Cup', '2026-08-29', '09:00', '17:00') RETURNING id`,
    );
    const { rows: division } = await db.query<{ id: string }>(
      `INSERT INTO divisions (event_id, name) VALUES ($1, 'Community') RETURNING id`,
      [event[0]!.id],
    );
    divisionId = division[0]!.id;

    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: url,
      SESSION_SECRET: 'test-secret-that-is-definitely-long-enough',
    } as NodeJS.ProcessEnv);

    client = makeClient(createApp(config, db));
    await client.start();

    await client.loginAs('admin@example.com', ADMIN_PW);
    const made = await client.post('/api/teams', { divisionId, name: 'AbbVie' });
    teamId = made.body.id;
    const other = await client.post('/api/teams', { divisionId, name: 'Wintrust' });
    otherTeamId = other.body.id;

    // The roster entry an admin typed in from a paper list: carries the email
    // and the captain tick, but belongs to no account.
    await db.query(
      `INSERT INTO players (team_id, first_name, last_name, email, is_captain)
       VALUES ($1, 'Brianna', 'Captain', $2, TRUE)`,
      [teamId, CAPTAIN_EMAIL],
    );
  });

  afterAll(async () => {
    await client?.stop();
    await db?.end();
  });

  it('starts with nobody in charge, which is the state that caused this', async () => {
    const { rows } = await db.query<{ coach_user_id: string | null }>(
      'SELECT coach_user_id FROM teams WHERE id = $1',
      [teamId],
    );
    expect(rows[0]!.coach_user_id).toBeNull();
  });

  it('refuses a referee, who has no team screen to see it on', async () => {
    await client.loginAs('admin@example.com', ADMIN_PW);
    const res = await client.put(`/api/teams/${teamId}/coach`, { userId: refId });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('role_cannot_coach');
  });

  it('puts the captain in charge, and links the roster row they were already on', async () => {
    await client.loginAs('admin@example.com', ADMIN_PW);
    const res = await client.put(`/api/teams/${teamId}/coach`, { userId: captainId });

    expect(res.status).toBe(200);
    // Registering is what normally links a roster row, and it is closed to them
    // -- their email already has an account, so registration refuses it.
    expect(res.body.claimedPlayer).toBe(true);
    expect(res.body.promotedToCoach).toBe(true);

    const { rows } = await db.query<{ user_id: string | null; is_captain: boolean }>(
      'SELECT user_id, is_captain FROM players WHERE team_id = $1',
      [teamId],
    );
    expect(rows[0]!.user_id).toBe(captainId);
    expect(rows[0]!.is_captain).toBe(true);
  });

  /**
   * The point of the whole exercise. Before this existed the same sign-in
   * returned 404 "You are not on a roster yet" -- an account, a roster row with
   * the captain tick, and no way for the app to connect the two.
   */
  it('shows the captain their team when they sign in', async () => {
    await client.loginAs(CAPTAIN_EMAIL, CAPTAIN_PW);
    const res = await client.get('/api/participant/me');

    expect(res.status).toBe(200);
    expect(res.body.team.name).toBe('AbbVie');
    expect(res.body.teammates.some((t: { isCaptain: boolean }) => t.isCaptain)).toBe(true);
  });

  it('lets them edit the roster they are answerable for', async () => {
    await client.loginAs(CAPTAIN_EMAIL, CAPTAIN_PW);
    const res = await client.get(`/api/rosters/${teamId}/players`);

    expect(res.status).toBe(200);
  });

  /**
   * The flag the roster screen switches on. Not isCoach, which only reports
   * having no player row -- a captain who runs the team and plays in it has
   * one, and would have been shown a read-only list of their own roster.
   */
  it('tells the team page that this person may change the roster', async () => {
    await client.loginAs(CAPTAIN_EMAIL, CAPTAIN_PW);
    const me = await client.get('/api/participant/me');

    expect(me.body.canEditRoster).toBe(true);
    expect(me.body.isCoach).toBe(false);
  });

  it('will not hand one person a second team they could never reach', async () => {
    await client.loginAs('admin@example.com', ADMIN_PW);
    const res = await client.put(`/api/teams/${otherTeamId}/coach`, { userId: captainId });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('already_running_a_team');
  });

  it('can take them off again without changing what their account is', async () => {
    await client.loginAs('admin@example.com', ADMIN_PW);
    const res = await client.put(`/api/teams/${teamId}/coach`, { userId: null });
    expect(res.status).toBe(200);

    const { rows } = await db.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [
      captainId,
    ]);
    // Removing someone from a team is not a reason to silently demote them.
    expect(rows[0]!.role).toBe('coach');
  });
});
