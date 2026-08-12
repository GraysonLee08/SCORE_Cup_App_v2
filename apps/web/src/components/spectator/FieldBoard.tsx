import type { PublicFixture } from '../../types.js';
import { isRunning, matchPhase, phaseLabel } from './clock.js';

/**
 * What is on every pitch, right now.
 *
 * This is the question someone standing at Fire Pitch actually has, and it is
 * the one thing a printed schedule taped to a fence answers badly. It spans
 * the whole venue rather than one division, because the fields do too.
 */
/** What a scheduled game shows where a score would go. */
function kickoffTime(fixture: PublicFixture): string {
  if (!fixture.kickoffAt) return 'TBC';
  return new Date(fixture.kickoffAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function FieldBoard({
  fixtures,
  now,
  selectedId,
  onPick,
}: {
  fixtures: PublicFixture[];
  now: number;
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  const fieldNames = [
    ...new Set(fixtures.map((f) => f.fieldName).filter((n): n is string => Boolean(n))),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (fieldNames.length === 0) {
    return (
      <section className="glass">
        <h2>Pitches</h2>
        <p className="soft">No fields have games on them yet.</p>
      </section>
    );
  }

  return (
    <section className="glass field-board">
      <h2>On the pitches</h2>

      <div className="field-rows">
        {fieldNames.map((name) => {
          const onField = fixtures.filter((f) => f.fieldName === name);
          const current =
            onField.find((f) => f.status === 'in_progress') ??
            onField.find((f) => f.status === 'scheduled') ??
            null;
          const next = current
            ? onField.find((f) => f.status === 'scheduled' && f.id !== current.id)
            : undefined;

          const phase = current ? matchPhase(current, now) : null;
          const live = phase ? isRunning(phase) || phase.kind === 'halftime' : false;

          return (
            <button
              key={name}
              className={`field-row ${live ? 'is-live' : ''} ${
                current && current.id === selectedId ? 'active' : ''
              }`}
              onClick={() => current && onPick(current.id)}
              disabled={!current}
            >
              <span className="field-name">
                {live && <span className="dot" aria-hidden="true" />}
                {name}
              </span>

              {current ? (
                <>
                  <span className="field-teams">
                    {current.homeTeamName} <span className="soft">v</span> {current.awayTeamName}
                  </span>
                  <span className="field-score">
                    {current.homeScore != null
                      ? `${current.homeScore}–${current.awayScore}`
                      : phaseLabel(phase!) || kickoffTime(current)}
                  </span>
                </>
              ) : (
                <span className="field-teams soft">Done for the day</span>
              )}

              {/* A knockout game whose entrants are not decided reads as
                  "Winner of earlier match v Winner of earlier match", which
                  says nothing twice. Show the time instead until it means
                  something. */}
              {next && (
                <span className="field-next soft">
                  Next {kickoffTime(next)}
                  {next.homeTeamId && next.awayTeamId
                    ? ` — ${next.homeTeamName} v ${next.awayTeamName}`
                    : ` — ${next.round ?? 'to be decided'}`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
