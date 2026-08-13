import { useEffect, useState } from 'react';
import { api, ApiFailure } from '../../../api.js';
import type { AdminDivision, AdminEvent } from '../../../types.js';

/**
 * Divisions: the separate competitions within the tournament. Each has its own
 * teams, pools and bracket, and optionally its own fields -- which is how two
 * run side by side.
 */
export default function DivisionsWidget({
  data,
  onChanged,
}: {
  data: AdminEvent;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
      setStatus({ ok: true, text: ok });
      onChanged();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof ApiFailure ? error.message : 'Something went wrong.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="widget">
      {status && (
        <div className={status.ok ? 'notice ok' : 'notice error'} role="status">
          {status.text}
        </div>
      )}

      {data.divisions.map((division) => (
        <DivisionCard
          key={division.id}
          division={division}
          data={data}
          busy={busy}
          onRun={run}
        />
      ))}

      <section className="card">
        <h2>Add a division</h2>
        <p className="hint">
          A separate competition within this tournament — Competitive and Community, for example.
        </p>
        <div className="row" style={{ maxWidth: '32rem' }}>
          <input
            aria-label="Division name"
            placeholder="e.g. Competitive"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            style={{ flex: '0 0 auto' }}
            disabled={busy || !newName.trim()}
            onClick={async () => {
              await run(
                () => api.post(`/api/events/${data.event.id}/divisions`, { name: newName.trim() }),
                'Division added.',
              );
              setNewName('');
            }}
          >
            Add
          </button>
        </div>
      </section>
    </div>
  );
}

function DivisionCard({
  division,
  data,
  busy,
  onRun,
}: {
  division: AdminDivision;
  data: AdminEvent;
  busy: boolean;
  onRun: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const poolStage = division.stages.find((s) => s.kind === 'pool');
  const config = (poolStage?.config ?? {}) as { gamesPerTeam?: number };
  const [name, setName] = useState(division.name);
  const [games, setGames] = useState(config.gamesPerTeam ?? 3);

  useEffect(() => {
    setName(division.name);
    setGames(config.gamesPerTeam ?? 3);
  }, [division, config.gamesPerTeam]);

  return (
    <section className="card">
      <div className="meta">
        <h2 style={{ margin: 0, flex: 1 }}>{division.name}</h2>
        <span className="pill">{division.teams.length} teams</span>
        {division.fixtureCount > 0 && (
          <span className="pill done">{division.fixtureCount} games</span>
        )}
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor={`tn-${division.id}`}>Division name</label>
          <input
            id={`tn-${division.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim() && name !== division.name) {
                void onRun(
                  () => api.patch(`/api/setup/divisions/${division.id}`, { name: name.trim() }),
                  'Renamed.',
                );
              }
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={`tg-${division.id}`}>Games per team</label>
          <input
            id={`tg-${division.id}`}
            type="number"
            min={1}
            max={30}
            value={games}
            disabled={!poolStage}
            onChange={(e) => setGames(Number(e.target.value))}
            onBlur={() => {
              if (poolStage && games !== config.gamesPerTeam) {
                void onRun(
                  () =>
                    api.put(`/api/setup/divisions/${division.id}/games-per-team`, {
                      count: games,
                    }),
                  'Updated.',
                );
              }
            }}
          />
          <p className="hint">
            Pool games each team plays before the playoffs — not the size of the pool. Four
            teams playing 3 each is a full round robin; 11 teams playing 2 each is not, and
            the schedule pairs them up so nobody plays the same side twice.
          </p>
        </div>
      </div>

      <h3>Fields it uses</h3>
      <p className="hint" style={{ marginTop: 0, marginBottom: '.6rem' }}>
        Tick none to allow every field. Pinning each division to its own is how two run at once.
      </p>
      <div>
        {data.fields.map((field) => (
          <label key={field.id} className="checkbox">
            <input
              type="checkbox"
              checked={division.fieldIds.includes(field.id)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...division.fieldIds, field.id]
                  : division.fieldIds.filter((id) => id !== field.id);
                void onRun(
                  () => api.patch(`/api/setup/divisions/${division.id}`, { fieldIds: next }),
                  'Fields updated.',
                );
              }}
            />
            {field.name}
          </label>
        ))}
      </div>

      <h3>Rounds</h3>
      <div className="row" style={{ maxWidth: '30rem' }}>
        {!poolStage && (
          <button
            disabled={busy}
            onClick={() =>
              onRun(
                () =>
                  api.post(`/api/events/divisions/${division.id}/stages`, {
                    kind: 'pool',
                    name: 'Pool Play',
                    sequence: 1,
                  }),
                'Pool play added.',
              )
            }
          >
            Add pool play
          </button>
        )}
        {poolStage && !division.stages.some((s) => s.kind === 'bracket') && (
          <button
            disabled={busy}
            onClick={() =>
              onRun(
                () =>
                  api.post(`/api/events/divisions/${division.id}/stages`, {
                    kind: 'bracket',
                    name: 'Knockout',
                    sequence: 2,
                  }),
                'Knockout added.',
              )
            }
          >
            Add knockout rounds
          </button>
        )}
        {division.stages.map((s) => (
          <span key={s.id} className="pill">
            {s.name}
          </span>
        ))}
      </div>

      <div style={{ marginTop: '1.4rem' }}>
        <button
          className="ghost danger"
          disabled={busy}
          onClick={() => {
            // Deliberately asks the server first rather than guessing. It comes
            // back naming what would be lost, and the name has to be typed --
            // this cascades through every team, game and result in the
            // division, and there is nothing to undo it with.
            void onRun(async () => {
              const url = `/api/events/divisions/${division.id}`;
              try {
                await api.delete(url);
                return;
              } catch (error) {
                if (!(error instanceof ApiFailure) || error.code !== 'division_not_empty') {
                  throw error;
                }
                const typed = window.prompt(
                  `${error.message}

Type the division's name to confirm: ${division.name}`,
                );
                if (typed?.trim() !== division.name) {
                  throw new ApiFailure(409, 'cancelled', 'Not deleted — the name did not match.');
                }
                await api.delete(url, { force: true });
              }
            }, 'Division deleted.');
          }}
        >
          Delete this division
        </button>
      </div>
    </section>
  );
}
