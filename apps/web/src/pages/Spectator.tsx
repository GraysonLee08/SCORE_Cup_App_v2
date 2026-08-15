import { useCallback, useEffect, useMemo, useState } from 'react';
import { getRevalidated } from '../api.js';
import type { PublicDivision, PublicEventResponse, PublicFixture, SessionUser } from '../types.js';
import StandingsTable, { sharedCardRule } from '../components/StandingsTable.js';
import FixtureList from '../components/FixtureList.js';
import Bracket from '../components/Bracket.js';
import AppHeader from '../components/AppHeader.js';
import Spotlight from '../components/spectator/Spotlight.js';
import Countdown from '../components/spectator/Countdown.js';
import FieldBoard from '../components/spectator/FieldBoard.js';
import Pulse from '../components/spectator/Pulse.js';
import SunToggle from '../components/spectator/SunToggle.js';
import { initialSunMode, SUN_KEY } from '../components/spectator/sunMode.js';
import { useNow } from '../components/spectator/clock.js';
import { usePoll } from '../components/spectator/usePoll.js';
import { eventDateLabel, eventDay, timeOfDayLabel } from '../components/spectator/eventDay.js';

type Tab = 'next' | 'completed' | 'playoffs';

const TEAM_KEY = 'scorescup.followed-team';

const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** The parts are joined with a separator, so only the first one is capitalised. */
const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

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
  const [tab, setTab] = useState<Tab>('next');
  const [pickedFixtureId, setPickedFixtureId] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>(
    () => localStorage.getItem(TEAM_KEY) ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [sunMode, setSunMode] = useState<boolean>(initialSunMode);
  /** Consecutive failed refreshes, used to back the poll off. */
  const [failures, setFailures] = useState(0);

  const now = useNow();

  /**
   * Written on the tap rather than in an effect: an effect would persist the
   * device's own contrast preference as though the visitor had chosen it, and
   * from then on the board would stop following that setting.
   */
  const chooseSunMode = useCallback((on: boolean) => {
    setSunMode(on);
    try {
      localStorage.setItem(SUN_KEY, on ? '1' : '0');
    } catch {
      // Storage can fail in private mode; the choice still holds for this visit.
    }
  }, []);

  /**
   * One pass over the whole tournament: the event, then every division in it.
   *
   * The event is re-read on each pass rather than once at mount, so a division
   * added or removed during the day appears without anyone reloading. And the
   * divisions settle independently -- one of them failing must not blank a
   * board that is being watched, so whatever did load is kept and the error
   * only shows if nothing did.
   */
  const loadAll = useCallback(async () => {
    let current: PublicEventResponse;
    let eventChanged: boolean;
    try {
      const res = await getRevalidated<PublicEventResponse>('/api/public/event');
      current = res.data;
      eventChanged = res.changed;
    } catch {
      setError('Could not refresh. Showing the last update.');
      setFailures((n) => n + 1);
      return;
    }

    // Only touch state when the server says something moved. An unchanged
    // tournament should cost nothing beyond the question.
    if (eventChanged) {
      setEvent(current);
      setDivisionId((existing) =>
        existing && current.divisions.some((d) => d.id === existing)
          ? existing
          : (current.divisions[0]?.id ?? null),
      );
    }

    const settled = await Promise.allSettled(
      current.divisions.map((d) =>
        getRevalidated<PublicDivision>(`/api/public/divisions/${d.id}`),
      ),
    );
    const loaded = settled
      .filter(
        (r): r is PromiseFulfilledResult<{ data: PublicDivision; changed: boolean }> =>
          r.status === 'fulfilled',
      )
      .map((r) => r.value);

    // A 304 still hands back the previous body, so when any division moved the
    // whole map can be rewritten from `loaded` without re-fetching the rest.
    if (loaded.length > 0 && loaded.some((r) => r.changed)) {
      setDivisions(Object.fromEntries(loaded.map((r) => [r.data.id, r.data])));
    }

    const complete = loaded.length === current.divisions.length;
    setError(complete ? null : 'Could not refresh everything. Showing the last update.');
    setFailures((n) => (complete ? 0 : n + 1));
  }, []);

  useEffect(() => {
    void loadAll();
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

  /**
   * Which division each game belongs to.
   *
   * The spotlight and the pitch board span the whole venue; the tables, tabs
   * and bracket show one division. Without this, tapping a Community game
   * while Competitive is selected features a fixture that appears in none of
   * the tables underneath it, and nothing on screen explains why.
   *
   * Null with a single division, where naming it on every row is just noise.
   */
  const divisionOf = useMemo(() => {
    const all = Object.values(divisions);
    if (all.length < 2) return null;
    return new Map(all.flatMap((d) => d.fixtures.map((f) => [f.id, d.name] as const)));
  }, [divisions]);

  /**
   * The shape of the day, read off the schedule rather than written down in a
   * sentence somebody has to remember to update. It is the only place the page
   * says that there are two tournaments here and that they run one after the
   * other.
   */
  const dayShape = useMemo(() => {
    const starts = Object.values(divisions)
      .map((d) => {
        const first = d.fixtures
          .map((f) => f.kickoffAt)
          .filter((t): t is string => Boolean(t))
          .sort()[0];
        return first ? `${d.name} from ${clockTime(first)}` : null;
      })
      .filter((p): p is string => Boolean(p));

    if (Object.values(divisions).some((d) => d.fixtures.some((f) => f.stageKind === 'bracket'))) {
      starts.push('pool games first, then playoffs');
    }
    return starts;
  }, [divisions]);

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

  // Two halves of one list, so between them they hold every game -- there is
  // no longer a separate full schedule to fall back on. Split on whether a
  // score exists rather than on status, so a game that has kicked off but has
  // no result yet sits under "Up next" instead of between the two.
  const upcoming = fixtures.filter((f) => f.homeScore == null);
  const completed = [...fixtures].reverse().filter((f) => f.homeScore != null);
  const bracketFixtures = division?.fixtures.filter((f) => f.stageKind === 'bracket') ?? [];

  const loading = event !== null && Object.keys(divisions).length === 0;

  /**
   * Before the day, on it, or after it.
   *
   * Everything below reads from this rather than assuming the tournament is
   * happening now. The board is shared with teams weeks ahead, so "now" is the
   * exception rather than the rule for most of the page's life.
   */
  const { tense, daysAway } = eventDay(event?.event.eventDate, now);

  /**
   * How often to ask, given what is actually happening.
   *
   * Twenty seconds is the cadence a running match needs. It is not the cadence
   * a schedule three weeks out needs, and the board spends far more of its life
   * in the second state than the first: the link goes to teams weeks ahead and
   * gets left open. Failures back the interval off rather than hammering a
   * server that is already having a bad time.
   */
  const base = liveNow.length > 0 ? 20_000 : tense === 'today' ? 60_000 : 300_000;
  usePoll(loadAll, base * Math.min(2 ** failures, 4));

  // The date is what a visitor needs before the day and the venue is what they
  // need on it, so lead with the date and keep the venue beside it. Season was
  // the old fallback and reads as a bare "2026" whenever no venue is set.
  const dateLabel = eventDateLabel(event?.event.eventDate);

  // The published window, not a derived one: these are the hours teams were
  // told, and they hold whether or not a schedule has been generated yet.
  const dayWindow = [timeOfDayLabel(event?.event.startTime), timeOfDayLabel(event?.event.endTime)]
    .filter(Boolean)
    .join(' – ');

  const subtitle =
    [dateLabel, event?.event.location].filter(Boolean).join(' · ') ||
    event?.event.season ||
    'Live scores';

  return (
    <div className={sunMode ? 'app spectator sun' : 'app spectator'}>
      <a className="skip-link" href="#board">
        Skip to the scores
      </a>

      <div className="glow" aria-hidden="true" />

      <AppHeader
        user={user}
        title={event?.event.name ?? 'SCORES Cup'}
        subtitle={subtitle}
        extra={<SunToggle on={sunMode} onChange={chooseSunMode} />}
        titleIsHeading
      />

      {/* The board *is* the main landmark rather than sitting inside one: at
          1280 it is a flex child of the shell with its own height, so an extra
          wrapper would take that sizing and leave the grid with none. */}
      <main className="board" id="board">
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
            tense={tense}
            selectedId={spotlight?.id ?? null}
            onPick={setPickedFixtureId}
            divisionOf={divisionOf}
          />
          {division && (
            <Pulse
              fixtures={allFixtures}
              pools={division.pools}
              tense={tense}
              dayWindow={dayWindow}
            />
          )}
        </div>

        {/* ---- centre: the featured match, then the detail ---- */}
        <div className="rail centre">
          {/* Before the day there is no match to feature, and a hero of two
              dashes reads as a broken scoreboard. The date takes the slot. */}
          {tense === 'before' && event ? (
            <Countdown
              event={event.event}
              daysAway={daysAway}
              fixtures={allFixtures}
              divisionCount={event.divisions.length}
              followedTeamId={teamFilter}
            />
          ) : (
            <Spotlight
              fixture={spotlight}
              now={now}
              onPick={setPickedFixtureId}
              siblings={liveNow.length > 1 ? liveNow : []}
              divisionName={spotlight ? (divisionOf?.get(spotlight.id) ?? null) : null}
            />
          )}

          <div className="glass">
            {dayShape.length > 0 && (
              <p className="day-shape soft tiny">{sentenceCase(dayShape.join(' · '))}</p>
            )}

            <nav className="segmented" aria-label="Sections">
              {(
                [
                  ['next', 'Up next'],
                  ['completed', 'Completed'],
                  ['playoffs', 'Playoffs'],
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

            {division && tab === 'next' && (
              upcoming.length === 0 ? (
                <p className="soft">Every game has been played.</p>
              ) : (
                <FixtureList fixtures={upcoming} showField groupByTime />
              )
            )}

            {division && tab === 'completed' && (
              completed.length === 0 ? (
                <p className="soft">Nothing has finished yet.</p>
              ) : (
                <FixtureList fixtures={completed} showField groupByTime />
              )
            )}

            {division && tab === 'playoffs' && <Bracket fixtures={bracketFixtures} />}
          </div>
        </div>

        {/* Its own grid item rather than the top of the right rail: stacked on a
            phone the rails run one after another, which buried the only control
            on the page halfway down. */}
        <section className="glass filters follow-panel" aria-labelledby="follow-title">
          {/* Named for the action rather than the state it leaves behind: this
              is the only control on the page and nothing else tells anyone
              what it is for. */}
          <h2 id="follow-title">Follow your team</h2>

          {event && event.divisions.length > 1 && (
            <div className="field">
              {/* "Tournament" read as though there were two separate events
                  sharing one set of pitches. They are divisions of one. */}
              <label htmlFor="division">Division</label>
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

        {/* ---- right rail: the tables ---- */}
        <div className="rail right">
          {division?.pools.map((pool) => (
            <div className="glass table-panel" key={pool.poolId}>
              <StandingsTable pool={pool} highlightTeamId={teamFilter} />
            </div>
          ))}

          {/* One key and one card rule for every table in the rail. "GF" does
              not mean something different in Pool B, so both are said once,
              under all of them, rather than repeated inside each panel. */}
          {division && division.pools.length > 0 && (
            <div className="standings-key soft tiny">
              <p>P played · W won · D drawn · L lost · GF goals for · GA goals against · Pts points</p>
              <p>{sharedCardRule(division.pools)}</p>
            </div>
          )}
        </div>
      </main>

      <footer className="board-footer soft">
        {tense === 'before'
          ? 'Scores appear here on the day, automatically'
          : tense === 'after'
            ? 'Final scores'
            : 'Scores update automatically'}{' '}
        ·{' '}
        <a href="https://www.chicagoscores.org" target="_blank" rel="noreferrer">
          America SCORES Chicago
        </a>{' '}
        ·{' '}
        <a
          className="donate"
          href="https://www.chicagoscores.org/donate"
          target="_blank"
          rel="noreferrer"
        >
          Donate
        </a>
        {event?.event.location ? ` · ${event.event.location}` : ''}
      </footer>
    </div>
  );
}
