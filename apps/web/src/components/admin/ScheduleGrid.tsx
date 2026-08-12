import { useCallback, useEffect, useMemo, useState } from 'react';
import { detectConflicts, type ScheduleConflict, type ScheduleEntry } from '@scores-cup/engine';
import { api, ApiFailure } from '../../api.js';
import type { AdminEvent, AdminUser, PublicDivision, PublicFixture } from '../../types.js';

/**
 * The whole day as a grid: fields down the side, kickoff times across the top.
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
  const [divisionId, setDivisionId] = useState(data.divisions[0]?.id ?? '');
  const [division, setDivision] = useState<PublicDivision | null>(null);
  const [referees, setReferees] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!divisionId) return;
    setDivision(await api.get<PublicDivision>(`/api/public/divisions/${divisionId}`));
  }, [divisionId]);

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

  const fixtures = division?.fixtures ?? [];

  /** Distinct kickoff times, in order — the columns of the grid. */
  const slots = useMemo(() => {
    const times = new Set<string>();
    for (const f of fixtures) if (f.kickoffAt) times.add(f.kickoffAt);
    return [...times].sort();
  }, [fixtures]);

  const teamNames = useMemo(
    () => new Map((division?.teams ?? []).map((t) => [t.id, t.name])),
    [division],
  );

  const conflicts = useMemo(() => {
    if (!division) return [];
    const fieldIdByName = new Map(data.fields.map((f) => [f.name, f.id]));

    const entries: ScheduleEntry[] = fixtures.map((f) => ({
      id: f.id,
      label: `${f.homeTeamName} v ${f.awayTeamName}`,
      fieldId: f.fieldName ? (fieldIdByName.get(f.fieldName) ?? f.fieldName) : null,
      startMinutes: f.kickoffAt ? Math.round(new Date(f.kickoffAt).getTime() / 60000) : null,
      // Play time only. The changeover gap is handled by the rest check.
      durationMinutes: 30,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
    }));

    return detectConflicts(entries, {
      minRestMinutes: data.event.minRestMinutes,
      teamName: (id) => teamNames.get(id) ?? id,
      fieldName: (id) => data.fields.find((f) => f.id === id)?.name ?? id,
    });
  }, [division, fixtures, data, teamNames]);

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
            <label htmlFor="g-division">Tournament</label>
            <select
              id="g-division"
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

      <section className="card">
        <h2>Schedule</h2>
        <p className="hint">
          Fields down the side, kickoff times across. Click a game to change its field, time,
          teams or referee.
        </p>

        {slots.length === 0 ? (
          <p className="muted">
            Nothing scheduled yet — generate a schedule on the Tournament setup tab.
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
                            return (
                              <button
                                key={f.id}
                                className={`slot ${worst} ${selected === f.id ? 'chosen' : ''}`}
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
              </tbody>
            </table>
          </div>
        )}
      </section>

      {chosen && (
        <EditFixture
          fixture={chosen}
          data={data}
          division={division!}
          referees={referees}
          slots={slots}
          onPatch={patch}
          onClose={() => setSelected(null)}
        />
      )}
    </>
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
