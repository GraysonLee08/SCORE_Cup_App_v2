import type { PublicPoolTable } from '../types.js';
import { cardLabel } from './cards.js';

/**
 * State the weighting rather than assume it. The number is on public display
 * and it decides who goes through, so an explanation that disagrees with the
 * configuration would be worse than none at all.
 */
function cardRule(weights: PublicPoolTable['penaltyPoints']): string {
  if (!weights) return 'Cards count against a team.';
  if (weights.yellow === weights.red) return `Every card counts ${weights.yellow}.`;
  return `A yellow counts ${weights.yellow}, a red counts ${weights.red}.`;
}

/**
 * The rule as one sentence for every table on screen.
 *
 * Weighting is configured per pool, so stating one pool's numbers under all of
 * them would be a guess dressed as a fact. When the pools agree -- which they
 * do, and are meant to -- say the numbers. When they ever disagree, say the
 * rule without them rather than say it wrongly.
 */
export function sharedCardRule(pools: PublicPoolTable[]): string {
  if (pools.length === 0) return '';

  const shapes = new Set(
    pools.map((p) => (p.penaltyPoints ? `${p.penaltyPoints.yellow}:${p.penaltyPoints.red}` : '—')),
  );
  const rule = shapes.size === 1 ? cardRule(pools[0]!.penaltyPoints) : 'Cards count against a team.';

  return `${rule} Used to separate teams level on points — fewer is better.`;
}

/**
 * The shutout rule, stated once for the rail.
 *
 * Same reasoning as the card rule, and the same refusal to guess: the bonus is
 * configured per pool, so pools that disagree get the rule without a number
 * rather than one pool's number printed under another pool's table. A bonus of
 * zero means the tournament is not running the rule at all, and the sentence
 * disappears with it -- SO then reads as a plain statistic, which it is.
 */
export function sharedShutoutRule(pools: PublicPoolTable[]): string {
  if (pools.length === 0) return '';

  const bonuses = new Set(pools.map((p) => p.shutoutWinBonus ?? 0));
  if (bonuses.size !== 1) return 'SO counts wins to nil, which carry a bonus point.';

  const bonus = [...bonuses][0]!;
  if (bonus === 0) return 'SO counts wins to nil.';
  return `SO counts wins to nil — each one adds ${bonus} point${bonus === 1 ? '' : 's'} to the win.`;
}

export default function StandingsTable({
  pool,
  highlightTeamId,
}: {
  pool: PublicPoolTable;
  highlightTeamId?: string;
}) {
  const anyManual = pool.rows.some((r) => r.needsManualTiebreak);
  const anyAdjustment = pool.rows.some((r) => r.adjustmentPoints !== 0);

  // A table of zeros badged "In progress" says a tournament is underway that
  // nobody has played a minute of. Three states, not two.
  const notStarted = pool.rows.every((r) => r.played === 0);

  // The pool name names both the panel and the table inside it. Without it a
  // table-navigation user meets two unnamed ten-column tables in a row.
  const headingId = `pool-${pool.poolId}-title`;

  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="meta">
        <h2 id={headingId} style={{ margin: 0 }}>
          {pool.poolName}
        </h2>
        {pool.complete ? (
          <span className="pill done">Final</span>
        ) : notStarted ? (
          <span className="pill">Not started</span>
        ) : (
          <span className="pill">In progress</span>
        )}
      </div>

      <div className="table-scroll">
        <table className="standings" aria-labelledby={headingId}>
          <thead>
            <tr>
              <th scope="col" className="num">#</th>
              <th scope="col">Team</th>
              <th scope="col" className="num">P</th>
              <th scope="col" className="num">W</th>
              <th scope="col" className="num">D</th>
              <th scope="col" className="num">L</th>
              <th scope="col" className="num">GF</th>
              <th scope="col" className="num">GA</th>
              {/* Without this, Pts cannot be checked against the row it sits
                  on: two wins reads as six points and the table says eight.
                  GA will not do the job either -- it is a running total, so a
                  side with two clean sheets and one heavy defeat shows the
                  same GA as a side with none. */}
              <th scope="col" className="num" title="Wins to nil">SO</th>
              <th scope="col" className="num" title="Card points — fewer is better">
                Cards
              </th>
              <th scope="col" className="num">Pts</th>
            </tr>
          </thead>
          <tbody>
            {pool.rows.map((row) => (
              <tr
                key={row.teamId}
                className={row.teamId === highlightTeamId ? 'highlight' : undefined}
              >
                <td className="num">{row.rank}</td>
                <td>
                  {row.teamName}
                  {row.needsManualTiebreak && (
                    <span className="asterisk" title="Tied">
                      *<span className="sr-only"> separated by the organisers</span>
                    </span>
                  )}
                  {row.adjustmentPoints !== 0 && (
                    <span className="asterisk" title="Points adjustment">
                      †<span className="sr-only"> includes a points adjustment</span>
                    </span>
                  )}
                </td>
                <td className="num">{row.played}</td>
                <td className="num">{row.won}</td>
                <td className="num">{row.drawn}</td>
                <td className="num">{row.lost}</td>
                <td className="num">{row.goalsFor}</td>
                <td className="num">{row.goalsAgainst}</td>
                <td className="num">{row.shutoutWins}</td>
                {/* The breakdown was a `title` and nothing else, which is a
                    tooltip on a desktop and silence everywhere else. The
                    number stays visible; the split is now said out loud. */}
                <td className="num" title={cardLabel(row.yellowCards, row.redCards)}>
                  {row.penaltyPoints}
                  <span className="sr-only">
                    {' '}
                    card points, {cardLabel(row.yellowCards, row.redCards)}
                  </span>
                </td>
                <td className="num strong">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The card rule is said once for the whole rail -- see sharedCardRule.
          These two footnotes stay, because they are about rows in this table:
          they only appear when a team here is actually affected. */}
      {anyManual && (
        <p className="muted" style={{ marginTop: '.6rem' }}>
          * Level on every tiebreaker — separated by the tournament organisers.
        </p>
      )}
      {anyAdjustment && (
        <p className="muted" style={{ marginTop: '.2rem' }}>
          † Includes a points adjustment made by the organisers.
        </p>
      )}
    </section>
  );
}
