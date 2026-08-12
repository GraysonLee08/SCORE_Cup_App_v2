import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import type { PublicDivision, PublicEventResponse } from '../types.js';
import StandingsTable from '../components/StandingsTable.js';
import FixtureList from '../components/FixtureList.js';
import Bracket from '../components/Bracket.js';
import AppHeader from '../components/AppHeader.js';
import type { SessionUser } from '../types.js';

type Tab = 'now' | 'standings' | 'schedule' | 'bracket';

const TEAM_KEY = 'scorescup.followed-team';

export default function Spectator({ user }: { user: SessionUser | null }) {
  const [event, setEvent] = useState<PublicEventResponse | null>(null);
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [division, setDivision] = useState<PublicDivision | null>(null);
  const [tab, setTab] = useState<Tab>('now');
  const [teamFilter, setTeamFilter] = useState<string>(
    () => localStorage.getItem(TEAM_KEY) ?? '',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<PublicEventResponse>('/api/public/event')
      .then((res) => {
        setEvent(res);
        setDivisionId((current) => current ?? res.divisions[0]?.id ?? null);
      })
      .catch(() => setError('Could not load the tournament.'));
  }, []);

  const loadDivision = useCallback(async () => {
    if (!divisionId) return;
    try {
      setDivision(await api.get<PublicDivision>(`/api/public/divisions/${divisionId}`));
      setError(null);
    } catch {
      setError('Could not refresh. Showing the last update.');
    }
  }, [divisionId]);

  useEffect(() => {
    void loadDivision();
  }, [loadDivision]);

  // Live-ish without a socket. A spectator standing in a field expects the
  // score to change without them doing anything.
  useEffect(() => {
    const timer = window.setInterval(() => void loadDivision(), 20_000);
    return () => window.clearInterval(timer);
  }, [loadDivision]);

  useEffect(() => {
    if (teamFilter) localStorage.setItem(TEAM_KEY, teamFilter);
    else localStorage.removeItem(TEAM_KEY);
  }, [teamFilter]);

  // A followed team should survive switching divisions only if it exists there.
  useEffect(() => {
    if (!division || !teamFilter) return;
    if (!division.teams.some((t) => t.id === teamFilter)) setTeamFilter('');
  }, [division, teamFilter]);

  const fixtures = useMemo(() => {
    if (!division) return [];
    if (!teamFilter) return division.fixtures;
    return division.fixtures.filter(
      (f) => f.homeTeamId === teamFilter || f.awayTeamId === teamFilter,
    );
  }, [division, teamFilter]);

  const live = fixtures.filter((f) => f.status === 'in_progress');
  const upcoming = fixtures.filter((f) => f.status === 'scheduled').slice(0, 6);
  const recent = fixtures
    .filter((f) => f.homeScore != null)
    .slice(-6)
    .reverse();

  const bracketFixtures = division?.fixtures.filter((f) => f.stageKind === 'bracket') ?? [];

  return (
    <div className="app">
      <AppHeader
        user={user}
        title={event?.event.name ?? 'SCORES Cup'}
        subtitle={event?.event.season ?? 'Live scores'}
      />

      <div className="content">
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        {event && event.divisions.length > 1 && (
          <div className="field">
            <label htmlFor="division">Tournament</label>
            <select
              id="division"
              value={divisionId ?? ''}
              onChange={(e) => setDivisionId(e.target.value)}
            >
              {event.divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {division && (
          <div className="field">
            <label htmlFor="team">Follow a team</label>
            <select
              id="team"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              <option value="">All teams</option>
              {division.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {event?.announcements?.length ? (
          <div className="notice ok">
            <strong>{event.announcements[0]!.title}</strong>
            <div>{event.announcements[0]!.message}</div>
          </div>
        ) : null}

        <nav className="tabs" aria-label="Sections">
          {(
            [
              ['now', 'Now'],
              ['standings', 'Standings'],
              ['schedule', 'Schedule'],
              ['bracket', 'Bracket'],
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

        {!division && <p className="muted center">Loading…</p>}

        {division && tab === 'now' && (
          <>
            {live.length > 0 && (
              <>
                <h2>In play</h2>
                <FixtureList fixtures={live} showField />
              </>
            )}

            <h2>Next up</h2>
            {upcoming.length === 0 ? (
              <p className="muted">No games scheduled.</p>
            ) : (
              <FixtureList fixtures={upcoming} showField />
            )}

            {recent.length > 0 && (
              <>
                <h2>Latest results</h2>
                <FixtureList fixtures={recent} showField />
              </>
            )}
          </>
        )}

        {division && tab === 'standings' && (
          <>
            {division.pools.length === 0 && <p className="muted">Standings not available yet.</p>}
            {division.pools.map((pool) => (
              <StandingsTable key={pool.poolId} pool={pool} highlightTeamId={teamFilter} />
            ))}
          </>
        )}

        {division && tab === 'schedule' && (
          <FixtureList fixtures={fixtures} showField groupByTime />
        )}

        {division && tab === 'bracket' && <Bracket fixtures={bracketFixtures} />}
      </div>

      <footer className="content muted center" style={{ paddingTop: 0 }}>
        Scores update automatically. America SCORES Chicago.
      </footer>
    </div>
  );
}
