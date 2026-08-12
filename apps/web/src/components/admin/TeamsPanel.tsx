import { useCallback, useEffect, useState } from 'react';
import { api, ApiFailure } from '../../api.js';
import type { AdminEvent, RosterPlayer } from '../../types.js';

/**
 * Teams and rosters. An admin needs to do everything a coach can, because on
 * the day the coach is on a pitch and the admin is the one at a laptop.
 */
export default function TeamsPanel({
  data,
  onChanged,
}: {
  data: AdminEvent;
  onChanged: () => void;
}) {
  const [divisionId, setDivisionId] = useState(data.divisions[0]?.id ?? '');
  const [name, setName] = useState('');
  const [bulk, setBulk] = useState('');
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const division = data.divisions.find((d) => d.id === divisionId) ?? data.divisions[0];

  async function addTeams(names: string[]) {
    const failed: string[] = [];
    let added = 0;
    for (const teamName of names) {
      try {
        await api.post('/api/teams', { divisionId: division?.id, name: teamName });
        added++;
      } catch (error) {
        failed.push(`${teamName} (${error instanceof ApiFailure ? error.message : 'failed'})`);
      }
    }
    setStatus({
      ok: failed.length === 0,
      text:
        failed.length === 0
          ? `Added ${added} team${added === 1 ? '' : 's'}.`
          : `Added ${added}. Skipped: ${failed.join('; ')}`,
    });
    onChanged();
  }

  return (
    <>
      {status && (
        <div className={status.ok ? 'notice ok' : 'notice error'} role="status">
          {status.text}
        </div>
      )}

      {data.divisions.length > 1 && (
        <div className="field" style={{ maxWidth: '20rem' }}>
          <label htmlFor="t-division">Tournament</label>
          <select
            id="t-division"
            value={divisionId}
            onChange={(e) => setDivisionId(e.target.value)}
          >
            {data.divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.teams.length} teams)
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="split">
        <section className="card">
          <h2>{division?.name ?? 'Teams'}</h2>
          <p className="hint">
            Give each coach their team’s join code — anyone with it can register onto that team.
            Click a team to see and edit its roster.
          </p>

          {!division || division.teams.length === 0 ? (
            <p className="muted">No teams yet. Add some on the right.</p>
          ) : (
            <div className="table-scroll">
              <table className="standings">
                <thead>
                  <tr>
                    <th scope="col">Team</th>
                    <th scope="col">Pool</th>
                    <th scope="col">Join code</th>
                    <th scope="col" className="num">Players</th>
                    <th scope="col"></th>
                  </tr>
                </thead>
                <tbody>
                  {division.teams.map((team) => {
                    const pool = division.pools.find((p) => p.id === team.poolId);
                    return (
                      <tr key={team.id}>
                        <td>
                          <button
                            className="ghost"
                            style={{ minHeight: '1.9rem', padding: '0 .3rem', fontWeight: 700 }}
                            onClick={() =>
                              setOpenTeam((t) => (t === team.id ? null : team.id))
                            }
                          >
                            {openTeam === team.id ? '▾' : '▸'} {team.name}
                          </button>
                        </td>
                        <td>{pool?.name ?? '—'}</td>
                        <td>
                          <code className="joincode">{team.joinCode}</code>
                        </td>
                        <td className="num">{team.playerCount}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button
                            className="ghost"
                            style={{ minHeight: '1.9rem', padding: '0 .45rem' }}
                            onClick={async () => {
                              if (!window.confirm(`New join code for ${team.name}? The old one stops working.`)) return;
                              await api.post(`/api/teams/${team.id}/join-code`);
                              onChanged();
                            }}
                          >
                            New code
                          </button>{' '}
                          <button
                            className="ghost danger"
                            style={{ minHeight: '1.9rem', padding: '0 .45rem' }}
                            onClick={async () => {
                              if (!window.confirm(`Remove ${team.name} from the tournament?`)) return;
                              try {
                                await api.delete(`/api/teams/${team.id}`);
                                setStatus({ ok: true, text: `${team.name} removed.` });
                                onChanged();
                              } catch (error) {
                                setStatus({
                                  ok: false,
                                  text:
                                    error instanceof ApiFailure
                                      ? error.message
                                      : 'Could not remove it.',
                                });
                              }
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {openTeam && (
            <Roster
              teamId={openTeam}
              teamName={division?.teams.find((t) => t.id === openTeam)?.name ?? ''}
              onChanged={onChanged}
            />
          )}
        </section>

        <section className="card sticky-side">
          <h2>Add teams</h2>
          <div className="row">
            <input
              aria-label="Team name"
              placeholder="Team name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              disabled={!name.trim() || !division}
              onClick={async () => {
                await addTeams([name.trim()]);
                setName('');
              }}
            >
              Add
            </button>
          </div>

          <div className="field" style={{ marginTop: '.8rem' }}>
            <label htmlFor="t-bulk">Or paste a list, one per line</label>
            <textarea
              id="t-bulk"
              rows={6}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={'Lakeview Lions\nPilsen Pumas\nHyde Park Hawks'}
            />
          </div>
          <button
            disabled={!bulk.trim() || !division}
            onClick={async () => {
              await addTeams(bulk.split('\n').map((l) => l.trim()).filter(Boolean));
              setBulk('');
            }}
          >
            Add all
          </button>
        </section>
      </div>
    </>
  );
}

function Roster({
  teamId,
  teamName,
  onChanged,
}: {
  teamId: string;
  teamName: string;
  onChanged: () => void;
}) {
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [draft, setDraft] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ players: RosterPlayer[] }>(`/api/rosters/${teamId}/players`);
      setPlayers(res.players);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : 'Could not load the roster.');
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ marginTop: '1rem', borderTop: '2px solid var(--line)', paddingTop: '.8rem' }}>
      <h3>{teamName} roster</h3>
      {error && <div className="notice error">{error}</div>}

      {players.length === 0 && <p className="muted">Nobody on this roster yet.</p>}

      <div className="table-scroll">
        <table className="standings">
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td style={{ width: '30%' }}>
                  <input
                    aria-label={`Name for ${p.firstName} ${p.lastName}`}
                    defaultValue={`${p.firstName} ${p.lastName}`}
                    onBlur={async (e) => {
                      const [first, ...rest] = e.target.value.trim().split(' ');
                      if (!first) return;
                      await api.patch(`/api/rosters/${teamId}/players/${p.id}`, {
                        firstName: first,
                        lastName: rest.join(' ') || p.lastName,
                      });
                      await load();
                    }}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Email for ${p.firstName}`}
                    defaultValue={p.email ?? ''}
                    placeholder="email"
                    onBlur={async (e) => {
                      if (e.target.value === (p.email ?? '')) return;
                      await api.patch(`/api/rosters/${teamId}/players/${p.id}`, {
                        email: e.target.value || undefined,
                      });
                      await load();
                    }}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Phone for ${p.firstName}`}
                    defaultValue={p.phone ?? ''}
                    placeholder="phone"
                    onBlur={async (e) => {
                      if (e.target.value === (p.phone ?? '')) return;
                      await api.patch(`/api/rosters/${teamId}/players/${p.id}`, {
                        phone: e.target.value || undefined,
                      });
                      await load();
                    }}
                  />
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <label className="checkbox" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={p.isCaptain}
                      onChange={async (e) => {
                        await api.patch(`/api/rosters/${teamId}/players/${p.id}`, {
                          isCaptain: e.target.checked,
                        });
                        await load();
                      }}
                    />
                    Captain
                  </label>
                </td>
                <td>
                  {!p.selfRegistered && <span className="pill">added by staff</span>}
                </td>
                <td>
                  <button
                    className="ghost danger"
                    style={{ minHeight: '1.9rem', padding: '0 .45rem' }}
                    onClick={async () => {
                      if (!window.confirm(`Remove ${p.firstName} ${p.lastName}?`)) return;
                      await api.delete(`/api/rosters/${teamId}/players/${p.id}`);
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

      <h3>Add a player</h3>
      <div className="grid-2">
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
        <input
          aria-label="Email"
          placeholder="Email (optional)"
          value={draft.email}
          onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
        />
        <input
          aria-label="Phone"
          placeholder="Phone (optional)"
          value={draft.phone}
          onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
        />
      </div>
      <button
        style={{ marginTop: '.5rem' }}
        disabled={!draft.firstName.trim() || !draft.lastName.trim()}
        onClick={async () => {
          try {
            await api.post(`/api/rosters/${teamId}/players`, {
              firstName: draft.firstName.trim(),
              lastName: draft.lastName.trim(),
              email: draft.email.trim() || undefined,
              phone: draft.phone.trim() || undefined,
            });
            setDraft({ firstName: '', lastName: '', email: '', phone: '' });
            await load();
            onChanged();
          } catch (err) {
            setError(err instanceof ApiFailure ? err.message : 'Could not add them.');
          }
        }}
      >
        Add player
      </button>
    </div>
  );
}
