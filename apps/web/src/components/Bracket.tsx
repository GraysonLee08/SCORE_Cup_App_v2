import type { PublicFixture } from '../types.js';

/**
 * Rounds are grouped by their label rather than drawn as connected lines. On a
 * phone a true bracket tree either overflows or shrinks past legibility, and
 * the thing people actually want is "who is playing, and who won".
 */
export default function Bracket({ fixtures }: { fixtures: PublicFixture[] }) {
  if (fixtures.length === 0) {
    return (
      <p className="muted">
        The bracket appears once pool play finishes. Places are decided by the pool tables.
      </p>
    );
  }

  const rounds = [...new Set(fixtures.map((f) => f.round ?? 'Knockout'))];

  return (
    <>
      {rounds.map((round) => (
        <section className="card" key={round}>
          <h2>{round}</h2>
          {fixtures
            .filter((f) => (f.round ?? 'Knockout') === round)
            .map((f) => {
              const played = f.homeScore != null;
              const homeWins =
                played &&
                (f.homeScore! > f.awayScore! ||
                  (f.homeScore === f.awayScore &&
                    (f.homePenalties ?? 0) > (f.awayPenalties ?? 0)));
              const awayWins =
                played &&
                (f.awayScore! > f.homeScore! ||
                  (f.homeScore === f.awayScore &&
                    (f.awayPenalties ?? 0) > (f.homePenalties ?? 0)));

              return (
                <div className="fixture" key={f.id}>
                  <div className="fixture-meta">
                    {f.fieldName && <span>{f.fieldName}</span>}
                    {f.kickoffAt && (
                      <span>
                        {new Date(f.kickoffAt).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>

                  {/* An unresolved slot reads "Winner of earlier match" rather
                      than sitting blank, so the shape of the bracket is clear
                      before anyone has qualified. */}
                  <div className={`team-line ${homeWins ? 'winner' : ''}`}>
                    <span className={`team-name ${f.homeTeamId ? '' : 'pending'}`}>
                      {f.homeTeamName}
                    </span>
                    <span className="team-score">{played ? f.homeScore : '–'}</span>
                  </div>
                  <div className={`team-line ${awayWins ? 'winner' : ''}`}>
                    <span className={`team-name ${f.awayTeamId ? '' : 'pending'}`}>
                      {f.awayTeamName}
                    </span>
                    <span className="team-score">{played ? f.awayScore : '–'}</span>
                  </div>

                  {f.homePenalties != null && f.awayPenalties != null && (
                    <div className="muted" style={{ fontSize: '.85rem', marginTop: '.25rem' }}>
                      Won {f.homePenalties}–{f.awayPenalties} on penalties
                    </div>
                  )}
                </div>
              );
            })}
        </section>
      ))}
    </>
  );
}
