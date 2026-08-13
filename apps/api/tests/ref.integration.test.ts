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
    put: (p: string, b?: unknown) => send('PUT', p, b),
    del: (p: string) => send('DELETE', p),
    async loginAs(email: string, password: string) {
      cookie = '';
      return send('POST', '/api/auth/login', { email, password });
    },
  };
}

suite('referee score entry', () => {
  let db: Db;
  let client: ReturnType<typeof makeClient>;
  let myFixtureId = '';
  let otherFixtureId = '';
  let homeTeamId = '';
  let awayTeamId = '';

  const PW = 'a perfectly good password';

  beforeAll(async () => {
    await migrate(url!);
    db = createPool(url!);
    for (const t of ['audit_log', 'match_signoffs', 'cards', 'fixtures', 'players',
                     'ref_field_assignments', 'teams', 'pools', 'stages',
                     'division_fields', 'divisions', 'fields', 'events', 'users']) {
      await db.query(`DELETE FROM ${t}`);
    }

    const hash = await hashPassword(PW);
    const { rows: refRows } = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, display_name)
       VALUES ('ref@example.com',$1,'ref','Ref One') RETURNING id`,
      [hash],
    );
    await db.query(
      `INSERT INTO users (email, password_hash, role, display_name)
       VALUES ('coach@example.com',$1,'coach','A Coach')`,
      [hash],
    );

    const { rows: ev } = await db.query<{ id: string }>(
      `INSERT INTO events (name, event_date, start_time, end_time)
       VALUES ('T','2026-08-29','09:00','17:00') RETURNING id`,
    );
    const { rows: myField } = await db.query<{ id: string }>(
      `INSERT INTO fields (event_id, name) VALUES ($1,'Field 1') RETURNING id`, [ev[0]!.id],
    );
    const { rows: otherField } = await db.query<{ id: string }>(
      `INSERT INTO fields (event_id, name) VALUES ($1,'Field 2') RETURNING id`, [ev[0]!.id],
    );
    // Assigned to Field 1 only.
    await db.query(
      'INSERT INTO ref_field_assignments (user_id, field_id) VALUES ($1,$2)',
      [refRows[0]!.id, myField[0]!.id],
    );

    const { rows: div } = await db.query<{ id: string }>(
      `INSERT INTO divisions (event_id, name) VALUES ($1,'D') RETURNING id`, [ev[0]!.id],
    );
    const { rows: stage } = await db.query<{ id: string }>(
      `INSERT INTO stages (division_id, kind, name, sequence, config)
       VALUES ($1,'pool','Pool',1,'{}') RETURNING id`, [div[0]!.id],
    );
    const { rows: teams } = await db.query<{ id: string }>(
      `INSERT INTO teams (division_id, name, join_code)
       VALUES ($1,'Home','AAAAAA'),($1,'Away','BBBBBB') RETURNING id`, [div[0]!.id],
    );
    homeTeamId = teams[0]!.id;
    awayTeamId = teams[1]!.id;

    for (const [fieldId, target] of [[myField[0]!.id, 'mine'], [otherField[0]!.id, 'other']] as const) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO fixtures (stage_id, field_id, home_ref, away_ref, home_team_id, away_team_id, kickoff_at)
         VALUES ($1,$2,'{}','{}',$3,$4, now()) RETURNING id`,
        [stage[0]!.id, fieldId, homeTeamId, awayTeamId],
      );
      if (target === 'mine') myFixtureId = rows[0]!.id;
      else otherFixtureId = rows[0]!.id;
    }

    const config = loadConfig({
      NODE_ENV: 'test', DATABASE_URL: url,
      SESSION_SECRET: 'test-secret-that-is-definitely-long-enough',
    } as NodeJS.ProcessEnv);
    client = makeClient(createApp(config, db));
    await client.start();
    await client.loginAs('ref@example.com', PW);
  });

  afterAll(async () => {
    await client?.stop();
    await db?.end();
  });

  it('shows only fixtures on the referee’s assigned fields', async () => {
    const res = await client.get('/api/ref/my-fixtures');
    expect(res.status).toBe(200);
    expect(res.body.fixtures).toHaveLength(1);
    expect(res.body.fixtures[0].fieldName).toBe('Field 1');
  });

  it('records a score', async () => {
    const res = await client.put(`/api/ref/fixtures/${myFixtureId}/score`, {
      homeScore: 3, awayScore: 0, status: 'complete',
    });
    expect(res.status).toBe(200);

    const { rows } = await db.query<{ home_score: number }>(
      'SELECT home_score FROM fixtures WHERE id = $1', [myFixtureId],
    );
    expect(rows[0]!.home_score).toBe(3);
  });

  /**
   * A nil-nil draw is a played game worth a point to each side. It has to be
   * storable as 0, distinct from "not entered", or the standings lose a game
   * that was actually played.
   */
  it('records a nil-nil draw as a played game, not as nothing', async () => {
    const res = await client.put(`/api/ref/fixtures/${myFixtureId}/score`, {
      homeScore: 0, awayScore: 0, status: 'complete',
    });
    expect(res.status).toBe(200);

    const { rows } = await db.query<{ home_score: number | null; status: string }>(
      'SELECT home_score, away_score, status FROM fixtures WHERE id = $1', [myFixtureId],
    );
    expect(rows[0]!.home_score).toBe(0);
    expect(rows[0]!.home_score).not.toBeNull();
    expect(rows[0]!.status).toBe('complete');
  });

  it('clears a result back to not yet played', async () => {
    await client.put(`/api/ref/fixtures/${myFixtureId}/score`, {
      homeScore: 4, awayScore: 2, status: 'complete',
    });

    const res = await client.del(`/api/ref/fixtures/${myFixtureId}/score`);
    expect(res.status).toBe(200);

    const { rows } = await db.query<{
      home_score: number | null; away_score: number | null; status: string;
    }>('SELECT home_score, away_score, status FROM fixtures WHERE id = $1', [myFixtureId]);
    expect(rows[0]!.home_score).toBeNull();
    expect(rows[0]!.away_score).toBeNull();
    expect(rows[0]!.status).toBe('scheduled');
  });

  /** A captain signed for a score that no longer exists. */
  it('drops the captains’ sign-offs when a result is cleared', async () => {
    await client.put(`/api/ref/fixtures/${myFixtureId}/score`, {
      homeScore: 2, awayScore: 1, status: 'complete',
    });
    const signoff = await client.post(`/api/ref/fixtures/${myFixtureId}/signoff`, {
      teamId: homeTeamId, captainName: 'A Captain',
    });
    expect(signoff.status).toBe(201);

    const res = await client.del(`/api/ref/fixtures/${myFixtureId}/score`);
    expect(res.body.signoffsRemoved).toBe(1);

    const { rows } = await db.query<{ n: string }>(
      'SELECT count(*) AS n FROM match_signoffs WHERE fixture_id = $1', [myFixtureId],
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  /** Cards were shown regardless of the score, so clearing must not bin them. */
  it('keeps cards when a result is cleared', async () => {
    await client.put(`/api/ref/fixtures/${myFixtureId}/score`, {
      homeScore: 1, awayScore: 1, status: 'complete',
    });
    const card = await client.post(`/api/ref/fixtures/${myFixtureId}/cards`, {
      teamId: homeTeamId, type: 'yellow', clientId: 'clear-keeps-cards-0001',
    });

    await client.del(`/api/ref/fixtures/${myFixtureId}/score`);

    const { rows } = await db.query<{ n: string }>(
      'SELECT count(*) AS n FROM cards WHERE fixture_id = $1', [myFixtureId],
    );
    expect(Number(rows[0]!.n)).toBe(1);

    // Later tests in this suite share the fixture and count its cards, so put
    // the disciplinary record back as it was found.
    await client.del(`/api/ref/fixtures/${myFixtureId}/cards/${card.body.id}`);
  });

  it('refuses to clear a result on another referee’s field', async () => {
    const res = await client.del(`/api/ref/fixtures/${otherFixtureId}/score`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('wrong_field');
  });

  it('refuses to write to another referee’s field', async () => {
    const score = await client.put(`/api/ref/fixtures/${otherFixtureId}/score`, {
      homeScore: 9, awayScore: 0,
    });
    expect(score.status).toBe(403);
    expect(score.body.code).toBe('wrong_field');

    const card = await client.post(`/api/ref/fixtures/${otherFixtureId}/cards`, {
      teamId: homeTeamId, type: 'red',
    });
    expect(card.status).toBe(403);
  });

  it('does not duplicate a card when a queued submit is retried', async () => {
    const clientId = 'retry-test-client-id-0001';
    const first = await client.post(`/api/ref/fixtures/${myFixtureId}/cards`, {
      teamId: awayTeamId, type: 'yellow', minute: 12, clientId,
    });
    const retry = await client.post(`/api/ref/fixtures/${myFixtureId}/cards`, {
      teamId: awayTeamId, type: 'yellow', minute: 12, clientId,
    });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body.id).toBe(first.body.id);

    const cards = await client.get(`/api/ref/fixtures/${myFixtureId}/cards`);
    expect(cards.body.cards).toHaveLength(1);
  });

  it('leaves a card unattributed until a captain names the player', async () => {
    const cards = await client.get(`/api/ref/fixtures/${myFixtureId}/cards`);
    expect(cards.body.cards[0].playerId).toBeNull();
    expect(cards.body.cards[0].teamName).toBe('Away');
  });

  it('rejects penalties on a game that was not drawn', async () => {
    const res = await client.put(`/api/ref/fixtures/${myFixtureId}/score`, {
      homeScore: 3, awayScore: 0, homePenalties: 4, awayPenalties: 3,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('penalties_without_draw');
  });

  it('rejects a shootout that ended level', async () => {
    const res = await client.put(`/api/ref/fixtures/${myFixtureId}/score`, {
      homeScore: 1, awayScore: 1, homePenalties: 3, awayPenalties: 3,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('penalties_tied');
  });

  it('accepts a draw decided on penalties', async () => {
    const res = await client.put(`/api/ref/fixtures/${myFixtureId}/score`, {
      homeScore: 1, awayScore: 1, homePenalties: 4, awayPenalties: 3,
    });
    expect(res.status).toBe(200);

    const { rows } = await db.query<{ home_score: number; home_penalties: number }>(
      'SELECT home_score, home_penalties FROM fixtures WHERE id = $1', [myFixtureId],
    );
    // The goals stay level -- penalties decide who advances, not the table.
    expect(rows[0]!.home_score).toBe(1);
    expect(rows[0]!.home_penalties).toBe(4);
  });

  it('records both captains signing off', async () => {
    const first = await client.post(`/api/ref/fixtures/${myFixtureId}/signoff`, {
      teamId: homeTeamId, captainName: 'A. Captain',
    });
    const second = await client.post(`/api/ref/fixtures/${myFixtureId}/signoff`, {
      teamId: awayTeamId, captainName: 'B. Captain',
    });
    expect(first.status).toBe(201);
    expect(second.body.signoffCount).toBe(2);
  });

  it('stops a coach entering scores', async () => {
    await client.loginAs('coach@example.com', PW);
    const res = await client.put(`/api/ref/fixtures/${myFixtureId}/score`, {
      homeScore: 5, awayScore: 5,
    });
    expect(res.status).toBe(403);
  });
});
