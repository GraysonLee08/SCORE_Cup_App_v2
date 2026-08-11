import type {
  Fixture,
  FixtureId,
  PoolId,
  StageId,
  TeamId,
  TeamRef,
} from './types.js';

export interface PoolInput {
  id: PoolId;
  teamIds: TeamId[];
}

export class FixtureGenerationError extends Error {
  override name = 'FixtureGenerationError';
}

/**
 * Generate pool fixtures where every team plays exactly `gamesPerTeam` games.
 *
 * This is deliberately more general than a round robin. The 2026 SCORE Cup
 * plays 3 pool games from a 10-team division, which no round robin produces
 * (a 10-team round robin is 9 games each; two pools of 5 would be 4 each).
 *
 * Implemented as a circulant graph. For each "distance" d, every team is
 * paired with the team d positions around the circle, which adds exactly 2 to
 * every team's game count. An odd `gamesPerTeam` needs one additional perfect
 * matching (distance n/2), which only exists when the pool has an even number
 * of teams -- see the parity check below.
 */
export function generatePoolFixtures(
  stageId: StageId,
  pools: PoolInput[],
  gamesPerTeam: number,
): Fixture[] {
  const perPool = pools.map((pool) => {
    validatePool(pool, gamesPerTeam);
    return generateForPool(stageId, pool, gamesPerTeam);
  });

  // Interleave pools rather than concatenating them. The scheduler fills each
  // time slot from the front of this list, so grouping by pool strands the
  // smallest pool's games at the end on a single field while the others sit
  // idle. Round-robining across pools keeps every field busy.
  const fixtures: Fixture[] = [];
  const longest = perPool.reduce((max, list) => Math.max(max, list.length), 0);
  for (let i = 0; i < longest; i++) {
    for (const list of perPool) {
      const fixture = list[i];
      if (fixture) fixtures.push(fixture);
    }
  }

  return fixtures;
}

function validatePool(pool: PoolInput, gamesPerTeam: number): void {
  const n = pool.teamIds.length;

  if (gamesPerTeam < 1) {
    throw new FixtureGenerationError(
      `Pool "${pool.id}": gamesPerTeam must be at least 1, got ${gamesPerTeam}.`,
    );
  }

  if (gamesPerTeam > n - 1) {
    throw new FixtureGenerationError(
      `Pool "${pool.id}" has ${n} teams, so each team can play at most ${n - 1} games ` +
        `without a rematch, but gamesPerTeam is ${gamesPerTeam}.`,
    );
  }

  // A schedule where every team plays exactly K games needs n*K/2 fixtures.
  // If n*K is odd there is no such schedule -- someone must play a different
  // number of games. Caught here rather than producing a lopsided fixture list.
  if ((n * gamesPerTeam) % 2 !== 0) {
    throw new FixtureGenerationError(
      `Pool "${pool.id}" cannot have ${n} teams each playing exactly ${gamesPerTeam} games: ` +
        `that needs ${n} x ${gamesPerTeam} / 2 = ${(n * gamesPerTeam) / 2} fixtures, which is not a whole number. ` +
        `Use an even number of teams, or an even number of games per team.`,
    );
  }
}

function generateForPool(
  stageId: StageId,
  pool: PoolInput,
  gamesPerTeam: number,
): Fixture[] {
  const teams = pool.teamIds;
  const n = teams.length;
  const fixtures: Fixture[] = [];

  const fullRings = Math.floor(gamesPerTeam / 2);
  const needsMatching = gamesPerTeam % 2 === 1;

  const at = (i: number): TeamId => {
    const id = teams[i % n];
    if (id === undefined) {
      throw new FixtureGenerationError(`Pool "${pool.id}": team index ${i} out of range.`);
    }
    return id;
  };

  // Each ring contributes exactly 2 games per team.
  for (let d = 1; d <= fullRings; d++) {
    for (let j = 0; j < n; j++) {
      fixtures.push(
        makeFixture(stageId, pool.id, at(j), at(j + d), fixtures.length),
      );
    }
  }

  // An odd game count needs one perfect matching on top of the rings.
  // Parity validation above guarantees n is even whenever we reach here.
  if (needsMatching) {
    const half = n / 2;
    for (let j = 0; j < half; j++) {
      fixtures.push(
        makeFixture(stageId, pool.id, at(j), at(j + half), fixtures.length),
      );
    }
  }

  return fixtures;
}

function makeFixture(
  stageId: StageId,
  poolId: PoolId,
  homeTeamId: TeamId,
  awayTeamId: TeamId,
  index: number,
): Fixture {
  return {
    id: `${stageId}:${poolId}:${index + 1}`,
    stageId,
    poolId,
    home: { kind: 'team', teamId: homeTeamId },
    away: { kind: 'team', teamId: awayTeamId },
  };
}

/**
 * Generate a single-elimination bracket whose entrants are not yet known.
 *
 * Fixtures reference pool positions ("1st in Pool A") and earlier fixtures
 * ("winner of SF1"), so the whole bracket can be scheduled onto fields and
 * kickoff times before pool play has finished.
 */
export function generateBracketFixtures(
  stageId: StageId,
  poolIds: PoolId[],
  advancePerPool: number,
  options: { thirdPlaceGame?: boolean } = {},
): Fixture[] {
  const size = poolIds.length * advancePerPool;

  if (size < 2) {
    throw new FixtureGenerationError(
      `A bracket needs at least 2 entrants, got ${size} ` +
        `(${poolIds.length} pools x ${advancePerPool} advancing).`,
    );
  }

  if ((size & (size - 1)) !== 0) {
    throw new FixtureGenerationError(
      `Bracket size must be a power of two, got ${size} ` +
        `(${poolIds.length} pools x ${advancePerPool} advancing). ` +
        `Byes are not supported yet -- adjust pool count or teams advancing.`,
    );
  }

  const seeds = seedOrder(poolIds, advancePerPool);
  const rounds = Math.log2(size);
  const fixtures: Fixture[] = [];

  // First round pairs seed 1 v last, 2 v second-last, and so on.
  let previousRound: FixtureId[] = [];
  for (let i = 0; i < size / 2; i++) {
    const home = seeds[i];
    const away = seeds[size - 1 - i];
    if (home === undefined || away === undefined) {
      throw new FixtureGenerationError(`Bracket seeding failed at index ${i}.`);
    }
    const id = `${stageId}:r1:${i + 1}`;
    fixtures.push({
      id,
      stageId,
      home,
      away,
      round: roundName(rounds, 1),
    });
    previousRound.push(id);
  }

  // Subsequent rounds consume the winners of the round before.
  for (let r = 2; r <= rounds; r++) {
    const thisRound: FixtureId[] = [];
    for (let i = 0; i < previousRound.length; i += 2) {
      const a = previousRound[i];
      const b = previousRound[i + 1];
      if (a === undefined || b === undefined) {
        throw new FixtureGenerationError(`Bracket round ${r} pairing failed at index ${i}.`);
      }
      const id = `${stageId}:r${r}:${i / 2 + 1}`;
      fixtures.push({
        id,
        stageId,
        home: { kind: 'fixtureWinner', fixtureId: a },
        away: { kind: 'fixtureWinner', fixtureId: b },
        round: roundName(rounds, r),
      });
      thisRound.push(id);
    }
    previousRound = thisRound;
  }

  if (options.thirdPlaceGame && rounds >= 2) {
    const semis = fixtures.filter((f) => f.round === roundName(rounds, rounds - 1));
    const a = semis[0];
    const b = semis[1];
    if (a && b) {
      fixtures.push({
        id: `${stageId}:third-place`,
        stageId,
        home: { kind: 'fixtureLoser', fixtureId: a.id },
        away: { kind: 'fixtureLoser', fixtureId: b.id },
        round: 'Third-place game',
      });
    }
  }

  return fixtures;
}

/**
 * Seed entrants so that pool winners are spread across the bracket and, where
 * possible, teams from the same pool cannot meet before the final.
 * Order is all 1st places, then all 2nd places, and so on.
 */
function seedOrder(poolIds: PoolId[], advancePerPool: number): TeamRef[] {
  const refs: TeamRef[] = [];
  for (let position = 1; position <= advancePerPool; position++) {
    for (const poolId of poolIds) {
      refs.push({ kind: 'poolPosition', poolId, position });
    }
  }
  return refs;
}

function roundName(totalRounds: number, round: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-final';
  if (fromEnd === 2) return 'Quarter-final';
  return `Round ${round}`;
}
