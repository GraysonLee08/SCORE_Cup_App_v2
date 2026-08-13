import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { recordAudit } from '../auth/audit.js';
import { HttpError, refCanAccessField, requireAuth } from '../auth/middleware.js';

const scoreSchema = z.object({
  homeScore: z.number().int().min(0).max(99),
  awayScore: z.number().int().min(0).max(99),
  homePenalties: z.number().int().min(0).max(99).optional(),
  awayPenalties: z.number().int().min(0).max(99).optional(),
  status: z.enum(['in_progress', 'complete']).optional(),
});

const cardSchema = z.object({
  teamId: z.string().uuid(),
  type: z.enum(['yellow', 'red']),
  minute: z.number().int().min(0).max(200).optional(),
  /** Free text the referee jots to identify a player, e.g. "red headband". */
  identifyingNote: z.string().max(200).optional(),
  /** Client-generated so a retry after a dead zone does not duplicate. */
  clientId: z.string().min(8).max(100).optional(),
});

const signoffSchema = z.object({
  teamId: z.string().uuid(),
  captainName: z.string().min(1).max(120),
  /** Captains name the carded players here, since jerseys have no numbers. */
  cardAttributions: z
    .array(z.object({ cardId: z.string().uuid(), playerId: z.string().uuid() }))
    .optional(),
});

/**
 * A referee may only touch fixtures on a field they are assigned to. Checked
 * against the database on every request rather than read from the session, so
 * an admin reassigning a ref mid-day takes effect immediately.
 */
async function assertCanScoreFixture(
  db: Db,
  userId: string,
  role: string,
  fixtureId: string,
): Promise<{ fieldId: string | null; divisionId: string }> {
  const { rows } = await db.query<{
    field_id: string | null;
    division_id: string;
    referee_user_id: string | null;
  }>(
    `SELECT f.field_id, f.referee_user_id, s.division_id
       FROM fixtures f JOIN stages s ON s.id = f.stage_id
      WHERE f.id = $1`,
    [fixtureId],
  );
  const fixture = rows[0];
  if (!fixture) throw new HttpError(404, 'No such game.', 'not_found');

  if (role === 'admin') return { fieldId: fixture.field_id, divisionId: fixture.division_id };

  if (role !== 'ref') {
    throw new HttpError(403, 'Only referees can enter scores.', 'forbidden');
  }

  // Named on the match, or covering the field it is played on. The union
  // matters: if the named referee does not turn up, whoever is on that field
  // can still record the score.
  const namedOnMatch = fixture.referee_user_id === userId;
  const coversField =
    fixture.field_id !== null && (await refCanAccessField(db, userId, fixture.field_id));

  if (!namedOnMatch && !coversField) {
    throw new HttpError(403, 'That game is not yours to score.', 'wrong_field');
  }

  return { fieldId: fixture.field_id, divisionId: fixture.division_id };
}

export function refRoutes(db: Db): Router {
  const router = Router();

  /** Everything on this referee's fields, current game first. */
  router.get('/my-fixtures', requireAuth, async (req, res) => {
    const user = req.session.user!;

    const scopeToRef = user.role === 'ref';
    const { rows } = await db.query(
      `SELECT f.id, f.round, f.kickoff_at AS "kickoffAt", f.status,
              f.home_score AS "homeScore", f.away_score AS "awayScore",
              f.home_penalties AS "homePenalties", f.away_penalties AS "awayPenalties",
              fl.id AS "fieldId", fl.name AS "fieldName",
              home.id AS "homeTeamId", home.name AS "homeTeamName",
              away.id AS "awayTeamId", away.name AS "awayTeamName",
              f.home_ref AS "homeRef", f.away_ref AS "awayRef",
              s.name AS "stageName", d.name AS "divisionName",
              (SELECT count(*) FROM match_signoffs ms WHERE ms.fixture_id = f.id)::int
                AS "signoffCount",
              (f.referee_user_id = $2) AS "assignedToMe"
         FROM fixtures f
         JOIN stages s ON s.id = f.stage_id
         JOIN divisions d ON d.id = s.division_id
         LEFT JOIN fields fl ON fl.id = f.field_id
         LEFT JOIN teams home ON home.id = f.home_team_id
         LEFT JOIN teams away ON away.id = f.away_team_id
        WHERE ($1::boolean = false
               OR f.referee_user_id = $2
               OR f.field_id IN (SELECT field_id FROM ref_field_assignments WHERE user_id = $2))
        ORDER BY f.kickoff_at NULLS LAST, fl.sort_order`,
      [scopeToRef, user.id],
    );

    res.json({ fixtures: rows });
  });

  router.get('/fixtures/:id/cards', requireAuth, async (req, res) => {
    const fixtureId = req.params.id;
    if (!fixtureId) throw new HttpError(400, 'No game specified.', 'invalid_input');

    const user = req.session.user!;
    await assertCanScoreFixture(db, user.id, user.role, fixtureId);

    const { rows } = await db.query(
      `SELECT c.id, c.team_id AS "teamId", c.type, c.minute,
              c.identifying_note AS "identifyingNote", c.player_id AS "playerId",
              t.name AS "teamName",
              (p.first_name || ' ' || p.last_name) AS "playerName"
         FROM cards c
         JOIN teams t ON t.id = c.team_id
         LEFT JOIN players p ON p.id = c.player_id
        WHERE c.fixture_id = $1
        ORDER BY c.created_at`,
      [fixtureId],
    );
    res.json({ cards: rows });
  });

  /**
   * Setting a score is idempotent, so an offline retry is harmless -- the
   * second arrival simply writes the same numbers again.
   */
  router.put('/fixtures/:id/score', requireAuth, async (req, res) => {
    const fixtureId = req.params.id;
    if (!fixtureId) throw new HttpError(400, 'No game specified.', 'invalid_input');

    const parsed = scoreSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Check the scores.', 'invalid_input');
    const d = parsed.data;

    const user = req.session.user!;
    await assertCanScoreFixture(db, user.id, user.role, fixtureId);

    const hasPenalties = d.homePenalties !== undefined && d.awayPenalties !== undefined;
    if (hasPenalties && d.homeScore !== d.awayScore) {
      throw new HttpError(
        400,
        'Penalties only apply when the game finished level.',
        'penalties_without_draw',
      );
    }
    if (hasPenalties && d.homePenalties === d.awayPenalties) {
      throw new HttpError(400, 'A shootout cannot end level.', 'penalties_tied');
    }

    const { rows: before } = await db.query(
      'SELECT home_score, away_score FROM fixtures WHERE id = $1',
      [fixtureId],
    );

    await db.query(
      `UPDATE fixtures
          SET home_score = $1, away_score = $2,
              home_penalties = $3, away_penalties = $4,
              status = $5, updated_at = now()
        WHERE id = $6`,
      [
        d.homeScore,
        d.awayScore,
        d.homePenalties ?? null,
        d.awayPenalties ?? null,
        d.status ?? 'complete',
        fixtureId,
      ],
    );

    await recordAudit(db, {
      actorUserId: user.id,
      entityType: 'fixture',
      entityId: fixtureId,
      action: 'set_score',
      before: before[0],
      after: d,
    });

    res.json({ ok: true });
  });

  /**
   * Put a game back to having no result at all.
   *
   * Distinct from saving 0-0: a nil-nil draw is a played game worth a point to
   * each side, and "nobody has entered this yet" is not. Without this there is
   * no way back from a mistyped score, and the standings inherit it.
   *
   * Sign-offs go with it -- a captain signed for a score that no longer
   * exists. Cards deliberately stay: they were shown regardless of the score,
   * and quietly binning a red card is a bigger loss than an extra step to
   * remove one.
   */
  router.delete('/fixtures/:id/score', requireAuth, async (req, res) => {
    const fixtureId = req.params.id;
    if (!fixtureId) throw new HttpError(400, 'No game specified.', 'invalid_input');

    const user = req.session.user!;
    await assertCanScoreFixture(db, user.id, user.role, fixtureId);

    const { rows: before } = await db.query<{
      home_score: number | null;
      away_score: number | null;
      status: string;
    }>('SELECT home_score, away_score, status FROM fixtures WHERE id = $1', [fixtureId]);

    await db.query(
      `UPDATE fixtures
          SET home_score = NULL, away_score = NULL,
              home_penalties = NULL, away_penalties = NULL,
              status = 'scheduled', updated_at = now()
        WHERE id = $1`,
      [fixtureId],
    );

    const { rowCount: signoffsRemoved } = await db.query(
      'DELETE FROM match_signoffs WHERE fixture_id = $1',
      [fixtureId],
    );

    await recordAudit(db, {
      actorUserId: user.id,
      entityType: 'fixture',
      entityId: fixtureId,
      action: 'clear_score',
      before: before[0],
      after: { cleared: true, signoffsRemoved },
    });

    res.json({ ok: true, signoffsRemoved: signoffsRemoved ?? 0 });
  });

  router.post('/fixtures/:id/cards', requireAuth, async (req, res) => {
    const fixtureId = req.params.id;
    if (!fixtureId) throw new HttpError(400, 'No game specified.', 'invalid_input');

    const parsed = cardSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Check the card details.', 'invalid_input');
    const d = parsed.data;

    const user = req.session.user!;
    await assertCanScoreFixture(db, user.id, user.role, fixtureId);

    // ON CONFLICT makes a retry return the original card rather than a second
    // one. Without this, one dead zone turns a yellow into two.
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO cards (fixture_id, team_id, type, minute, identifying_note,
                          recorded_by, client_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (client_id) WHERE client_id IS NOT NULL DO UPDATE
         SET minute = EXCLUDED.minute
       RETURNING id`,
      [
        fixtureId,
        d.teamId,
        d.type,
        d.minute ?? null,
        d.identifyingNote ?? null,
        user.id,
        d.clientId ?? null,
      ],
    );

    await recordAudit(db, {
      actorUserId: user.id,
      entityType: 'card',
      entityId: rows[0]!.id,
      action: 'record',
      after: { fixtureId, teamId: d.teamId, type: d.type, minute: d.minute },
    });

    res.status(201).json({ id: rows[0]!.id });
  });

  router.delete('/fixtures/:id/cards/:cardId', requireAuth, async (req, res) => {
    const { id: fixtureId, cardId } = req.params;
    if (!fixtureId || !cardId) throw new HttpError(400, 'Missing ids.', 'invalid_input');

    const user = req.session.user!;
    await assertCanScoreFixture(db, user.id, user.role, fixtureId);

    const { rows } = await db.query(
      'DELETE FROM cards WHERE id = $1 AND fixture_id = $2 RETURNING type, team_id',
      [cardId, fixtureId],
    );
    if (!rows[0]) throw new HttpError(404, 'No such card.', 'not_found');

    await recordAudit(db, {
      actorUserId: user.id,
      entityType: 'card',
      entityId: cardId,
      action: 'delete',
      before: rows[0],
    });

    res.status(204).end();
  });

  /**
   * Match-end sign-off. Both captains confirm the score, and the carded team's
   * captain names the players -- the referee could not, since jerseys have no
   * numbers and they do not know the teams.
   */
  router.post('/fixtures/:id/signoff', requireAuth, async (req, res) => {
    const fixtureId = req.params.id;
    if (!fixtureId) throw new HttpError(400, 'No game specified.', 'invalid_input');

    const parsed = signoffSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'A captain name is required.', 'invalid_input');
    const d = parsed.data;

    const user = req.session.user!;
    await assertCanScoreFixture(db, user.id, user.role, fixtureId);

    const { rows: scoreRows } = await db.query<{ home_score: number | null }>(
      'SELECT home_score FROM fixtures WHERE id = $1',
      [fixtureId],
    );
    if (scoreRows[0]?.home_score == null) {
      throw new HttpError(400, 'Enter the score before signing off.', 'no_score');
    }

    for (const attribution of d.cardAttributions ?? []) {
      await db.query(
        `UPDATE cards SET player_id = $1
          WHERE id = $2 AND fixture_id = $3 AND team_id = $4`,
        [attribution.playerId, attribution.cardId, fixtureId, d.teamId],
      );
    }

    await db.query(
      `INSERT INTO match_signoffs (fixture_id, team_id, captain_name)
       VALUES ($1,$2,$3)
       ON CONFLICT (fixture_id, team_id) DO UPDATE
         SET captain_name = EXCLUDED.captain_name, signed_at = now()`,
      [fixtureId, d.teamId, d.captainName],
    );

    await recordAudit(db, {
      actorUserId: user.id,
      entityType: 'fixture',
      entityId: fixtureId,
      action: 'signoff',
      after: { teamId: d.teamId, captainName: d.captainName },
    });

    const { rows: counted } = await db.query<{ n: string }>(
      'SELECT count(*) AS n FROM match_signoffs WHERE fixture_id = $1',
      [fixtureId],
    );

    res.status(201).json({ signoffCount: Number(counted[0]!.n) });
  });

  return router;
}

/** Admin: assign a referee to the fields they will cover. */
export function refAssignmentRoutes(db: Db): Router {
  const router = Router();

  router.put('/:userId/fields', requireAuth, async (req, res) => {
    if (req.session.user!.role !== 'admin') {
      throw new HttpError(403, 'Only an admin can assign referees.', 'forbidden');
    }
    const userId = req.params.userId;
    const parsed = z.object({ fieldIds: z.array(z.string().uuid()) }).safeParse(req.body);
    if (!userId || !parsed.success) {
      throw new HttpError(400, 'A list of field ids is required.', 'invalid_input');
    }

    await db.query('DELETE FROM ref_field_assignments WHERE user_id = $1', [userId]);
    for (const fieldId of parsed.data.fieldIds) {
      await db.query(
        'INSERT INTO ref_field_assignments (user_id, field_id) VALUES ($1,$2)',
        [userId, fieldId],
      );
    }

    await recordAudit(db, {
      actorUserId: req.session.user!.id,
      entityType: 'user',
      entityId: userId,
      action: 'assign_fields',
      after: parsed.data,
    });

    res.status(204).end();
  });

  return router;
}
