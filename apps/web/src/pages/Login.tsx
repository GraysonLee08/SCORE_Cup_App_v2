import { useState, type FormEvent } from 'react';
import { api, ApiFailure } from '../api.js';
import type { SessionUser } from '../types.js';

export default function Login({ onSignedIn }: { onSignedIn: (user: SessionUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ user: SessionUser }>('/api/auth/login', { email, password });
      onSignedIn(res.user);
    } catch (err) {
      setError(
        err instanceof ApiFailure ? err.message : 'Could not reach the server. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <h1>SCORES Cup</h1>
      <p className="muted">Sign in to enter scores.</p>

      <form onSubmit={submit} className="card stack">
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {/* No self-service reset by design -- there is no email provider. The
          spectator view needs no login, so a locked-out user is not stuck. */}
      <p className="muted center">
        Forgotten your password? Email <strong>scorescup@chicagoscores.org</strong> and an
        admin will send a temporary one. Scores, standings and the bracket are public — you do
        not need an account to follow the tournament.
      </p>
    </div>
  );
}
