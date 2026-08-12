/**
 * Core domain types for the tournament engine.
 *
 * Nothing in this package may import a database driver, an HTTP framework, or
 * anything else with I/O. The engine is a set of pure functions over these
 * types so that a whole tournament format can be tested in milliseconds.
 */

export type TeamId = string;
export type PoolId = string;
export type StageId = string;
export type FixtureId = string;
export type FieldId = string;
export type PlayerId = string;

/**
 * One side of a fixture. Pool matchups know their teams up front; knockout
 * matchups do not ("winner of SF1"), so a fixture can be scheduled onto a
 * field and kickoff time long before the teams are known.
 */
export type TeamRef =
  | { kind: 'team'; teamId: TeamId }
  | { kind: 'poolPosition'; poolId: PoolId; position: number }
  /**
   * A wildcard: "the best 3rd-place team across these pools", and the second
   * best, and so on.
   *
   * Needed whenever the number of teams reaching the playoffs is not a whole
   * multiple of the number of pools -- 5 qualifiers from 2 pools means the top
   * two of each, plus whichever third-placed team did better.
   */
  | { kind: 'bestOfPosition'; poolIds: PoolId[]; position: number; rank: number }
  | { kind: 'fixtureWinner'; fixtureId: FixtureId }
  | { kind: 'fixtureLoser'; fixtureId: FixtureId };

export interface Team {
  id: TeamId;
  name: string;
  poolId?: PoolId;
}

/** Minutes. Total slot = 2 * half + halftime + changeover. */
export interface MatchTiming {
  halfMinutes: number;
  halftimeMinutes: number;
  /** Gap after the final whistle before the next game may kick off on this field. */
  changeoverMinutes: number;
}

export function slotMinutes(t: MatchTiming): number {
  return t.halfMinutes * 2 + t.halftimeMinutes + t.changeoverMinutes;
}

export interface ScoringRules {
  win: number;
  draw: number;
  loss: number;
  /**
   * Extra point for winning without conceding. 2026 SCORE Cup awards 1.
   * Never awarded for a 0-0 draw, since that is not a win.
   */
  shutoutWinBonus: number;
}

/**
 * Weight applied per card when computing the "penalty points" tiebreaker.
 *
 * The 2026 rules phrase this as "least number of cards", which reads as a flat
 * count, so both default to 1. Many tournaments weight a red more heavily --
 * hence configurable. See docs/OPEN-QUESTIONS.md.
 */
export interface PenaltyPointWeights {
  yellow: number;
  red: number;
}

export type Tiebreaker =
  | 'headToHead'
  | 'goalsFor'
  | 'goalsAgainst'
  | 'goalDifference'
  | 'penaltyPoints'
  /** Unresolvable by computation (2026 uses rock-paper-scissors). Flags the row for an admin. */
  | 'manual';

export interface PoolStageConfig {
  kind: 'pool';
  poolCount: number;
  /**
   * How many games each team plays. NOT necessarily a full round robin --
   * 2026 plays 3 games from a 10-team division.
   */
  gamesPerTeam: number;
  scoring: ScoringRules;
  penaltyPoints: PenaltyPointWeights;
  tiebreakers: Tiebreaker[];
  timing: MatchTiming;
}

export interface BracketStageConfig {
  kind: 'bracket';
  /**
   * How many teams reach the playoffs in total.
   *
   * Expressed as a total rather than per pool because that is the question an
   * organiser is actually answering ("the top 6 go through"), and because it
   * is the only form that can express a wildcard place.
   *
   * Any number from 2 upwards works. When it is not a power of two the bracket
   * is padded up to the next one and the top seeds sit out the first round --
   * 6 qualifiers play a bracket of 8 with 2 byes.
   */
  qualifiers: number;
  /**
   * Superseded by `qualifiers`, kept so stage configs written before it
   * existed still load. Read through `qualifierCount()`, never directly.
   */
  advancePerPool?: number;
  thirdPlaceGame: boolean;
  /** 2026 goes straight to penalties with no extra time. */
  drawResolution: 'penalties';
  timing: MatchTiming;
}

/**
 * How many teams this bracket takes, tolerating configs saved before
 * `qualifiers` existed.
 */
export function qualifierCount(
  config: { qualifiers?: number; advancePerPool?: number },
  poolCount: number,
): number {
  if (config.qualifiers && config.qualifiers > 0) return config.qualifiers;
  return (config.advancePerPool ?? 0) * poolCount;
}

export type StageConfig = PoolStageConfig | BracketStageConfig;

export interface Fixture {
  id: FixtureId;
  stageId: StageId;
  poolId?: PoolId;
  home: TeamRef;
  away: TeamRef;
  /** e.g. "Round 1", "Semi-final". Display only. */
  round?: string;
}

export interface ScheduledFixture extends Fixture {
  fieldId: FieldId;
  /** Minutes from the event's first kickoff. Converted to wall-clock at the edges. */
  kickoffOffsetMinutes: number;
}

export interface Result {
  fixtureId: FixtureId;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  homeScore: number;
  awayScore: number;
  /**
   * Penalty shootout, knockout only. Kept separate from goals: a 1-1 game won
   * 4-3 on penalties is still a 1-1 draw for goals for/against purposes.
   */
  homePenalties?: number;
  awayPenalties?: number;
}

export interface Card {
  fixtureId: FixtureId;
  teamId: TeamId;
  /** Null until a captain attributes it at match-end sign-off. */
  playerId?: PlayerId;
  type: 'yellow' | 'red';
  minute?: number;
}

/** Admin override folded into standings as a visible, audited line item. */
export interface StandingsAdjustment {
  teamId: TeamId;
  points: number;
  reason: string;
}

export interface StandingsRow {
  teamId: TeamId;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  shutoutWins: number;
  yellowCards: number;
  redCards: number;
  penaltyPoints: number;
  adjustmentPoints: number;
  points: number;
  rank: number;
  /** True when the team is still tied after every computable tiebreaker. */
  needsManualTiebreak: boolean;
}
