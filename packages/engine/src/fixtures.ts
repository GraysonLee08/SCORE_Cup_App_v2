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
 * Fixtures reference pool positions ("1st in Pool A"), wildcard places ("best
 * 3rd place") and earlier fixtures ("winner of SF1"), so the whole bracket can
 * be scheduled onto fields and kickoff times before pool play has finished.
 *
 * Any number of qualifiers from 2 upwards is accepted. When it is not a power
 * of two the bracket is padded to the next one and the extra slots become
 * byes, which fall to the top seeds -- 6 qualifiers play a bracket of 8, and
 * seeds 1 and 2 sit out the first round.
 */
export function generateBracketFixtures(
  stageId: StageId,
  poolIds: PoolId[],
  qualifiers: number,
  options: { thirdPlaceGame?: boolean } = {},
): Fixture[] {
  if (poolIds.length === 0) {
    throw new FixtureGenerationError('A bracket needs at least one pool to seed from.');
  }

  if (qualifiers < 2) {
    throw new FixtureGenerationError(
      `A bracket needs at least 2 teams in the playoffs, got ${qualifiers}.`,
    );
  }

  const size = nextPowerOfTwo(qualifiers);
  const rounds = Math.log2(size);
  const seeds = seedOrder(poolIds, qualifiers);

  // Lay the seeds out in standard bracket order, so the two best teams can
  // only meet in the final: 1 and 2 go to opposite ends, 3 and 4 to opposite
  // halves from them, and so on. Slots beyond the qualifier count are byes.
  const slots: (TeamRef | null)[] = bracketSlots(size).map((seed) =>
    seed <= qualifiers ? (seeds[seed - 1] ?? null) : null,
  );

  const fixtures: Fixture[] = [];

  /**
   * Who comes out of each first-round pairing: the winner of a real game, or
   * the team that had nobody to play.
   */
  let advancing: TeamRef[] = [];
  let gameNumber = 0;

  for (let i = 0; i < size; i += 2) {
    const home = slots[i] ?? null;
    const away = slots[i + 1] ?? null;

    if (home && away) {
      gameNumber += 1;
      const id = `${stageId}:r1:${gameNumber}`;
      fixtures.push({ id, stageId, home, away, round: roundName(rounds, 1) });
      advancing.push({ kind: 'fixtureWinner', fixtureId: id });
      continue;
    }

    const solo = home ?? away;
    if (!solo) {
      // Two byes in one pairing would mean a whole branch with nobody in it.
      // Cannot happen: padding to the *next* power of two leaves fewer byes
      // than pairings, and standard seeding spreads them one per pairing.
      throw new FixtureGenerationError(
        `Bracket of ${size} for ${qualifiers} qualifiers left an empty pairing.`,
      );
    }
    advancing.push(solo);
  }

  // Later rounds consume whatever came out of the round before -- a winner, or
  // a team that had a bye.
  for (let r = 2; r <= rounds; r++) {
    const next: TeamRef[] = [];
    for (let i = 0; i < advancing.length; i += 2) {
      const home = advancing[i];
      const away = advancing[i + 1];
      if (home === undefined || away === undefined) {
        throw new FixtureGenerationError(`Bracket round ${r} pairing failed at index ${i}.`);
      }
      const id = `${stageId}:r${r}:${i / 2 + 1}`;
      fixtures.push({ id, stageId, home, away, round: roundName(rounds, r) });
      next.push({ kind: 'fixtureWinner', fixtureId: id });
    }
    advancing = next;
  }

  if (options.thirdPlaceGame && rounds >= 2) {
    const semis = fixtures.filter((f) => f.round === roundName(rounds, rounds - 1));
    const a = semis[0];
    const b = semis[1];
    // With a small enough bracket there may be only one semi-final, in which
    // case third place is already settled and there is nothing to play for.
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

/** Smallest power of two greater than or equal to n. */
export function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/** How many teams sit out the first round for a given playoff size. */
export function byeCount(qualifiers: number): number {
  return nextPowerOfTwo(qualifiers) - qualifiers;
}

/**
 * Seed numbers in bracket-slot order.
 *
 * Built by repeatedly mirroring, which is the standard construction: [1,2]
 * becomes [1,4,2,3], then [1,8,4,5,2,7,3,6]. Read as pairs it gives 1v8, 4v5,
 * 2v7, 3v6 -- so seed 1 meets seed 4 in the semi and seed 2 only in the final.
 */
export function bracketSlots(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const total = order.length * 2;
    const next: number[] = [];
    for (const seed of order) {
      next.push(seed, total + 1 - seed);
    }
    order = next;
  }
  return order;
}

/**
 * Seed the qualifiers.
 *
 * Pool winners first, then all the runners-up, and so on -- so a pool winner
 * always outranks a runner-up. When the number of qualifiers is not a whole
 * multiple of the pool count the remainder are wildcards: the best teams
 * across pools at the next position down.
 */
function seedOrder(poolIds: PoolId[], qualifiers: number): TeamRef[] {
  const pools = poolIds.length;
  const guaranteed = Math.floor(qualifiers / pools);
  const wildcards = qualifiers % pools;
  const refs: TeamRef[] = [];

  for (let position = 1; position <= guaranteed; position++) {
    for (const poolId of poolIds) {
      refs.push({ kind: 'poolPosition', poolId, position });
    }
  }

  for (let rank = 1; rank <= wildcards; rank++) {
    refs.push({ kind: 'bestOfPosition', poolIds, position: guaranteed + 1, rank });
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
