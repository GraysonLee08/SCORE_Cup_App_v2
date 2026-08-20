import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Db } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { hashPassword } from '../src/auth/password.js';

/**
 * Joining a team when you already have an account.
 *
 * Registering with a code refuses an address that already has one, which left
 * anyone who did with nowhere to go: enter the code, be told to sign in, sign
 * in, arrive at a page with no team on it. That is the captains whose accounts
 * were made for them, and next year it is every returning player.
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
    signOut: () => {
      cookie = '';
    },
    async loginAs(email: string, password: string) {
      cookie = '';
      return send('POST', '/api/auth/login', { email, password });
    },
  };
}

suite('joining a team with a code', () => {
  let db: Db;
  let client: ReturnType<typeof makeClient>;
  let codeA = '';
  let codeB = '';
  let teamA = '';

  const ADMIN_PW = 'an excellent admin password';
  const PLAYER_PW = 'an excellent player password';
  const PLAYER = 'returning-player@example.com';

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
       VALUES ($1,$2,'participant','Robin Fielder')`,
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
      name: 'Join Cup', eventDate: '2026-08-29', startTime: '09:00', endTime: '17:00',
    });
    const division = await client.post(`/api/events/${event.body.id}/divisions`, {
      name: 'Community',
    });
    const a = await client.post('/api/teams', { divisionId: division.body.id, name: 'Mazek Law' });
    const b = await client.post('/api/teams', { divisionId: division.body.id, name: 'Wintrust' });
    teamA = a.body.id;
    codeA = a.body.joinCode;
    codeB = b.body.joinCode;
  });

  beforeEach(async () => {
    await db.query('DELETE FROM players');
  });

  afterAll(async () => {
    await client?.stop();
    await db?.end();
  });

  it('puts a signed-in account onto the team, using the name on the account', async () => {
    await client.loginAs(PLAYER, PLAYER_PW);
    const res = await client.post('/api/join', { joinCode: codeA });

    expect(res.status).toBe(201);
    expect(res.body.teamName).toBe('Mazek Law');
    expect(res.body.claimed).toBe(false);

    const me = await client.get('/api/participant/me');
    expect(me.status).toBe(200);
    expect(me.body.team.name).toBe('Mazek Law');
    expect(me.body.teammates[0].firstName).toBe('Robin');
    expect(me.body.teammates[0].lastName).toBe('Fielder');
  });

  it('takes the row a coach already typed rather than making a second one', async () => {
    // Signed in first, so the row appears while the session is open and
    // sign-in has had no chance to claim it.
    await client.loginAs(PLAYER, PLAYER_PW);
    await db.query(
      `INSERT INTO players (team_id, first_name, last_name, email, is_captain)
       VALUES ($1,'Robin','Fielder',$2,TRUE)`,
      [teamA, PLAYER],
    );

    const res = await client.post('/api/join', { joinCode: codeA });
    expect(res.body.claimed).toBe(true);

    const { rows } = await db.query<{ n: string }>(
      'SELECT count(*) AS n FROM players WHERE team_id = $1',
      [teamA],
    );
    expect(Number(rows[0]!.n)).toBe(1);

    // The captain tick a coach set survives being claimed.
    const me = await client.get('/api/participant/me');
    expect(me.body.teammates[0].isCaptain).toBe(true);
  });

  it('is harmless to use the same code twice', async () => {
    await client.loginAs(PLAYER, PLAYER_PW);
    await client.post('/api/join', { joinCode: codeA });
    const again = await client.post('/api/join', { joinCode: codeA });

    expect(again.status).toBe(200);
    expect(again.body.alreadyThere).toBe(true);

    const { rows } = await db.query<{ n: string }>('SELECT count(*) AS n FROM players');
    expect(Number(rows[0]!.n)).toBe(1);
  });

  /**
   * Codes get forwarded. Using someone else's should not quietly take a player
   * off the team they are already on -- that is a decision, not a side effect.
   */
  it('will not move somebody who is already on a team', async () => {
    await client.loginAs(PLAYER, PLAYER_PW);
    await client.post('/api/join', { joinCode: codeA });

    const res = await client.post('/api/join', { joinCode: codeB });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('already_on_a_roster');
    expect(res.body.error).toContain('Mazek Law');

    expect((await client.get('/api/participant/me')).body.team.name).toBe('Mazek Law');
  });

  /**
   * The case sign-in deliberately will not touch. With one address on two
   * rosters, nothing can tell which team is theirs -- but the code can, because
   * only the team that issued it hands it out.
   */
  it('settles duplicates that sign-in refuses to guess between', async () => {
    const { rows: teams } = await db.query<{ id: string }>('SELECT id FROM teams ORDER BY name');
    for (const t of teams) {
      await db.query(
        `INSERT INTO players (team_id, first_name, last_name, email)
         VALUES ($1,'Robin','Fielder',$2)`,
        [t.id, PLAYER],
      );
    }

    await client.loginAs(PLAYER, PLAYER_PW);
    // Sign-in leaves it alone, as it should.
    expect((await client.get('/api/participant/me')).status).toBe(409);

    const res = await client.post('/api/join', { joinCode: codeA });
    expect(res.body.claimed).toBe(true);
    expect((await client.get('/api/participant/me')).body.team.name).toBe('Mazek Law');
  });

  it('rejects a code that is not a team', async () => {
    await client.loginAs(PLAYER, PLAYER_PW);
    const res = await client.post('/api/join', { joinCode: 'NOPE12' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('unknown_code');
  });

  it('is closed to anyone not signed in', async () => {
    client.signOut();
    const res = await client.post('/api/join', { joinCode: codeA });
    expect(res.status).toBe(401);
  });
});
