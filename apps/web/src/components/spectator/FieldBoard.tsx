import type { PublicFixture } from '../../types.js';
import Jersey from '../Jersey.js';
import { isRunning, matchPhase, phaseLabel } from './clock.js';
import type { EventTense } from './eventDay.js';

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
  tense,
  selectedId,
  onPick,
  divisionOf,
}: {
  fixtures: PublicFixture[];
  now: number;
  tense: EventTense;
  selectedId: string | null;
  onPick: (id: string) => void;
  /**
   * Fixture id to division name, or null when the event has only one division
   * and naming it on every row would be noise. The pitches are shared, so a
   * row can belong to a division other than the one selected below.
   */
  divisionOf: Map<string, string> | null;
}) {
  const fieldNames = [
    ...new Set(fixtures.map((f) => f.fieldName).filter((n): n is string => Boolean(n))),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (fieldNames.length === 0) {
    return (
      <section className="glass" aria-labelledby="field-board-title">
        <h2 id="field-board-title">Pitches</h2>
        <p className="soft">
          {tense === 'before'
            ? 'The pitches appear here once the schedule is published.'
            : 'No fields have games on them yet.'}
        </p>
      </section>
    );
  }

  return (
    <section className="glass field-board" aria-labelledby="field-board-title">
      {/* "On the pitches" is a claim about right now, and three weeks out it is
          not true. The rows are the same either way -- the heading is not. */}
      <h2 id="field-board-title">{tense === 'before' ? 'The pitches' : 'On the pitches'}</h2>

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
              // `aria-disabled` rather than `disabled`: a pitch that has
              // finished is still one of the four, and `disabled` drops it out
              // of the tab order entirely -- so a keyboard user could not find
              // out that Leadership is done for the day, only that it was
              // missing from the list.
              aria-disabled={current ? undefined : true}
            >
              <span className="field-name">
                {live && <span className="dot" aria-hidden="true" />}
                {name}
                {current && divisionOf?.get(current.id) && (
                  <span className="field-division">{divisionOf.get(current.id)}</span>
                )}
              </span>

              {current ? (
                <>
                  <span className="field-teams">
                    <Jersey jersey={current.homeJersey} teamName={current.homeTeamName} size={20} />
                    {current.homeTeamName} <span className="soft">v</span>{' '}
                    <Jersey jersey={current.awayJersey} teamName={current.awayTeamName} size={20} />
                    {current.awayTeamName}
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

              {/* A knockout game whose entrants are not decided is shown by its
                  round rather than its two placeholders -- the round is shorter
                  and, on a board read from a distance, enough. */}
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
