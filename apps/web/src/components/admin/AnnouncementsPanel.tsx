import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import type { AdminEvent } from '../../types.js';

interface Announcement {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  publishAt: string | null;
  divisionId: string | null;
  teamId: string | null;
  teamName: string | null;
}

/**
 * When a scheduled message goes out, said the way it would be said aloud.
 *
 * A time alone is ambiguous the day before the tournament: "1:30 PM" could be
 * today or Saturday, and the difference is the whole point of scheduling it.
 */
function whenLabel(iso: string): string {
  const at = new Date(iso);
  const today = new Date();
  const sameDay =
    at.getFullYear() === today.getFullYear() &&
    at.getMonth() === today.getMonth() &&
    at.getDate() === today.getDate();

  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? time : `${at.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

/**
 * Messages. Scope narrows from everyone, to one division, to one team --
 * a team-scoped message reaches that roster's participant view without
 * appearing on the public page.
 *
 * A message can also carry a time, and then it is written now and revealed
 * then. Nothing runs in the background to make that happen: the board and the
 * team pages re-read on a timer and simply do not select a message whose time
 * has not come, so it appears within one poll of it.
 */
export default function AnnouncementsPanel({ data }: { data: AdminEvent }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [form, setForm] = useState({ title: '', message: '', scope: '', when: '' });

  const load = useCallback(async () => {
    const res = await api.get<{ announcements: Announcement[] }>(
      `/api/admin/events/${data.event.id}/announcements`,
    );
    setItems(res.announcements);
  }, [data.event.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const allTeams = data.divisions.flatMap((d) =>
    d.teams.map((t) => ({ ...t, divisionName: d.name })),
  );

  return (
    <>
      <section className="card stack">
        <h2>Post a message</h2>

        <div className="field">
          <label htmlFor="a-scope">Who sees it</label>
          <select
            id="a-scope"
            value={form.scope}
            onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
          >
            <option value="">Everyone (shows on the public page)</option>
            {data.divisions.map((d) => (
              <option key={d.id} value={`division:${d.id}`}>
                {d.name} — everyone in this division
              </option>
            ))}
            {allTeams.map((t) => (
              <option key={t.id} value={`team:${t.id}`}>
                {t.name} ({t.divisionName}) — this team only
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="a-title">Title</label>
          <input
            id="a-title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Field 2 running 10 minutes late"
          />
        </div>

        <div className="field">
          <label htmlFor="a-message">Message</label>
          <textarea
            id="a-message"
            rows={3}
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          />
        </div>

        <div className="field">
          <label htmlFor="a-when">When</label>
          <input
            id="a-when"
            type="datetime-local"
            value={form.when}
            onChange={(e) => setForm((f) => ({ ...f, when: e.target.value }))}
          />
          {/* The consequence, not the input -- the same principle the timing
              screen uses. Somebody typing a time here needs to know whether
              they have just queued something or published it. */}
          <p className="hint">
            {form.when === ''
              ? 'Leave empty to post now.'
              : new Date(form.when).getTime() <= Date.now()
                ? 'That time has passed, so this posts immediately.'
                : `Hidden until ${whenLabel(new Date(form.when).toISOString())}, then it appears on its own.`}
          </p>
        </div>

        <button
          className="primary"
          disabled={!form.title.trim() || !form.message.trim()}
          onClick={async () => {
            const [kind, id] = form.scope.split(':');
            await api.post(`/api/admin/events/${data.event.id}/announcements`, {
              title: form.title.trim(),
              message: form.message.trim(),
              divisionId: kind === 'division' ? id : null,
              teamId: kind === 'team' ? id : null,
              // The field is wall-clock with no zone; read in this browser's
              // timezone, which is the venue's, and sent as an instant so the
              // server is never guessing which 1:30 was meant.
              publishAt: form.when ? new Date(form.when).toISOString() : null,
            });
            setForm({ title: '', message: '', scope: '', when: '' });
            await load();
          }}
        >
          {form.when && new Date(form.when).getTime() > Date.now() ? 'Schedule' : 'Post'}
        </button>
      </section>

      <section className="card">
        <h2>Posted</h2>
        {items.length === 0 && <p className="muted">Nothing posted yet.</p>}
        <ul className="cards-list">
          {items.map((a) => {
            // Not yet visible to anyone. This is the one state on the screen
            // that can be silently wrong -- a message everybody assumes went
            // out -- so it is marked rather than left to be inferred from a
            // date sitting beside eleven others.
            const queued = Boolean(a.publishAt && new Date(a.publishAt).getTime() > Date.now());

            return (
            <li key={a.id} style={{ display: 'block' }}>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline' }}>
                <strong style={{ flex: 1 }}>{a.title}</strong>
                {queued && <span className="pill">Scheduled {whenLabel(a.publishAt!)}</span>}
                <span className="pill">
                  {a.teamName ?? (a.divisionId ? 'One division' : 'Everyone')}
                </span>
                <button
                  className="ghost danger"
                  style={{ minHeight: '2rem', padding: '0 .55rem' }}
                  onClick={async () => {
                    await api.delete(`/api/admin/announcements/${a.id}`);
                    await load();
                  }}
                >
                  Delete
                </button>
              </div>
              <div className="muted">{a.message}</div>
              {queued && (
                <div className="hint">
                  Nobody can see this yet. Deleting it before its time cancels it.
                </div>
              )}
            </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
