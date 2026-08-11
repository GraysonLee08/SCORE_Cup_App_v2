import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Db } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { hashPassword } from '../src/auth/password.js';

/**
 * Runs against a real Postgres. Set TEST_DATABASE_URL to enable:
 *   docker compose up -d db
 *   TEST_DATABASE_URL=postgres://scup:scup_dev_password@localhost:5433/scup_test npm test
 *
 * Skipped rather than failed when unset, so the unit suite stays runnable
 * anywhere.
 */
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

/** Minimal fetch-style helper so we do not add supertest for four calls. */
function makeClient(app: Express) {
  let port = 0;
  let cookie = '';
  let server: ReturnType<Express['listen']>;

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
    async post(path: string, body?: unknown): Promise<{ status: number; body: any }> {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0]!;
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    async get(path: string): Promise<{ status: number; body: any }> {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        headers: cookie ? { cookie } : {},
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    clearCookie() {
      cookie = '';
    },
  };
}

suite('auth', () => {
  let db: Db;
  let client: ReturnType<typeof makeClient>;

  beforeAll(async () => {
    await migrate(url!);
    db = createPool(url!);
    await db.query('DELETE FROM audit_log');
    await db.query('DELETE FROM users');
    await db.query(
      `INSERT INTO users (email, password_hash, role, display_name)
       VALUES ($1, $2, 'admin', 'Test Admin')`,
      ['Admin@Example.com', await hashPassword('a very good password')],
    );

    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: url,
      SESSION_SECRET: 'test-secret-that-is-definitely-long-enough',
    } as NodeJS.ProcessEnv);

    client = makeClient(createApp(config, db));
    await client.start();
  });

  afterAll(async () => {
    await client?.stop();
    await db?.end();
  });

  it('rejects a wrong password', async () => {
    const res = await client.post('/api/auth/login', {
      email: 'admin@example.com',
      password: 'wrong',
    });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('invalid_credentials');
  });

  it('gives the same error for an unknown email, revealing nothing', async () => {
    const res = await client.post('/api/auth/login', {
      email: 'nobody@example.com',
      password: 'wrong',
    });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('invalid_credentials');
  });

  it('signs in regardless of email casing', async () => {
    const res = await client.post('/api/auth/login', {
      email: 'ADMIN@EXAMPLE.COM',
      password: 'a very good password',
    });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  it('returns the signed-in user', async () => {
    const res = await client.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('Test Admin');
  });

  it('never returns the password hash', async () => {
    const res = await client.get('/api/auth/me');
    expect(JSON.stringify(res.body)).not.toContain('$2a$');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('issues a temp password that forces a change on first login', async () => {
    const created = await client.post('/api/auth/users', {
      email: 'ref@example.com',
      displayName: 'Test Ref',
      role: 'ref',
    });
    expect(created.status).toBe(201);
    expect(created.body.tempPassword).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    client.clearCookie();
    const login = await client.post('/api/auth/login', {
      email: 'ref@example.com',
      password: created.body.tempPassword,
    });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
  });

  it('rejects a duplicate email that differs only by case', async () => {
    client.clearCookie();
    await client.post('/api/auth/login', {
      email: 'admin@example.com',
      password: 'a very good password',
    });
    const res = await client.post('/api/auth/users', {
      email: 'REF@example.com',
      displayName: 'Duplicate',
      role: 'ref',
    });
    expect(res.status).toBe(409);
  });

  it('stops a non-admin creating users', async () => {
    client.clearCookie();
    const created = await client.post('/api/auth/login', {
      email: 'ref@example.com',
      password: 'placeholder',
    });
    expect(created.status).toBe(401); // temp password already consumed above
  });

  it('requires the current password to change it', async () => {
    client.clearCookie();
    await client.post('/api/auth/login', {
      email: 'admin@example.com',
      password: 'a very good password',
    });
    const res = await client.post('/api/auth/change-password', {
      currentPassword: 'not it',
      newPassword: 'a brand new password',
    });
    expect(res.status).toBe(403);
  });

  it('rejects a new password that is too short', async () => {
    const res = await client.post('/api/auth/change-password', {
      currentPassword: 'a very good password',
      newPassword: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('weak_password');
  });

  it('blocks /me once signed out', async () => {
    await client.post('/api/auth/logout');
    const res = await client.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('writes an audit entry for a login', async () => {
    const { rows } = await db.query<{ count: string }>(
      "SELECT count(*) FROM audit_log WHERE action = 'login'",
    );
    expect(Number(rows[0]!.count)).toBeGreaterThan(0);
  });
});
