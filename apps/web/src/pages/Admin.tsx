import { useCallback, useEffect, useState } from 'react';
import { api, ApiFailure } from '../api.js';
import type { AdminEvent, SessionUser } from '../types.js';
import AppHeader from '../components/AppHeader.js';
import DayWidget from '../components/admin/setup/DayWidget.js';
import TournamentsWidget from '../components/admin/setup/TournamentsWidget.js';
import PoolsWidget from '../components/admin/setup/PoolsWidget.js';
import GenerateWidget from '../components/admin/setup/GenerateWidget.js';
import CreateEventWidget from '../components/admin/setup/CreateEventWidget.js';
import ResultsPanel from '../components/admin/ResultsPanel.js';
import ScheduleGrid from '../components/admin/ScheduleGrid.js';
import TeamsPanel from '../components/admin/TeamsPanel.js';
import PeoplePanel from '../components/admin/PeoplePanel.js';
import AnnouncementsPanel from '../components/admin/AnnouncementsPanel.js';
import AuditPanel from '../components/admin/AuditPanel.js';

interface NavItem {
  key: string;
  label: string;
  blurb: string;
  children?: NavItem[];
}

/**
 * One widget per nav entry. Nothing is stacked, so each screen can be
 * generous without turning into a long scroll.
 */
const NAV: NavItem[] = [
  {
    key: 'setup',
    label: 'Tournament setup',
    blurb: 'Define the day and the tournaments running on it.',
    children: [
      { key: 'setup.day', label: 'The day', blurb: 'Date, venue, timings and fields — shared by every tournament.' },
      { key: 'setup.tournaments', label: 'Tournaments', blurb: 'The competitions running on the day, and the fields each uses.' },
      { key: 'setup.pools', label: 'Pools', blurb: 'How teams are grouped for pool play.' },
      { key: 'setup.generate', label: 'Generate schedule', blurb: 'Check the day fits, then build the fixtures.' },
    ],
  },
  { key: 'teams', label: 'Teams & rosters', blurb: 'Teams, join codes, and who is on each roster.' },
  { key: 'people', label: 'User management', blurb: 'Referees, coaches and players — accounts and passwords.' },
  { key: 'schedule', label: 'Schedule grid', blurb: 'Every game by field and kickoff. Move anything; clashes are flagged as you go.' },
  { key: 'results', label: 'Results & standings', blurb: 'Correct any score or card, and see the effect before you save.' },
  { key: 'messages', label: 'Messages', blurb: 'Post to everyone, one tournament, or a single team.' },
  { key: 'audit', label: 'History', blurb: 'Who changed what, and when.' },
];

function findItem(key: string): NavItem | undefined {
  for (const item of NAV) {
    if (item.key === key) return item;
    const child = item.children?.find((c) => c.key === key);
    if (child) return child;
  }
  return undefined;
}

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
  const [active, setActive] = useState('setup.day');
  const [expanded, setExpanded] = useState<string[]>(['setup']);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      const res = await api.get<{ events: { id: string; name: string }[] }>('/api/events');
      setEvents(res.events);
      setEventId((current) => current ?? res.events[0]?.id ?? null);
    } catch {
      setError('Could not load events.');
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

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

  const section = findItem(active);

  return (
    <div className="app admin admin-shell">
      <AppHeader user={user} title="Admin" subtitle={user.displayName} onSignOut={onSignOut} />

      <div className="admin-body">
        <nav className="admin-nav" aria-label="Admin sections">
          {NAV.map((item) => {
            if (!item.children) {
              return (
                <button
                  key={item.key}
                  className={`nav-parent ${active === item.key ? 'active' : ''}`}
                  onClick={() => setActive(item.key)}
                  aria-current={active === item.key ? 'page' : undefined}
                >
                  {item.label}
                </button>
              );
            }

            const isOpen = expanded.includes(item.key);
            return (
              <div key={item.key}>
                <button
                  className={`nav-parent ${isOpen ? 'open' : ''}`}
                  aria-expanded={isOpen}
                  onClick={() => {
                    setExpanded((e) =>
                      e.includes(item.key) ? e.filter((k) => k !== item.key) : [...e, item.key],
                    );
                    // Opening a group lands on its first screen, so a click
                    // always shows something.
                    if (!isOpen && item.children?.[0]) setActive(item.children[0].key);
                  }}
                >
                  <span className="caret">▶</span>
                  {item.label}
                </button>

                {isOpen && (
                  <div className="nav-children">
                    {item.children.map((child) => (
                      <button
                        key={child.key}
                        className={active === child.key ? 'active' : ''}
                        onClick={() => setActive(child.key)}
                        aria-current={active === child.key ? 'page' : undefined}
                      >
                        {child.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <main className="admin-main">
          <header>
            <h1>{section?.label ?? 'Admin'}</h1>
            <p>{section?.blurb}</p>
          </header>

          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}

          {events.length > 1 && (
            <div className="field" style={{ maxWidth: '22rem' }}>
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

          {events.length === 0 && !error && (
            <CreateEventWidget
              onCreated={async () => {
                await loadEvents();
                await reload();
              }}
            />
          )}

          {!data && events.length > 0 && !error && <p className="muted">Loading…</p>}

          {data && (
            <>
              {active === 'setup.day' && <DayWidget data={data} onChanged={reload} />}
              {active === 'setup.tournaments' && (
                <TournamentsWidget data={data} onChanged={reload} />
              )}
              {active === 'setup.pools' && <PoolsWidget data={data} onChanged={reload} />}
              {active === 'setup.generate' && <GenerateWidget data={data} onChanged={reload} />}
              {active === 'teams' && <TeamsPanel data={data} onChanged={reload} />}
              {active === 'people' && <PeoplePanel data={data} />}
              {active === 'schedule' && <ScheduleGrid data={data} />}
              {active === 'results' && <ResultsPanel data={data} />}
              {active === 'messages' && <AnnouncementsPanel data={data} />}
            </>
          )}

          {active === 'audit' && <AuditPanel />}
        </main>
      </div>
    </div>
  );
}
