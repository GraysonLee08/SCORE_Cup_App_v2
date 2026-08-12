import { useCallback, useEffect, useState } from 'react';
import { api, ApiFailure } from '../../../api.js';
import type { AdminDivision, AdminEvent, Feasibility } from '../../../types.js';

/**
 * Build the schedule. The feasibility check runs first and on demand, so a day
 * that will not fit is obvious before anyone commits to it -- and regenerating
 * over real results requires a deliberate confirmation.
 */
export default function GenerateWidget({
  data,
  onChanged,
}: {
  data: AdminEvent;
  onChanged: () => void;
}) {
  const [feasibility, setFeasibility] = useState<Record<string, Feasibility>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async (division: AdminDivision) => {
    try {
      const res = await api.get<Feasibility>(
        `/api/schedule/divisions/${division.id}/feasibility`,
      );
      setFeasibility((f) => ({ ...f, [division.id]: res }));
    } catch (error) {
      setFeasibility((f) => ({
        ...f,
        [division.id]: {
          fits: false,
          summary: error instanceof ApiFailure ? error.message : 'Could not check.',
        } as Feasibility,
      }));
    }
  }, []);

  useEffect(() => {
    for (const division of data.divisions) {
      if (division.teams.length > 0) void check(division);
    }
  }, [data, check]);

  return (
    <div className="widget">
      {status && (
        <div className={status.ok ? 'notice ok' : 'notice error'} role="status">
          {status.text}
        </div>
      )}

      {data.divisions.length === 0 && (
        <section className="card">
          <h2>Nothing to schedule yet</h2>
          <p className="hint">Add a division and some teams first.</p>
        </section>
      )}

      {data.divisions.map((division) => {
        const report = feasibility[division.id];
        const ready =
          division.teams.length > 0 && division.stages.some((s) => s.kind === 'pool');

        return (
          <section className="card" key={division.id}>
            <div className="meta">
              <h2 style={{ margin: 0, flex: 1 }}>{division.name}</h2>
              <span className="pill">{division.teams.length} teams</span>
              <span className="pill">
                {division.fieldIds.length > 0
                  ? `${division.fieldIds.length} fields`
                  : `all ${data.fields.length} fields`}
              </span>
              {division.fixtureCount > 0 && (
                <span className="pill done">{division.fixtureCount} games</span>
              )}
            </div>

            {!ready && (
              <p className="hint">
                Needs teams and a pool-play round before it can be scheduled.
              </p>
            )}

            {report && (
              <div className={report.fits ? 'notice ok' : 'notice error'}>{report.summary}</div>
            )}

            <div className="row" style={{ maxWidth: '34rem' }}>
              <button disabled={busy || !ready} onClick={() => void check(division)}>
                Check it fits
              </button>
              <button
                className="primary"
                disabled={busy || !ready}
                onClick={async () => {
                  setBusy(true);
                  setStatus(null);
                  try {
                    try {
                      await api.post(`/api/schedule/divisions/${division.id}/generate`);
                    } catch (error) {
                      if (
                        error instanceof ApiFailure &&
                        error.code === 'results_would_be_lost'
                      ) {
                        if (!window.confirm(`${error.message}\n\nOverwrite anyway?`)) return;
                        await api.post(`/api/schedule/divisions/${division.id}/generate`, {
                          force: true,
                        });
                      } else {
                        throw error;
                      }
                    }
                    setStatus({ ok: true, text: `${division.name}: schedule generated.` });
                    onChanged();
                    await check(division);
                  } catch (error) {
                    setStatus({
                      ok: false,
                      text:
                        error instanceof ApiFailure ? error.message : 'Could not generate it.',
                    });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Generate schedule
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
