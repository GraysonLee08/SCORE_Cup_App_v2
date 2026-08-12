import { useCallback, useEffect, useState } from 'react';
import { api, ApiFailure } from '../../api.js';
import type { AdminEvent, PublicDivision, PublicFixture } from '../../types.js';

/**
 * Results and standings for the admin. Every score is editable here regardless
 * of field or stage -- when a referee's phone dies, this is the fallback.
 *
 * Standings cannot be edited directly because they are computed. Overriding a
 * table is done with a points adjustment, which shows up as its own line.
 */
export default function ResultsPanel({ data }: { data: AdminEvent }) {
  const [divisionId, setDivisionId] = useState(data.divisions[0]?.id ?? '');
  const [division, setDivision] = useState<PublicDivision | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!divisionId) return;
    setDivision(await api.get<PublicDivision>(`/api/public/divisions/${divisionId}`));
  }, [divisionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (fixture: PublicFixture, home: number, away: number) => {
      try {
        await api.put(`/api/ref/fixtures/${fixture.id}/score`, {
          homeScore: home,
          awayScore: away,
          status: 'complete',
        });
        setStatus(`Saved ${fixture.homeTeamName} ${home}–${away} ${fixture.awayTeamName}.`);
        await load();
      } catch (error) {
        setStatus(error instanceof ApiFailure ? error.message : 'Could not save.');
      }
    },
    [load],
  );

  return (
    <>
      {data.divisions.length > 1 && (
        <div className="field">
          <label htmlFor="results-division">Tournament</label>
          <select
            id="results-division"
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

      {status && (
        <div className="notice ok" role="status">
          {status}
        </div>
      )}

      {!division && <p className="muted">Loading…</p>}

      {division && division.fixtures.length === 0 && (
        <p className="muted">No schedule generated yet — do that on the Setup tab.</p>
      )}

      {division?.fixtures.map((fixture) => (
        <EditableFixture key={fixture.id} fixture={fixture} onSave={save} />
      ))}

      {division && division.pools.length > 0 && (
        <AdjustmentsSection divisionId={division.id} division={division} onChanged={load} />
      )}
    </>
  );
}

function EditableFixture({
  fixture,
  onSave,
}: {
  fixture: PublicFixture;
  onSave: (f: PublicFixture, home: number, away: number) => Promise<void>;
}) {
  const [home, setHome] = useState(fixture.homeScore ?? 0);
  const [away, setAway] = useState(fixture.awayScore ?? 0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setHome(fixture.homeScore ?? 0);
    setAway(fixture.awayScore ?? 0);
  }, [fixture.homeScore, fixture.awayScore]);

  const known = Boolean(fixture.homeTeamId && fixture.awayTeamId);
  const played = fixture.homeScore != null;

  return (
    <div className="fixture">
      <div className="fixture-meta">
        <span>
          {fixture.kickoffAt
            ? new Date(fixture.kickoffAt).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })
            : 'TBC'}
        </span>
        {fixture.fieldName && <span>{fixture.fieldName}</span>}
        {fixture.poolName && <span>{fixture.poolName}</span>}
        {fixture.round && <span>{fixture.round}</span>}
        {played && <span className="pill done">Final</span>}
      </div>

      <div className="team-line">
        <span className="team-name">{fixture.homeTeamName}</span>
        <span className="team-score">{played ? fixture.homeScore : '–'}</span>
      </div>
      <div className="team-line">
        <span className="team-name">{fixture.awayTeamName}</span>
        <span className="team-score">{played ? fixture.awayScore : '–'}</span>
      </div>

      {known && (
        <>
          <button
            className="ghost"
            style={{ minHeight: '2.1rem', padding: '0 .6rem', marginTop: '.4rem' }}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Cancel' : played ? 'Correct score' : 'Enter score'}
          </button>

          {open && (
            <div className="row" style={{ marginTop: '.6rem' }}>
              <div>
                <label htmlFor={`h-${fixture.id}`}>{fixture.homeTeamName}</label>
                <input
                  id={`h-${fixture.id}`}
                  type="number"
                  min={0}
                  value={home}
                  onChange={(e) => setHome(Number(e.target.value))}
                />
              </div>
              <div>
                <label htmlFor={`a-${fixture.id}`}>{fixture.awayTeamName}</label>
                <input
                  id={`a-${fixture.id}`}
                  type="number"
                  min={0}
                  value={away}
                  onChange={(e) => setAway(Number(e.target.value))}
                />
              </div>
              <button
                className="primary"
                onClick={async () => {
                  await onSave(fixture, home, away);
                  setOpen(false);
                }}
              >
                Save
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AdjustmentsSection({
  divisionId,
  division,
  onChanged,
}: {
  divisionId: string;
  division: PublicDivision;
  onChanged: () => void;
}) {
  const [teamId, setTeamId] = useState('');
  const [points, setPoints] = useState(-3);
  const [reason, setReason] = useState('');
  const [list, setList] = useState<
    { id: string; teamName: string; points: number; reason: string }[]
  >([]);

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
    <section className="card stack">
      <h2>Points adjustments</h2>
      <p className="muted">
        Standings are calculated from results, so they cannot be edited directly. Apply an
        adjustment instead — it appears in the table as its own line, so anyone can see why the
        points differ from the games.
      </p>

      {list.length > 0 && (
        <ul className="cards-list">
          {list.map((a) => (
            <li key={a.id}>
              <span style={{ flex: 1 }}>
                <strong>{a.teamName}</strong> {a.points > 0 ? `+${a.points}` : a.points} —{' '}
                {a.reason}
              </span>
              <button
                className="ghost danger"
                style={{ minHeight: '2rem', padding: '0 .6rem' }}
                onClick={async () => {
                  await api.delete(`/api/admin/adjustments/${a.id}`);
                  await load();
                  onChanged();
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="field">
        <label htmlFor="adj-team">Team</label>
        <select id="adj-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Choose a team</option>
          {division.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="row">
        <div>
          <label htmlFor="adj-points">Points</label>
          <input
            id="adj-points"
            type="number"
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
          />
        </div>
        <div style={{ flex: '2 1 12rem' }}>
          <label htmlFor="adj-reason">Reason</label>
          <input
            id="adj-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Forfeit"
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
          setReason('');
          setTeamId('');
          await load();
          onChanged();
        }}
      >
        Apply adjustment
      </button>
    </section>
  );
}
