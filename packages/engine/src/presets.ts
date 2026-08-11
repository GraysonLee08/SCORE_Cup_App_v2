import type {
  MatchTiming,
  PenaltyPointWeights,
  ScoringRules,
  Tiebreaker,
} from './types.js';

/**
 * The 2026 SCORE Cup rule set, as supplied by the Tournament Organizer.
 *
 * These are values, not logic. A future tournament changes the numbers; the
 * engine does not change. Kept here so the rules live in one greppable place
 * rather than scattered through the app.
 */

/** 3 for a win, 1 for a tie, 0 for a loss, plus 1 for winning via shutout. */
export const SCORE_CUP_2026_SCORING: ScoringRules = {
  win: 3,
  draw: 1,
  loss: 0,
  shutoutWinBonus: 1,
};

/**
 * The rules say "Penalty Points (least number of cards)", which reads as a flat
 * count, so a red weighs the same as a yellow. Flagged in
 * docs/OPEN-QUESTIONS.md -- many tournaments weight reds more heavily.
 */
export const SCORE_CUP_2026_PENALTY_POINTS: PenaltyPointWeights = {
  yellow: 1,
  red: 1,
};

/**
 * Head-to-head, goals for, goals against, fewest cards, then rock-paper-scissors.
 * Note there is no goal difference: goals for and against are separate,
 * sequential criteria.
 */
export const SCORE_CUP_2026_TIEBREAKERS: Tiebreaker[] = [
  'headToHead',
  'goalsFor',
  'goalsAgainst',
  'penaltyPoints',
  'manual',
];

/** Group play: 14-minute halves, 2-minute halftime. */
export const SCORE_CUP_2026_GROUP_TIMING: MatchTiming = {
  halfMinutes: 14,
  halftimeMinutes: 2,
  // Not specified in the rules -- confirm with the organizer.
  changeoverMinutes: 5,
};

/** Knockout: 12-minute halves, 3-minute halftime. */
export const SCORE_CUP_2026_KNOCKOUT_TIMING: MatchTiming = {
  halfMinutes: 12,
  halftimeMinutes: 3,
  changeoverMinutes: 5,
};
