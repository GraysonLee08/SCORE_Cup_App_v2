import {
  computeStandings,
  decideOutcome,
  resolveTeamRef,
  type Card,
  type ResolutionContext,
  type Result,
  type StandingsRow,
  type TeamRef,
} from '@scores-cup/engine';
import type { Db } from '../db.js';
import { HttpError } from '../auth/middleware.js';
import { poolStageConfigSchema, stageConfigSchema } from './stageConfig.js';

/**
 * Read model for every public view. Standings and bracket entrants are
 * computed here on each read rather than stored, so a corrected score is
 * reflected everywhere immediately with no second copy to go stale.
 *
 * Deliberately returns nothing that identifies a person: no rosters, no
 * contact details, no card attributions.
 */

export interface PublicFixture {
  id: string;
  round: string | null;
  kickoffAt: string | null;
  status: string;
  fieldName: string | null;
  poolName: string | null;
  stageName: string;
  stageKind: 'pool' | 'bracket';
  homeTeamId: string | null;
  homeTeamName: string;
  awayTeamId: string | null;
  awayTeamName: string;
  /**
   * The kit each side is in, once the side is known. Sent on the fixture as
   * well as the team list so a board showing one game does not have to hold
   * the whole division to draw it.
   */
  homeJersey: string | null;
  awayJersey: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homePenalties: number | null;
  awayPenalties: number | null;
  /** Cards per side, counts only. Who received them is not public. */
  homeCards: { yellow: number; red: number };
  awayCards: { yellow: number; red: number };
  /** Name only -- who is refereeing is useful publicly; their account is not. */
  refereeName: string | null;
  /**
   * Half length and the interval, so a spectator's screen can run its own
   * clock. Sent rather than computed here because the server's "now" is not
   * the viewer's, and a ticking clock has to tick locally to feel live.
   */
  halfMinutes: number | null;
  halftimeMinutes: number | null;
}

export interface PublicPoolTable {
  poolId: string;
  poolName: string;
  complete: boolean;
  rows: (StandingsRow & { teamName: string })[];
  /**
   * What a card costs in this pool. Sent so the standings can state the rule
   * rather than assert a weighting the config might not use -- the number is
   * on public display, so the explanation beside it has to be the real one.
   */
  penaltyPoints: { yellow: number; red: number };
  /**
   * What a win to nil is worth on top of the win. Sent for the same reason as
   * the card weighting: the SO column exists to account for points that would
   * otherwise be unexplainable, and an explanation off by one is worse than
   * none at all.
   */
  shutoutWinBonus: number;
}

export interface PublicDivision {
  id: string;
  name: string;
  pools: PublicPoolTable[];
  fixtures: PublicFixture[];
  teams: { id: string; name: string; jersey: string | null }[];
}

interface FixtureRow {
  id: string;
  stage_id: string;
  stage_name: string;
  stage_kind: 'pool' | 'bracket';
  pool_id: string | null;
  pool_name: string | null;
  field_name: string | null;
  kickoff_at: Date | null;
  status: string;
  home_ref: TeamRef;
  away_ref: TeamRef;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home_score: number | null;
  away_score: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
  round: string | null;
  referee_name: string | null;
}

export async function loadPublicDivision(db: Db, divisionId: string): Promise<PublicDivision> {
  const { rows: divisionRows } = await db.query<{ id: string; name: string }>(
    'SELECT id, name FROM divisions WHERE id = $1',
    [divisionId],
  );
  const division = divisionRows[0];
  if (!division) throw new HttpError(404, 'No such division.', 'not_found');

  const { rows: teams } = await db.query<{
    id: string;
    name: string;
    pool_id: string | null;
    jersey: string | null;
  }>(
    'SELECT id, name, pool_id, jersey FROM teams WHERE division_id = $1 ORDER BY name',
    [divisionId],
  );
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const teamJerseys = new Map(teams.map((t) => [t.id, t.jersey]));

  const { rows: fixtures } = await db.query<FixtureRow>(
    `SELECT f.id, f.stage_id, s.name AS stage_name, s.kind AS stage_kind,
            f.pool_id, p.name AS pool_name, fl.name AS field_name,
            f.kickoff_at, f.status, f.home_ref, f.away_ref,
            f.home_team_id, f.away_team_id,
            home.name AS home_team_name, away.name AS away_team_name,
            f.home_score, f.away_score, f.home_penalties, f.away_penalties, f.round,
            ref.display_name AS referee_name
       FROM fixtures f
       JOIN stages s ON s.id = f.stage_id
       LEFT JOIN pools p ON p.id = f.pool_id
       LEFT JOIN fields fl ON fl.id = f.field_id
       LEFT JOIN teams home ON home.id = f.home_team_id
       LEFT JOIN teams away ON away.id = f.away_team_id
       LEFT JOIN users ref ON ref.id = f.referee_user_id
      WHERE s.division_id = $1
      ORDER BY f.kickoff_at NULLS LAST, fl.sort_order`,
    [divisionId],
  );

  const { rows: cardRows } = await db.query<{
    fixture_id: string; team_id: string; type: 'yellow' | 'red';
  }>(
    `SELECT c.fixture_id, c.team_id, c.type
       FROM cards c JOIN fixtures f ON f.id = c.fixture_id
       JOIN stages s ON s.id = f.stage_id
      WHERE s.division_id = $1`,
    [divisionId],
  );

  const { rows: adjustmentRows } = await db.query<{
    team_id: string; points: number; reason: string;
  }>(
    'SELECT team_id, points, reason FROM standings_adjustments WHERE division_id = $1',
    [divisionId],
  );

  const { rows: allStageRows } = await db.query<{ id: string; config: unknown }>(
    'SELECT id, config FROM stages WHERE division_id = $1 ORDER BY sequence',
    [divisionId],
  );

  const poolStageRows = allStageRows.filter(
    (s) => (s.config as { kind?: string } | null)?.kind === 'pool',
  );

  // A bracket half is usually shorter than a pool half, so timing is per
  // stage rather than per event.
  const stageTiming = new Map<string, { halfMinutes: number; halftimeMinutes: number }>();
  for (const stage of allStageRows) {
    const parsed = stageConfigSchema.safeParse(stage.config);
    if (!parsed.success) continue;
    stageTiming.set(stage.id, {
      halfMinutes: parsed.data.timing.halfMinutes,
      halftimeMinutes: parsed.data.timing.halftimeMinutes,
    });
  }

  // --- Standings, per pool -------------------------------------------------

  const pools: PublicPoolTable[] = [];
  const standingsByPool = new Map<string, StandingsRow[]>();
  const poolComplete = new Set<string>();

  const { rows: poolRows } = await db.query<{ id: string; name: string; stage_id: string }>(
    `SELECT p.id, p.name, p.stage_id FROM pools p
       JOIN stages s ON s.id = p.stage_id
      WHERE s.division_id = $1
      ORDER BY s.sequence, p.sort_order`,
    [divisionId],
  );

  for (const pool of poolRows) {
    const stage = poolStageRows.find((s) => s.id === pool.stage_id);
    const parsed = poolStageConfigSchema.safeParse(stage?.config);
    if (!parsed.success) continue;

    const poolFixtures = fixtures.filter((f) => f.pool_id === pool.id);
    const complete =
      poolFixtures.length > 0 && poolFixtures.every((f) => f.home_score != null);
    if (complete) poolComplete.add(pool.id);

    const poolTeamIds = teams.filter((t) => t.pool_id === pool.id).map((t) => t.id);

    const results: Result[] = poolFixtures
      .filter((f) => f.home_score != null && f.home_team_id && f.away_team_id)
      .map((f) => ({
        fixtureId: f.id,
        homeTeamId: f.home_team_id!,
        awayTeamId: f.away_team_id!,
        homeScore: f.home_score!,
        awayScore: f.away_score!,
      }));

    const poolFixtureIds = new Set(poolFixtures.map((f) => f.id));
    const cards: Card[] = cardRows
      .filter((c) => poolFixtureIds.has(c.fixture_id))
      .map((c) => ({ fixtureId: c.fixture_id, teamId: c.team_id, type: c.type }));

    const table = computeStandings({
      teamIds: poolTeamIds,
      results,
      cards,
      adjustments: adjustmentRows
        .filter((a) => poolTeamIds.includes(a.team_id))
        .map((a) => ({ teamId: a.team_id, points: a.points, reason: a.reason })),
      scoring: parsed.data.scoring,
      penaltyPoints: parsed.data.penaltyPoints,
      tiebreakers: parsed.data.tiebreakers,
    });

    standingsByPool.set(pool.id, table);
    pools.push({
      poolId: pool.id,
      poolName: pool.name,
      complete,
      rows: table.map((r) => ({ ...r, teamName: teamNames.get(r.teamId) ?? 'Unknown' })),
      penaltyPoints: parsed.data.penaltyPoints,
      shutoutWinBonus: parsed.data.scoring.shutoutWinBonus,
    });
  }

  // --- Resolve bracket entrants -------------------------------------------

  const outcomes = new Map<string, { winnerTeamId: string | null; loserTeamId: string | null }>();
  for (const f of fixtures) {
    if (!f.home_team_id || !f.away_team_id) continue;
    outcomes.set(
      f.id,
      decideOutcome({
        homeTeamId: f.home_team_id,
        awayTeamId: f.away_team_id,
        homeScore: f.home_score,
        awayScore: f.away_score,
        homePenalties: f.home_penalties,
        awayPenalties: f.away_penalties,
      }),
    );
  }

  // Names for the slots that have no team in them yet: which group a place is
  // drawn from, and where the game feeding this one is being played. Both turn
  // an entry that is true of any game into one about this game.
  const poolNames = new Map<string, string>();
  for (const pool of pools) poolNames.set(pool.poolId, pool.poolName);

  const fixtureFieldNames = new Map<string, string>();
  for (const f of fixtures) {
    if (f.field_name) fixtureFieldNames.set(f.id, f.field_name);
  }

  const ctx: ResolutionContext = {
    standingsByPool,
    outcomes,
    poolComplete,
    poolNames,
    fixtureFieldNames,
  };

  const cardCount = (fixtureId: string, teamId: string | null) => {
    const counts = { yellow: 0, red: 0 };
    if (!teamId) return counts;
    for (const c of cardRows) {
      if (c.fixture_id === fixtureId && c.team_id === teamId) counts[c.type] += 1;
    }
    return counts;
  };

  const publicFixtures: PublicFixture[] = fixtures.map((f) => {
    const home = f.home_team_id
      ? { teamId: f.home_team_id, label: '' }
      : resolveTeamRef(f.home_ref, ctx);
    const away = f.away_team_id
      ? { teamId: f.away_team_id, label: '' }
      : resolveTeamRef(f.away_ref, ctx);

    return {
      id: f.id,
      round: f.round,
      kickoffAt: f.kickoff_at ? f.kickoff_at.toISOString() : null,
      status: f.status,
      fieldName: f.field_name,
      poolName: f.pool_name,
      stageName: f.stage_name,
      stageKind: f.stage_kind,
      homeTeamId: home.teamId,
      homeTeamName: home.teamId
        ? (f.home_team_name ?? teamNames.get(home.teamId) ?? 'TBC')
        : home.label,
      awayTeamId: away.teamId,
      awayTeamName: away.teamId
        ? (f.away_team_name ?? teamNames.get(away.teamId) ?? 'TBC')
        : away.label,
      homeJersey: home.teamId ? (teamJerseys.get(home.teamId) ?? null) : null,
      awayJersey: away.teamId ? (teamJerseys.get(away.teamId) ?? null) : null,
      homeScore: f.home_score,
      awayScore: f.away_score,
      homePenalties: f.home_penalties,
      awayPenalties: f.away_penalties,
      homeCards: cardCount(f.id, f.home_team_id),
      awayCards: cardCount(f.id, f.away_team_id),
      refereeName: f.referee_name,
      halfMinutes: stageTiming.get(f.stage_id)?.halfMinutes ?? null,
      halftimeMinutes: stageTiming.get(f.stage_id)?.halftimeMinutes ?? null,
    };
  });

  return {
    id: division.id,
    name: division.name,
    pools,
    fixtures: publicFixtures,
    teams: teams.map((t) => ({ id: t.id, name: t.name, jersey: t.jersey })),
  };
}
