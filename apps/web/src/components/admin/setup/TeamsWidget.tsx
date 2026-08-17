import { useCallback, useEffect, useState } from 'react';
import { api, ApiFailure } from '../../../api.js';
import type { AdminEvent, AdminTeam, AdminUser } from '../../../types.js';
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
  const [people, setPeople] = useState<AdminUser[]>([]);

  const division = data.divisions.find((d) => d.id === divisionId) ?? data.divisions[0];

  // Anyone who could sensibly be put in charge. Referees are left out: their
  // sign-in lands on the referee screen, which has no team on it.
  const loadPeople = useCallback(async () => {
    try {
      const res = await api.get<{ users: AdminUser[] }>('/api/admin/users');
      setPeople(res.users.filter((u) => !u.disabled && u.role !== 'ref'));
    } catch {
      setPeople([]);
    }
  }, []);

  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

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
                    <th scope="col">Runs the team</th>
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
                        <CoachPicker
                          team={team}
                          people={people}
                          onChanged={() => {
                            onChanged();
                            void loadPeople();
                          }}
                          onStatus={setStatus}
                        />
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
 * The one person answerable for a team -- captain and coach are the same
 * person here.
 *
 * The normal route is the join code: send it to them, they register, they
 * appear in this list. Naming them here is the second half, and the half that
 * was missing entirely -- it is what lets them edit their own roster, and what
 * makes the team show up when they sign in.
 */
function CoachPicker({
  team,
  people,
  onChanged,
  onStatus,
}: {
  team: AdminTeam;
  people: AdminUser[];
  onChanged: () => void;
  onStatus: (s: { ok: boolean; text: string }) => void;
}) {
  const [saving, setSaving] = useState(false);

  return (
    <select
      aria-label={`Who runs ${team.name}`}
      value={team.coachUserId ?? ''}
      disabled={saving}
      style={{ width: 'auto', minHeight: '34px', maxWidth: '13rem' }}
      onChange={async (e) => {
        const userId = e.target.value || null;
        setSaving(true);
        try {
          const res = await api.put<{ claimedPlayer: boolean; promotedToCoach: boolean }>(
            `/api/teams/${team.id}/coach`,
            { userId },
          );
          const who = people.find((p) => p.id === userId)?.displayName;
          // Both of these happen silently on the server, and both change what
          // that person can do, so neither should be a surprise later.
          const extra = [
            res.promotedToCoach && 'their account is now a coach account',
            res.claimedPlayer && 'their roster entry is linked to it',
          ].filter(Boolean);
          onStatus({
            ok: true,
            text: userId
              ? `${who} runs ${team.name}${extra.length ? ` — ${extra.join(', ')}.` : '.'}`
              : `${team.name} has nobody assigned.`,
          });
          onChanged();
        } catch (error) {
          onStatus({
            ok: false,
            text: error instanceof ApiFailure ? error.message : 'Could not save that.',
          });
        } finally {
          setSaving(false);
        }
      }}
    >
      <option value="">Nobody yet</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.displayName}
        </option>
      ))}
    </select>
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
