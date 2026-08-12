import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import type { AdminEvent } from '../../types.js';

interface Announcement {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  divisionId: string | null;
  teamId: string | null;
  teamName: string | null;
}

/**
 * Messages. Scope narrows from everyone, to one tournament, to one team --
 * a team-scoped message reaches that roster's participant view without
 * appearing on the public page.
 */
export default function AnnouncementsPanel({ data }: { data: AdminEvent }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [form, setForm] = useState({ title: '', message: '', scope: '' });

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
                {d.name} — everyone in this tournament
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
            });
            setForm({ title: '', message: '', scope: '' });
            await load();
          }}
        >
          Post
        </button>
      </section>

      <section className="card">
        <h2>Posted</h2>
        {items.length === 0 && <p className="muted">Nothing posted yet.</p>}
        <ul className="cards-list">
          {items.map((a) => (
            <li key={a.id} style={{ display: 'block' }}>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline' }}>
                <strong style={{ flex: 1 }}>{a.title}</strong>
                <span className="pill">
                  {a.teamName ?? (a.divisionId ? 'One tournament' : 'Everyone')}
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
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
