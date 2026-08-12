import { useCallback, useEffect, useState } from 'react';
import { api, ApiFailure } from '../../../api.js';
import type { AdminDivision, AdminEvent, Feasibility } from '../../../types.js';

/**
 * Build the schedule. The feasibility check runs first and on demand, so a day
 * that will not fit is obvious before anyone commits to it -- and regenerating
 * over real results requires a deliberate confirmation.
 */
interface EventGenerateResult {
  sequencing: string;
  notes: string[];
  divisions: { divisionId: string; divisionName: string; inserted: number }[];
}

const SEQUENCING_LABEL: Record<AdminEvent['event']['divisionSequencing'], string> = {
  separate_fields: 'Own pitches',
  sequential: 'One after another',
  alternating: 'Taking turns',
};

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

      {/* A pitch hosts one game at a time, so with more than one division the
          answer for each depends on what the others took. Only building them
          together can get that right. */}
      {data.divisions.length > 1 && (
        <section className="card">
          <div className="meta">
            <h2 style={{ margin: 0, flex: 1 }}>Build the whole day</h2>
            <span className="pill">{SEQUENCING_LABEL[data.event.divisionSequencing]}</span>
          </div>
          <p className="hint">
            {data.divisions.length} divisions are sharing {data.fields.length} pitches. Build
            them together so no pitch ends up with two games on it at once — generating one
            division at a time can only fit around whatever is already there.
          </p>

          <button
            className="primary"
            style={{ maxWidth: '20rem' }}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setStatus(null);
              try {
                const url = `/api/schedule/events/${data.event.id}/generate`;
                let result;
                try {
                  result = await api.post<EventGenerateResult>(url);
                } catch (error) {
                  if (error instanceof ApiFailure && error.code === 'results_would_be_lost') {
                    if (!window.confirm(`${error.message}\n\nOverwrite anyway?`)) return;
                    result = await api.post<EventGenerateResult>(url, { force: true });
                  } else {
                    throw error;
                  }
                }
                setStatus({
                  ok: true,
                  text: `Whole day built — ${result.divisions
                    .map((d) => `${d.divisionName} ${d.inserted} games`)
                    .join(', ')}.${result.notes.length ? ` ${result.notes.join(' ')}` : ''}`,
                });
                onChanged();
                for (const division of data.divisions) await check(division);
              } catch (error) {
                setStatus({
                  ok: false,
                  text: error instanceof ApiFailure ? error.message : 'Could not build it.',
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            Build the whole day
          </button>
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
              <>
                <div className={report.fits ? 'notice ok' : 'notice error'}>
                  {report.summary}
                </div>

                {/* The scheduler already prefers rested teams; this is what it
                    managed, so the cost of a change is visible rather than
                    something to count by hand. */}
                {report.quality && (
                  <dl className="kv" style={{ marginBottom: '1rem' }}>
                    <div>
                      <dt>Back-to-back games</dt>
                      <dd>
                        {report.quality.backToBackCount}
                        {report.quality.backToBackCount === 0 && ' — nobody plays twice in a row'}
                      </dd>
                    </div>
                    <div>
                      <dt>Average rest</dt>
                      <dd>{report.quality.averageRestMinutes} min</dd>
                    </div>
                    <div>
                      <dt>Shortest rest</dt>
                      <dd>{report.quality.minRestObserved} min</dd>
                    </div>
                  </dl>
                )}

                {report.quality && report.quality.backToBackCount > 0 && (
                  <p className="hint">
                    Teams are spread out as far as the day allows. To reduce this further you
                    need more fields, fewer games each, or a longer window — raising the rest
                    gap forces everyone to sit out a round and lengthens the day considerably.
                  </p>
                )}
              </>
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
