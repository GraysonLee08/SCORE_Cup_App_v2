import { useEffect, useState } from 'react';
import { api, ApiFailure } from '../../api.js';
import type { AdminEvent } from '../../types.js';

/**
 * Event-level settings: the things every tournament that day shares.
 *
 * Written to explain itself. An admin opening this a week before the event
 * should not have to guess what "rest between games" governs, and should not
 * discover that the date is unchangeable only after entering it wrong.
 */
export default function EventSettings({
  data,
  onChanged,
}: {
  data: AdminEvent;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: data.event.name,
    eventDate: data.event.eventDate.slice(0, 10),
    startTime: data.event.startTime.slice(0, 5),
    endTime: data.event.endTime.slice(0, 5),
    minRestMinutes: data.event.minRestMinutes,
  });
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newField, setNewField] = useState('');

  useEffect(() => {
    setForm({
      name: data.event.name,
      eventDate: data.event.eventDate.slice(0, 10),
      startTime: data.event.startTime.slice(0, 5),
      endTime: data.event.endTime.slice(0, 5),
      minRestMinutes: data.event.minRestMinutes,
    });
  }, [data.event]);

  const windowMinutes = minutesBetween(data.event.startTime, data.event.endTime);

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      await api.patch(`/api/events/${data.event.id}`, form);
      setEditing(false);
      setStatus('Saved.');
      onChanged();
    } catch (error) {
      setStatus(error instanceof ApiFailure ? error.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="meta">
        <h2 style={{ margin: 0 }}>Tournament day</h2>
        {!editing && (
          <button
            className="ghost"
            style={{ minHeight: '2.1rem', padding: '0 .7rem' }}
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        )}
      </div>

      <p className="muted">
        Settings shared by every tournament running on this date. Each tournament then gets its
        own teams, pools and fields below.
      </p>

      {status && (
        <div className={status === 'Saved.' ? 'notice ok' : 'notice error'} role="status">
          {status}
        </div>
      )}

      {!editing ? (
        <dl className="kv">
          <div>
            <dt>Date</dt>
            <dd>{formatDate(data.event.eventDate)}</dd>
          </div>
          <div>
            <dt>First kickoff</dt>
            <dd>{data.event.startTime.slice(0, 5)}</dd>
          </div>
          <div>
            <dt>Hard stop</dt>
            <dd>{data.event.endTime.slice(0, 5)}</dd>
          </div>
          <div>
            <dt>You have</dt>
            <dd>{formatDuration(windowMinutes)}</dd>
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
      ) : (
        <div className="stack">
          <div className="field">
            <label htmlFor="ev-name">Event name</label>
            <input
              id="ev-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="row">
            <div>
              <label htmlFor="ev-date">Date</label>
              <input
                id="ev-date"
                type="date"
                value={form.eventDate}
                onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="ev-start">First kickoff</label>
              <input
                id="ev-start"
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="ev-end">Hard stop</label>
              <input
                id="ev-end"
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            </div>
          </div>
          <p className="muted">
            Everything must finish by the hard stop. The scheduler warns you before generating
            if it will not fit.
          </p>

          <div className="field">
            <label htmlFor="ev-rest">Rest between a team’s games (minutes)</label>
            <input
              id="ev-rest"
              type="number"
              min={0}
              max={240}
              value={form.minRestMinutes}
              onChange={(e) =>
                setForm((f) => ({ ...f, minRestMinutes: Number(e.target.value) }))
              }
            />
            <p className="muted" style={{ marginTop: '.35rem' }}>
              The gap between a team finishing one game and starting the next. This matters more
              than the number of fields: games already run about 5 minutes apart, so anything
              above <strong>5</strong> forces teams to sit out a whole round — which can add
              well over an hour, and stops extra fields helping at all.
            </p>
          </div>

          <div className="row">
            <button onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
            <button className="primary" onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      )}

      {!editing && data.event.minRestMinutes > 5 && (
        <div className="notice pending" style={{ marginTop: '.8rem' }}>
          A rest gap above 5 minutes means teams cannot play in back-to-back rounds. Expect a
          noticeably longer day, and note that adding fields will not shorten it.
        </div>
      )}

      <h3 style={{ marginTop: '1.2rem' }}>Fields</h3>
      <p className="muted">
        The pitches you have. Each tournament is then given some or all of them — that is how
        two tournaments run side by side.
      </p>

      {data.fields.length === 0 && (
        <div className="notice pending">
          No fields yet. Add at least one before generating a schedule.
        </div>
      )}

      <ul className="cards-list">
        {data.fields.map((field) => {
          const usedBy = data.divisions.filter((d) => d.fieldIds.includes(field.id));
          return (
            <li key={field.id}>
              <span style={{ flex: 1 }}>
                <strong>{field.name}</strong>
                <span className="muted" style={{ marginLeft: '.5rem' }}>
                  {usedBy.length > 0
                    ? usedBy.map((d) => d.name).join(', ')
                    : 'available to every tournament'}
                </span>
              </span>
              <button
                className="ghost danger"
                style={{ minHeight: '2rem', padding: '0 .55rem' }}
                onClick={async () => {
                  try {
                    await api.delete(`/api/events/fields/${field.id}`);
                    onChanged();
                  } catch (error) {
                    setStatus(
                      error instanceof ApiFailure ? error.message : 'Could not remove it.',
                    );
                  }
                }}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      <div className="row" style={{ marginTop: '.6rem' }}>
        <input
          aria-label="New field name"
          placeholder="e.g. Field 1"
          value={newField}
          onChange={(e) => setNewField(e.target.value)}
        />
        <button
          disabled={busy || !newField.trim()}
          onClick={async () => {
            try {
              await api.post(`/api/events/${data.event.id}/fields`, { name: newField.trim() });
              setNewField('');
              onChanged();
            } catch (error) {
              setStatus(error instanceof ApiFailure ? error.message : 'Could not add it.');
            }
          }}
        >
          Add field
        </button>
      </div>
    </section>
  );
}

function minutesBetween(start: string, end: string): number {
  const toMinutes = (t: string) => {
    const [h = '0', m = '0'] = t.split(':');
    return Number(h) * 60 + Number(m);
  };
  return toMinutes(end) - toMinutes(start);
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hours`;
  return `${h}h ${m}m`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
}
