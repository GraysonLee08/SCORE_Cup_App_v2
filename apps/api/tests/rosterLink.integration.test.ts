import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Db } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { hashPassword } from '../src/auth/password.js';

/**
 * A roster row and an account are two different things, and something has to
 * join them.
 *
 * Staff type the row from a paper list; the person makes the account. Only two
 * events ever connected the two -- registering with a join code, and being put
 * in charge of a team -- so an account whose own address was sitting on a
 * roster still signed in to "you are not on a roster yet". Taking someone off
 * "runs the team" put them straight back there.
 */
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

function makeClient(app: Express) {
  let port = 0;
  let cookie = '';
  let server: ReturnType<Express['listen']>;

  const send = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0]!;
    return { status: res.status, body: (await res.json().catch(() => null)) as any };
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
    async loginAs(email: string, password: string) {
      cookie = '';
      return send('POST', '/api/auth/login', { email, password });
    },
  };
}

suite('joining a roster row to its account', () => {
  let db: Db;
  let client: ReturnType<typeof makeClient>;
  let teamA = '';
  let teamB = '';

  const ADMIN_PW = 'an excellent admin password';
  const PLAYER_PW = 'an excellent player password';
  const PLAYER = 'rosterlink-player@example.com';

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
    await db.query(
      `INSERT INTO users (email, password_hash, role, display_name)
       VALUES ($1,$2,'participant','Robin Player')`,
      [PLAYER, await hashPassword(PLAYER_PW)],
    );

    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: url,
      SESSION_SECRET: 'test-secret-that-is-definitely-long-enough',
    } as NodeJS.ProcessEnv);
    client = makeClient(createApp(config, db));
    await client.start();

    await client.loginAs('admin@example.com', ADMIN_PW);
    const event = await client.post('/api/events', {
      name: 'Link Cup',
      eventDate: '2026-08-29',
      startTime: '09:00',
      endTime: '17:00',
    });
    const division = await client.post(`/api/events/${event.body.id}/divisions`, {
      name: 'Community',
    });
    teamA = (await client.post('/api/teams', { divisionId: division.body.id, name: 'Mazek Law' }))
      .body.id;
    teamB = (await client.post('/api/teams', { divisionId: division.body.id, name: 'Cornerstone' }))
      .body.id;
  });

  beforeEach(async () => {
    await db.query('DELETE FROM players');
    await client.loginAs('admin@example.com', ADMIN_PW);
  });

  afterAll(async () => {
    await client?.stop();
    await db?.end();
  });

  it('attaches a new roster row to an account that already exists', async () => {
    const res = await client.post(`/api/rosters/${teamA}/players`, {
      firstName: 'Robin',
      lastName: 'Player',
      email: PLAYER,
    });
    expect(res.status).toBe(201);
    expect(res.body.linkedToAccount).toBe(true);

    await client.loginAs(PLAYER, PLAYER_PW);
    const me = await client.get('/api/participant/me');
    expect(me.status).toBe(200);
    expect(me.body.team.name).toBe('Mazek Law');
  });

  it('attaches when the address is filled in afterwards', async () => {
    const created = await client.post(`/api/rosters/${teamA}/players`, {
      firstName: 'Robin',
      lastName: 'Player',
    });
    await client.patch(`/api/rosters/${teamA}/players/${created.body.id}`, { email: PLAYER });

    await client.loginAs(PLAYER, PLAYER_PW);
    expect((await client.get('/api/participant/me')).body.team.name).toBe('Mazek Law');
  });

  /**
   * The row that was already there when the account was made: nothing writes to
   * it afterwards, so neither roster route ever gets the chance.
   */
  it('attaches at sign-in a row that nothing has touched since', async () => {
    await db.query(
      `INSERT INTO players (team_id, first_name, last_name, email)
       VALUES ($1,'Robin','Player',$2)`,
      [teamA, PLAYER],
    );

    await client.loginAs(PLAYER, PLAYER_PW);
    expect((await client.get('/api/participant/me')).body.team.name).toBe('Mazek Law');
  });

  /**
   * Which team someone belongs to is a real question when their address sits on
   * two rosters and neither is attached to them, and guessing is worse than
   * saying so. Inserted directly, because that is how the state arises: rows
   * typed in while nothing was in a position to claim either.
   */
  it('refuses to guess between duplicates, and says that is the problem', async () => {
    for (const team of [teamA, teamB]) {
      await db.query(
        `INSERT INTO players (team_id, first_name, last_name, email)
         VALUES ($1,'Robin','Player',$2)`,
        [team, PLAYER],
      );
    }

    await client.loginAs(PLAYER, PLAYER_PW);
    const me = await client.get('/api/participant/me');

    expect(me.status).toBe(409);
    expect(me.body.code).toBe('duplicate_roster_rows');
    expect(me.body.error).toContain('2 rosters');
    // Not the old advice, which sent them for a code they never needed.
    expect(me.body.error).not.toContain('team code');
  });

  /**
   * One person, one roster row. A second row carrying the same address must not
   * drag them onto another team -- that would leave them on two, with the
   * lookup choosing between them by LIMIT 1.
   */
  it('leaves someone where they are when a second row appears', async () => {
    await client.post(`/api/rosters/${teamA}/players`, {
      firstName: 'Robin',
      lastName: 'Player',
      email: PLAYER,
    });
    const second = await client.post(`/api/rosters/${teamB}/players`, {
      firstName: 'Robin',
      lastName: 'Player',
      email: PLAYER,
    });
    expect(second.body.linkedToAccount).toBe(false);

    const { rows } = await db.query<{ n: string }>(
      'SELECT count(*) AS n FROM players WHERE user_id = (SELECT id FROM users WHERE email = $1)',
      [PLAYER],
    );
    expect(Number(rows[0]!.n)).toBe(1);

    await client.loginAs(PLAYER, PLAYER_PW);
    expect((await client.get('/api/participant/me')).body.team.name).toBe('Mazek Law');
  });

  it('still says nothing is there when nothing is', async () => {
    await client.loginAs(PLAYER, PLAYER_PW);
    const me = await client.get('/api/participant/me');
    expect(me.status).toBe(404);
    expect(me.body.code).toBe('no_team');
  });
});
