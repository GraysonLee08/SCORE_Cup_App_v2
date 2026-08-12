import { useCallback, useEffect, useState } from 'react';
import { api, ApiFailure } from '../../api.js';
import type { AdminDivision, AdminEvent, Feasibility } from '../../types.js';

/**
 * Everything needed to define the tournament, in the order an organiser
 * builds it: the day, then each tournament running on it, then generate.
 *
 * Fields are set by count rather than one at a time, because organisers think
 * "we have four pitches" -- and the feasibility line under each tournament
 * updates as settings change, so a day that will not fit is obvious before
 * anyone commits to it.
 */
export default function SetupPanel({
  data,
  onChanged,
}: {
  data: AdminEvent | null;
  onChanged: () => void;
}) {
  if (!data) return <CreateEvent onCreated={onChanged} />;
  return <EventSetup data={data} onChanged={onChanged} />;
}

function EventSetup({ data, onChanged }: { data: AdminEvent; onChanged: () => void }) {
  const [form, setForm] = useState(() => fromEvent(data));
  const [fieldCount, setFieldCount] = useState(data.fields.length);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feasibility, setFeasibility] = useState<Record<string, Feasibility>>({});

  useEffect(() => {
    setForm(fromEvent(data));
    setFieldCount(data.fields.length);
  }, [data]);

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
        } as Feasibility,
      }));
    }
  }, []);

  useEffect(() => {
    for (const division of data.divisions) {
      if (division.teams.length > 0) void checkFeasibility(division);
    }
  }, [data, checkFeasibility]);

  const run = useCallback(
    async (fn: () => Promise<unknown>, ok: string) => {
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
    },
    [onChanged],
  );

  const windowMinutes = minutesBetween(form.startTime, form.endTime);

  return (
    <>
      {status && (
        <div className={status.ok ? 'notice ok' : 'notice error'} role="status">
          {status.text}
        </div>
      )}

      <div className="cols">
        <section className="card">
          <h2>The day</h2>
          <p className="hint">Shared by every tournament running on this date.</p>

          <div className="field">
            <label htmlFor="s-name">Event name</label>
            <input
              id="s-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="field">
            <label htmlFor="s-location">Location</label>
            <input
              id="s-location"
              value={form.location}
              placeholder="e.g. Montrose Beach Fields, Chicago"
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </div>

          <div className="grid-3">
            <div className="field">
              <label htmlFor="s-date">Date</label>
              <input
                id="s-date"
                type="date"
                value={form.eventDate}
                onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="s-start">First kickoff</label>
              <input
                id="s-start"
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="s-end">Hard stop</label>
              <input
                id="s-end"
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            </div>
          </div>
          <p className="hint">
            That is {formatDuration(windowMinutes)} of playing time to fit everything into.
          </p>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="s-rest">Rest between games (min)</label>
              <input
                id="s-rest"
                type="number"
                min={0}
                max={240}
                value={form.minRestMinutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minRestMinutes: Number(e.target.value) }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="s-fields">Number of fields</label>
              <input
                id="s-fields"
                type="number"
                min={0}
                max={40}
                value={fieldCount}
                onChange={(e) => setFieldCount(Number(e.target.value))}
                onBlur={() => {
                  if (fieldCount !== data.fields.length) {
                    void run(
                      () =>
                        api.put(`/api/setup/events/${data.event.id}/field-count`, {
                          count: fieldCount,
                        }),
                      'Fields updated.',
                    );
                  }
                }}
              />
            </div>
          </div>
          <p className="hint">
            Games already run about 5 minutes apart, so a rest gap above{' '}
            <strong>5</strong> forces teams to sit out a whole round — that can add over an
            hour, and stops extra fields helping at all.
          </p>

          <div className="row" style={{ marginTop: '.6rem' }}>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    api.patch(`/api/events/${data.event.id}`, {
                      name: form.name,
                      location: form.location || undefined,
                      eventDate: form.eventDate,
                      startTime: form.startTime,
                      endTime: form.endTime,
                      minRestMinutes: form.minRestMinutes,
                    }),
                  'Saved.',
                )
              }
            >
              Save the day
            </button>
          </div>

          <h3>Field names</h3>
          <ul className="cards-list">
            {data.fields.map((field) => (
              <li key={field.id}>
                <input
                  aria-label={`Name for ${field.name}`}
                  defaultValue={field.name}
                  style={{ flex: 1 }}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== field.name) {
                      void run(
                        () =>
                          api.patch(`/api/setup/fields/${field.id}`, {
                            name: e.target.value.trim(),
                          }),
                        'Field renamed.',
                      );
                    }
                  }}
                />
                <span className="muted" style={{ minWidth: '9rem' }}>
                  {data.divisions.filter((d) => d.fieldIds.includes(field.id)).map((d) => d.name).join(', ') ||
                    'any tournament'}
                </span>
              </li>
            ))}
          </ul>
          {data.fields.length === 0 && (
            <p className="hint">Set a number of fields above to create them.</p>
          )}
        </section>

        <div>
          {data.divisions.map((division) => (
            <DivisionCard
              key={division.id}
              division={division}
              data={data}
              busy={busy}
              feasibility={feasibility[division.id]}
              onRun={run}
              onCheck={() => void checkFeasibility(division)}
            />
          ))}

          <AddDivision eventId={data.event.id} onAdded={onChanged} busy={busy} />
        </div>
      </div>
    </>
  );
}

function DivisionCard({
  division,
  data,
  busy,
  feasibility,
  onRun,
  onCheck,
}: {
  division: AdminDivision;
  data: AdminEvent;
  busy: boolean;
  feasibility?: Feasibility;
  onRun: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
  onCheck: () => void;
}) {
  const poolStage = division.stages.find((s) => s.kind === 'pool');
  const config = (poolStage?.config ?? {}) as { poolCount?: number; gamesPerTeam?: number };
  const [name, setName] = useState(division.name);
  const [pools, setPools] = useState(config.poolCount ?? division.pools.length);
  const [games, setGames] = useState(config.gamesPerTeam ?? 3);

  useEffect(() => {
    setName(division.name);
    setPools(config.poolCount ?? division.pools.length);
    setGames(config.gamesPerTeam ?? 3);
  }, [division, config.poolCount, config.gamesPerTeam]);

  return (
    <section className="card">
      <div className="meta">
        <h2 style={{ margin: 0, flex: 1 }}>{division.name}</h2>
        {division.fixtureCount > 0 && (
          <span className="pill done">{division.fixtureCount} games scheduled</span>
        )}
      </div>

      <div className="field">
        <label htmlFor={`d-name-${division.id}`}>Tournament name</label>
        <input
          id={`d-name-${division.id}`}
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

      <div className="grid-3">
        <div className="field">
          <label htmlFor={`d-teams-${division.id}`}>Teams</label>
          <input id={`d-teams-${division.id}`} value={division.teams.length} readOnly />
          <p className="hint">Added on the Teams tab.</p>
        </div>
        <div className="field">
          <label htmlFor={`d-pools-${division.id}`}>Pools</label>
          <input
            id={`d-pools-${division.id}`}
            type="number"
            min={1}
            max={26}
            value={pools}
            disabled={!poolStage}
            onChange={(e) => setPools(Number(e.target.value))}
            onBlur={() => {
              if (poolStage && pools !== (config.poolCount ?? division.pools.length)) {
                void onRun(
                  () =>
                    api.put(`/api/setup/divisions/${division.id}/pool-count`, { count: pools }),
                  'Pools updated.',
                );
              }
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={`d-games-${division.id}`}>Games per team</label>
          <input
            id={`d-games-${division.id}`}
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
                  'Games per team updated.',
                );
              }
            }}
          />
        </div>
      </div>

      <div className="field">
        <label>Fields this tournament uses</label>
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
        <p className="hint">
          Tick none to allow every field. Pinning each tournament to its own fields is how two
          run side by side.
        </p>
      </div>

      {!poolStage && (
        <div className="row">
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
        </div>
      )}

      {poolStage && !division.stages.some((s) => s.kind === 'bracket') && (
        <div className="row">
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
        </div>
      )}

      {division.teams.some((t) => !t.poolId) && (
        <div className="notice pending">
          {division.teams.filter((t) => !t.poolId).length} team(s) are not in a pool yet.
        </div>
      )}

      {feasibility && (
        <div className={feasibility.fits ? 'notice ok' : 'notice error'}>
          {feasibility.summary}
        </div>
      )}

      <div className="row">
        <button
          disabled={busy || division.teams.length === 0}
          onClick={() =>
            onRun(
              () => api.post(`/api/events/divisions/${division.id}/auto-assign-pools`),
              'Teams spread across pools.',
            )
          }
        >
          Auto-assign pools
        </button>
        <button disabled={busy} onClick={onCheck}>
          Check it fits
        </button>
        <button
          className="primary"
          disabled={busy || division.teams.length === 0}
          onClick={() =>
            onRun(async () => {
              try {
                await api.post(`/api/schedule/divisions/${division.id}/generate`);
              } catch (error) {
                if (error instanceof ApiFailure && error.code === 'results_would_be_lost') {
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

      <div className="row" style={{ marginTop: '.4rem' }}>
        <button
          className="ghost danger"
          disabled={busy}
          onClick={() => {
            if (!window.confirm(`Delete ${division.name} and everything in it?`)) return;
            void onRun(
              () => api.delete(`/api/events/divisions/${division.id}`),
              'Tournament deleted.',
            );
          }}
        >
          Delete this tournament
        </button>
      </div>
    </section>
  );
}

function AddDivision({
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
    <section className="card">
      <h2>Add a tournament</h2>
      <p className="hint">
        A separate competition on the same day — e.g. Competitive and Community — each with its
        own teams, pools and bracket.
      </p>
      <div className="row">
        <input
          aria-label="Tournament name"
          placeholder="e.g. Competitive"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          disabled={busy || !name.trim()}
          onClick={async () => {
            await api.post(`/api/events/${eventId}/divisions`, { name: name.trim() });
            setName('');
            onAdded();
          }}
        >
          Add
        </button>
      </div>
    </section>
  );
}

function CreateEvent({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    name: 'SCORES Cup',
    location: '',
    eventDate: '2026-08-29',
    startTime: '09:00',
    endTime: '17:00',
    minRestMinutes: 5,
  });
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="card stack" style={{ maxWidth: '34rem' }}>
      <h2>Set up the tournament</h2>
      <p className="hint">You can change any of this later.</p>
      {error && <div className="notice error">{error}</div>}

      <div className="field">
        <label htmlFor="c-name">Event name</label>
        <input
          id="c-name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </div>
      <div className="field">
        <label htmlFor="c-location">Location</label>
        <input
          id="c-location"
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
        />
      </div>
      <div className="grid-3">
        <div className="field">
          <label htmlFor="c-date">Date</label>
          <input
            id="c-date"
            type="date"
            value={form.eventDate}
            onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="c-start">First kickoff</label>
          <input
            id="c-start"
            type="time"
            value={form.startTime}
            onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="c-end">Hard stop</label>
          <input
            id="c-end"
            type="time"
            value={form.endTime}
            onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
          />
        </div>
      </div>
      <div className="field" style={{ maxWidth: '14rem' }}>
        <label htmlFor="c-rest">Rest between games (min)</label>
        <input
          id="c-rest"
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
            await api.post('/api/events', {
              ...form,
              location: form.location || undefined,
            });
            onCreated();
          } catch (err) {
            setError(err instanceof ApiFailure ? err.message : 'Could not create it.');
          }
        }}
      >
        Create
      </button>
    </section>
  );
}

function fromEvent(data: AdminEvent) {
  return {
    name: data.event.name,
    location: data.event.location ?? '',
    eventDate: data.event.eventDate.slice(0, 10),
    startTime: data.event.startTime.slice(0, 5),
    endTime: data.event.endTime.slice(0, 5),
    minRestMinutes: data.event.minRestMinutes,
  };
}

function minutesBetween(start: string, end: string): number {
  const toMinutes = (t: string) => {
    const [h = '0', m = '0'] = t.split(':');
    return Number(h) * 60 + Number(m);
  };
  return toMinutes(end) - toMinutes(start);
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return 'no time';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} minutes`;
  if (m === 0) return `${h} hours`;
  return `${h}h ${m}m`;
}
