import { useState } from 'react';
import { api, ApiFailure } from '../../api.js';
import type { AdminEvent } from '../../types.js';

/**
 * Teams and their join codes. The join code is what a coach shares so their
 * players register onto the right team, so it needs to be easy to read out.
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
  const [status, setStatus] = useState<string | null>(null);

  const division = data.divisions.find((d) => d.id === divisionId);

  async function addTeams(names: string[]) {
    let added = 0;
    const failures: string[] = [];
    for (const teamName of names) {
      try {
        await api.post('/api/teams', { divisionId, name: teamName });
        added++;
      } catch (error) {
        failures.push(
          `${teamName}: ${error instanceof ApiFailure ? error.message : 'failed'}`,
        );
      }
    }
    setStatus(
      failures.length === 0
        ? `Added ${added} team${added === 1 ? '' : 's'}.`
        : `Added ${added}. Skipped: ${failures.join('; ')}`,
    );
    onChanged();
  }

  return (
    <>
      {status && (
        <div className="notice ok" role="status">
          {status}
        </div>
      )}

      {data.divisions.length > 1 && (
        <div className="field">
          <label htmlFor="teams-division">Tournament</label>
          <select
            id="teams-division"
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

      <section className="card stack">
        <h2>Add teams</h2>
        <div className="row">
          <input
            aria-label="Team name"
            placeholder="Team name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            disabled={!name.trim() || !divisionId}
            onClick={async () => {
              await addTeams([name.trim()]);
              setName('');
            }}
          >
            Add
          </button>
        </div>

        <div className="field">
          <label htmlFor="bulk">Or paste a list, one team per line</label>
          <textarea
            id="bulk"
            rows={5}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={'Lakeview Lions\nPilsen Pumas\nHyde Park Hawks'}
          />
        </div>
        <button
          disabled={!bulk.trim() || !divisionId}
          onClick={async () => {
            const names = bulk
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean);
            await addTeams(names);
            setBulk('');
          }}
        >
          Add all
        </button>
      </section>

      {division && (
        <section className="card">
          <h2>{division.name}</h2>
          <p className="muted">
            Give each coach their team’s code. Anyone with it can register onto that team, so
            rotate it if it gets out.
          </p>

          <div className="table-scroll">
            <table className="standings">
              <thead>
                <tr>
                  <th scope="col">Team</th>
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
                      <code className="joincode">{team.joinCode}</code>
                    </td>
                    <td className="num">{team.playerCount}</td>
                    <td>
                      <button
                        className="ghost"
                        style={{ minHeight: '2rem', padding: '0 .55rem' }}
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Rotate the code for ${team.name}? The old one stops working immediately. Players already registered are unaffected.`,
                            )
                          )
                            return;
                          await api.post(`/api/teams/${team.id}/join-code`);
                          onChanged();
                        }}
                      >
                        Rotate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {division.teams.length === 0 && <p className="muted">No teams yet.</p>}
        </section>
      )}
    </>
  );
}
