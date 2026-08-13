import { useState } from 'react';
import { api, ApiFailure } from '../../../api.js';
import type { AdminEvent, AdminTeam } from '../../../types.js';
import Jersey, { JERSEYS } from '../../Jersey.js';

/**
 * Teams within a division.
 *
 * Just the teams themselves -- who is competing, their join code, and which
 * pool they sit in. Their players live one level down, under Players.
 */
export default function TeamsWidget({
  data,
  onChanged,
}: {
  data: AdminEvent;
  onChanged: () => void;
}) {
  const [divisionId, setDivisionId] = useState(data.divisions[0]?.id ?? '');
  const [name, setName] = useState('');
  const [bulk, setBulk] = useState('');
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

  if (!division) {
    return (
      <div className="widget">
        <section className="card">
          <h2>No divisions yet</h2>
          <p className="hint">Add one under Divisions first.</p>
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

      {data.divisions.length > 1 && (
        <div className="field" style={{ maxWidth: '22rem' }}>
          <label htmlFor="tw-division">Division</label>
          <select
            id="tw-division"
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
          <h2>Teams in {division.name}</h2>
          <p className="hint">
            Give each coach their team’s join code — anyone with it can register onto that team.
          </p>

          {division.teams.length === 0 ? (
            <p className="muted">No teams yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="standings">
                <thead>
                  <tr>
                    <th scope="col">Team</th>
                    <th scope="col">Kit</th>
                    <th scope="col">Pool</th>
                    <th scope="col">Join code</th>
                    <th scope="col" className="num">Players</th>
                    <th scope="col"></th>
                  </tr>
                </thead>
                <tbody>
                  {division.teams.map((team) => (
                    <tr key={team.id}>
                      <td>{team.name}</td>
                      <td>
                        <KitPicker team={team} onChanged={onChanged} />
                      </td>
                      <td>
                        <select
                          aria-label={`Pool for ${team.name}`}
                          value={team.poolId ?? ''}
                          style={{ width: 'auto', minHeight: '34px' }}
                          onChange={async (e) => {
                            await api.patch(`/api/events/teams/${team.id}/pool`, {
                              poolId: e.target.value || null,
                            });
                            onChanged();
                          }}
                        >
                          <option value="">None</option>
                          {division.pools.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <code className="joincode">{team.joinCode}</code>
                      </td>
                      <td className="num">{team.playerCount}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button
                          className="ghost"
                          style={{ minHeight: '1.9rem', padding: '0 .45rem' }}
                          onClick={async () => {
                            if (
                              !window.confirm(
                                `New join code for ${team.name}? The old one stops working.`,
                              )
                            )
                              return;
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
                            if (!window.confirm(`Remove ${team.name} from ${division.name}?`))
                              return;
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
                  ))}
                </tbody>
              </table>
            </div>
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
              style={{ flex: '0 0 auto' }}
              disabled={!name.trim()}
              onClick={async () => {
                await addTeams([name.trim()]);
                setName('');
              }}
            >
              Add
            </button>
          </div>

          <div className="field" style={{ marginTop: '1rem' }}>
            <label htmlFor="tw-bulk">Or paste a list, one per line</label>
            <textarea
              id="tw-bulk"
              rows={7}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={'Lakeview Lions\nPilsen Pumas\nHyde Park Hawks'}
            />
          </div>
          <button
            disabled={!bulk.trim()}
            onClick={async () => {
              await addTeams(bulk.split('\n').map((l) => l.trim()).filter(Boolean));
              setBulk('');
            }}
          >
            Add all
          </button>
        </section>
      </div>
    </div>
  );
}

/**
 * Which kit a team plays in.
 *
 * Offers a guess from the team's own name, because 19 teams is 19 chances to
 * pick the wrong shirt from an identical-looking list. The guess is only ever
 * a default -- two JPMorganChase sides wear different colours, so the name can
 * narrow it down but cannot decide it.
 */
function KitPicker({ team, onChanged }: { team: AdminTeam; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const suggestion = team.jersey ?? suggestKit(team.name);

  return (
    <span className="kit-picker">
      <Jersey jersey={team.jersey} teamName={team.name} size={26} />
      <select
        aria-label={`Kit for ${team.name}`}
        value={team.jersey ?? ''}
        disabled={saving}
        style={{ width: 'auto', minHeight: '34px' }}
        onChange={async (e) => {
          setSaving(true);
          setError(false);
          try {
            await api.patch(`/api/events/teams/${team.id}/jersey`, {
              jersey: e.target.value || null,
            });
            onChanged();
          } catch {
            setError(true);
          } finally {
            setSaving(false);
          }
        }}
      >
        <option value="">
          {suggestion && !team.jersey ? `None — try ${suggestion}?` : 'None'}
        </option>
        {JERSEYS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      {error && <span className="asterisk">!</span>}
    </span>
  );
}

/** Loose match of a team name against the kit filenames. */
function suggestKit(teamName: string): string | null {
  const flat = teamName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    JERSEYS.find((k) => k.replace(/-/g, '') === flat) ??
    JERSEYS.find((k) => flat.startsWith(k.replace(/-/g, '').slice(0, 6))) ??
    null
  );
}
