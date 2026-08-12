import { useCallback, useEffect, useState } from 'react';
import { api, ApiFailure } from '../../api.js';
import type { AdminDivision, AdminEvent, Feasibility } from '../../types.js';

/**
 * The setup screen. Ordered the way the day is actually built: event, fields,
 * divisions, stages, pools, then generate.
 *
 * The feasibility check runs before generating, so an admin discovers a day
 * that does not fit while there is still time to change it.
 */
export default function SetupPanel({
  data,
  onChanged,
}: {
  data: AdminEvent | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [feasibility, setFeasibility] = useState<Record<string, Feasibility>>({});

  const act = useCallback(
    async (fn: () => Promise<unknown>, success: string) => {
      setBusy(true);
      setStatus(null);
      try {
        await fn();
        setStatus(success);
        onChanged();
      } catch (error) {
        setStatus(error instanceof ApiFailure ? error.message : 'Something went wrong.');
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  const checkFeasibility = useCallback(async (division: AdminDivision) => {
    try {
      const res = await api.get<Feasibility>(
        `/api/schedule/divisions/${division.id}/feasibility`,
      );
      setFeasibility((f) => ({ ...f, [division.id]: res }));
    } catch (error) {
      setFeasibility((f) => ({
        ...f,
        [division.id]: {
          fits: false,
          summary: error instanceof ApiFailure ? error.message : 'Could not check.',
          fixtureCount: 0,
          fieldCount: 0,
          requiredMinutes: 0,
          availableMinutes: 0,
          overByMinutes: 0,
          waves: 0,
        },
      }));
    }
  }, []);

  useEffect(() => {
    for (const division of data?.divisions ?? []) {
      if (division.teams.length > 0) void checkFeasibility(division);
    }
  }, [data, checkFeasibility]);

  if (!data) return <CreateEvent onCreated={onChanged} />;

  return (
    <>
      {status && (
        <div className="notice ok" role="status">
          {status}
        </div>
      )}

      <section className="card">
        <h2>The day</h2>
        <dl className="kv">
          <div>
            <dt>Date</dt>
            <dd>{data.event.eventDate}</dd>
          </div>
          <div>
            <dt>Window</dt>
            <dd>
              {data.event.startTime}–{data.event.endTime}
            </dd>
          </div>
          <div>
            <dt>Rest between games</dt>
            <dd>{data.event.minRestMinutes} min</dd>
          </div>
          <div>
            <dt>Fields</dt>
            <dd>{data.fields.length}</dd>
          </div>
        </dl>

        {/* Above the changeover gap, teams must sit out alternate slots and
            extra fields stop reducing the finish time. */}
        {data.event.minRestMinutes > 5 && (
          <div className="notice pending" style={{ marginTop: '.8rem' }}>
            A rest gap above 5 minutes means teams cannot play back-to-back slots, which
            lengthens the day considerably — and extra fields stop helping.
          </div>
        )}

        <AddField eventId={data.event.id} onAdded={onChanged} busy={busy} />

        <ul className="cards-list">
          {data.fields.map((f) => (
            <li key={f.id}>{f.name}</li>
          ))}
        </ul>
      </section>

      <AddDivision eventId={data.event.id} fields={data.fields} onAdded={onChanged} busy={busy} />

      {data.divisions.map((division) => (
        <section className="card" key={division.id}>
          <div className="meta">
            <h2 style={{ margin: 0 }}>{division.name}</h2>
            <span className="pill">{division.teams.length} teams</span>
            <span className="pill">
              {division.fieldIds.length > 0
                ? `${division.fieldIds.length} fields`
                : 'all fields'}
            </span>
            {division.fixtureCount > 0 && (
              <span className="pill done">{division.fixtureCount} games</span>
            )}
          </div>

          {division.stages.length === 0 ? (
            <div className="row">
              <button
                disabled={busy}
                onClick={() =>
                  act(
                    () =>
                      api.post(`/api/events/divisions/${division.id}/stages`, {
                        kind: 'pool',
                        name: 'Pool Play',
                        sequence: 1,
                      }),
                    'Pool stage added.',
                  )
                }
              >
                Add pool stage
              </button>
            </div>
          ) : (
            <ul className="cards-list">
              {division.stages.map((s) => (
                <li key={s.id}>
                  <strong>{s.name}</strong>
                  <span className="muted" style={{ marginLeft: '.5rem' }}>
                    {s.kind === 'pool'
                      ? `${(s.config as any).poolCount} pools · ${(s.config as any).gamesPerTeam} games each`
                      : `${(s.config as any).advancePerPool} advance per pool`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {division.stages.some((s) => s.kind === 'pool') &&
            !division.stages.some((s) => s.kind === 'bracket') && (
              <div className="row" style={{ marginTop: '.5rem' }}>
                <button
                  disabled={busy}
                  onClick={() =>
                    act(
                      () =>
                        api.post(`/api/events/divisions/${division.id}/stages`, {
                          kind: 'bracket',
                          name: 'Knockout',
                          sequence: 2,
                        }),
                      'Knockout stage added.',
                    )
                  }
                >
                  Add knockout stage
                </button>
              </div>
            )}

          {division.pools.length > 0 && division.teams.length > 0 && (
            <>
              <h3 style={{ marginTop: '1rem' }}>Pools</h3>
              {division.pools.map((pool) => (
                <div key={pool.id} style={{ marginBottom: '.5rem' }}>
                  <strong>{pool.name}</strong>
                  <ul className="cards-list">
                    {division.teams
                      .filter((t) => t.poolId === pool.id)
                      .map((t) => (
                        <li key={t.id}>
                          <span style={{ flex: 1 }}>{t.name}</span>
                          <select
                            aria-label={`Pool for ${t.name}`}
                            value={t.poolId ?? ''}
                            style={{ width: 'auto', minHeight: '2.2rem' }}
                            onChange={(e) =>
                              act(
                                () =>
                                  api.patch(`/api/events/teams/${t.id}/pool`, {
                                    poolId: e.target.value || null,
                                  }),
                                'Moved.',
                              )
                            }
                          >
                            {division.pools.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}

              {division.teams.some((t) => !t.poolId) && (
                <div className="notice pending">
                  {division.teams.filter((t) => !t.poolId).length} team(s) are not in a pool.
                </div>
              )}

              <div className="row">
                <button
                  disabled={busy}
                  onClick={() =>
                    act(
                      () =>
                        api.post(`/api/events/divisions/${division.id}/auto-assign-pools`),
                      'Teams spread across pools.',
                    )
                  }
                >
                  Auto-assign pools
                </button>
              </div>
            </>
          )}

          {feasibility[division.id] && (
            <div
              className={`notice ${feasibility[division.id]!.fits ? 'ok' : 'error'}`}
              style={{ marginTop: '.8rem' }}
            >
              {feasibility[division.id]!.summary}
            </div>
          )}

          <div className="row" style={{ marginTop: '.5rem' }}>
            <button disabled={busy} onClick={() => void checkFeasibility(division)}>
              Check it fits
            </button>
            <button
              className="primary"
              disabled={busy || division.teams.length === 0}
              onClick={() =>
                act(async () => {
                  try {
                    await api.post(`/api/schedule/divisions/${division.id}/generate`);
                  } catch (error) {
                    // Regenerating over real results needs a deliberate confirmation.
                    if (
                      error instanceof ApiFailure &&
                      error.code === 'results_would_be_lost'
                    ) {
                      if (!window.confirm(`${error.message}\n\nOverwrite anyway?`)) return;
                      await api.post(`/api/schedule/divisions/${division.id}/generate`, {
                        force: true,
                      });
                    } else {
                      throw error;
                    }
                  }
                }, 'Schedule generated.')
              }
            >
              Generate schedule
            </button>
          </div>
        </section>
      ))}
    </>
  );
}

function CreateEvent({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    name: 'SCORES Cup',
    eventDate: '2026-08-29',
    startTime: '09:00',
    endTime: '17:00',
    minRestMinutes: 5,
  });
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="card stack">
      <h2>Create the event</h2>
      {error && <div className="notice error">{error}</div>}

      {(
        [
          ['name', 'Name', 'text'],
          ['eventDate', 'Date', 'date'],
          ['startTime', 'First kickoff', 'time'],
          ['endTime', 'Hard stop', 'time'],
        ] as const
      ).map(([key, label, type]) => (
        <div className="field" key={key}>
          <label htmlFor={key}>{label}</label>
          <input
            id={key}
            type={type}
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          />
        </div>
      ))}

      <div className="field">
        <label htmlFor="rest">Minimum rest between a team’s games (minutes)</label>
        <input
          id="rest"
          type="number"
          min={0}
          value={form.minRestMinutes}
          onChange={(e) => setForm((f) => ({ ...f, minRestMinutes: Number(e.target.value) }))}
        />
      </div>

      <button
        className="primary"
        onClick={async () => {
          try {
            await api.post('/api/events', form);
            onCreated();
          } catch (err) {
            setError(err instanceof ApiFailure ? err.message : 'Could not create the event.');
          }
        }}
      >
        Create event
      </button>
    </section>
  );
}

function AddField({
  eventId,
  onAdded,
  busy,
}: {
  eventId: string;
  onAdded: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState('');
  return (
    <div className="row" style={{ marginTop: '.8rem' }}>
      <input
        aria-label="New field name"
        placeholder="Field name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        disabled={busy || !name.trim()}
        onClick={async () => {
          await api.post(`/api/events/${eventId}/fields`, { name: name.trim() });
          setName('');
          onAdded();
        }}
      >
        Add field
      </button>
    </div>
  );
}

function AddDivision({
  eventId,
  fields,
  onAdded,
  busy,
}: {
  eventId: string;
  fields: { id: string; name: string }[];
  onAdded: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <section className="card">
      <h2>Add a tournament</h2>
      <p className="muted">
        Leave fields unticked to let this tournament use any of them. Tick some to pin it —
        that is how two tournaments run side by side.
      </p>

      <div className="field">
        <label htmlFor="division-name">Name</label>
        <input
          id="division-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Competitive"
        />
      </div>

      <div className="field">
        <label>Fields</label>
        {fields.map((f) => (
          <label key={f.id} className="checkbox">
            <input
              type="checkbox"
              checked={selected.includes(f.id)}
              onChange={(e) =>
                setSelected((s) =>
                  e.target.checked ? [...s, f.id] : s.filter((x) => x !== f.id),
                )
              }
            />
            {f.name}
          </label>
        ))}
      </div>

      <button
        disabled={busy || !name.trim()}
        onClick={async () => {
          await api.post(`/api/events/${eventId}/divisions`, {
            name: name.trim(),
            fieldIds: selected.length > 0 ? selected : undefined,
          });
          setName('');
          setSelected([]);
          onAdded();
        }}
      >
        Add tournament
      </button>
    </section>
  );
}
