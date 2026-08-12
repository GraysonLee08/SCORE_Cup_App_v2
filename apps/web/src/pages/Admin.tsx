import { useCallback, useEffect, useState } from 'react';
import { api, ApiFailure } from '../api.js';
import type { AdminEvent, SessionUser } from '../types.js';
import SetupPanel from '../components/admin/SetupPanel.js';
import ResultsPanel from '../components/admin/ResultsPanel.js';
import TeamsPanel from '../components/admin/TeamsPanel.js';
import PeoplePanel from '../components/admin/PeoplePanel.js';
import AnnouncementsPanel from '../components/admin/AnnouncementsPanel.js';
import AuditPanel from '../components/admin/AuditPanel.js';
import AppHeader from '../components/AppHeader.js';

type Tab = 'setup' | 'results' | 'teams' | 'people' | 'messages' | 'audit';

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

  return (
    <div className="app admin">
      <AppHeader user={user} title="Admin" subtitle={user.displayName} onSignOut={onSignOut} />

      <div className="content">
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        {events.length > 1 && (
          <div className="field">
            <label htmlFor="event">Event</label>
            <select
              id="event"
              value={eventId ?? ''}
              onChange={(e) => setEventId(e.target.value)}
            >
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav className="tabs" aria-label="Admin sections">
          {(
            [
              ['setup', 'Setup'],
              ['results', 'Results'],
              ['teams', 'Teams'],
              ['people', 'Refs & users'],
              ['messages', 'Messages'],
              ['audit', 'History'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? 'tab active' : 'tab'}
              onClick={() => setTab(key)}
              aria-current={tab === key ? 'page' : undefined}
            >
              {label}
            </button>
          ))}
        </nav>

        {!data && !error && <p className="muted center">Loading…</p>}

        {data && tab === 'setup' && <SetupPanel data={data} onChanged={reload} />}
        {data && tab === 'results' && <ResultsPanel data={data} />}
        {data && tab === 'teams' && <TeamsPanel data={data} onChanged={reload} />}
        {data && tab === 'people' && <PeoplePanel data={data} />}
        {data && tab === 'messages' && <AnnouncementsPanel data={data} />}
        {data && tab === 'audit' && <AuditPanel />}

        {!data && !error && events.length === 0 && (
          <SetupPanel data={null} onChanged={reload} />
        )}
      </div>
    </div>
  );
}
