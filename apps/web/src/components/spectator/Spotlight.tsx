import type { PublicFixture } from '../../types.js';
import { isRunning, matchPhase, phaseLabel } from './clock.js';
import Jersey from '../Jersey.js';

/**
 * The one game the page is about right now.
 *
 * A spectator arriving cold should not have to read a table to find out what
 * is happening. This is the biggest thing on the screen and it answers that in
 * one glance: who, where, what the score is, and how far in they are.
 */
export default function Spotlight({
  fixture,
  now,
  onPick,
  siblings,
}: {
  fixture: PublicFixture | null;
  now: number;
  onPick: (id: string) => void;
  /** Other games happening at the same time, so the viewer can switch. */
  siblings: PublicFixture[];
}) {
  if (!fixture) {
    return (
      <section className="glass spotlight empty">
        <h2>Nothing on the pitches</h2>
        <p className="soft">
          When the first game kicks off it will appear here, and the scores update on their own.
        </p>
      </section>
    );
  }

  const phase = matchPhase(fixture, now);
  const live = isRunning(phase) || phase.kind === 'halftime';
  const played = fixture.homeScore != null;
  const label = phaseLabel(phase);

  return (
    <section className={`glass spotlight ${live ? 'is-live' : ''}`} aria-live="polite">
      <div className="spotlight-top">
        <span className="tag">{fixture.fieldName ?? 'Field TBC'}</span>
        {fixture.poolName && <span className="tag ghost">{fixture.poolName}</span>}
        {fixture.round && <span className="tag ghost">{fixture.round}</span>}
        {live ? (
          <span className="tag live">
            <span className="dot" aria-hidden="true" />
            Live
          </span>
        ) : (
          fixture.status === 'complete' && <span className="tag done">Final</span>
        )}
      </div>

      <div className="spotlight-score">
        <div className="team">
          <Jersey jersey={fixture.homeJersey} teamName={fixture.homeTeamName} size={44} />
          <div className="team-name">{fixture.homeTeamName}</div>
          <Pips counts={fixture.homeCards} />
        </div>

        <div className="numbers">
          <span className="n">{played ? fixture.homeScore : '–'}</span>
          <span className="sep" aria-hidden="true" />
          <span className="n">{played ? fixture.awayScore : '–'}</span>
        </div>

        <div className="team right">
          <Jersey jersey={fixture.awayJersey} teamName={fixture.awayTeamName} size={44} />
          <div className="team-name">{fixture.awayTeamName}</div>
          <Pips counts={fixture.awayCards} />
        </div>
      </div>

      {fixture.homePenalties != null && fixture.awayPenalties != null && (
        <p className="soft center">
          Won on penalties {fixture.homePenalties}–{fixture.awayPenalties}
        </p>
      )}

      <div className="spotlight-clock">
        {label && <strong className={live ? 'ticking' : ''}>{label}</strong>}
        {fixture.kickoffAt && (
          <span className="soft">
            Kickoff{' '}
            {new Date(fixture.kickoffAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        )}
        {fixture.refereeName && <span className="soft">Ref {fixture.refereeName}</span>}
      </div>

      {/* The clock is inferred from the scheduled kickoff, so it is honest
          about being an estimate rather than pretending to be official. */}
      {isRunning(phase) && <p className="soft tiny center">Approximate — timed from the scheduled kickoff.</p>}

      {siblings.length > 0 && (
        <div className="spotlight-switch">
          {siblings.map((f) => (
            <button
              key={f.id}
              className={f.id === fixture.id ? 'chip-btn active' : 'chip-btn'}
              onClick={() => onPick(f.id)}
              aria-current={f.id === fixture.id ? 'true' : undefined}
            >
              {f.fieldName ?? 'TBC'}
              {f.homeScore != null && (
                <span className="mini">
                  {' '}
                  {f.homeScore}–{f.awayScore}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Pips({ counts }: { counts: { yellow: number; red: number } }) {
  if (counts.yellow === 0 && counts.red === 0) return null;
  return (
    <span className="pips" aria-label={`${counts.yellow} yellow, ${counts.red} red`}>
      {Array.from({ length: counts.yellow }, (_, i) => (
        <span key={`y${i}`} className="pip yellow" />
      ))}
      {Array.from({ length: counts.red }, (_, i) => (
        <span key={`r${i}`} className="pip red" />
      ))}
    </span>
  );
}
