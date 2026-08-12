import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import type { PublicDivision, PublicEventResponse, PublicFixture, SessionUser } from '../types.js';
import StandingsTable from '../components/StandingsTable.js';
import FixtureList from '../components/FixtureList.js';
import Bracket from '../components/Bracket.js';
import AppHeader from '../components/AppHeader.js';
import Spotlight from '../components/spectator/Spotlight.js';
import FieldBoard from '../components/spectator/FieldBoard.js';
import Pulse from '../components/spectator/Pulse.js';
import { useNow } from '../components/spectator/clock.js';

type Tab = 'now' | 'schedule' | 'bracket';

const TEAM_KEY = 'scorescup.followed-team';

/**
 * The spectator board.
 *
 * Laid out as a dashboard rather than a column, because the audience splits in
 * two: someone at the venue on a phone, and someone following from elsewhere
 * on a laptop -- or a screen at the venue itself. The same widgets serve all
 * three; only how many fit side by side changes.
 *
 * The pitch board and the spotlight span the whole venue, not the selected
 * division, because the four fields at Fire Pitch do not care which tournament
 * a game belongs to and neither does anyone watching.
 */
export default function Spectator({ user }: { user: SessionUser | null }) {
  const [event, setEvent] = useState<PublicEventResponse | null>(null);
  const [divisions, setDivisions] = useState<Record<string, PublicDivision>>({});
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('now');
  const [pickedFixtureId, setPickedFixtureId] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>(
    () => localStorage.getItem(TEAM_KEY) ?? '',
  );
  const [error, setError] = useState<string | null>(null);

  const now = useNow();

  useEffect(() => {
    api
      .get<PublicEventResponse>('/api/public/event')
      .then((res) => {
        setEvent(res);
        setDivisionId((current) => current ?? res.divisions[0]?.id ?? null);
      })
      .catch(() => setError('Could not load the tournament.'));
  }, []);

  const loadAll = useCallback(async () => {
    if (!event) return;
    try {
      const loaded = await Promise.all(
        event.divisions.map((d) => api.get<PublicDivision>(`/api/public/divisions/${d.id}`)),
      );
      setDivisions(Object.fromEntries(loaded.map((d) => [d.id, d])));
      setError(null);
    } catch {
      setError('Could not refresh. Showing the last update.');
    }
  }, [event]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Live-ish without a socket. A spectator standing at a field expects the
  // score to change without them doing anything.
  useEffect(() => {
    const timer = window.setInterval(() => void loadAll(), 20_000);
    return () => window.clearInterval(timer);
  }, [loadAll]);

  useEffect(() => {
    if (teamFilter) localStorage.setItem(TEAM_KEY, teamFilter);
    else localStorage.removeItem(TEAM_KEY);
  }, [teamFilter]);

  const division = divisionId ? (divisions[divisionId] ?? null) : null;

  // A followed team should survive switching divisions only if it exists there.
  useEffect(() => {
    if (!division || !teamFilter) return;
    if (!division.teams.some((t) => t.id === teamFilter)) setTeamFilter('');
  }, [division, teamFilter]);

  /** Every game at the venue, whichever tournament it belongs to. */
  const allFixtures = useMemo(
    () => Object.values(divisions).flatMap((d) => d.fixtures),
    [divisions],
  );

  const fixtures = useMemo(() => {
    if (!division) return [];
    if (!teamFilter) return division.fixtures;
    return division.fixtures.filter(
      (f) => f.homeTeamId === teamFilter || f.awayTeamId === teamFilter,
    );
  }, [division, teamFilter]);

  // What the big panel shows: whatever was picked, else a live game, else the
  // next one due. A followed team takes priority -- that is why you followed.
  const spotlight = useMemo<PublicFixture | null>(() => {
    const picked = allFixtures.find((f) => f.id === pickedFixtureId);
    if (picked) return picked;

    const preferred = teamFilter
      ? allFixtures.filter((f) => f.homeTeamId === teamFilter || f.awayTeamId === teamFilter)
      : allFixtures;

    const pool = preferred.length > 0 ? preferred : allFixtures;
    return (
      pool.find((f) => f.status === 'in_progress') ??
      pool.find((f) => f.status === 'scheduled') ??
      [...pool].reverse().find((f) => f.homeScore != null) ??
      null
    );
  }, [allFixtures, pickedFixtureId, teamFilter]);

  const liveNow = allFixtures.filter((f) => f.status === 'in_progress');
  const upcoming = fixtures.filter((f) => f.status === 'scheduled').slice(0, 6);
  const recent = fixtures.filter((f) => f.homeScore != null).slice(-6).reverse();
  const bracketFixtures = division?.fixtures.filter((f) => f.stageKind === 'bracket') ?? [];

  const loading = event !== null && Object.keys(divisions).length === 0;

  return (
    <div className="app spectator">
      <div className="glow" aria-hidden="true" />

      <AppHeader
        user={user}
        title={event?.event.name ?? 'SCORES Cup'}
        subtitle={event?.event.location ?? event?.event.season ?? 'Live scores'}
      />

      <div className="board">
        {error && (
          <div className="notice error board-full" role="alert">
            {error}
          </div>
        )}

        {event?.announcements?.length ? (
          <div className="glass announce board-full" role="status">
            <span className="tag accent">Notice</span>
            <strong>{event.announcements[0]!.title}</strong>
            <span className="soft">{event.announcements[0]!.message}</span>
          </div>
        ) : null}

        {/* ---- left rail: the venue at a glance ---- */}
        <div className="rail left">
          <FieldBoard
            fixtures={allFixtures}
            now={now}
            selectedId={spotlight?.id ?? null}
            onPick={setPickedFixtureId}
          />
          {division && <Pulse fixtures={allFixtures} pools={division.pools} />}
        </div>

        {/* ---- centre: the featured match, then the detail ---- */}
        <div className="rail centre">
          <Spotlight
            fixture={spotlight}
            now={now}
            onPick={setPickedFixtureId}
            siblings={liveNow.length > 1 ? liveNow : []}
          />

          <div className="glass">
            <nav className="segmented" aria-label="Sections">
              {(
                [
                  ['now', 'Now'],
                  ['schedule', 'Full schedule'],
                  ['bracket', 'Bracket'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={tab === key ? 'seg active' : 'seg'}
                  onClick={() => setTab(key)}
                  aria-current={tab === key ? 'page' : undefined}
                >
                  {label}
                </button>
              ))}
            </nav>

            {loading && <p className="soft center">Loading…</p>}

            {division && tab === 'now' && (
              <>
                <h3>Next up</h3>
                {upcoming.length === 0 ? (
                  <p className="soft">No games left to play.</p>
                ) : (
                  <FixtureList fixtures={upcoming} showField />
                )}

                {recent.length > 0 && (
                  <>
                    <h3>Latest results</h3>
                    <FixtureList fixtures={recent} showField />
                  </>
                )}
              </>
            )}

            {division && tab === 'schedule' && (
              <FixtureList fixtures={fixtures} showField groupByTime />
            )}

            {division && tab === 'bracket' && <Bracket fixtures={bracketFixtures} />}
          </div>
        </div>

        {/* ---- right rail: the tables and the controls ---- */}
        <div className="rail right">
          <section className="glass filters">
            <h2>Following</h2>

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
                <label htmlFor="team">Team</label>
                <select
                  id="team"
                  value={teamFilter}
                  onChange={(e) => {
                    setTeamFilter(e.target.value);
                    setPickedFixtureId(null);
                  }}
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

            <p className="soft tiny">
              Your choice is remembered on this device. No account needed.
            </p>
          </section>

          {division?.pools.map((pool) => (
            <div className="glass table-panel" key={pool.poolId}>
              <StandingsTable pool={pool} highlightTeamId={teamFilter} />
            </div>
          ))}
        </div>
      </div>

      <footer className="board-footer soft">
        Scores update automatically · America SCORES Chicago
        {event?.event.location ? ` · ${event.event.location}` : ''}
      </footer>
    </div>
  );
}
