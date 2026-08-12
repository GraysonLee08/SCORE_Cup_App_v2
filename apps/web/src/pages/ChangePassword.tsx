import { useState, type FormEvent } from 'react';
import { api, ApiFailure } from '../api.js';
import type { SessionUser } from '../types.js';

/**
 * Shown to anyone signed in with a temporary password, before they can reach
 * anything else. Temporary passwords are single-use by policy and expire, so
 * this is the only screen available until it is changed.
 */
export default function ChangePassword({
  user,
  onDone,
  onSignOut,
}: {
  user: SessionUser;
  onDone: () => void;
  onSignOut: () => void;
}) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/change-password', { currentPassword, newPassword });
      onDone();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : 'Could not change it.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <h1>Set a new password</h1>
      <p className="muted">
        Hello {user.displayName}. You signed in with a temporary password, so please choose your
        own before carrying on.
      </p>

      <form className="card stack" onSubmit={submit}>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        <div className="field">
          <label htmlFor="current">Temporary password</label>
          <input
            id="current"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="new">New password</label>
          <input
            id="new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            required
          />
          <p className="muted" style={{ marginTop: '.3rem' }}>
            At least 10 characters. A short phrase works well.
          </p>
        </div>

        <div className="field">
          <label htmlFor="confirm">New password again</label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>

        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save and continue'}
        </button>
      </form>

      <p className="center">
        <button className="ghost" onClick={onSignOut}>
          Sign out instead
        </button>
      </p>
    </div>
  );
}
