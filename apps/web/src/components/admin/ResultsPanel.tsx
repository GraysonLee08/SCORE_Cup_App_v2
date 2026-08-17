import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeStandings, type Card as EngineCard, type Result } from '@scores-cup/engine';
import { api, ApiFailure } from '../../api.js';
import type { AdminEvent, AdminUser, Card, PublicDivision, PublicFixture } from '../../types.js';

/**
 * Scores are nullable here on purpose.
 *
 * `null` means nobody has entered a result; `0` means they entered nil. Folding
 * those together makes a real 0-0 draw impossible to save -- it looks identical
 * to an untouched game -- and makes an untouched game look scored.
 */
interface PendingEdit {
  homeScore: number | null;
  awayScore: number | null;
  homeYellow: number;
  homeRed: number;
  awayYellow: number;
  awayRed: number;
}

/**
 * What to tell the person at the scores table after a save.
 *
 * Separated out and tested because this sentence is the only thing standing
 * between a director and a wrong belief about the day's record. "Could not
 * save" after four of ten wrote is not a small inaccuracy: it invites someone
 * to re-enter four results that are already in the database, or to walk away
 * thinking nothing landed when half of it did.
 */
export function saveOutcome({
  savedCount,
  failed,
  attempted,
  sessionLost,
}: {
  savedCount: number;
  /** Human names of the games that failed, in the order they were tried. */
  failed: string[];
  attempted: number;
  sessionLost: boolean;
}): { ok: boolean; text: string } {
  if (failed.length === 0) {
    return { ok: true, text: `Saved ${savedCount} game${savedCount === 1 ? '' : 's'}.` };
  }

  // Everything not saved is still in the editor, including any the run never
  // reached after a lost session -- so count from what was attempted rather
  // than from the failures seen.
  const remaining = attempted - savedCount;

  return {
    ok: false,
    text:
      (savedCount > 0 ? `Saved ${savedCount}. ` : '') +
      `${failed.length} could not be saved: ${failed.join(', ')}. ` +
      (sessionLost
        ? `Your session has expired — sign in again, then save the remaining ${remaining}.`
        : `${remaining === 1 ? 'It is' : 'They are'} still here, so you can try again.`),
  };
}

/**
 * Results, with the standings recomputed live as edits are made.
 *
 * The preview runs the engine in the browser -- the very same
 * `computeStandings` the server uses. That is only possible because the engine
 * is pure: no database, no HTTP. An admin correcting a score at the awards
 * table can see who it promotes before committing to it.
 */
export default function ResultsPanel({
  data,
  onPendingChange,
}: {
  data: AdminEvent;
  /**
   * How many edits are waiting to be saved. Reported upward because the panel
   * cannot defend its own state: the nav that unmounts it lives a level above,
   * and until it knew, a click on "Schedule grid" threw the work away in
   * silence.
   */
  onPendingChange?: (count: number) => void;
}) {
  const [divisionId, setDivisionId] = useState(data.divisions[0]?.id ?? '');
  const [division, setDivision] = useState<PublicDivision | null>(null);
  const [pending, setPending] = useState<Record<string, PendingEdit>>({});
  const [cardsByFixture, setCardsByFixture] = useState<Record<string, Card[]>>({});
  const [openFixture, setOpenFixture] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [referees, setReferees] = useState<AdminUser[]>([]);
  const [scoreFilter, setScoreFilter] = useState<'all' | 'unscored' | 'scored'>('all');

  const load = useCallback(async () => {
    if (!divisionId) return;
    setDivision(await api.get<PublicDivision>(`/api/public/divisions/${divisionId}`));
  }, [divisionId]);

  useEffect(() => {
    void load();
    setPending({});
    setOpenFixture(null);
  }, [load]);

  useEffect(() => {
    api
      .get<{ users: AdminUser[] }>('/api/admin/users')
      .then((res) => setReferees(res.users.filter((u) => u.role === 'ref')))
      .catch(() => setReferees([]));
  }, []);

  const adminDivision = data.divisions.find((d) => d.id === divisionId);
  const poolConfig = (adminDivision?.stages.find((s) => s.kind === 'pool')?.config ?? null) as
    | {
        scoring: { win: number; draw: number; loss: number; shutoutWinBonus: number };
        penaltyPoints: { yellow: number; red: number };
        tiebreakers: string[];
      }
    | null;

  /** Standings as they would be if every pending edit were saved. */
  const preview = useMemo(() => {
    if (!division || !poolConfig) return null;

    return division.pools.map((pool) => {
      const poolFixtures = division.fixtures.filter((f) => f.poolName === pool.poolName);
      const teamIds = pool.rows.map((r) => r.teamId);

      const results: Result[] = [];
      const cards: EngineCard[] = [];

      for (const f of poolFixtures) {
        if (!f.homeTeamId || !f.awayTeamId) continue;
        const edit = pending[f.id];
        const homeScore = edit ? edit.homeScore : f.homeScore;
        const awayScore = edit ? edit.awayScore : f.awayScore;

        if (homeScore != null && awayScore != null) {
          results.push({
            fixtureId: f.id,
            homeTeamId: f.homeTeamId,
            awayTeamId: f.awayTeamId,
            homeScore,
            awayScore,
          });
        }

        const counts = edit
          ? {
              home: { yellow: edit.homeYellow, red: edit.homeRed },
              away: { yellow: edit.awayYellow, red: edit.awayRed },
            }
          : { home: f.homeCards, away: f.awayCards };

        for (const [side, teamId] of [
          [counts.home, f.homeTeamId],
          [counts.away, f.awayTeamId],
        ] as const) {
          for (let i = 0; i < side.yellow; i++) {
            cards.push({ fixtureId: f.id, teamId, type: 'yellow' });
          }
          for (let i = 0; i < side.red; i++) {
            cards.push({ fixtureId: f.id, teamId, type: 'red' });
          }
        }
      }

      const rows = computeStandings({
        teamIds,
        results,
        cards,
        adjustments: pool.rows
          .filter((r) => r.adjustmentPoints !== 0)
          .map((r) => ({ teamId: r.teamId, points: r.adjustmentPoints, reason: 'adjustment' })),
        scoring: poolConfig.scoring,
        penaltyPoints: poolConfig.penaltyPoints,
        tiebreakers: poolConfig.tiebreakers as never,
      });

      return { poolName: pool.poolName, rows, before: pool.rows };
    });
  }, [division, poolConfig, pending]);

  const openEditor = useCallback(
    async (fixture: PublicFixture) => {
      setOpenFixture((current) => (current === fixture.id ? null : fixture.id));
      if (!cardsByFixture[fixture.id]) {
        try {
          const res = await api.get<{ cards: Card[] }>(`/api/ref/fixtures/${fixture.id}/cards`);
          setCardsByFixture((c) => ({ ...c, [fixture.id]: res.cards }));
        } catch {
          setCardsByFixture((c) => ({ ...c, [fixture.id]: [] }));
        }
      }
      setPending((p) =>
        p[fixture.id]
          ? p
          : {
              ...p,
              [fixture.id]: {
                homeScore: fixture.homeScore,
                awayScore: fixture.awayScore,
                homeYellow: fixture.homeCards.yellow,
                homeRed: fixture.homeCards.red,
                awayYellow: fixture.awayCards.yellow,
                awayRed: fixture.awayCards.red,
              },
            },
      );
    },
    [cardsByFixture],
  );

  /** Bring stored cards in line with the requested counts. */
  const reconcileCards = useCallback(
    async (fixture: PublicFixture, edit: PendingEdit) => {
      const existing = cardsByFixture[fixture.id] ?? [];
      const targets = [
        { teamId: fixture.homeTeamId, type: 'yellow' as const, want: edit.homeYellow },
        { teamId: fixture.homeTeamId, type: 'red' as const, want: edit.homeRed },
        { teamId: fixture.awayTeamId, type: 'yellow' as const, want: edit.awayYellow },
        { teamId: fixture.awayTeamId, type: 'red' as const, want: edit.awayRed },
      ];

      for (const target of targets) {
        if (!target.teamId) continue;
        const have = existing.filter(
          (c) => c.teamId === target.teamId && c.type === target.type,
        );
        for (let i = have.length; i < target.want; i++) {
          await api.post(`/api/ref/fixtures/${fixture.id}/cards`, {
            teamId: target.teamId,
            type: target.type,
            clientId: crypto.randomUUID(),
          });
        }
        for (let i = target.want; i < have.length; i++) {
          await api.delete(`/api/ref/fixtures/${fixture.id}/cards/${have[i]!.id}`);
        }
      }
    },
    [cardsByFixture],
  );

  const changedIds = Object.keys(pending).filter((id) => {
    const f = division?.fixtures.find((x) => x.id === id);
    const e = pending[id]!;
    if (!f) return false;
    return (
      e.homeScore !== f.homeScore ||
      e.awayScore !== f.awayScore ||
      e.homeYellow !== f.homeCards.yellow ||
      e.homeRed !== f.homeCards.red ||
      e.awayYellow !== f.awayCards.yellow ||
      e.awayRed !== f.awayCards.red
    );
  });

  /**
   * Filtering by scored/unscored answers "what is still outstanding" at the
   * scores table, which late in the day is the only question being asked.
   * A game being edited stays visible whatever the filter says, so the list
   * cannot shift out from under someone mid-edit.
   */
  const visibleFixtures = useMemo(() => {
    if (!division) return [];
    if (scoreFilter === 'all') return division.fixtures;
    return division.fixtures.filter((f) => {
      if (pending[f.id]) return true;
      return scoreFilter === 'scored' ? f.homeScore !== null : f.homeScore === null;
    });
  }, [division, scoreFilter, pending]);

  const pendingCount = changedIds.length;

  // Tell the shell, and clear the flag on the way out so a guard cannot
  // outlive the edits it was guarding.
  useEffect(() => {
    onPendingChange?.(pendingCount);
  }, [pendingCount, onPendingChange]);

  useEffect(() => () => onPendingChange?.(0), [onPendingChange]);

  /**
   * The browser's own guard, for the exits the app does not own: a closed tab,
   * a reload, a followed link. Registered only while there is something to
   * lose, so it never interrupts anyone for nothing.
   */
  useEffect(() => {
    if (pendingCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pendingCount]);

  /** One side entered and the other blank -- not a result, and not a clear. */
  const incompleteIds = changedIds.filter((id) => {
    const e = pending[id]!;
    return (e.homeScore === null) !== (e.awayScore === null);
  });

  async function saveAll() {
    if (!division) return;

    // Clearing destroys a result, so it is confirmed here rather than at the
    // counter -- this is the point of no return, not the button press.
    const clearing = changedIds.filter((id) => {
      const f = division.fixtures.find((x) => x.id === id)!;
      return pending[id]!.homeScore === null && f.homeScore !== null;
    });
    if (clearing.length > 0) {
      const names = clearing
        .map((id) => {
          const f = division.fixtures.find((x) => x.id === id)!;
          return `${f.homeTeamName} ${f.homeScore}–${f.awayScore} ${f.awayTeamName}`;
        })
        .join('\n');
      const ok = window.confirm(
        `This clears ${clearing.length} result${clearing.length === 1 ? '' : 's'} back to ` +
          `not yet played:\n\n${names}\n\nThe standings will drop the game. Cards are kept.`,
      );
      if (!ok) return;
    }

    setSaving(true);
    setStatus(null);

    /**
     * Each game is saved on its own terms.
     *
     * These are separate writes, so "it failed" was never the whole truth: a
     * failure on the fourth game used to report one error and leave all ten
     * marked unsaved, including the three already in the database. On a day
     * where the standings are the product, the person at the scores table has
     * to know exactly where the record now stands -- not merely that something
     * went wrong.
     */
    const saved: string[] = [];
    const failed: string[] = [];
    let sessionLost = false;

    for (const id of changedIds) {
      const fixture = division.fixtures.find((f) => f.id === id)!;
      const edit = pending[id]!;
      try {
        if (edit.homeScore === null && edit.awayScore === null) {
          await api.delete(`/api/ref/fixtures/${id}/score`);
        } else {
          await api.put(`/api/ref/fixtures/${id}/score`, {
            homeScore: edit.homeScore,
            awayScore: edit.awayScore,
            status: 'complete',
          });
        }
        await reconcileCards(fixture, edit);
        saved.push(id);
      } catch (error) {
        failed.push(`${fixture.homeTeamName} v ${fixture.awayTeamName}`);
        // A signed-out session fails every remaining write identically. Stop
        // rather than firing nine more doomed requests and listing nine games
        // that were never really the problem.
        if (error instanceof ApiFailure && (error.status === 401 || error.status === 403)) {
          sessionLost = true;
          break;
        }
      }
    }

    // What saved stops being unsaved, whatever happened to the rest; what
    // failed stays in the editor so it can be tried again without retyping.
    if (saved.length > 0) {
      setPending((prev) => {
        const next = { ...prev };
        for (const id of saved) delete next[id];
        return next;
      });
      setCardsByFixture({});
      setOpenFixture(null);
    }

    // Re-read either way. A screen that disagrees with the server is the one
    // outcome worse than a failed save.
    await load().catch(() => {});
    setSaving(false);

    setStatus(
      saveOutcome({ savedCount: saved.length, failed, attempted: changedIds.length, sessionLost }),
    );
  }

  return (
    <>
      {/* A failed save is announced assertively; a successful one waits its
          turn. Both used to be `status`, so "3 could not be saved" queued
          politely behind whatever the screen reader was already saying. */}
      {status && (
        <div
          className={status.ok ? 'notice ok' : 'notice error'}
          role={status.ok ? 'status' : 'alert'}
        >
          {status.text}
        </div>
      )}

      <div className="row" style={{ alignItems: 'flex-end' }}>
        {data.divisions.length > 1 && (
          <div className="field" style={{ maxWidth: '20rem', marginBottom: 0 }}>
            <label htmlFor="r-division">Division</label>
            <select
              id="r-division"
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
            >
              {data.divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field" style={{ maxWidth: '14rem', marginBottom: 0 }}>
          <label htmlFor="r-filter">Show</label>
          <select
            id="r-filter"
            value={scoreFilter}
            onChange={(e) => setScoreFilter(e.target.value as typeof scoreFilter)}
          >
            <option value="all">All games</option>
            <option value="unscored">Not yet scored</option>
            <option value="scored">Scored</option>
          </select>
        </div>

        {division && (
          <span className="pill" style={{ marginBottom: '.4rem' }}>
            {division.fixtures.filter((f) => f.homeScore === null).length} still to score
          </span>
        )}
      </div>

      {changedIds.length > 0 && (
        <div className="notice pending" style={{ display: 'flex', alignItems: 'center', gap: '.8rem' }}>
          <span style={{ flex: 1 }}>
            <strong>{changedIds.length}</strong> unsaved change
            {changedIds.length === 1 ? '' : 's'}.{' '}
            {incompleteIds.length > 0
              ? `${incompleteIds.length} ${incompleteIds.length === 1 ? 'game has' : 'games have'} a score on one side only — fill in both, or clear both.`
              : 'The table on the right shows the effect.'}
          </span>
          <button onClick={() => setPending({})} disabled={saving}>
            Discard
          </button>
          <button
            className="primary"
            style={{ width: 'auto' }}
            onClick={() => void saveAll()}
            disabled={saving || incompleteIds.length > 0}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}

      <div className="split">
        <section className="card">
          <h2>Games</h2>
          {!division && <p className="muted">Loading…</p>}
          {division?.fixtures.length === 0 && (
            <p className="muted">No schedule yet — generate one under Setup → Generate schedule.</p>
          )}

          {visibleFixtures.length === 0 && division && division.fixtures.length > 0 && (
            <p className="muted">
              No {scoreFilter === 'scored' ? 'scored' : 'unscored'} games.
            </p>
          )}

          {visibleFixtures.map((fixture) => {
            const edit = pending[fixture.id];
            const isOpen = openFixture === fixture.id;
            const changed = changedIds.includes(fixture.id);

            return (
              <div
                className={`fixture${(edit ? edit.homeScore : fixture.homeScore) === null ? ' unscored' : ''}`}
                key={fixture.id}
                style={changed ? { borderColor: 'var(--accent)' } : undefined}
              >
                <div className="fixture-meta">
                  {fixture.kickoffAt && (
                    <span>
                      {new Date(fixture.kickoffAt).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                  {fixture.fieldName && <span>{fixture.fieldName}</span>}
                  {fixture.poolName && <span>{fixture.poolName}</span>}
                  {fixture.round && <span>{fixture.round}</span>}
                  {changed && <span className="pill live">edited</span>}
                </div>

                <div className="team-line">
                  <span className="team-name">{fixture.homeTeamName}</span>
                  <span className="team-score">
                    {(edit ? edit.homeScore : fixture.homeScore) ?? '–'}
                  </span>
                </div>
                <div className="team-line">
                  <span className="team-name">{fixture.awayTeamName}</span>
                  <span className="team-score">
                    {(edit ? edit.awayScore : fixture.awayScore) ?? '–'}
                  </span>
                </div>

                <div className="editor-row" style={{ borderTop: 0, paddingTop: 0 }}>
                  <label
                    htmlFor={`ref-${fixture.id}`}
                    style={{ margin: 0, textTransform: 'none', letterSpacing: 0 }}
                  >
                    Referee
                  </label>
                  <select
                    id={`ref-${fixture.id}`}
                    style={{ width: 'auto', flex: '1 1 10rem', minHeight: '32px' }}
                    value={fixture.refereeName
                      ? (referees.find((r) => r.displayName === fixture.refereeName)?.id ?? '')
                      : ''}
                    onChange={async (e) => {
                      try {
                        await api.put(`/api/schedule/fixtures/${fixture.id}/referee`, {
                          userId: e.target.value || null,
                        });
                        await load();
                      } catch (error) {
                        setStatus({
                          ok: false,
                          text:
                            error instanceof ApiFailure ? error.message : 'Could not assign.',
                        });
                      }
                    }}
                  >
                    <option value="">Nobody yet</option>
                    {referees.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.displayName}
                      </option>
                    ))}
                  </select>

                  {fixture.homeTeamId && fixture.awayTeamId && (
                    <button
                      className="ghost"
                      style={{ minHeight: '2rem', padding: '0 .6rem' }}
                      onClick={() => void openEditor(fixture)}
                    >
                      {isOpen ? 'Close' : 'Edit score & cards'}
                    </button>
                  )}
                </div>

                {isOpen && edit && (
                  <div style={{ marginTop: '.7rem' }}>
                    {[
                      { label: fixture.homeTeamName, side: 'home' as const },
                      { label: fixture.awayTeamName, side: 'away' as const },
                    ].map(({ label, side }) => (
                      <div key={side} className="editor-row">
                        <strong style={{ flex: 1 }}>{label}</strong>
                        <Counter
                          label={`${label} goals`}
                          value={side === 'home' ? edit.homeScore : edit.awayScore}
                          onChange={(v) =>
                            setPending((p) => ({
                              ...p,
                              [fixture.id]: {
                                ...p[fixture.id]!,
                                [side === 'home' ? 'homeScore' : 'awayScore']: v,
                              },
                            }))
                          }
                          suffix="goals"
                          allowEmpty
                        />
                        <Counter
                          label={`${label} yellow cards`}
                          value={side === 'home' ? edit.homeYellow : edit.awayYellow}
                          onChange={(v) =>
                            setPending((p) => ({
                              ...p,
                              [fixture.id]: {
                                ...p[fixture.id]!,
                                [side === 'home' ? 'homeYellow' : 'awayYellow']: v ?? 0,
                              },
                            }))
                          }
                          suffix="🟨"
                        />
                        <Counter
                          label={`${label} red cards`}
                          value={side === 'home' ? edit.homeRed : edit.awayRed}
                          onChange={(v) =>
                            setPending((p) => ({
                              ...p,
                              [fixture.id]: {
                                ...p[fixture.id]!,
                                [side === 'home' ? 'homeRed' : 'awayRed']: v ?? 0,
                              },
                            }))
                          }
                          suffix="🟥"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <div className="sticky-side">
          <section className="card">
            <h2>Standings {changedIds.length > 0 && <span className="pill live">preview</span>}</h2>
            <p className="hint">
              {changedIds.length > 0
                ? 'How the table will look once you save.'
                : 'Live table. Edit a game to see the effect before saving.'}
            </p>

            {preview?.map((pool) => (
              <div key={pool.poolName} style={{ marginBottom: '1rem' }}>
                <h3>{pool.poolName}</h3>
                <div className="table-scroll">
                  <table className="standings">
                    <thead>
                      <tr>
                        <th scope="col" className="num">#</th>
                        <th scope="col">Team</th>
                        <th scope="col" className="num">P</th>
                        {/* The point of this panel is watching Pts move as a
                            score is typed. A win to nil moves it by four, not
                            three, so without this the preview jumps by an
                            amount the columns cannot account for. */}
                        <th scope="col" className="num" title="Shutouts — wins to nil">
                          SH
                        </th>
                        <th scope="col" className="num">GF</th>
                        <th scope="col" className="num">GA</th>
                        <th scope="col" className="num" title="Fair play — card points, fewer is better">
                          FP
                        </th>
                        <th scope="col" className="num">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pool.rows.map((row) => {
                        const was = pool.before.find((b) => b.teamId === row.teamId);
                        const moved = was ? was.rank - row.rank : 0;
                        const name = was?.teamName ?? row.teamId;
                        return (
                          <tr key={row.teamId} className={moved !== 0 ? 'highlight' : undefined}>
                            <td className="num">{row.rank}</td>
                            <td>
                              {name}
                              {moved > 0 && <span className="move up"> ▲{moved}</span>}
                              {moved < 0 && <span className="move down"> ▼{-moved}</span>}
                            </td>
                            <td className="num">{row.played}</td>
                            <td className="num">{row.shutoutWins}</td>
                            <td className="num">{row.goalsFor}</td>
                            <td className="num">{row.goalsAgainst}</td>
                            <td
                              className="num"
                              title={`${row.yellowCards} yellow, ${row.redCards} red`}
                            >
                              {row.penaltyPoints}
                            </td>
                            <td className="num strong">{row.points}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {!poolConfig && (
              <p className="muted">
                Add pool play to this division to see standings.
              </p>
            )}
          </section>

          {division && <Adjustments divisionId={divisionId} division={division} onChanged={load} />}
        </div>
      </div>
    </>
  );
}

/**
 * With `allowEmpty`, counting below nil returns to "–" rather than sticking at
 * 0. That is what makes an accidental edit undoable in the same gesture that
 * caused it, and it is why goals are nullable and cards are not: a game can be
 * unplayed, but a played game cannot have an unknown number of yellows.
 */
function Counter({
  label,
  value,
  onChange,
  suffix,
  allowEmpty = false,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  suffix: string;
  allowEmpty?: boolean;
}) {
  const decrement = () => {
    if (value === null) return;
    if (value === 0) return onChange(allowEmpty ? null : 0);
    onChange(value - 1);
  };

  return (
    <span className={`counter${value === null ? ' empty' : ''}`}>
      <button
        aria-label={value === 0 && allowEmpty ? `Clear ${label}` : `Fewer ${label}`}
        onClick={decrement}
        disabled={value === null}
      >
        −
      </button>
      <span className="counter-value">
        {value ?? '–'}
        <span className="counter-suffix">{suffix}</span>
      </span>
      <button aria-label={`More ${label}`} onClick={() => onChange((value ?? -1) + 1)}>
        +
      </button>
    </span>
  );
}

function Adjustments({
  divisionId,
  division,
  onChanged,
}: {
  divisionId: string;
  division: PublicDivision;
  onChanged: () => void;
}) {
  const [list, setList] = useState<
    { id: string; teamName: string; points: number; reason: string }[]
  >([]);
  const [teamId, setTeamId] = useState('');
  const [points, setPoints] = useState(-3);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    const res = await api.get<{ adjustments: typeof list }>(
      `/api/admin/divisions/${divisionId}/adjustments`,
    );
    setList(res.adjustments);
  }, [divisionId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="card">
      <h2>Points adjustments</h2>
      <p className="hint">
        Standings come from results, so they cannot be typed over. An adjustment appears as its
        own line, so anyone can see why the points differ from the games.
      </p>

      {list.map((a) => (
        <div key={a.id} className="editor-row">
          <span style={{ flex: 1 }}>
            <strong>{a.teamName}</strong> {a.points > 0 ? `+${a.points}` : a.points} — {a.reason}
          </span>
          <button
            className="ghost danger"
            style={{ minHeight: '1.9rem', padding: '0 .45rem' }}
            onClick={async () => {
              await api.delete(`/api/admin/adjustments/${a.id}`);
              await load();
              onChanged();
            }}
          >
            Remove
          </button>
        </div>
      ))}

      <div className="field">
        <label htmlFor="adj-team">Team</label>
        <select id="adj-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Choose…</option>
          {division.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="adj-points">Points</label>
          <input
            id="adj-points"
            type="number"
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="adj-reason">Reason</label>
          <input
            id="adj-reason"
            value={reason}
            placeholder="Forfeit"
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
      <button
        disabled={!teamId || !reason.trim()}
        onClick={async () => {
          await api.post(`/api/admin/divisions/${divisionId}/adjustments`, {
            teamId,
            points,
            reason: reason.trim(),
          });
          setTeamId('');
          setReason('');
          await load();
          onChanged();
        }}
      >
        Apply adjustment
      </button>
    </section>
  );
}
