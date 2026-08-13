import type { PublicPoolTable } from '../types.js';

/**
 * State the weighting rather than assume it. The number is on public display
 * and it decides who goes through, so an explanation that disagrees with the
 * configuration would be worse than none at all.
 */
function cardRule(weights: PublicPoolTable['penaltyPoints']): string {
  if (!weights) return 'Cards counts against a team.';
  const part = (n: number, colour: string) =>
    `a ${colour} counts ${n}${n === 1 ? '' : ''}`;
  return weights.yellow === weights.red
    ? `Every card counts ${weights.yellow}.`
    : `${capitalise(part(weights.yellow, 'yellow'))}, ${part(weights.red, 'red')}.`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

  return (
    <section className="card">
      <div className="meta">
        <h2 style={{ margin: 0 }}>{pool.poolName}</h2>
        {pool.complete ? (
          <span className="pill done">Final</span>
        ) : (
          <span className="pill">In progress</span>
        )}
      </div>

      <div className="table-scroll">
        <table className="standings">
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
                  {row.needsManualTiebreak && <span className="asterisk" title="Tied">*</span>}
                  {row.adjustmentPoints !== 0 && (
                    <span className="asterisk" title="Points adjustment">†</span>
                  )}
                </td>
                <td className="num">{row.played}</td>
                <td className="num">{row.won}</td>
                <td className="num">{row.drawn}</td>
                <td className="num">{row.lost}</td>
                <td className="num">{row.goalsFor}</td>
                <td
                  className="num"
                  title={`${row.yellowCards} yellow, ${row.redCards} red`}
                >
                  {row.penaltyPoints}
                </td>
                <td className="num strong">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Say why the order is what it is, rather than leaving people to guess. */}
      <p className="muted" style={{ marginTop: '.6rem' }}>
        {cardRule(pool.penaltyPoints)} Used to separate teams level on points — fewer is
        better. Hover or tap a number for the yellow and red breakdown.
      </p>
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
