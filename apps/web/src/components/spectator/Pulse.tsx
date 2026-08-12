import { useMemo } from 'react';
import type { PublicFixture, PublicPoolTable } from '../../types.js';

/**
 * The tournament in numbers.
 *
 * Everything here is counted from results that are already public -- no new
 * data, no guesses, no invented predictions. It exists because a fundraiser is
 * a day out as much as a competition, and "42 goals so far" is the kind of
 * thing people read out to each other on a sideline.
 */
export default function Pulse({
  fixtures,
  pools,
}: {
  fixtures: PublicFixture[];
  pools: PublicPoolTable[];
}) {
  const stats = useMemo(() => {
    const played = fixtures.filter((f) => f.homeScore != null);
    const goals = played.reduce((n, f) => n + f.homeScore! + f.awayScore!, 0);
    const cards = fixtures.reduce(
      (n, f) =>
        n +
        f.homeCards.yellow +
        f.homeCards.red +
        f.awayCards.yellow +
        f.awayCards.red,
      0,
    );

    let biggest: { margin: number; text: string } | null = null;
    for (const f of played) {
      const margin = Math.abs(f.homeScore! - f.awayScore!);
      if (margin === 0) continue;
      if (!biggest || margin > biggest.margin) {
        const winner = f.homeScore! > f.awayScore! ? f.homeTeamName : f.awayTeamName;
        const loser = f.homeScore! > f.awayScore! ? f.awayTeamName : f.homeTeamName;
        const hi = Math.max(f.homeScore!, f.awayScore!);
        const lo = Math.min(f.homeScore!, f.awayScore!);
        biggest = { margin, text: `${winner} ${hi}–${lo} ${loser}` };
      }
    }

    const shutouts = pools.reduce(
      (n, p) => n + p.rows.reduce((m, r) => m + r.shutoutWins, 0),
      0,
    );

    const leader = pools
      .flatMap((p) => p.rows.filter((r) => r.rank === 1).map((r) => ({ ...r, pool: p.poolName })))
      .sort((a, b) => b.points - a.points)[0];

    return {
      played: played.length,
      total: fixtures.length,
      goals,
      cards,
      biggest,
      shutouts,
      leader,
      perGame: played.length === 0 ? null : (goals / played.length).toFixed(1),
    };
  }, [fixtures, pools]);

  const pct = stats.total === 0 ? 0 : Math.round((stats.played / stats.total) * 100);

  return (
    <section className="glass pulse">
      <h2>The day so far</h2>

      <div className="progress" role="img" aria-label={`${pct}% of games played`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="soft tiny">
        {stats.played} of {stats.total} games played
      </p>

      <div className="stat-grid">
        <Stat value={stats.goals} label={plural(stats.goals, 'goal')} />
        <Stat value={stats.perGame ?? '–'} label="per game" />
        <Stat value={stats.shutouts} label={plural(stats.shutouts, 'clean sheet')} />
        <Stat value={stats.cards} label={plural(stats.cards, 'card')} />
      </div>

      {stats.biggest && (
        <p className="pulse-line">
          <span className="soft">Biggest win</span> {stats.biggest.text}
        </p>
      )}
      {stats.leader && (
        <p className="pulse-line">
          <span className="soft">Top of {stats.leader.pool}</span> {stats.leader.teamName}
          <span className="soft"> — {stats.leader.points} pts</span>
        </p>
      )}
    </section>
  );
}

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
