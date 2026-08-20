import { useState, type FormEvent } from 'react';
import { api, ApiFailure } from '../api.js';

/**
 * Joining a team when you already have an account.
 *
 * Registering with a code makes an account and a roster row together, and
 * refuses an address that already has an account. Anyone who did was told to
 * sign in instead, signed in, and arrived here -- at a page with no team on it
 * and nothing to do about it. This is the way out, and next year it is the way
 * in for everybody who played this year.
 */
export default function JoinTeam({ onJoined }: { onJoined: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/join', { joinCode: code.trim() });
      setCode('');
      onJoined();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : 'Could not join that team.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Join your team</h2>
      <p className="muted">
        Your captain has a six-character code for the team. Entering it here puts you on their
        roster.
      </p>

      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}

      <div className="field">
        <label htmlFor="join-code">Team code</label>
        <input
          id="join-code"
          value={code}
          // Codes are handed out in capitals and read off a phone screen, so
          // the field stops caring which way they are typed.
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
        />
      </div>

      <button className="primary" type="submit" disabled={busy || !code.trim()}>
        {busy ? 'Joining…' : 'Join team'}
      </button>
    </form>
  );
}
