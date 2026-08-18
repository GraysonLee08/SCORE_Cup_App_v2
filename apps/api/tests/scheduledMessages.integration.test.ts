import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Db } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

/**
 * Messages written now and revealed later.
 *
 * There is no scheduler to test: the reveal is a WHERE clause, so what has to
 * be proved is that the readers actually apply it, and that they agree with
 * each other. A message visible on the board but not on a team's page -- or
 * the reverse -- would be worse than no scheduling at all, because nobody
 * would know which surface was lying.
 */
suite('scheduled messages', () => {
  let db: Db;
  let app: Express;
  let server: ReturnType<Express['listen']>;
  let port = 0;
  let eventId = '';

  const get = async (path: string) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: res.status, body: (await res.json().catch(() => null)) as any };
  };

  beforeAll(async () => {
    await migrate(url!);
    const config = loadConfig({
      DATABASE_URL: url,
      SESSION_SECRET: 'test-secret-that-is-definitely-long-enough',
    } as NodeJS.ProcessEnv);
    db = createPool(config.DATABASE_URL);
    app = createApp(config, db);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        port = (server.address() as { port: number }).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.end?.();
  });

  beforeEach(async () => {
    for (const t of ['announcements', 'fixtures', 'stages', 'divisions', 'fields', 'events']) {
      await db.query(`DELETE FROM ${t}`);
    }
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO events (name, event_date, start_time, end_time, timezone, min_rest_minutes)
       VALUES ('SCORE Cup', '2026-08-29', '09:00', '17:00', 'America/Chicago', 5)
       RETURNING id`,
    );
    eventId = rows[0]!.id;
  });

  async function post(title: string, publishAt: string | null) {
    await db.query(
      `INSERT INTO announcements (event_id, title, message, publish_at)
       VALUES ($1, $2, 'body', $3)`,
      [eventId, title, publishAt],
    );
  }

  it('publishes immediately when no time is set', async () => {
    await post('Welcome to the SCORE Cup', null);
    const { body } = await get('/api/public/event');
    expect(body.announcements.map((a: any) => a.title)).toEqual(['Welcome to the SCORE Cup']);
  });

  it('hides a message until its time', async () => {
    await post('Playoffs in fifteen minutes', new Date(Date.now() + 60_000).toISOString());

    const before = await get('/api/public/event');
    expect(before.body.announcements).toEqual([]);

    // Move it into the past rather than waiting a minute: the rule under test
    // is the comparison, not the clock.
    await db.query(`UPDATE announcements SET publish_at = now() - interval '1 second'`);

    const after = await get('/api/public/event');
    expect(after.body.announcements.map((a: any) => a.title)).toEqual([
      'Playoffs in fifteen minutes',
    ]);
  });

  it('orders by when it went out, not when it was typed', async () => {
    // The unscheduled message was written two minutes ago. The scheduled one
    // was typed three days ago but only revealed one minute ago, so it is the
    // newer of the two *as far as anyone reading the board is concerned*.
    // Ordering on created_at would bury it three days down -- which is exactly
    // the message somebody wrote early so that it would land on top.
    await db.query(
      `INSERT INTO announcements (event_id, title, message, created_at)
       VALUES ($1, 'Field 2 running late', 'body', now() - interval '2 minutes')`,
      [eventId],
    );
    await db.query(
      `INSERT INTO announcements (event_id, title, message, created_at, publish_at)
       VALUES ($1, 'Awards at 5:30', 'body', now() - interval '3 days', now() - interval '1 minute')`,
      [eventId],
    );

    const { body } = await get('/api/public/event');
    expect(body.announcements.map((a: any) => a.title)).toEqual([
      'Awards at 5:30',
      'Field 2 running late',
    ]);
  });

  it('dates a scheduled message by its reveal, not its writing', async () => {
    await db.query(
      `INSERT INTO announcements (event_id, title, message, created_at, publish_at)
       VALUES ($1, 'Awards at 5:30', 'body', '2026-08-01T00:00:00Z', '2026-08-17T00:00:00Z')`,
      [eventId],
    );
    const { body } = await get('/api/public/event');
    expect(body.announcements[0].createdAt).toContain('2026-08-17');
  });
});
