import { z } from 'zod';

/**
 * Runtime validation mirroring the engine's config types. Stage config is
 * stored as JSONB so a format change does not need a migration -- which means
 * the guarantee that it is well-formed has to live here instead.
 */

const matchTiming = z.object({
  halfMinutes: z.number().int().positive().max(90),
  halftimeMinutes: z.number().int().min(0).max(60),
  changeoverMinutes: z.number().int().min(0).max(120),
});

const scoringRules = z.object({
  win: z.number().int(),
  draw: z.number().int(),
  loss: z.number().int(),
  shutoutWinBonus: z.number().int().min(0),
});

const penaltyPointWeights = z.object({
  yellow: z.number().min(0),
  red: z.number().min(0),
});

const tiebreaker = z.enum([
  'headToHead',
  'goalsFor',
  'goalsAgainst',
  'goalDifference',
  'penaltyPoints',
  'manual',
]);

export const poolStageConfigSchema = z.object({
  kind: z.literal('pool'),
  poolCount: z.number().int().positive().max(32),
  gamesPerTeam: z.number().int().positive().max(30),
  scoring: scoringRules,
  penaltyPoints: penaltyPointWeights,
  tiebreakers: z.array(tiebreaker).min(1),
  timing: matchTiming,
});

export const bracketStageConfigSchema = z.object({
  kind: z.literal('bracket'),
  advancePerPool: z.number().int().positive().max(16),
  thirdPlaceGame: z.boolean(),
  drawResolution: z.literal('penalties'),
  timing: matchTiming,
});

export const stageConfigSchema = z.discriminatedUnion('kind', [
  poolStageConfigSchema,
  bracketStageConfigSchema,
]);

export type PoolStageConfigInput = z.infer<typeof poolStageConfigSchema>;
export type BracketStageConfigInput = z.infer<typeof bracketStageConfigSchema>;
export type StageConfigInput = z.infer<typeof stageConfigSchema>;

/** 2026 defaults, so an admin creating a stage starts from the real rules. */
export const DEFAULT_POOL_CONFIG: PoolStageConfigInput = {
  kind: 'pool',
  poolCount: 2,
  gamesPerTeam: 3,
  scoring: { win: 3, draw: 1, loss: 0, shutoutWinBonus: 1 },
  penaltyPoints: { yellow: 1, red: 1 },
  tiebreakers: ['headToHead', 'goalsFor', 'goalsAgainst', 'penaltyPoints', 'manual'],
  timing: { halfMinutes: 14, halftimeMinutes: 2, changeoverMinutes: 5 },
};

export const DEFAULT_BRACKET_CONFIG: BracketStageConfigInput = {
  kind: 'bracket',
  advancePerPool: 2,
  thirdPlaceGame: false,
  drawResolution: 'penalties',
  timing: { halfMinutes: 12, halftimeMinutes: 3, changeoverMinutes: 5 },
};
