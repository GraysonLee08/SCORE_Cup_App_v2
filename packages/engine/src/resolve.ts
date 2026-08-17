import type { FixtureId, PoolId, StandingsRow, TeamId, TeamRef } from './types.js';

export interface ResolutionContext {
  /** Final standings per pool. A pool still in progress simply resolves to nothing. */
  standingsByPool: Map<PoolId, StandingsRow[]>;
  /** Completed results, keyed by fixture. */
  outcomes: Map<FixtureId, { winnerTeamId: TeamId | null; loserTeamId: TeamId | null }>;
  /** True once a pool has played every one of its fixtures. */
  poolComplete: Set<PoolId>;
  /**
   * Pool names, so an unplayed game can say which group it draws from.
   * "1st in pool" is true of four different teams on a four-pool day.
   */
  poolNames?: Map<PoolId, string>;
  /**
   * Where an earlier game is being played, so the game waiting on it can point
   * at somewhere a spectator can actually walk to.
   */
  fixtureFieldNames?: Map<FixtureId, string>;
}

export interface ResolvedTeam {
  teamId: TeamId | null;
  /** What to show when the team is not yet known: "Winner of SF1", "1st in Pool A". */
  label: string;
}

/**
 * Turn a team reference into an actual team, or a human label if it cannot be
 * resolved yet.
 *
 * Deliberately computed on read rather than written back when a stage
 * finishes. Same reasoning as standings: a corrected score should change the
 * bracket immediately, with no second copy to go stale.
 */
export function resolveTeamRef(ref: TeamRef, ctx: ResolutionContext): ResolvedTeam {
  switch (ref.kind) {
    case 'team':
      return { teamId: ref.teamId, label: '' };

    case 'poolPosition': {
      const label = poolPositionLabel(ref.position, ctx.poolNames?.get(ref.poolId));

      // Resolving from a half-finished pool would show a team that the next
      // result could displace, so wait for the pool to complete.
      if (!ctx.poolComplete.has(ref.poolId)) {
        return { teamId: null, label };
      }
      const table = ctx.standingsByPool.get(ref.poolId);
      const row = table?.[ref.position - 1];
      return row ? { teamId: row.teamId, label: '' } : { teamId: null, label };
    }

    case 'bestOfPosition': {
      const label =
        ref.rank === 1
          ? `Best ${ordinal(ref.position)} Place`
          : `${ordinal(ref.rank)}-best ${ordinal(ref.position)} Place`;

      // Every pool in the comparison has to be finished. Naming a wildcard
      // while one pool is still playing would show a team that the next result
      // could knock out.
      if (!ref.poolIds.every((id) => ctx.poolComplete.has(id))) {
        return { teamId: null, label };
      }

      const candidates = ref.poolIds
        .map((id) => ctx.standingsByPool.get(id)?.[ref.position - 1])
        .filter((row): row is StandingsRow => row !== undefined);

      // Cross-pool order: points, then goal difference, then goals scored,
      // then fewest conceded, then fewest cards. Teams level on all of it stay
      // in pool order, which is arbitrary -- an admin can re-point the game.
      const sorted = [...candidates].sort(
        (a, b) =>
          b.points - a.points ||
          b.goalDifference - a.goalDifference ||
          b.goalsFor - a.goalsFor ||
          a.goalsAgainst - b.goalsAgainst ||
          a.penaltyPoints - b.penaltyPoints,
      );

      const row = sorted[ref.rank - 1];
      return row ? { teamId: row.teamId, label: '' } : { teamId: null, label };
    }

    case 'fixtureWinner': {
      const outcome = ctx.outcomes.get(ref.fixtureId);
      const field = ctx.fixtureFieldNames?.get(ref.fixtureId);
      return outcome?.winnerTeamId
        ? { teamId: outcome.winnerTeamId, label: '' }
        : { teamId: null, label: field ? `Winner of ${field}` : 'Winner of earlier match' };
    }

    case 'fixtureLoser': {
      const outcome = ctx.outcomes.get(ref.fixtureId);
      const field = ctx.fixtureFieldNames?.get(ref.fixtureId);
      return outcome?.loserTeamId
        ? { teamId: outcome.loserTeamId, label: '' }
        : { teamId: null, label: field ? `Loser of ${field}` : 'Loser of earlier match' };
    }
  }
}

/**
 * Who won, accounting for a shootout. A knockout game level on goals is
 * decided on penalties, but the goals stay level for standings purposes.
 */
export function decideOutcome(result: {
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  homeScore: number | null;
  awayScore: number | null;
  homePenalties?: number | null;
  awayPenalties?: number | null;
}): { winnerTeamId: TeamId | null; loserTeamId: TeamId | null } {
  const { homeScore, awayScore } = result;
  if (homeScore == null || awayScore == null) {
    return { winnerTeamId: null, loserTeamId: null };
  }

  if (homeScore > awayScore) {
    return { winnerTeamId: result.homeTeamId, loserTeamId: result.awayTeamId };
  }
  if (awayScore > homeScore) {
    return { winnerTeamId: result.awayTeamId, loserTeamId: result.homeTeamId };
  }

  const homePk = result.homePenalties;
  const awayPk = result.awayPenalties;
  if (homePk != null && awayPk != null && homePk !== awayPk) {
    return homePk > awayPk
      ? { winnerTeamId: result.homeTeamId, loserTeamId: result.awayTeamId }
      : { winnerTeamId: result.awayTeamId, loserTeamId: result.homeTeamId };
  }

  // A drawn pool game has no winner, and that is fine.
  return { winnerTeamId: null, loserTeamId: null };
}

/**
 * How a pool place reads before the pool has finished.
 *
 * With the group named it says which four teams it is choosing between --
 * "1st in pool" is equally true of every pool on the day, which on a bracket
 * board is close to saying nothing. Without a name it keeps the old wording
 * rather than inventing a group that was never given one.
 */
function poolPositionLabel(position: number, poolName: string | undefined): string {
  if (!poolName) return `${ordinal(position)} in pool`;
  if (position === 1) return `Winner ${poolName} Group`;
  return `${ordinal(position)} Place ${poolName} Group`;
}

function ordinal(n: number): string {
  // 11th, 12th and 13th are the exceptions to the last-digit rule.
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;

  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
