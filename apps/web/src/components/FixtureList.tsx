import type { PublicFixture } from '../types.js';
import Jersey from './Jersey.js';
import { cardLabel } from './cards.js';

function time(iso: string | null): string {
  if (!iso) return 'TBC';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function CardPips({ counts }: { counts: { yellow: number; red: number } }) {
  if (counts.yellow === 0 && counts.red === 0) return null;
  return (
    <span className="pips" role="img" aria-label={cardLabel(counts.yellow, counts.red)}>
      {Array.from({ length: counts.yellow }, (_, i) => (
        <span key={`y${i}`} className="pip yellow" />
      ))}
      {Array.from({ length: counts.red }, (_, i) => (
        <span key={`r${i}`} className="pip red" />
      ))}
    </span>
  );
}

export default function FixtureList({
  fixtures,
  showField,
  groupByTime,
}: {
  fixtures: PublicFixture[];
  showField?: boolean;
  groupByTime?: boolean;
}) {
  if (fixtures.length === 0) {
    return <p className="muted">Nothing to show.</p>;
  }

  const groups = groupByTime
    ? [...new Map(fixtures.map((f) => [f.kickoffAt ?? 'tbc', f.kickoffAt])).keys()]
    : [null];

  return (
    <>
      {groups.map((key) => {
        const inGroup = groupByTime
          ? fixtures.filter((f) => (f.kickoffAt ?? 'tbc') === key)
          : fixtures;

        return (
          <div key={key ?? 'all'}>
            {groupByTime && (
              <h3 className="time-heading">{time(inGroup[0]?.kickoffAt ?? null)}</h3>
            )}
            {inGroup.map((f) => {
              const played = f.homeScore != null;
              const homeWon =
                played &&
                (f.homeScore! > f.awayScore! ||
                  (f.homeScore === f.awayScore &&
                    (f.homePenalties ?? 0) > (f.awayPenalties ?? 0)));
              const awayWon =
                played &&
                (f.awayScore! > f.homeScore! ||
                  (f.homeScore === f.awayScore &&
                    (f.awayPenalties ?? 0) > (f.homePenalties ?? 0)));

              return (
                <div className={played ? 'fixture' : 'fixture unscored'} key={f.id}>
                  <div className="fixture-meta">
                    {!groupByTime && <span>{time(f.kickoffAt)}</span>}
                    {showField && f.fieldName && <span>{f.fieldName}</span>}
                    {f.poolName && <span>{f.poolName}</span>}
                    {f.round && <span>{f.round}</span>}
                    {f.status === 'in_progress' && <span className="pill live">Live</span>}
                  </div>

                  <div className={`team-line ${homeWon ? 'winner' : ''}`}>
                    <Jersey jersey={f.homeJersey} teamName={f.homeTeamName} />
                    <span className="team-name">{f.homeTeamName}</span>
                    <CardPips counts={f.homeCards} />
                    <span className="team-score">{played ? f.homeScore : '–'}</span>
                  </div>

                  <div className={`team-line ${awayWon ? 'winner' : ''}`}>
                    <Jersey jersey={f.awayJersey} teamName={f.awayTeamName} />
                    <span className="team-name">{f.awayTeamName}</span>
                    <CardPips counts={f.awayCards} />
                    <span className="team-score">{played ? f.awayScore : '–'}</span>
                  </div>

                  {/* A shootout decides who advances, but the goals stay level. */}
                  {f.homePenalties != null && f.awayPenalties != null && (
                    <div className="muted" style={{ fontSize: '.85rem', marginTop: '.25rem' }}>
                      Penalties {f.homePenalties}–{f.awayPenalties}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
