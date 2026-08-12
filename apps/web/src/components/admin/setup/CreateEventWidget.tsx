import { useState } from 'react';
import { api, ApiFailure } from '../../../api.js';

/** First run: no tournament exists yet. */
export default function CreateEventWidget({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    name: 'SCORES Cup',
    location: '',
    eventDate: '2026-08-29',
    startTime: '09:00',
    endTime: '17:00',
    minRestMinutes: 5,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="widget">
      <section className="card" style={{ maxWidth: '40rem' }}>
        <h2>Create the tournament</h2>
        <p className="hint">You can change any of this later.</p>
        {error && <div className="notice error">{error}</div>}

        <div className="field">
          <label htmlFor="ce-name">Tournament name</label>
          <input
            id="ce-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>

        <div className="field">
          <label htmlFor="ce-location">Location</label>
          <input
            id="ce-location"
            value={form.location}
            placeholder="Fire Pitch, 3626 N Talman Ave, Chicago, IL 60618"
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
        </div>

        <div className="grid-3">
          <div className="field">
            <label htmlFor="ce-date">Date</label>
            <input
              id="ce-date"
              type="date"
              value={form.eventDate}
              onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="ce-start">First kickoff</label>
            <input
              id="ce-start"
              type="time"
              value={form.startTime}
              onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="ce-end">Hard stop</label>
            <input
              id="ce-end"
              type="time"
              value={form.endTime}
              onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
            />
          </div>
        </div>

        <div className="field" style={{ maxWidth: '16rem' }}>
          <label htmlFor="ce-rest">Rest between games (min)</label>
          <input
            id="ce-rest"
            type="number"
            min={0}
            value={form.minRestMinutes}
            onChange={(e) => setForm((f) => ({ ...f, minRestMinutes: Number(e.target.value) }))}
          />
        </div>

        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.post('/api/events', {
                ...form,
                location: form.location || undefined,
              });
              onCreated();
            } catch (err) {
              setError(err instanceof ApiFailure ? err.message : 'Could not create it.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Creating…' : 'Create'}
        </button>
      </section>
    </div>
  );
}
