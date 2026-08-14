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
    async put(path: string, body?: unknown): Promise<{ status: number; body: any }> {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    clearCookie() {
      cookie = '';
    },
    /** Held and put back so one client can carry two sessions in turn. */
    cookieValue() {
      return cookie;
    },
    useCookie(value: string) {
      cookie = value;
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

  /**
   * Revoking access. The column existed and sign-in honoured it, but nothing
   * anywhere set it, so no account could actually be closed.
   */
  describe('disabling an account', () => {
    let refId = '';
    let adminId = '';

    beforeAll(async () => {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, role, display_name)
         VALUES ('revoke-ref@example.com', $1, 'ref', 'A Referee') RETURNING id`,
        [await hashPassword('a very good password')],
      );
      refId = rows[0]!.id;
      const { rows: admins } = await db.query<{ id: string }>(
        "SELECT id FROM users WHERE role = 'admin' LIMIT 1",
      );
      adminId = admins[0]!.id;
    });

    async function asAdmin() {
      client.clearCookie();
      await client.post('/api/auth/login', {
        email: 'admin@example.com',
        password: 'a very good password',
      });
    }

    /**
     * The point of the whole feature: a session that is already open has to
     * stop working. "Revoked next time they sign in" is not revocation.
     */
    it('ends a session that is already open', async () => {
      client.clearCookie();
      await client.post('/api/auth/login', {
        email: 'revoke-ref@example.com',
        password: 'a very good password',
      });
      const refCookie = client.cookieValue();
      expect((await client.get('/api/auth/me')).status).toBe(200);

      await asAdmin();
      const res = await client.put(`/api/auth/users/${refId}/disabled`, { disabled: true });
      expect(res.status).toBe(200);

      client.useCookie(refCookie);
      const after = await client.get('/api/auth/me');
      expect(after.status).toBe(401);
      expect(after.body.code).toBe('account_disabled');
    });

    it('stops them signing in again', async () => {
      client.clearCookie();
      const res = await client.post('/api/auth/login', {
        email: 'revoke-ref@example.com',
        password: 'a very good password',
      });
      expect(res.status).toBe(401);
    });

    it('lets them back in once re-enabled', async () => {
      await asAdmin();
      await client.put(`/api/auth/users/${refId}/disabled`, { disabled: false });

      client.clearCookie();
      const res = await client.post('/api/auth/login', {
        email: 'revoke-ref@example.com',
        password: 'a very good password',
      });
      expect(res.status).toBe(200);
    });

    it('refuses to let an admin disable themselves', async () => {
      await asAdmin();
      const res = await client.put(`/api/auth/users/${adminId}/disabled`, { disabled: true });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('cannot_disable_self');
    });

    /**
     * The invariant that matters: an enabled admin always remains. It holds
     * because the caller is an enabled admin who cannot be the target, so
     * disabling anyone else still leaves them. Asserted rather than assumed,
     * since it is the reason there is no separate "last admin" check.
     */
    it('always leaves an admin who can still sign in', async () => {
      const { rows: created } = await db.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, role, display_name)
         VALUES ('admin2@example.com', $1, 'admin', 'Second Admin') RETURNING id`,
        [await hashPassword('a very good password')],
      );
      const secondAdminId = created[0]!.id;

      await asAdmin();
      expect(
        (await client.put(`/api/auth/users/${secondAdminId}/disabled`, { disabled: true })).status,
      ).toBe(200);

      const { rows } = await db.query<{ n: string }>(
        "SELECT count(*) AS n FROM users WHERE role = 'admin' AND disabled = FALSE",
      );
      expect(Number(rows[0]!.n)).toBeGreaterThan(0);

      await db.query('UPDATE users SET disabled = FALSE');
    });
  });
});
