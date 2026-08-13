import { useCallback, useEffect, useMemo, useState } from 'react';
import { detectConflicts, type ScheduleConflict, type ScheduleEntry } from '@scores-cup/engine';
import { api, ApiFailure } from '../../api.js';
import type { AdminEvent, AdminUser, PublicDivision, PublicFixture } from '../../types.js';

/** A game plus the division it belongs to, which the public payload omits. */
type GridFixture = PublicFixture & { divisionId: string; divisionName: string };

/**
 * The whole day as a grid: fields down the side, kickoff times across the top.
 *
 * Deliberately shows every division at once. A field hosts one game at a time
 * no matter which tournament it belongs to, so a grid scoped to one division
 * cannot see the clash that matters most -- two divisions on the same pitch.
 *
 * Every game can be re-pointed here -- its field, its time, either team, and
 * its referee. Conflicts are recomputed in the browser after every change
 * using the engine's own detector, so an admin sees the clash immediately
 * rather than after saving.
 *
 * Moves are allowed even when they conflict. Mid-rearrangement a temporary
 * clash is normal, and refusing the first move would make the grid unusable.
 */
export default function ScheduleGrid({ data }: { data: AdminEvent }) {
  const [divisionFilter, setDivisionFilter] = useState('');
  const [divisions, setDivisions] = useState<PublicDivision[]>([]);
  const [referees, setReferees] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const divisionIds = data.divisions.map((d) => d.id).join(',');

  const load = useCallback(async () => {
    const ids = divisionIds ? divisionIds.split(',') : [];
    const loaded = await Promise.all(
      ids.map((id) => api.get<PublicDivision>(`/api/public/divisions/${id}`)),
    );
    setDivisions(loaded);
  }, [divisionIds]);

  useEffect(() => {
    void load();
    setSelected(null);
  }, [load]);

  useEffect(() => {
    api
      .get<{ users: AdminUser[] }>('/api/admin/users')
      .then((r) => setReferees(r.users.filter((u) => u.role === 'ref')))
      .catch(() => setReferees([]));
  }, []);

  /** Every game at the venue, tagged with whose tournament it is. */
  const fixtures = useMemo<GridFixture[]>(
    () =>
      divisions.flatMap((d) =>
        d.fixtures.map((f) => ({ ...f, divisionId: d.id, divisionName: d.name })),
      ),
    [divisions],
  );

  /** Distinct kickoff times, in order — the columns of the grid. */
  const slots = useMemo(() => {
    const times = new Set<string>();
    for (const f of fixtures) if (f.kickoffAt) times.add(f.kickoffAt);
    return [...times].sort();
  }, [fixtures]);

  const teamNames = useMemo(
    () => new Map(divisions.flatMap((d) => d.teams).map((t) => [t.id, t.name])),
    [divisions],
  );

  const conflicts = useMemo(() => {
    if (divisions.length === 0) return [];
    const fieldIdByName = new Map(data.fields.map((f) => [f.name, f.id]));

    const entries: ScheduleEntry[] = fixtures.map((f) => ({
      id: f.id,
      label: `${f.divisionName}: ${f.homeTeamName} v ${f.awayTeamName}`,
      fieldId: f.fieldName ? (fieldIdByName.get(f.fieldName) ?? f.fieldName) : null,
      startMinutes: f.kickoffAt ? Math.round(new Date(f.kickoffAt).getTime() / 60000) : null,
      // Play time only; the changeover gap is handled by the rest check. Taken
      // from the stage's own timing, because a knockout half is shorter than a
      // pool half and a guessed 30 would miss narrow overlaps.
      durationMinutes:
        f.halfMinutes != null ? f.halfMinutes * 2 + (f.halftimeMinutes ?? 0) : 30,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
    }));

    return detectConflicts(entries, {
      minRestMinutes: data.event.minRestMinutes,
      teamName: (id) => teamNames.get(id) ?? id,
      fieldName: (id) => data.fields.find((f) => f.id === id)?.name ?? id,
    });
  }, [divisions, fixtures, data, teamNames]);

  const conflictIds = useMemo(() => {
    const map = new Map<string, ScheduleConflict[]>();
    for (const c of conflicts) {
      for (const id of c.fixtureIds) {
        map.set(id, [...(map.get(id) ?? []), c]);
      }
    }
    return map;
  }, [conflicts]);

  const patch = useCallback(
    async (fixtureId: string, body: Record<string, unknown>) => {
      try {
        await api.patch(`/api/schedule/fixtures/${fixtureId}`, body);
        await load();
        setStatus(null);
      } catch (error) {
        setStatus({
          ok: false,
          text: error instanceof ApiFailure ? error.message : 'Could not move that game.',
        });
      }
    },
    [load],
  );

  const errors = conflicts.filter((c) => c.severity === 'error');
  const warnings = conflicts.filter((c) => c.severity === 'warning');
  const chosen = fixtures.find((f) => f.id === selected) ?? null;
  const chosenDivision = divisions.find((d) => d.id === chosen?.divisionId) ?? null;
  const showAll = divisionFilter === '';

  /**
   * Games with nowhere to be drawn.
   *
   * The grid is a cell per (field, time), so a game missing either matches no
   * cell and vanishes -- with no way to select it again and put it back. They
   * get their own row instead: nothing can be lost if there is always
   * somewhere for it to sit.
   */
  const unassigned = useMemo(
    () => fixtures.filter((f) => !f.fieldName || !f.kickoffAt),
    [fixtures],
  );

  return (
    <>
      {status && !status.ok && (
        <div className="notice error" role="alert">
          {status.text}
        </div>
      )}

      <div className="row" style={{ alignItems: 'flex-end', marginBottom: '.6rem' }}>
        {data.divisions.length > 1 && (
          <div className="field" style={{ maxWidth: '18rem', marginBottom: 0 }}>
            <label htmlFor="g-division">Highlight</label>
            <select
              id="g-division"
              value={divisionFilter}
              onChange={(e) => setDivisionFilter(e.target.value)}
            >
              <option value="">Every division</option>
              {data.divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div style={{ flex: '1 1 auto' }} />
        <div>
          {errors.length === 0 && warnings.length === 0 ? (
            <span className="pill done">No conflicts</span>
          ) : (
            <>
              {errors.length > 0 && (
                <span className="pill" style={{ background: 'var(--bad)', color: '#fff' }}>
                  {errors.length} clash{errors.length === 1 ? '' : 'es'}
                </span>
              )}{' '}
              {warnings.length > 0 && (
                <span className="pill" style={{ background: '#f5c518' }}>
                  {warnings.length} warning{warnings.length === 1 ? '' : 's'}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className={errors.length > 0 ? 'notice error' : 'notice pending'}>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {conflicts.slice(0, 8).map((c, i) => (
              <li key={i}>{c.message}</li>
            ))}
            {conflicts.length > 8 && <li>…and {conflicts.length - 8} more.</li>}
          </ul>
        </div>
      )}

      <DelayControl fixtures={fixtures} data={data} onApplied={load} />

      <section className="card">
        <h2>Schedule</h2>
        <p className="hint">
          Fields down the side, kickoff times across, every division together — a pitch can
          only host one game at a time, whichever tournament it belongs to. Click a game to
          change its field, time, teams or referee.
        </p>

        {slots.length === 0 ? (
          <p className="muted">
            Nothing scheduled yet — generate one under Setup → Generate schedule.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="grid-table">
              <thead>
                <tr>
                  <th scope="col" className="corner">Field</th>
                  {slots.map((slot) => (
                    <th key={slot} scope="col">
                      {new Date(slot).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.fields.map((field) => (
                  <tr key={field.id}>
                    <th scope="row">{field.name}</th>
                    {slots.map((slot) => {
                      const inCell = fixtures.filter(
                        (f) => f.fieldName === field.name && f.kickoffAt === slot,
                      );
                      return (
                        <td key={slot}>
                          {inCell.map((f) => {
                            const issues = conflictIds.get(f.id) ?? [];
                            const worst = issues.some((c) => c.severity === 'error')
                              ? 'clash'
                              : issues.length > 0
                                ? 'warn'
                                : '';
                            const dimmed = !showAll && f.divisionId !== divisionFilter;
                            return (
                              <button
                                key={f.id}
                                className={`slot ${worst} ${selected === f.id ? 'chosen' : ''}${
                                  dimmed ? ' dim' : ''
                                }`}
                                onClick={() => setSelected(selected === f.id ? null : f.id)}
                                title={issues.map((c) => c.message).join('\n')}
                              >
                                <span className="slot-teams">
                                  {f.homeTeamName} v {f.awayTeamName}
                                </span>
                                <span className="slot-meta">
                                  {f.round ?? f.poolName ?? ''}
                                  {f.refereeName ? ` · ${f.refereeName}` : ''}
                                  {f.homeScore != null
                                    ? ` · ${f.homeScore}–${f.awayScore}`
                                    : ''}
                                </span>
                              </button>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {unassigned.length > 0 && (
                  <tr className="unassigned-row">
                    <th scope="row">
                      Unassigned
                      <span className="pill" style={{ background: 'var(--bad)', color: '#fff' }}>
                        {unassigned.length}
                      </span>
                    </th>
                    <td colSpan={Math.max(1, slots.length)}>
                      {unassigned.map((f) => (
                        <button
                          key={f.id}
                          className={`slot warn ${selected === f.id ? 'chosen' : ''}`}
                          onClick={() => setSelected(selected === f.id ? null : f.id)}
                        >
                          <span className="slot-teams">
                            {f.homeTeamName} v {f.awayTeamName}
                          </span>
                          <span className="slot-meta">
                            {f.divisionName}
                            {!f.fieldName && ' · no pitch'}
                            {!f.kickoffAt && ' · no time'}
                          </span>
                        </button>
                      ))}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RefereeBoard fixtures={fixtures} slots={slots} referees={referees} />

      {chosen && chosenDivision && (
        <EditFixture
          fixture={chosen}
          data={data}
          division={chosenDivision}
          referees={referees}
          slots={slots}
          onPatch={patch}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

/**
 * The day laid out by referee rather than by pitch.
 *
 * The same games, turned ninety degrees. On the pitch grid a referee's day is
 * scattered across four rows, so "is everyone covered, and when does each of
 * them get a break" cannot be read off it -- which is the question being asked
 * while building the rota, and the one the director actually needs answered.
 *
 * Games with nobody named are their own row rather than being left out. An
 * unassigned game is not an absence of information, it is the thing you are
 * looking for.
 */
function RefereeBoard({
  fixtures,
  slots,
  referees,
}: {
  fixtures: GridFixture[];
  slots: string[];
  referees: AdminUser[];
}) {
  const [open, setOpen] = useState(false);

  /** Everyone with a game, plus anyone on the books who has none at all. */
  const names = useMemo(() => {
    const withGames = new Set(
      fixtures.map((f) => f.refereeName).filter((n): n is string => Boolean(n)),
    );
    for (const r of referees) withGames.add(r.displayName);
    return [...withGames].sort((a, b) => a.localeCompare(b));
  }, [fixtures, referees]);

  const uncovered = fixtures.filter((f) => f.kickoffAt && !f.refereeName);

  if (slots.length === 0) return null;

  return (
    <section className="card">
      <div className="meta">
        <h2 style={{ margin: 0, flex: 1 }}>Referees</h2>
        {uncovered.length > 0 && (
          <span className="pill" style={{ background: 'var(--warn)', color: '#fff' }}>
            {uncovered.length} unassigned
          </span>
        )}
        <button
          className="ghost"
          style={{ minHeight: '2rem' }}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? 'Hide' : 'Show rota'}
        </button>
      </div>

      {!open ? (
        <p className="hint">
          The same games by referee instead of by pitch — who is on, and where the gaps
          are. {names.length} referee{names.length === 1 ? '' : 's'} on the books.
        </p>
      ) : (
        <>
          <p className="hint">
            A blank cell is a break. Games with nobody named appear in the last row — those
            fall to whoever is covering that pitch.
          </p>

          <div className="table-scroll">
            <table className="grid-table">
              <thead>
                <tr>
                  <th scope="col" className="corner">Referee</th>
                  {slots.map((slot) => (
                    <th key={slot} scope="col">
                      {new Date(slot).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {names.map((name) => {
                  const mine = fixtures.filter((f) => f.refereeName === name);
                  return (
                    <tr key={name}>
                      <th scope="row">
                        {name}
                        <span className="pill">{mine.length}</span>
                      </th>
                      {slots.map((slot) => {
                        const here = mine.filter((f) => f.kickoffAt === slot);
                        return (
                          <td key={slot}>
                            {here.map((f) => (
                              <span className="slot" key={f.id}>
                                <span className="slot-teams">{f.fieldName ?? 'No pitch'}</span>
                                <span className="slot-meta">
                                  {f.divisionName}
                                  {f.round ? ` · ${f.round}` : ''}
                                </span>
                              </span>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {uncovered.length > 0 && (
                  <tr className="unassigned-row">
                    <th scope="row">
                      Nobody named
                      <span className="pill" style={{ background: 'var(--warn)', color: '#fff' }}>
                        {uncovered.length}
                      </span>
                    </th>
                    {slots.map((slot) => {
                      const here = uncovered.filter((f) => f.kickoffAt === slot);
                      return (
                        <td key={slot}>
                          {here.map((f) => (
                            <span className="slot warn" key={f.id}>
                              <span className="slot-teams">{f.fieldName ?? 'No pitch'}</span>
                              <span className="slot-meta">{f.divisionName}</span>
                            </span>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Push the rest of the day back when it is running late.
 *
 * The alternative is re-typing a kickoff time onto every remaining game, which
 * nobody is going to do accurately while it is raining. One number moves
 * everything from a chosen round onwards and keeps the gaps that were designed
 * into the day.
 *
 * The preview is the point. "17 games move and the last kickoff becomes
 * 5:35 PM" is the decision being made -- whether to absorb the delay or
 * shorten the halves instead -- and it has to be visible before the button,
 * not after.
 */
function DelayControl({
  fixtures,
  data,
  onApplied,
}: {
  fixtures: GridFixture[];
  data: AdminEvent;
  onApplied: () => Promise<void>;
}) {
  const [minutes, setMinutes] = useState(10);
  const [from, setFrom] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  /** Rounds that still have something to play. A finished round cannot move. */
  const rounds = useMemo(() => {
    const times = new Set<string>();
    for (const f of fixtures) {
      if (f.kickoffAt && f.status === 'scheduled') times.add(f.kickoffAt);
    }
    return [...times].sort();
  }, [fixtures]);

  const chosen = from || rounds[0] || '';

  const moving = fixtures.filter(
    (f) => f.kickoffAt && chosen && f.kickoffAt >= chosen && f.status === 'scheduled',
  );
  const staying = fixtures.filter(
    (f) => f.kickoffAt && chosen && f.kickoffAt >= chosen && f.status !== 'scheduled',
  );

  const lastKickoff = moving.reduce<string | null>(
    (latest, f) => (latest === null || f.kickoffAt! > latest ? f.kickoffAt! : latest),
    null,
  );
  const newLast = lastKickoff ? new Date(new Date(lastKickoff).getTime() + minutes * 60_000) : null;
  const eventEnd = new Date(`${data.event.eventDate}T${data.event.endTime}`);
  const overruns = newLast !== null && newLast.getTime() > eventEnd.getTime();

  if (rounds.length === 0) return null;

  return (
    <section className="card">
      <div className="meta">
        <h2 style={{ margin: 0, flex: 1 }}>Running late?</h2>
        <span className="pill">{rounds.length} rounds still to play</span>
      </div>

      {status && (
        <div className={status.ok ? 'notice ok' : 'notice error'} role="status">
          {status.text}
        </div>
      )}

      <p className="hint">
        Move a round and everything after it by the same amount, across both divisions —
        pitches are shared, so half a day cannot move on its own. Games already played or
        under way stay where they are.
      </p>

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ maxWidth: '14rem', marginBottom: 0 }}>
          <label htmlFor="delay-from">From this round on</label>
          <select id="delay-from" value={chosen} onChange={(e) => setFrom(e.target.value)}>
            {rounds.map((r) => (
              <option key={r} value={r}>
                {new Date(r).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </option>
            ))}
          </select>
        </div>

        <div className="field" style={{ maxWidth: '9rem', marginBottom: 0 }}>
          <label htmlFor="delay-mins">Minutes</label>
          <input
            id="delay-mins"
            type="number"
            step={5}
            min={-240}
            max={240}
            value={minutes}
            onChange={(e) => setMinutes(globalThis.Number(e.target.value) || 0)}
          />
        </div>

        {[5, 10, 15].map((m) => (
          <button
            key={m}
            className="ghost"
            style={{ minHeight: '2.2rem', marginBottom: '.15rem' }}
            onClick={() => setMinutes(m)}
          >
            +{m}
          </button>
        ))}
      </div>

      <dl className="kv" style={{ marginTop: '.8rem' }}>
        <div>
          <dt>Games moving</dt>
          <dd>
            {moving.length}
            {staying.length > 0 &&
              ` — ${staying.length} already played or under way, and stay put`}
          </dd>
        </div>
        <div>
          <dt>Last kickoff becomes</dt>
          <dd>
            {newLast
              ? newLast.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
              : '—'}
            {lastKickoff && (
              <span className="muted">
                {' '}
                (was{' '}
                {new Date(lastKickoff).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                )
              </span>
            )}
          </dd>
        </div>
      </dl>

      {overruns && (
        <div className="notice error">
          That pushes the last kickoff past{' '}
          {eventEnd.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}, when the
          tournament is meant to finish. Shortening the halves under Setup → Timings and
          rebuilding buys the time back across the whole day instead.
        </div>
      )}

      <button
        className="primary"
        style={{ maxWidth: '20rem' }}
        disabled={busy || minutes === 0 || moving.length === 0}
        onClick={async () => {
          const when = new Date(chosen).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          });
          const verb = minutes > 0 ? `back ${minutes}` : `forward ${-minutes}`;
          if (
            !window.confirm(
              `Move ${moving.length} game${moving.length === 1 ? '' : 's'} ${verb} minutes, ` +
                `from ${when} onwards?\n\nEveryone watching sees the new times immediately.`,
            )
          ) {
            return;
          }

          setBusy(true);
          setStatus(null);
          try {
            const result = await api.post<{
              moved: number;
              overrunsEndTime: boolean;
            }>(`/api/schedule/events/${data.event.id}/delay`, {
              fromKickoffAt: chosen,
              minutes,
            });
            setFrom('');
            await onApplied();
            setStatus({
              ok: !result.overrunsEndTime,
              text: result.overrunsEndTime
                ? `Moved ${result.moved} games, but the day now runs past its finish time.`
                : `Moved ${result.moved} game${result.moved === 1 ? '' : 's'}. ` +
                  `To undo it, run the same round with ${-minutes}.`,
            });
          } catch (error) {
            setStatus({
              ok: false,
              text: error instanceof ApiFailure ? error.message : 'Could not move the games.',
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? 'Moving…'
          : minutes >= 0
            ? `Push ${moving.length} games back ${minutes} min`
            : `Pull ${moving.length} games forward ${-minutes} min`}
      </button>
    </section>
  );
}

function EditFixture({
  fixture,
  data,
  division,
  referees,
  slots,
  onPatch,
  onClose,
}: {
  fixture: PublicFixture;
  data: AdminEvent;
  division: PublicDivision;
  referees: AdminUser[];
  slots: string[];
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const fieldId = data.fields.find((f) => f.name === fixture.fieldName)?.id ?? '';

  return (
    <section className="card">
      <div className="meta">
        <h2 style={{ margin: 0, flex: 1 }}>
          {fixture.homeTeamName} v {fixture.awayTeamName}
        </h2>
        <button className="ghost" style={{ minHeight: '2rem' }} onClick={onClose}>
          Close
        </button>
      </div>

      {fixture.homeScore != null && (
        <div className="notice pending">
          This game has a result ({fixture.homeScore}–{fixture.awayScore}). Moving it keeps the
          score; changing a team will attach that result to the new team.
        </div>
      )}

      <div className="grid-2">
        <div className="field">
          <label htmlFor="e-field">Field</label>
          <select
            id="e-field"
            value={fieldId}
            onChange={(e) => void onPatch(fixture.id, { fieldId: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {data.fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="e-time">Kickoff</label>
          <select
            id="e-time"
            value={fixture.kickoffAt ?? ''}
            onChange={(e) => void onPatch(fixture.id, { kickoffAt: e.target.value || null })}
          >
            <option value="">Unscheduled</option>
            {slots.map((slot) => (
              <option key={slot} value={slot}>
                {new Date(slot).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="e-home">Home team</label>
          <select
            id="e-home"
            value={fixture.homeTeamId ?? ''}
            onChange={(e) => void onPatch(fixture.id, { homeTeamId: e.target.value || null })}
          >
            <option value="">Not decided</option>
            {division.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="e-away">Away team</label>
          <select
            id="e-away"
            value={fixture.awayTeamId ?? ''}
            onChange={(e) => void onPatch(fixture.id, { awayTeamId: e.target.value || null })}
          >
            <option value="">Not decided</option>
            {division.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field" style={{ maxWidth: '22rem' }}>
        <label htmlFor="e-ref">Referee</label>
        <select
          id="e-ref"
          value={referees.find((r) => r.displayName === fixture.refereeName)?.id ?? ''}
          onChange={async (e) => {
            await api.put(`/api/schedule/fixtures/${fixture.id}/referee`, {
              userId: e.target.value || null,
            });
            await onPatch(fixture.id, {});
          }}
        >
          <option value="">
            {fixture.fieldName ? `Whoever covers ${fixture.fieldName}` : 'Unassigned'}
          </option>
          {referees.map((r) => (
            <option key={r.id} value={r.id}>
              {r.displayName}
            </option>
          ))}
        </select>
        <p className="hint">
          Naming a referee does not remove access from whoever covers the field — if they do not
          turn up, someone can still record the score.
        </p>
      </div>
    </section>
  );
}
