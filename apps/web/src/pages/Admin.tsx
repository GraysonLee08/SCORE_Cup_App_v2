import { useCallback, useEffect, useState } from 'react';
import { api, ApiFailure } from '../api.js';
import type { AdminEvent, SessionUser } from '../types.js';
import AppHeader from '../components/AppHeader.js';
import SetupPanel from '../components/admin/SetupPanel.js';
import ResultsPanel from '../components/admin/ResultsPanel.js';
import ScheduleGrid from '../components/admin/ScheduleGrid.js';
import TeamsPanel from '../components/admin/TeamsPanel.js';
import PeoplePanel from '../components/admin/PeoplePanel.js';
import AnnouncementsPanel from '../components/admin/AnnouncementsPanel.js';
import AuditPanel from '../components/admin/AuditPanel.js';

type Tab = 'setup' | 'teams' | 'people' | 'schedule' | 'results' | 'messages' | 'audit';

const SECTIONS: { key: Tab; label: string; group: string; blurb: string }[] = [
  {
    key: 'setup',
    label: 'Tournament setup',
    group: 'Before the day',
    blurb: 'The date, venue, timings and the shape of each tournament.',
  },
  {
    key: 'teams',
    label: 'Teams & rosters',
    group: 'Before the day',
    blurb: 'Add or remove teams, share join codes, and manage who is on each roster.',
  },
  {
    key: 'people',
    label: 'User management',
    group: 'Before the day',
    blurb: 'Referees, coaches and players — accounts, field assignments and passwords.',
  },
  {
    key: 'schedule',
    label: 'Schedule grid',
    group: 'On the day',
    blurb: 'Every game by field and kickoff. Move anything; clashes are flagged as you go.',
  },
  {
    key: 'results',
    label: 'Results & standings',
    group: 'On the day',
    blurb: 'Correct any score or card, and see the effect on the table before you save.',
  },
  {
    key: 'messages',
    label: 'Messages',
    group: 'On the day',
    blurb: 'Post to everyone, one tournament, or a single team.',
  },
  {
    key: 'audit',
    label: 'History',
    group: 'On the day',
    blurb: 'Who changed what, and when.',
  },
];

export default function Admin({
  user,
  onSignOut,
}: {
  user: SessionUser;
  onSignOut: () => void;
}) {
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [data, setData] = useState<AdminEvent | null>(null);
  const [tab, setTab] = useState<Tab>('setup');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ events: { id: string; name: string }[] }>('/api/events')
      .then((res) => {
        setEvents(res.events);
        setEventId((current) => current ?? res.events[0]?.id ?? null);
      })
      .catch(() => setError('Could not load events.'));
  }, []);

  const reload = useCallback(async () => {
    if (!eventId) return;
    try {
      setData(await api.get<AdminEvent>(`/api/admin/events/${eventId}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : 'Could not load the event.');
    }
  }, [eventId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const section = SECTIONS.find((s) => s.key === tab)!;
  const groups = [...new Set(SECTIONS.map((s) => s.group))];

  return (
    <div className="app admin admin-shell">
      <AppHeader user={user} title="Admin" subtitle={user.displayName} onSignOut={onSignOut} />

      <div className="admin-body">
        <nav className="admin-nav" aria-label="Admin sections">
          {groups.map((group) => (
            <div key={group}>
              <div className="nav-group">{group}</div>
              {SECTIONS.filter((s) => s.group === group).map((s) => (
                <button
                  key={s.key}
                  className={tab === s.key ? 'active' : ''}
                  onClick={() => setTab(s.key)}
                  aria-current={tab === s.key ? 'page' : undefined}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <main className="admin-main">
          <header>
            <h1>{section.label}</h1>
            <p>{section.blurb}</p>
          </header>

          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}

          {events.length > 1 && (
            <div className="field" style={{ maxWidth: '20rem' }}>
              <label htmlFor="event">Event</label>
              <select id="event" value={eventId ?? ''} onChange={(e) => setEventId(e.target.value)}>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!data && !error && events.length > 0 && <p className="muted">Loading…</p>}

          {tab === 'setup' && <SetupPanel data={data} onChanged={reload} />}
          {data && tab === 'teams' && <TeamsPanel data={data} onChanged={reload} />}
          {data && tab === 'schedule' && <ScheduleGrid data={data} />}
          {data && tab === 'results' && <ResultsPanel data={data} />}
          {data && tab === 'people' && <PeoplePanel data={data} />}
          {data && tab === 'messages' && <AnnouncementsPanel data={data} />}
          {tab === 'audit' && <AuditPanel />}
        </main>
      </div>
    </div>
  );
}
