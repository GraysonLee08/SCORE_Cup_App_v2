import { useState } from 'react';
import { api, ApiFailure } from '../api.js';
import type { MyTeam } from '../types.js';

/**
 * The roster, as the person answerable for the team sees it.
 *
 * Players putting themselves on with a team code is the way this is meant to
 * fill up: they arrive attached to their own account, and they bring the
 * emergency contact and jersey size with them, which a list of names never
 * does. This is the escape hatch for the one who will not, or cannot -- not the
 * main road.
 *
 * Removal asks first and names the person. Deleting the wrong row costs
 * somebody their place and whatever they had already filled in.
 */
export default function RosterEditor({
  team,
  onChanged,
}: {
  team: MyTeam;
  onChanged: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState({ firstName: '', lastName: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const teamId = team.team.id;

  async function run(work: () => Promise<void>, done: string) {
    setBusy(true);
    setStatus(null);
    try {
      await work();
      await onChanged();
      setStatus({ ok: true, text: done });
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof ApiFailure ? error.message : 'That did not save.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Manage the roster</h2>
      <p className="muted">
        Most people should add themselves with your team code — they arrive with their own
        emergency contact and shirt size filled in. Add anyone here who cannot.
      </p>

      {status && (
        <div className={status.ok ? 'notice ok' : 'notice error'} role="status">
          {status.text}
        </div>
      )}

      {team.teammates.length > 0 && (
        <ul className="cards-list">
          {team.teammates.map((p) => (
            <li key={p.id}>
              <span style={{ flex: 1 }}>
                <strong>
                  {p.firstName} {p.lastName}
                </strong>
                {p.isCaptain && (
                  <span className="pill" style={{ marginLeft: '.4rem' }}>
                    Captain
                  </span>
                )}
                <div className="muted">{p.email || 'No email — cannot claim their place'}</div>
              </span>

              <button
                className="ghost"
                style={{ minHeight: '2rem', padding: '0 .6rem' }}
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      api.patch(`/api/rosters/${teamId}/players/${p.id}`, {
                        isCaptain: !p.isCaptain,
                      }),
                    p.isCaptain ? 'Captain removed.' : 'Captain set.',
                  )
                }
              >
                {p.isCaptain ? 'Not captain' : 'Make captain'}
              </button>

              <button
                className="ghost danger"
                style={{ minHeight: '2rem', padding: '0 .6rem' }}
                disabled={busy}
                onClick={() => {
                  // Named, because "are you sure?" on a list of people is a
                  // question nobody can answer correctly.
                  if (
                    !window.confirm(
                      `Remove ${p.firstName} ${p.lastName} from ${team.team.name}?`,
                    )
                  ) {
                    return;
                  }
                  void run(
                    () => api.delete(`/api/rosters/${teamId}/players/${p.id}`),
                    `${p.firstName} ${p.lastName} removed.`,
                  );
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="row" style={{ marginTop: '1rem' }}>
        <input
          aria-label="First name"
          placeholder="First name"
          value={draft.firstName}
          onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
        />
        <input
          aria-label="Last name"
          placeholder="Last name"
          value={draft.lastName}
          onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
        />
      </div>
      <div className="field" style={{ marginTop: '.5rem' }}>
        <label htmlFor="roster-email">
          Email — how they claim their place if they register later
        </label>
        <input
          id="roster-email"
          type="email"
          value={draft.email}
          onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
        />
      </div>

      <button
        className="primary"
        disabled={busy || !draft.firstName.trim() || !draft.lastName.trim()}
        onClick={() =>
          void run(async () => {
            await api.post(`/api/rosters/${teamId}/players`, {
              firstName: draft.firstName.trim(),
              lastName: draft.lastName.trim(),
              email: draft.email.trim() || undefined,
            });
            setDraft({ firstName: '', lastName: '', email: '' });
          }, 'Added to the roster.')
        }
      >
        Add player
      </button>
    </section>
  );
}
