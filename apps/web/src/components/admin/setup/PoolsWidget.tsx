import { useEffect, useState } from 'react';
import { api, ApiFailure } from '../../../api.js';
import type { AdminEvent } from '../../../types.js';

/**
 * Pools, and which teams are in them.
 *
 * Pools belong to a tournament rather than to a field -- the same pool's games
 * are spread across whatever fields the tournament has, so a pool is a grouping
 * of teams, not a place.
 */
export default function PoolsWidget({
  data,
  onChanged,
}: {
  data: AdminEvent;
  onChanged: () => void;
}) {
  const [divisionId, setDivisionId] = useState(data.divisions[0]?.id ?? '');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const division = data.divisions.find((d) => d.id === divisionId) ?? data.divisions[0];
  const poolStage = division?.stages.find((s) => s.kind === 'pool');
  const config = (poolStage?.config ?? {}) as { poolCount?: number };
  const [pools, setPools] = useState(config.poolCount ?? division?.pools.length ?? 2);

  useEffect(() => {
    setPools(config.poolCount ?? division?.pools.length ?? 2);
  }, [division, config.poolCount]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
      setStatus({ ok: true, text: ok });
      onChanged();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof ApiFailure ? error.message : 'Something went wrong.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (!division) {
    return (
      <div className="widget">
        <section className="card">
          <h2>No divisions yet</h2>
          <p className="hint">Add one under Divisions first.</p>
        </section>
      </div>
    );
  }

  const unassigned = division.teams.filter((t) => !t.poolId);

  return (
    <div className="widget">
      {status && (
        <div className={status.ok ? 'notice ok' : 'notice error'} role="status">
          {status.text}
        </div>
      )}

      {data.divisions.length > 1 && (
        <div className="field" style={{ maxWidth: '22rem' }}>
          <label htmlFor="p-division">Division</label>
          <select
            id="p-division"
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

      <section className="card">
        <h2>Pools in {division.name}</h2>
        <p className="hint">
          A pool is a group of teams who play each other. Games are spread across whatever
          fields this division has, so pools are not tied to a pitch.
        </p>

        {!poolStage ? (
          <p className="hint">
            This division has no pool play yet — add it under Divisions.
          </p>
        ) : (
          <>
            <div className="field" style={{ maxWidth: '14rem' }}>
              <label htmlFor="p-count">Number of pools</label>
              <input
                id="p-count"
                type="number"
                min={1}
                max={26}
                value={pools}
                onChange={(e) => setPools(Number(e.target.value))}
                onBlur={() => {
                  if (pools !== (config.poolCount ?? division.pools.length)) {
                    void run(
                      () =>
                        api.put(`/api/setup/divisions/${division.id}/pool-count`, {
                          count: pools,
                        }),
                      'Pools updated.',
                    );
                  }
                }}
              />
            </div>

            <div className="row" style={{ maxWidth: '28rem' }}>
              <button
                disabled={busy || division.teams.length === 0}
                onClick={() =>
                  run(
                    () => api.post(`/api/events/divisions/${division.id}/auto-assign-pools`),
                    'Teams spread across pools.',
                  )
                }
              >
                Spread teams evenly
              </button>
            </div>

            {unassigned.length > 0 && (
              <div className="notice pending" style={{ marginTop: '1rem' }}>
                {unassigned.length} team{unassigned.length === 1 ? '' : 's'} not in a pool:{' '}
                {unassigned.map((t) => t.name).join(', ')}
              </div>
            )}
          </>
        )}
      </section>

      {poolStage && (
        <div className="cols">
          {division.pools.map((pool) => {
            const members = division.teams.filter((t) => t.poolId === pool.id);
            return (
              <section className="card" key={pool.id}>
                <div className="meta">
                  <h2 style={{ margin: 0, flex: 1 }}>{pool.name}</h2>
                  <span className="pill">{members.length}</span>
                </div>

                {members.length === 0 && <p className="hint">Empty.</p>}

                {members.map((team) => (
                  <div className="editor-row" key={team.id}>
                    <span style={{ flex: 1 }}>{team.name}</span>
                    <select
                      aria-label={`Pool for ${team.name}`}
                      value={team.poolId ?? ''}
                      style={{ width: 'auto', minHeight: '34px' }}
                      onChange={(e) =>
                        run(
                          () =>
                            api.patch(`/api/events/teams/${team.id}/pool`, {
                              poolId: e.target.value || null,
                            }),
                          `${team.name} moved.`,
                        )
                      }
                    >
                      <option value="">No pool</option>
                      {division.pools.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
