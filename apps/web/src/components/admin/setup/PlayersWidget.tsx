import { useCallback, useEffect, useState } from 'react';
import { api, ApiFailure } from '../../../api.js';
import type { AdminEvent, RosterPlayer } from '../../../types.js';

/**
 * Players: the bottom of the hierarchy, one roster at a time.
 *
 * An admin needs everything a coach can do here, because on the day the coach
 * is on a pitch and the admin is the one at a laptop.
 */
export default function PlayersWidget({
  data,
  onChanged,
}: {
  data: AdminEvent;
  onChanged: () => void;
}) {
  const [divisionId, setDivisionId] = useState(data.divisions[0]?.id ?? '');
  const division = data.divisions.find((d) => d.id === divisionId) ?? data.divisions[0];
  const [teamId, setTeamId] = useState(division?.teams[0]?.id ?? '');

  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [draft, setDraft] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const team = division?.teams.find((t) => t.id === teamId) ?? division?.teams[0];

  const load = useCallback(async () => {
    if (!team) {
      setPlayers([]);
      return;
    }
    try {
      const res = await api.get<{ players: RosterPlayer[] }>(`/api/rosters/${team.id}/players`);
      setPlayers(res.players);
      setStatus(null);
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof ApiFailure ? error.message : 'Could not load the roster.',
      });
    }
  }, [team]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Switching division should land on a team that exists in it.
    if (division && !division.teams.some((t) => t.id === teamId)) {
      setTeamId(division.teams[0]?.id ?? '');
    }
  }, [division, teamId]);

  if (!division || division.teams.length === 0) {
    return (
      <div className="widget">
        <section className="card">
          <h2>No teams yet</h2>
          <p className="hint">Add some under Teams first.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="widget wide">
      {status && (
        <div className={status.ok ? 'notice ok' : 'notice error'} role="status">
          {status.text}
        </div>
      )}

      <div className="row" style={{ alignItems: 'flex-end', maxWidth: '48rem' }}>
        {data.divisions.length > 1 && (
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="pw-division">Division</label>
            <select
              id="pw-division"
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
            >
              {data.divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="pw-team">Team</label>
          <select id="pw-team" value={team?.id ?? ''} onChange={(e) => setTeamId(e.target.value)}>
            {division.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.playerCount})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="split">
        <section className="card">
          <h2>{team?.name} roster</h2>
          <p className="hint">
            Players who registered themselves are marked. Anyone else was entered by staff and
            can still claim their place by registering with the same email.
          </p>

          {players.length === 0 ? (
            <p className="muted">Nobody on this roster yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="standings">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Phone</th>
                    <th scope="col">Captain</th>
                    <th scope="col"></th>
                    <th scope="col"></th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr key={p.id}>
                      <td style={{ minWidth: '11rem' }}>
                        <input
                          aria-label={`Name for ${p.firstName} ${p.lastName}`}
                          defaultValue={`${p.firstName} ${p.lastName}`}
                          onBlur={async (e) => {
                            const [first, ...rest] = e.target.value.trim().split(' ');
                            if (!first) return;
                            await api.patch(`/api/rosters/${team!.id}/players/${p.id}`, {
                              firstName: first,
                              lastName: rest.join(' ') || p.lastName,
                            });
                            await load();
                          }}
                        />
                      </td>
                      <td style={{ minWidth: '12rem' }}>
                        <input
                          aria-label={`Email for ${p.firstName}`}
                          defaultValue={p.email ?? ''}
                          placeholder="email"
                          onBlur={async (e) => {
                            if (e.target.value === (p.email ?? '')) return;
                            await api.patch(`/api/rosters/${team!.id}/players/${p.id}`, {
                              email: e.target.value || undefined,
                            });
                            await load();
                          }}
                        />
                      </td>
                      <td style={{ minWidth: '9rem' }}>
                        <input
                          aria-label={`Phone for ${p.firstName}`}
                          defaultValue={p.phone ?? ''}
                          placeholder="phone"
                          onBlur={async (e) => {
                            if (e.target.value === (p.phone ?? '')) return;
                            await api.patch(`/api/rosters/${team!.id}/players/${p.id}`, {
                              phone: e.target.value || undefined,
                            });
                            await load();
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${p.firstName} is captain`}
                          checked={p.isCaptain}
                          style={{ width: '1.15rem', height: '1.15rem', minHeight: 'auto' }}
                          onChange={async (e) => {
                            await api.patch(`/api/rosters/${team!.id}/players/${p.id}`, {
                              isCaptain: e.target.checked,
                            });
                            await load();
                          }}
                        />
                      </td>
                      <td>{!p.selfRegistered && <span className="pill">staff</span>}</td>
                      <td>
                        <button
                          className="ghost danger"
                          style={{ minHeight: '1.9rem', padding: '0 .45rem' }}
                          onClick={async () => {
                            if (!window.confirm(`Remove ${p.firstName} ${p.lastName}?`)) return;
                            await api.delete(`/api/rosters/${team!.id}/players/${p.id}`);
                            await load();
                            onChanged();
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card sticky-side">
          <h2>Add a player</h2>
          <p className="hint">Only a name is required — the rest can follow.</p>

          <div className="field">
            <label htmlFor="pw-first">First name</label>
            <input
              id="pw-first"
              value={draft.firstName}
              onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="pw-last">Last name</label>
            <input
              id="pw-last"
              value={draft.lastName}
              onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="pw-email">Email</label>
            <input
              id="pw-email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="pw-phone">Phone</label>
            <input
              id="pw-phone"
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            />
          </div>

          <button
            className="primary"
            disabled={!draft.firstName.trim() || !draft.lastName.trim()}
            onClick={async () => {
              try {
                await api.post(`/api/rosters/${team!.id}/players`, {
                  firstName: draft.firstName.trim(),
                  lastName: draft.lastName.trim(),
                  email: draft.email.trim() || undefined,
                  phone: draft.phone.trim() || undefined,
                });
                setDraft({ firstName: '', lastName: '', email: '', phone: '' });
                await load();
                onChanged();
              } catch (error) {
                setStatus({
                  ok: false,
                  text: error instanceof ApiFailure ? error.message : 'Could not add them.',
                });
              }
            }}
          >
            Add player
          </button>
        </section>
      </div>
    </div>
  );
}
