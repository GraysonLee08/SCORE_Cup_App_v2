import { useCallback, useEffect, useState } from 'react';
import { api, ApiFailure } from '../../api.js';
import type { AdminEvent, AdminUser } from '../../types.js';

/**
 * Accounts for everyone who signs in. Two jobs matter on the day: assigning a
 * referee to their fields, and issuing a temporary password when someone is
 * locked out -- there is no self-service reset, by design.
 *
 * Admin accounts cannot be created here. Handing out full control should take
 * a deliberate act outside the running tournament.
 */
export default function PeoplePanel({ data }: { data: AdminEvent }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ name: string; value: string } | null>(null);
  const [form, setForm] = useState({ email: '', displayName: '', role: 'ref' });

  const load = useCallback(async () => {
    const res = await api.get<{ users: AdminUser[] }>('/api/admin/users');
    setUsers(res.users);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      {status && (
        <div className="notice ok" role="status">
          {status}
        </div>
      )}

      {/* Shown once. There is no email provider, so the admin copies this into
          their own reply. */}
      {tempPassword && (
        <div className="notice pending">
          <strong>Temporary password for {tempPassword.name}</strong>
          <div className="tempcode">{tempPassword.value}</div>
          <p style={{ margin: '.4rem 0 0' }}>
            Copy it now — it is not shown again. It expires in 7 days and must be changed on
            first sign-in.
          </p>
          <button
            className="ghost"
            style={{ minHeight: '2rem', padding: '0 .6rem', marginTop: '.4rem' }}
            onClick={() => setTempPassword(null)}
          >
            Done
          </button>
        </div>
      )}

      <section className="card stack">
        <h2>Add a person</h2>
        <p className="hint">
          Creates the account and a one-time password to pass on. Admin accounts are
          deliberately not created here.
        </p>
        <div className="row">
          <div>
            <label htmlFor="p-name">Name</label>
            <input
              id="p-name"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="p-email">Email</label>
            <input
              id="p-email"
              type="email"
              autoCapitalize="none"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="p-role">Role</label>
            <select
              id="p-role"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value="ref">Referee</option>
              <option value="coach">Coach</option>
              <option value="participant">Player</option>
            </select>
          </div>
        </div>
        <button
          className="primary"
          disabled={!form.email.trim() || !form.displayName.trim()}
          onClick={async () => {
            try {
              const res = await api.post<{ tempPassword: string }>('/api/auth/users', form);
              setTempPassword({ name: form.displayName, value: res.tempPassword });
              setForm({ email: '', displayName: '', role: 'ref' });
              setStatus(null);
              await load();
            } catch (error) {
              setStatus(error instanceof ApiFailure ? error.message : 'Could not add them.');
            }
          }}
        >
          Add and create a temporary password
        </button>
      </section>


      <section className="card">
        <h2>Everyone</h2>
        <div className="table-scroll">
          <table className="standings">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Email</th>
                <th scope="col">Status</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.disabled ? 'muted' : undefined}>
                  <td>{u.displayName}</td>
                  <td>{u.role}</td>
                  <td>{u.email}</td>
                  <td>
                    {u.disabled ? (
                      <span className="pill" style={{ background: 'var(--bad)', color: '#fff' }}>
                        Disabled
                      </span>
                    ) : (
                      <span className="pill done">Active</span>
                    )}
                  </td>
                  <td>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <button
                        className="ghost"
                        style={{ minHeight: '2rem', padding: '0 .55rem' }}
                        disabled={u.disabled}
                        onClick={async () => {
                          const res = await api.post<{ tempPassword: string }>(
                            `/api/auth/users/${u.id}/temp-password`,
                          );
                          setTempPassword({ name: u.displayName, value: res.tempPassword });
                        }}
                      >
                        Reset password
                      </button>
                      <button
                        className={u.disabled ? 'ghost' : 'ghost danger'}
                        style={{ minHeight: '2rem', padding: '0 .55rem' }}
                        onClick={async () => {
                          if (
                            !u.disabled &&
                            !window.confirm(
                              `Disable ${u.displayName}? They are signed out immediately and ` +
                                `cannot sign in again until you turn the account back on.`,
                            )
                          ) {
                            return;
                          }
                          try {
                            await api.put(`/api/auth/users/${u.id}/disabled`, {
                              disabled: !u.disabled,
                            });
                            setStatus(
                              `${u.displayName} ${u.disabled ? 'can sign in again.' : 'is disabled.'}`,
                            );
                            await load();
                          } catch (error) {
                            setStatus(
                              error instanceof ApiFailure ? error.message : 'Could not change it.',
                            );
                          }
                        }}
                      >
                        {u.disabled ? 'Enable' : 'Disable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
