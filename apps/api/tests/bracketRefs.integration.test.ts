import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Db } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { hashPassword } from '../src/auth/password.js';

/**
 * A knockout game has to point at the game it is waiting on.
 *
 * The engine names a game before it exists -- "<stage>:r2:1" -- and later games
 * refer to it by that name. The row then gets a fresh uuid on insert. Left as
 * it was, every one of those pointers named a game no table had, and the winner
 * lookup is keyed by database id, so it never matched. The Championship would
 * have read "Winner of earlier match v Winner of earlier match" with both
 * semi-finals long finished, on the one screen everybody is watching.
 *
 * The last test is the one that matters: play the semis, and see the final fill
 * in by itself.
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
  };
}

suite('knockout games point at real rows', () => {
  let db: Db;
  let client: ReturnType<typeof makeClient>;
  let divisionId = '';

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

    const event = await client.post('/api/events', {
      name: 'Bracket Cup',
      eventDate: '2026-08-29',
      startTime: '09:00',
      endTime: '18:00',
    });
    for (const name of ['Field 1', 'Field 2']) {
      await client.post(`/api/events/${event.body.id}/fields`, { name });
    }
    const division = await client.post(`/api/events/${event.body.id}/divisions`, {
      name: 'Competitive',
    });
    divisionId = division.body.id;

    await client.post(`/api/events/divisions/${divisionId}/stages`, {
      kind: 'pool',
      name: 'Pool Play',
      sequence: 1,
    });
    for (let i = 1; i <= 8; i++) {
      await client.post('/api/teams', { divisionId, name: `Team ${String(i).padStart(2, '0')}` });
    }
    await client.post(`/api/events/divisions/${divisionId}/auto-assign-pools`);

    await client.post(`/api/events/divisions/${divisionId}/stages`, {
      kind: 'bracket',
      name: 'Playoffs',
      sequence: 2,
    });

    await client.post(`/api/schedule/divisions/${divisionId}/generate`);
  });

  afterAll(async () => {
    await client?.stop();
    await db?.end();
  });

  it('builds a knockout that waits on earlier games', async () => {
    const { rows } = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM fixtures f JOIN stages s ON s.id = f.stage_id
        WHERE s.division_id = $1 AND f.home_ref->>'kind' = 'fixtureWinner'`,
      [divisionId],
    );
    // Without at least one, the rest of this file proves nothing.
    expect(Number(rows[0]!.n)).toBeGreaterThan(0);
  });

  it('names a game that exists, not the one the engine invented', async () => {
    const { rows } = await db.query<{ ref: string }>(
      `SELECT f.home_ref->>'fixtureId' AS ref
         FROM fixtures f JOIN stages s ON s.id = f.stage_id
        WHERE s.division_id = $1 AND f.home_ref->>'kind' = 'fixtureWinner'`,
      [divisionId],
    );

    for (const { ref } of rows) {
      // The engine's own name looks like "<uuid>:r2:1" and is not a uuid.
      expect(ref).toMatch(/^[0-9a-f-]{36}$/);
      const { rows: target } = await db.query('SELECT 1 FROM fixtures WHERE id = $1::uuid', [ref]);
      expect(target).toHaveLength(1);
    }
  });

  /**
   * The end-to-end proof, and the reason any of this matters. Bracket entrants
   * are worked out on read and never written back, so the only way to see this
   * is through the public view -- the same answer the board shows.
   */
  it('fills the next round in once its feeders are played', async () => {
    // Play the pools out, so the knockout knows who is in it at all.
    await db.query(
      `UPDATE fixtures SET home_score = 2, away_score = 1, status = 'complete'
        WHERE stage_id IN (SELECT id FROM stages WHERE division_id = $1 AND kind = 'pool')`,
      [divisionId],
    );

    const bracketOf = (body: any) =>
      body.fixtures.filter((f: { stageKind: string }) => f.stageKind === 'bracket');

    const before = bracketOf((await client.get(`/api/public/divisions/${divisionId}`)).body);
    const waiting = before.filter((f: { homeTeamName: string }) =>
      /^Winner of /.test(f.homeTeamName),
    );
    // A later round that is still waiting on an earlier one -- the case that
    // was broken. If there is none, this test is not exercising anything.
    expect(waiting.length).toBeGreaterThan(0);

    // Play the knockout a round at a time. Each pass should hand the next
    // round its teams; a bracket that never resolves would stop making
    // progress and trip the guard below.
    let bracket = before;
    for (let round = 0; round < 6; round++) {
      const ready = bracket.filter(
        (f: { homeTeamId: string | null; homeScore: number | null }) =>
          f.homeTeamId && f.homeScore === null,
      );
      if (ready.length === 0) break;

      for (const f of ready) {
        await db.query(
          `UPDATE fixtures SET home_score = 3, away_score = 0, status = 'complete' WHERE id = $1`,
          [f.id],
        );
      }
      bracket = bracketOf((await client.get(`/api/public/divisions/${divisionId}`)).body);
    }

    // Nothing is left waiting on a game that has been played.
    const stranded = bracket.filter((f: { homeTeamName: string; awayTeamName: string }) =>
      /^(Winner|Loser) of /.test(f.homeTeamName) || /^(Winner|Loser) of /.test(f.awayTeamName),
    );
    expect(stranded).toHaveLength(0);

    // And the last game names two real teams -- the Championship, filled in by
    // itself, which is the whole point.
    const championship = bracket[bracket.length - 1];
    expect(championship.homeTeamId).toBeTruthy();
    expect(championship.homeTeamName).toMatch(/^Team /);
    expect(championship.awayTeamName).toMatch(/^Team /);
  });
});
