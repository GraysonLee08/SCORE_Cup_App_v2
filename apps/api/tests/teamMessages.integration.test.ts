import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Db } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { hashPassword } from '../src/auth/password.js';

/**
 * Who a message reaches.
 *
 * A message addressed to a team is for that team. It is written on the
 * assumption that outsiders will not read it -- "bring the spare kit, we clash
 * with Wintrust", "your 2:40 has moved" -- and the board is on a screen in the
 * middle of a park.
 *
 * Two readers apply the rule, and they apply different versions of it on
 * purpose: the board excludes anything addressed to a team, while a signed-in
 * page adds the team you are actually on. Nothing tells one what the other
 * decided, so nothing keeps them honest except this.
 *
 * A division message is deliberately public -- "Competitive: finals moved to
 * 5pm" is broadly relevant and goes on the board. Targeted and private are not
 * the same thing here, and the last test is there so that stays a decision
 * rather than becoming an accident.
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
    signedOut: (p: string) => {
      cookie = '';
      return send('GET', p);
    },
    async loginAs(email: string, password: string) {
      cookie = '';
      return send('POST', '/api/auth/login', { email, password });
    },
  };
}

suite('who a message reaches', () => {
  let db: Db;
  let client: ReturnType<typeof makeClient>;
  let eventId = '';
  let divisionId = '';
  let teamA = '';
  let teamB = '';

  const PW = 'an excellent player password';
  const ON_TEAM_A = 'msg-player-a@example.com';
  const ON_TEAM_B = 'msg-player-b@example.com';

  beforeAll(async () => {
    await migrate(url!);
    db = createPool(url!);
    for (const t of ['audit_log', 'announcements', 'fixtures', 'players', 'teams', 'pools',
                     'stages', 'division_fields', 'divisions', 'fields', 'events', 'users']) {
      await db.query(`DELETE FROM ${t}`);
    }

    const { rows: event } = await db.query<{ id: string }>(
      `INSERT INTO events (name, event_date, start_time, end_time)
       VALUES ('SCORE Cup','2026-08-29','09:00','17:00') RETURNING id`,
    );
    eventId = event[0]!.id;

    const { rows: division } = await db.query<{ id: string }>(
      `INSERT INTO divisions (event_id, name) VALUES ($1,'Community') RETURNING id`,
      [eventId],
    );
    divisionId = division[0]!.id;

    const { rows: teams } = await db.query<{ id: string }>(
      `INSERT INTO teams (division_id, name, join_code)
       VALUES ($1,'Mazek Law','AAAAAA'),($1,'Wintrust','BBBBBB') RETURNING id`,
      [divisionId],
    );
    teamA = teams[0]!.id;
    teamB = teams[1]!.id;

    for (const [email, teamId, name] of [
      [ON_TEAM_A, teamA, 'Robin A'],
      [ON_TEAM_B, teamB, 'Robin B'],
    ] as const) {
      const { rows: user } = await db.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, role, display_name)
         VALUES ($1,$2,'participant',$3) RETURNING id`,
        [email, await hashPassword(PW), name],
      );
      await db.query(
        `INSERT INTO players (team_id, user_id, first_name, last_name, email)
         VALUES ($1,$2,'Robin','Player',$3)`,
        [teamId, user[0]!.id, email],
      );
    }

    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: url,
      SESSION_SECRET: 'test-secret-that-is-definitely-long-enough',
    } as NodeJS.ProcessEnv);
    client = makeClient(createApp(config, db));
    await client.start();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM announcements');
  });

  afterAll(async () => {
    await client?.stop();
    await db?.end();
  });

  const announce = (title: string, target: { teamId?: string; divisionId?: string } = {}) =>
    db.query(
      `INSERT INTO announcements (event_id, division_id, team_id, title, message)
       VALUES ($1,$2,$3,$4,'body')`,
      [eventId, target.divisionId ?? null, target.teamId ?? null, title],
    );

  const titlesOnBoard = async () => {
    const res = await client.signedOut('/api/public/event');
    return (res.body.announcements as { title: string }[]).map((a) => a.title);
  };

  const titlesFor = async (email: string) => {
    await client.loginAs(email, PW);
    const res = await client.get('/api/participant/me');
    return (res.body.messages as { title: string }[]).map((a) => a.title);
  };

  it('keeps a message to one team off the public board', async () => {
    await announce('Bring the spare kit', { teamId: teamA });

    expect(await titlesOnBoard()).toEqual([]);
  });

  it('shows it to somebody signed in on that team', async () => {
    await announce('Bring the spare kit', { teamId: teamA });

    expect(await titlesFor(ON_TEAM_A)).toContain('Bring the spare kit');
  });

  it('keeps it from somebody signed in on another team', async () => {
    await announce('Bring the spare kit', { teamId: teamA });

    expect(await titlesFor(ON_TEAM_B)).not.toContain('Bring the spare kit');
  });

  it('sends a message with no address to everyone', async () => {
    await announce('Gates open at 8');

    expect(await titlesOnBoard()).toContain('Gates open at 8');
    expect(await titlesFor(ON_TEAM_A)).toContain('Gates open at 8');
    expect(await titlesFor(ON_TEAM_B)).toContain('Gates open at 8');
  });

  /**
   * Deliberate, and worth pinning precisely because it looks like the case
   * above: a division message is targeted but not private.
   */
  it('puts a division message on the board as well as the division', async () => {
    await announce('Community: finals moved to 5pm', { divisionId });

    expect(await titlesOnBoard()).toContain('Community: finals moved to 5pm');
    expect(await titlesFor(ON_TEAM_A)).toContain('Community: finals moved to 5pm');
  });

  it('separates the two rules when both kinds are live at once', async () => {
    await announce('Bring the spare kit', { teamId: teamA });
    await announce('Gates open at 8');

    // The board carries the open one and only the open one.
    expect(await titlesOnBoard()).toEqual(['Gates open at 8']);

    const forA = await titlesFor(ON_TEAM_A);
    expect(forA).toContain('Bring the spare kit');
    expect(forA).toContain('Gates open at 8');

    expect(await titlesFor(ON_TEAM_B)).toEqual(['Gates open at 8']);
  });
});
