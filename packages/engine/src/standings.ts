import type {
  Card,
  PenaltyPointWeights,
  Result,
  ScoringRules,
  StandingsAdjustment,
  StandingsRow,
  TeamId,
  Tiebreaker,
} from './types.js';

export interface StandingsInput {
  teamIds: TeamId[];
  /**
   * Completed games only. Callers pass pool results here; knockout games are
   * decided by advancement, not by a table.
   */
  results: Result[];
  /** Required when 'penaltyPoints' appears in `tiebreakers`. */
  cards?: Card[];
  adjustments?: StandingsAdjustment[];
  scoring: ScoringRules;
  penaltyPoints: PenaltyPointWeights;
  tiebreakers: Tiebreaker[];
}

/**
 * Compute a standings table.
 *
 * Standings are always derived, never stored. Correcting a score cannot leave
 * a stale table behind, because there is no second copy of the numbers.
 */
export function computeStandings(input: StandingsInput): StandingsRow[] {
  const rows = new Map<TeamId, StandingsRow>();

  for (const teamId of input.teamIds) {
    rows.set(teamId, emptyRow(teamId));
  }

  for (const result of input.results) {
    applyResult(rows, result, input.scoring);
  }

  for (const card of input.cards ?? []) {
    applyCard(rows, card, input.penaltyPoints);
  }

  for (const adjustment of input.adjustments ?? []) {
    const row = rows.get(adjustment.teamId);
    if (row) {
      row.adjustmentPoints += adjustment.points;
      row.points += adjustment.points;
    }
  }

  const sorted = [...rows.values()].sort((a, b) =>
    compareRows(a, b, input.results, input.scoring, input.tiebreakers),
  );

  assignRanks(sorted, input.results, input.scoring, input.tiebreakers);

  return sorted;
}

function emptyRow(teamId: TeamId): StandingsRow {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    shutoutWins: 0,
    yellowCards: 0,
    redCards: 0,
    penaltyPoints: 0,
    adjustmentPoints: 0,
    points: 0,
    rank: 0,
    needsManualTiebreak: false,
  };
}

function applyResult(
  rows: Map<TeamId, StandingsRow>,
  result: Result,
  scoring: ScoringRules,
): void {
  const home = rows.get(result.homeTeamId);
  const away = rows.get(result.awayTeamId);
  if (!home || !away) return;

  recordSide(home, result.homeScore, result.awayScore, scoring);
  recordSide(away, result.awayScore, result.homeScore, scoring);
}

function recordSide(
  row: StandingsRow,
  scored: number,
  conceded: number,
  scoring: ScoringRules,
): void {
  row.played += 1;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.goalDifference = row.goalsFor - row.goalsAgainst;

  if (scored > conceded) {
    row.won += 1;
    row.points += scoring.win;
    // A shutout bonus rewards winning to nil. A 0-0 draw is not a win, so it
    // never qualifies -- guaranteed here by sitting inside the win branch.
    if (conceded === 0) {
      row.shutoutWins += 1;
      row.points += scoring.shutoutWinBonus;
    }
  } else if (scored === conceded) {
    row.drawn += 1;
    row.points += scoring.draw;
  } else {
    row.lost += 1;
    row.points += scoring.loss;
  }
}

function applyCard(
  rows: Map<TeamId, StandingsRow>,
  card: Card,
  weights: PenaltyPointWeights,
): void {
  const row = rows.get(card.teamId);
  if (!row) return;

  if (card.type === 'yellow') {
    row.yellowCards += 1;
    row.penaltyPoints += weights.yellow;
  } else {
    row.redCards += 1;
    row.penaltyPoints += weights.red;
  }
}

function compareRows(
  a: StandingsRow,
  b: StandingsRow,
  results: Result[],
  scoring: ScoringRules,
  tiebreakers: Tiebreaker[],
): number {
  if (a.points !== b.points) return b.points - a.points;

  for (const tiebreaker of tiebreakers) {
    const verdict = applyTiebreaker(tiebreaker, a, b, results, scoring);
    if (verdict !== 0) return verdict;
  }

  return 0;
}

function applyTiebreaker(
  tiebreaker: Tiebreaker,
  a: StandingsRow,
  b: StandingsRow,
  results: Result[],
  scoring: ScoringRules,
): number {
  switch (tiebreaker) {
    case 'headToHead':
      return compareHeadToHead(a.teamId, b.teamId, results, scoring);
    case 'goalsFor':
      return b.goalsFor - a.goalsFor;
    case 'goalsAgainst':
      return a.goalsAgainst - b.goalsAgainst;
    case 'goalDifference':
      return b.goalDifference - a.goalDifference;
    case 'penaltyPoints':
      return a.penaltyPoints - b.penaltyPoints;
    case 'manual':
      return 0;
  }
}

/**
 * Compare two teams on the games they played against each other.
 *
 * Returns 0 when they never met -- which is a real possibility here, because
 * pool play does not require every pair to meet (2026 plays 3 games from a
 * 10-team pool). An inconclusive head-to-head falls through to the next
 * tiebreaker rather than ranking arbitrarily.
 */
function compareHeadToHead(
  teamA: TeamId,
  teamB: TeamId,
  results: Result[],
  scoring: ScoringRules,
): number {
  let pointsA = 0;
  let pointsB = 0;
  let met = false;

  for (const result of results) {
    const isPairing =
      (result.homeTeamId === teamA && result.awayTeamId === teamB) ||
      (result.homeTeamId === teamB && result.awayTeamId === teamA);
    if (!isPairing) continue;

    met = true;
    const aIsHome = result.homeTeamId === teamA;
    const scoredA = aIsHome ? result.homeScore : result.awayScore;
    const scoredB = aIsHome ? result.awayScore : result.homeScore;

    if (scoredA > scoredB) {
      pointsA += scoring.win;
      if (scoredB === 0) pointsA += scoring.shutoutWinBonus;
    } else if (scoredB > scoredA) {
      pointsB += scoring.win;
      if (scoredA === 0) pointsB += scoring.shutoutWinBonus;
    } else {
      pointsA += scoring.draw;
      pointsB += scoring.draw;
    }
  }

  if (!met) return 0;
  return pointsB - pointsA;
}

/**
 * Assign ranks, sharing a rank between teams that remain tied, and flagging
 * those the tiebreakers could not separate so an admin can resolve them
 * (2026 ends in rock-paper-scissors).
 */
function assignRanks(
  sorted: StandingsRow[],
  results: Result[],
  scoring: ScoringRules,
  tiebreakers: Tiebreaker[],
): void {
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    if (!row) continue;

    const previous = i > 0 ? sorted[i - 1] : undefined;
    const tiedWithPrevious =
      previous !== undefined &&
      compareRows(previous, row, results, scoring, tiebreakers) === 0;

    row.rank = tiedWithPrevious && previous ? previous.rank : i + 1;

    if (tiedWithPrevious && previous) {
      previous.needsManualTiebreak = true;
      row.needsManualTiebreak = true;
    }
  }
}
