import { useEffect, useState } from 'react';
import { api, ApiFailure } from '../../../api.js';
import type { AdminEvent } from '../../../types.js';

/**
 * The tournament itself: the date, venue, timings and pitches that every
 * division shares.
 *
 * Note the database calls this an `event`; the interface calls it a tournament
 * because that is what organisers call it. Divisions sit beneath it.
 */
export default function TournamentWidget({
  data,
  onChanged,
}: {
  data: AdminEvent;
  onChanged: () => void;
}) {
  const [form, setForm] = useState(() => fromEvent(data));
  const [fieldCount, setFieldCount] = useState(data.fields.length);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(fromEvent(data));
    setFieldCount(data.fields.length);
  }, [data]);

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

  const windowMinutes = minutesBetween(form.startTime, form.endTime);

  return (
    <div className="widget">
      {status && (
        <div className={status.ok ? 'notice ok' : 'notice error'} role="status">
          {status.text}
        </div>
      )}

      <section className="card">
        <h2>Tournament</h2>
        <p className="hint">The date, venue and timings. Every division inherits these.</p>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="d-name">Tournament name</label>
            <input
              id="d-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="d-date">Date</label>
            <input
              id="d-date"
              type="date"
              value={form.eventDate}
              onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="d-location">Location</label>
          <input
            id="d-location"
            value={form.location}
            placeholder="Fire Pitch, 3626 N Talman Ave, Chicago, IL 60618"
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
          <p className="hint">The full address, so players and spectators can find it.</p>
        </div>

        <h3>Timings</h3>
        <div className="grid-3">
          <div className="field">
            <label htmlFor="d-start">First kickoff</label>
            <input
              id="d-start"
              type="time"
              value={form.startTime}
              onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="d-end">Hard stop</label>
            <input
              id="d-end"
              type="time"
              value={form.endTime}
              onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="d-rest">Rest between games (min)</label>
            <input
              id="d-rest"
              type="number"
              min={0}
              max={240}
              value={form.minRestMinutes}
              onChange={(e) =>
                setForm((f) => ({ ...f, minRestMinutes: Number(e.target.value) }))
              }
            />
          </div>
        </div>
        <p className="hint">
          That is {formatDuration(windowMinutes)} to fit everything into. Games already run
          about 5 minutes apart, so a rest gap above <strong>5</strong> forces teams to sit out
          a whole round — that can add over an hour, and stops extra fields helping at all.
        </p>
      </section>

      <section className="card">
        <h2>Fields</h2>
        <p className="hint">
          The pitches you have. Each division is then given some or all of them.
        </p>

        <div className="field" style={{ maxWidth: '14rem' }}>
          <label htmlFor="d-fields">Number of fields</label>
          <input
            id="d-fields"
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

        {data.fields.length > 0 && (
          <>
            <h3>Names</h3>
            <div className="grid-3">
              {data.fields.map((field) => (
                <div className="field" key={field.id}>
                  <label htmlFor={`fn-${field.id}`}>Field {field.sortOrder || ''}</label>
                  <input
                    id={`fn-${field.id}`}
                    defaultValue={field.name}
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
                </div>
              ))}
            </div>
          </>
        )}

        {data.fields.length === 0 && (
          <p className="hint">Set a number above to create them.</p>
        )}

        <div style={{ marginTop: '1.4rem' }}>
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
            {busy ? 'Saving…' : 'Save tournament'}
          </button>
        </div>
      </section>
    </div>
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
