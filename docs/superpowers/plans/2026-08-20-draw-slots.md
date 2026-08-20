# Draw Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a division's schedule be generated as a framework of unnamed draw slots before teams are assigned, then bind teams to slots at a draw party in one audited, reversible act.

**Architecture:** A pool fixture stops pointing at a team and points at a draw slot instead, reusing the `home_ref`/`home_team_id` mechanism the playoff bracket already uses. The pairing algorithm is untouched. The scheduler learns that a draw slot carries an identity (unlike "winner of SF1"), so rest gaps in the framework are real. Binding a team writes the resolved team ids onto that pool's fixtures, so the scoring path never meets a draw slot.

**Tech Stack:** npm workspaces monorepo — `packages/engine` (pure TypeScript, no I/O), `apps/api` (Express + TypeScript + PostgreSQL), `apps/web` (Vite + React 18 + TypeScript). Vitest everywhere.

**Spec:** `docs/superpowers/specs/2026-08-20-draw-slots-design.md`

## Global Constraints

- **Commit messages are sentences, not conventional commits.** This repo writes `Let a message be written now and revealed later`, not `feat: add scheduled messages`. Never use a `feat:`/`fix:` prefix. Present tense, describes the change in the product's terms.
- **The engine imports no I/O.** `packages/engine` may not import a database driver, HTTP framework, or anything with side effects.
- **Everything is gated on `teams.draw_slot` being non-null.** A division that has never run a draw must generate byte-identically to today. Task 11 is the test that proves it; do not skip it.
- **Nothing lands in the 2026 event's path before the freeze on Tue 25 August 2026.** This work is additive and dormant.
- **Every admin write is audited** via `recordAudit(db, {actorUserId, entityType, entityId, action, before, after})` from `apps/api/src/auth/audit.ts`.
- **Labels:** a draw slot renders `Poet #1`. Ordinals (`Poet 1st`) are reserved for standings. The draw never renders an ordinal; the table never renders a `#`.
- **Run tests from the repo root** with `npm test --workspace <name>`, or a single file with `npx vitest run <path>` from inside that workspace.

---

### Task 1: The `drawSlot` reference and its label

**Files:**
- Modify: `packages/engine/src/types.ts:21-34` (the `TeamRef` union)
- Modify: `packages/engine/src/resolve.ts` (`resolveTeamRef`)
- Test: `packages/engine/tests/resolve.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `{ kind: 'drawSlot'; poolId: PoolId; slot: number }` as a `TeamRef` variant; `resolveTeamRef` returns `{ teamId: null, label: 'Poet #1' }` for it.

- [ ] **Step 1: Write the failing test**

Add to `packages/engine/tests/resolve.test.ts`:

```ts
it('labels a draw slot with a hash, never an ordinal', () => {
  const ctx = {
    standingsByPool: new Map(),
    outcomes: new Map(),
    poolComplete: new Set<string>(),
    poolNames: new Map([['pool-poet', 'Poet']]),
  };

  const resolved = resolveTeamRef({ kind: 'drawSlot', poolId: 'pool-poet', slot: 1 }, ctx);

  expect(resolved.teamId).toBeNull();
  expect(resolved.label).toBe('Poet #1');
});

it('keeps the ordinal label for a finishing position', () => {
  const ctx = {
    standingsByPool: new Map(),
    outcomes: new Map(),
    poolComplete: new Set<string>(),
    poolNames: new Map([['pool-poet', 'Poet']]),
  };

  const resolved = resolveTeamRef({ kind: 'poolPosition', poolId: 'pool-poet', position: 1 }, ctx);

  expect(resolved.label).toContain('1st');
  expect(resolved.label).not.toContain('#');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/resolve.test.ts` from `packages/engine`
Expected: FAIL — TypeScript rejects `kind: 'drawSlot'` as not assignable to `TeamRef`.

- [ ] **Step 3: Add the union member**

In `packages/engine/src/types.ts`, inside the `TeamRef` union, immediately after the `team` variant:

```ts
  /**
   * The team drawn into a numbered position in a pool, before anyone knows
   * which team that is. Unlike a finishing position this does not depend on
   * any result -- it is settled by a draw, and until the draw happens it is
   * still one identifiable participant with one set of kickoff times.
   */
  | { kind: 'drawSlot'; poolId: PoolId; slot: number }
```

- [ ] **Step 4: Resolve it**

In `packages/engine/src/resolve.ts`, add a case to the switch in `resolveTeamRef`, above `poolPosition`:

```ts
    case 'drawSlot': {
      const pool = ctx.poolNames?.get(ref.poolId);
      // No standings lookup: a draw slot is resolved by the draw, which the
      // API writes onto the fixture. If we are still looking at the ref, the
      // draw has not happened.
      return { teamId: null, label: pool ? `${pool} #${ref.slot}` : `#${ref.slot}` };
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/resolve.test.ts` from `packages/engine`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/types.ts packages/engine/src/resolve.ts packages/engine/tests/resolve.test.ts
git commit -m "Give a pool position a name before it has a team"
```

---

### Task 2: The scheduler learns which references carry an identity

This is the bug the whole feature rests on. `scheduling.ts:92` treats every non-`team` ref as constraining nothing, which is right for a semi-final and wrong for a draw slot.

**Files:**
- Modify: `packages/engine/src/types.ts` (add `ParticipantId`, export `refIdentity`)
- Modify: `packages/engine/src/scheduling.ts:93-99` (`concreteTeams`), `:397-405` (`measureQuality`)
- Test: `packages/engine/tests/scheduling.test.ts`

**Interfaces:**
- Consumes: the `drawSlot` variant from Task 1.
- Produces: `refIdentity(ref: TeamRef): ParticipantId | null` exported from `packages/engine/src/types.ts`. Returns `team:<uuid>` for a team, `draw:<poolId>#<slot>` for a draw slot, `null` for anything result-dependent.

- [ ] **Step 1: Write the failing test**

Add to `packages/engine/tests/scheduling.test.ts`:

```ts
import { refIdentity } from '../src/types.js';

describe('participant identity', () => {
  it('gives a draw slot an identity so it can be scheduled against itself', () => {
    expect(refIdentity({ kind: 'drawSlot', poolId: 'p1', slot: 3 })).toBe('draw:p1#3');
  });

  it('gives a team an identity', () => {
    expect(refIdentity({ kind: 'team', teamId: 'abc' })).toBe('team:abc');
  });

  it('gives a result-dependent reference no identity', () => {
    expect(refIdentity({ kind: 'fixtureWinner', fixtureId: 'sf1' })).toBeNull();
    expect(refIdentity({ kind: 'poolPosition', poolId: 'p1', position: 1 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scheduling.test.ts` from `packages/engine`
Expected: FAIL — `refIdentity` is not exported.

- [ ] **Step 3: Implement `refIdentity`**

At the end of the `TeamRef` block in `packages/engine/src/types.ts`:

```ts
/**
 * A participant is anything that can only be in one place at one time.
 *
 * A team is one. So is a draw slot: nobody knows its name yet, but exactly one
 * team will play all of its games, so two of its fixtures twenty minutes apart
 * is a real clash. "Winner of SF1" is not one -- it depends on a result that
 * has not happened, and constrains nothing until it does.
 */
export type ParticipantId = string;

export function refIdentity(ref: TeamRef): ParticipantId | null {
  switch (ref.kind) {
    case 'team':
      return `team:${ref.teamId}`;
    case 'drawSlot':
      return `draw:${ref.poolId}#${ref.slot}`;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run the identity test**

Run: `npx vitest run tests/scheduling.test.ts` from `packages/engine`
Expected: PASS

- [ ] **Step 5: Write the failing regression test for rest gaps**

This is the test that protects the printed framework. Add to `packages/engine/tests/scheduling.test.ts`:

```ts
it('keeps two games on the same draw slot apart', () => {
  const fixtures = [
    { id: 'f1', stageId: 's1', poolId: 'p1',
      home: { kind: 'drawSlot' as const, poolId: 'p1', slot: 1 },
      away: { kind: 'drawSlot' as const, poolId: 'p1', slot: 2 } },
    { id: 'f2', stageId: 's1', poolId: 'p1',
      home: { kind: 'drawSlot' as const, poolId: 'p1', slot: 1 },
      away: { kind: 'drawSlot' as const, poolId: 'p1', slot: 3 } },
  ];

  const scheduled = scheduleFixtures(fixtures, {
    fieldIds: ['field-a', 'field-b'],
    timing: { halfMinutes: 14, halftimeMinutes: 2, changeoverMinutes: 5 },
    minRestMinutes: 30,
  });

  const first = scheduled.find((f) => f.id === 'f1')!;
  const second = scheduled.find((f) => f.id === 'f2')!;
  const gap = Math.abs(first.kickoffOffsetMinutes - second.kickoffOffsetMinutes);

  expect(gap).toBeGreaterThanOrEqual(30);
});
```

Check the exact `scheduleFixtures` options object against the existing tests in this file and match them — the shape above must mirror what the other tests in `scheduling.test.ts` already pass.

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/scheduling.test.ts` from `packages/engine`
Expected: FAIL — both games land in the same wave, gap is 0.

- [ ] **Step 7: Use identity in the scheduler**

Replace `concreteTeams` at `packages/engine/src/scheduling.ts:92-99`:

```ts
/**
 * Participants we can constrain. A team and a draw slot both name someone who
 * can only play one game at a time; an unresolved bracket reference does not.
 */
function participantsOf(fixture: Fixture): ParticipantId[] {
  const found: ParticipantId[] = [];
  for (const ref of [fixture.home, fixture.away]) {
    const id = refIdentity(ref);
    if (id !== null) found.push(id);
  }
  return found;
}
```

Update the three call sites — `scheduling.ts:148`, `:206`, `:248` — to call `participantsOf`, and change the local variable type annotations from `TeamId[]` to `ParticipantId[]`. Import `ParticipantId` and `refIdentity` from `./types.js`.

In `measureQuality` at `:397-405`, replace the `ref.kind !== 'team'` filter:

```ts
  const byParticipant = new Map<ParticipantId, number[]>();

  for (const fixture of scheduled) {
    for (const ref of [fixture.home, fixture.away]) {
      const id = refIdentity(ref);
      if (id === null) continue;
      const kickoffs = byParticipant.get(id) ?? [];
      kickoffs.push(fixture.kickoffOffsetMinutes);
      byParticipant.set(id, kickoffs);
    }
  }
```

Rename the remaining `byTeam` uses in that function to `byParticipant`.

- [ ] **Step 8: Run the whole engine suite**

Run: `npm test --workspace packages/engine` from the repo root
Expected: PASS, 91 existing tests plus the new ones. If an existing test now fails, stop — it means the identity change altered bracket scheduling, which it must not.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/types.ts packages/engine/src/scheduling.ts packages/engine/tests/scheduling.test.ts
git commit -m "Treat a drawn position as someone who can only play one game at a time"
```

---

### Task 3: Conflict detection sees draw slots

**Files:**
- Modify: `packages/engine/src/conflicts.ts:12-24` (`ScheduleEntry`), `:56-60` (`sharedTeams`), `:112-116`
- Test: `packages/engine/tests/conflicts.test.ts`

**Interfaces:**
- Consumes: `ParticipantId` from Task 2.
- Produces: `ScheduleEntry` gains optional `homeParticipant?: ParticipantId | null` and `awayParticipant?: ParticipantId | null`. When unset, behaviour is exactly as today.

- [ ] **Step 1: Write the failing test**

Add to `packages/engine/tests/conflicts.test.ts`:

```ts
it('catches a draw slot booked into two games at once', () => {
  const conflicts = detectConflicts(
    [
      { id: 'f1', fieldId: 'a', startMinutes: 0, durationMinutes: 30,
        homeTeamId: null, awayTeamId: null,
        homeParticipant: 'draw:p1#1', awayParticipant: 'draw:p1#2' },
      { id: 'f2', fieldId: 'b', startMinutes: 0, durationMinutes: 30,
        homeTeamId: null, awayTeamId: null,
        homeParticipant: 'draw:p1#1', awayParticipant: 'draw:p1#3' },
    ],
    { minRestMinutes: 30, teamName: (id) => (id === 'draw:p1#1' ? 'Poet #1' : id) },
  );

  const clash = conflicts.find((c) => c.kind === 'team_double_booked');
  expect(clash).toBeDefined();
  expect(clash!.message).toContain('Poet #1');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/conflicts.test.ts` from `packages/engine`
Expected: FAIL — TypeScript rejects the unknown properties, and no clash is found.

- [ ] **Step 3: Add the optional fields and an accessor**

In `packages/engine/src/conflicts.ts`, add to `ScheduleEntry` after `awayTeamId`:

```ts
  /**
   * Who is playing, when that is not a team id -- a draw slot before the draw.
   * Falls back to the team ids, so an entry that does not set these behaves
   * exactly as it always has.
   */
  homeParticipant?: ParticipantId | null;
  awayParticipant?: ParticipantId | null;
```

Add the accessor next to `sharedTeams`:

```ts
function sidesOf(e: ScheduleEntry): ParticipantId[] {
  return [e.homeParticipant ?? e.homeTeamId, e.awayParticipant ?? e.awayTeamId]
    .filter((id): id is ParticipantId => id !== null && id !== undefined);
}
```

Rewrite `sharedTeams` to use it:

```ts
function sharedTeams(a: ScheduleEntry, b: ScheduleEntry): ParticipantId[] {
  const second = new Set(sidesOf(b));
  return sidesOf(a).filter((id) => second.has(id));
}
```

At `:112`, replace `for (const teamId of [entry.homeTeamId, entry.awayTeamId])` with `for (const teamId of sidesOf(entry))` and drop the now-dead `if (!teamId) continue;`.

Import `ParticipantId` from `./types.js`.

- [ ] **Step 4: Run the tests**

Run: `npm test --workspace packages/engine` from the repo root
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/conflicts.ts packages/engine/tests/conflicts.test.ts
git commit -m "Let the clash check see a position that has no team yet"
```

---

### Task 4: Generate pool fixtures over entrants

**Files:**
- Modify: `packages/engine/src/fixtures.ts:10-13` (`PoolInput`), `:33-54`, `:56-84` (`validatePool`), `:86-143`
- Test: `packages/engine/tests/fixtures.test.ts`

**Interfaces:**
- Consumes: `drawSlot` from Task 1.
- Produces: `PoolInput` becomes `{ id: PoolId; entrants: TeamRef[] }`. Two helpers exported from `fixtures.ts`:
  - `teamEntrants(teamIds: TeamId[]): TeamRef[]`
  - `drawSlotEntrants(poolId: PoolId, count: number): TeamRef[]`

- [ ] **Step 1: Write the failing test**

Add to `packages/engine/tests/fixtures.test.ts`:

```ts
it('emits the same six pairings whether entrants are teams or draw slots', () => {
  const byTeam = generatePoolFixtures('s1', [
    { id: 'p1', entrants: teamEntrants(['t1', 't2', 't3', 't4']) },
  ], 3);

  const bySlot = generatePoolFixtures('s1', [
    { id: 'p1', entrants: drawSlotEntrants('p1', 4) },
  ], 3);

  expect(bySlot).toHaveLength(6);
  expect(byTeam).toHaveLength(6);

  const shape = (refs: typeof bySlot) =>
    refs.map((f) => {
      const index = (r: TeamRef) =>
        r.kind === 'team' ? ['t1', 't2', 't3', 't4'].indexOf(r.teamId) + 1
        : r.kind === 'drawSlot' ? r.slot
        : 0;
      return `${index(f.home)}v${index(f.away)}`;
    });

  expect(shape(bySlot)).toEqual(shape(byTeam));
  expect(shape(bySlot)).toEqual(['1v2', '2v3', '3v4', '4v1', '1v3', '2v4']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/fixtures.test.ts` from `packages/engine`
Expected: FAIL — `entrants`, `teamEntrants` and `drawSlotEntrants` do not exist.

- [ ] **Step 3: Change `PoolInput` and add the helpers**

In `packages/engine/src/fixtures.ts`:

```ts
export interface PoolInput {
  id: PoolId;
  /**
   * The pool's places, in order. Pairing is by position around a circle, so
   * this order is the whole of what decides who plays whom -- which is exactly
   * what a draw party draws for.
   */
  entrants: TeamRef[];
}

export function teamEntrants(teamIds: TeamId[]): TeamRef[] {
  return teamIds.map((teamId) => ({ kind: 'team', teamId }));
}

export function drawSlotEntrants(poolId: PoolId, count: number): TeamRef[] {
  return Array.from({ length: count }, (_, i) => ({
    kind: 'drawSlot' as const,
    poolId,
    slot: i + 1,
  }));
}
```

- [ ] **Step 4: Update the generator internals**

In `validatePool`, replace `pool.teamIds.length` with `pool.entrants.length` (three occurrences: the `n` binding and the two message templates that mention team counts — keep the wording, it is still accurate).

In `generateForPool`, replace the `teams`/`at` block:

```ts
  const entrants = pool.entrants;
  const n = entrants.length;
  const fixtures: Fixture[] = [];

  const fullRings = Math.floor(gamesPerTeam / 2);
  const needsMatching = gamesPerTeam % 2 === 1;

  const at = (i: number): TeamRef => {
    const ref = entrants[i % n];
    if (ref === undefined) {
      throw new FixtureGenerationError(`Pool "${pool.id}": entrant index ${i} out of range.`);
    }
    return ref;
  };
```

Change `makeFixture` to take refs:

```ts
function makeFixture(
  stageId: StageId,
  poolId: PoolId,
  home: TeamRef,
  away: TeamRef,
  index: number,
): Fixture {
  return {
    id: `${stageId}:${poolId}:${index + 1}`,
    stageId,
    poolId,
    home,
    away,
  };
}
```

Also update the comment on `generatePoolFixtures` that says "every team is paired with the team d positions around the circle" to say "every entrant is paired with the entrant d positions around the circle".

- [ ] **Step 5: Fix every existing caller and test**

Run: `npm test --workspace packages/engine` from the repo root
Expected: FAIL — existing tests pass `teamIds`.

Update each failing call site to wrap with `teamEntrants([...])`. Do not change any expected value; only the input shape changes. Files likely affected: `packages/engine/tests/fixtures.test.ts`, `byes.test.ts`, `generality.test.ts`, `spread.test.ts`, `sharedFields.test.ts`.

- [ ] **Step 6: Keep the API compiling**

The API calls this at `apps/api/src/services/scheduleBuilder.ts:258` and its own `StagePlan` pools carry `teamIds`. Keep that DB-shaped type as it is and map at the call site:

```ts
    return generatePoolFixtures(
      stage.id,
      poolsWithTeams.map((p) => ({ id: p.id, entrants: teamEntrants(p.teamIds) })),
      stage.config.gamesPerTeam,
    );
```

Import `teamEntrants` alongside the existing `generatePoolFixtures` import at `scheduleBuilder.ts:4`.

- [ ] **Step 7: Run the whole suite**

Run: `npm test` from the repo root
Expected: PASS across engine, API and web. Every existing expectation must be unchanged — if one needed editing, the pairing maths moved and that is a bug. Each task must leave the repo green; do not move on with a red suite.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/fixtures.ts packages/engine/tests/ apps/api/src/services/scheduleBuilder.ts
git commit -m "Let a pool's places be drawn positions, not only teams"
```

---

### Task 5: The migration

**Files:**
- Create: `apps/api/migrations/011_team_draw_slot.sql`

**Interfaces:**
- Produces: `teams.draw_slot INTEGER NULL`, unique per pool where set.

- [ ] **Step 1: Write the migration**

```sql
-- The position a team was drawn into, at a draw party, before it played.
--
-- SCORES lays the schedule out from the team count first: real pitches, real
-- kickoff times, no names. Teams are then drawn into those positions in front
-- of a room, and what a team is drawn into settles its day -- who it plays,
-- when, and whether it sits out the first round. That is the fundraiser.
--
-- Distinct from a finishing position. "Poet #1" is where a team was drawn;
-- "Poet 1st" is where it ended up. Nothing displays both as a rank.
--
-- Null means this division does not run a draw, which is every division that
-- exists today. Ordering falls back to team name exactly as before.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS draw_slot INTEGER NULL;

COMMENT ON COLUMN teams.draw_slot IS
    'Position drawn at the draw party, 1-based within the pool. NULL when no draw was held.';

-- Two teams cannot occupy one position. Partial, so any number of teams may
-- sit undrawn while the draw is in progress.
CREATE UNIQUE INDEX IF NOT EXISTS teams_pool_draw_slot_idx
    ON teams (pool_id, draw_slot)
    WHERE draw_slot IS NOT NULL;

-- A position without a pool identifies nothing, and Postgres treats NULL pool
-- ids as distinct -- so without this the index above would admit two teams
-- both claiming slot 1 of no pool.
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_draw_slot_needs_pool;
ALTER TABLE teams ADD CONSTRAINT teams_draw_slot_needs_pool
    CHECK (draw_slot IS NULL OR pool_id IS NOT NULL);
```

- [ ] **Step 2: Apply it**

Run the project's migration path (the API container runs migrations on startup; locally, apply against your dev database the same way migrations 001–010 are applied).
Expected: no error, and `\d teams` shows the column, index and constraint.

- [ ] **Step 3: Verify the constraint bites**

Run against the dev database:

```sql
UPDATE teams SET draw_slot = 1, pool_id = NULL WHERE id = (SELECT id FROM teams LIMIT 1);
```

Expected: ERROR, `teams_draw_slot_needs_pool` violated.

- [ ] **Step 4: Commit**

```bash
git add apps/api/migrations/011_team_draw_slot.sql
git commit -m "Record the position a team was drawn into"
```

---

### Task 6: Generate a framework instead of a schedule

**Files:**
- Modify: `apps/api/src/services/scheduleBuilder.ts:125-132` (the pool query), and the `buildFixtures` pool branch at `:242-258`
- Test: `apps/api/tests/scheduleBuilder.test.ts`

**Interfaces:**
- Consumes: `teamEntrants`, `drawSlotEntrants` from Task 4.
- Produces: a pool stage whose teams all have `draw_slot` set generates fixtures carrying `drawSlot` refs; a pool stage with no slots generates exactly what it does today.

- [ ] **Step 1: Order by draw slot, falling back to name**

Replace the query at `apps/api/src/services/scheduleBuilder.ts:126`:

```ts
    const { rows: poolRows } = await db.query<{ id: string; team_ids: string[] | null }>(
      // Drawn positions first, in order. A team with no drawn position sorts
      // after them by name, which is what every division did before the draw
      // existed and what a division without one still does.
      `SELECT p.id,
              array_remove(array_agg(t.id ORDER BY t.draw_slot NULLS LAST, t.name), NULL) AS team_ids
         FROM pools p LEFT JOIN teams t ON t.pool_id = p.id
        WHERE p.stage_id = $1
        GROUP BY p.id
        ORDER BY p.sort_order, p.name`,
      [stage.id],
    );
```

The row shape is unchanged, so nothing downstream needs touching. Only the ordering inside `array_agg` moves.

- [ ] **Step 2: Choose entrants in `buildFixtures`**

In the `kind === 'pool'` branch at `:246-258`:

```ts
The pool branch keeps the mapping added in Task 4 Step 6 and is otherwise unchanged. Ordering is the whole of this task: with every team drawn, `ORDER BY t.draw_slot NULLS LAST, t.name` already puts them in slot order, so the same games come out with concrete teams in them. Generating against `drawSlot` refs is only needed **before** teams exist, which is Task 7.

- [ ] **Step 3: Write the test that pins the ordering**

`apps/api/tests/scheduleBuilder.test.ts` builds a `DivisionPlan` by hand through its local `plan()` helper, with `pools: [{ id: 'p1', teamIds: [...] }]`. The order of that array is what the new SQL controls, so the test asserts that order decides the pairings:

```ts
it('pairs by the order the pool is given, which is the draw order', () => {
  const drawn = plan();
  drawn.stages[0]!.pools = [{ id: 'p1', teamIds: ['t4', 't1', 't3', 't2'] }];

  const fixtures = buildSchedule(drawn).filter((f) => f.poolId === 'p1');
  const pairs = fixtures.map((f) =>
    `${f.home.kind === 'team' ? f.home.teamId : '?'}v${f.away.kind === 'team' ? f.away.teamId : '?'}`,
  );

  // Circle pairing over the given order: 1v2, 2v3, 3v4, 4v1, then 1v3, 2v4.
  expect(pairs).toEqual(['t4vt1', 't1vt3', 't3vt2', 't2vt4', 't4vt3', 't1vt2']);
});
```

Check `buildSchedule`'s real return shape against the other tests in this file before writing the filter — if it returns a wrapper rather than a bare array, reach through it the same way they do.

- [ ] **Step 4: Run the API tests**

Run: `npm test --workspace apps/api` from the repo root
Expected: PASS. Note that the integration tests skip without `TEST_DATABASE_URL`; `scheduleBuilder.test.ts` is a unit test and runs regardless.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/scheduleBuilder.ts apps/api/tests/scheduleBuilder.test.ts
git commit -m "Order a pool by the draw when there is one, by name when there is not"
```

---

### Task 7: Generate the framework before teams exist

**Files:**
- Modify: `apps/api/src/services/scheduleBuilder.ts` (`buildFixtures` pool branch from Task 6)
- Modify: `apps/api/src/routes/events.ts` (new endpoint)
- Test: `apps/api/tests/drawFramework.integration.test.ts` (create)

**Interfaces:**
- Consumes: `drawSlotEntrants` from Task 4; the `slotCount` field added below.
- Produces: `POST /api/setup/divisions/:divisionId/framework { slotsPerPool: number }` generates a schedule whose pool fixtures carry `drawSlot` refs and whose `home_team_id`/`away_team_id` are null.

- [ ] **Step 1: Add `slotCount` to the pool plan**

Where the stage's pools are assembled in `scheduleBuilder.ts`, add `slotCount: number` to the pool object alongside `teamIds`, defaulting to `0`. The framework endpoint sets it; ordinary generation leaves it at `0`. Add it to the `DivisionPlan`/`StagePlan` type the same file exports, as an optional field so `scheduleBuilder.test.ts`'s hand-built plans keep compiling.

In `buildFixtures`, replace the pool branch's filter and mapping from Task 4 Step 6:

```ts
    const poolsToBuild = stage.pools.filter(
      (p) => p.teamIds.length > 0 || (p.slotCount ?? 0) > 0,
    );
    if (poolsToBuild.length === 0) {
      throw new HttpError(
        400,
        'No teams have been assigned to pools yet.',
        'no_teams_assigned',
      );
    }

    return generatePoolFixtures(
      stage.id,
      poolsToBuild.map((p) => ({
        id: p.id,
        // A framework is laid out against positions, before anyone is in a
        // pool. Everything else is laid out against the teams themselves.
        entrants:
          (p.slotCount ?? 0) > 0
            ? drawSlotEntrants(p.id, p.slotCount!)
            : teamEntrants(p.teamIds),
      })),
      stage.config.gamesPerTeam,
    );
```

Import `drawSlotEntrants` alongside `teamEntrants`.

- [ ] **Step 2: Write the failing integration test**

Create `apps/api/tests/drawFramework.integration.test.ts`, following the harness in `apps/api/tests/bracketRefs.integration.test.ts` (same app, same real database, same skip-without-`TEST_DATABASE_URL` guard):

```ts
it('lays out a framework with kickoff times and no teams', async () => {
  const { divisionId } = await seedDivision({ pools: 2, teams: 0 });

  const res = await request(app)
    .post(`/api/setup/divisions/${divisionId}/framework`)
    .set('Cookie', adminCookie)
    .send({ slotsPerPool: 4 });

  expect(res.status).toBe(201);

  const fixtures = await db.query(
    `SELECT home_ref, away_ref, home_team_id, kickoff_at FROM fixtures
      WHERE stage_id = $1 ORDER BY kickoff_at`,
    [res.body.stageId],
  );

  expect(fixtures.rows).toHaveLength(12);
  expect(fixtures.rows[0].home_team_id).toBeNull();
  expect(fixtures.rows[0].home_ref.kind).toBe('drawSlot');
  expect(fixtures.rows[0].kickoff_at).not.toBeNull();
});

it('gives every slot enough rest', async () => {
  const { divisionId } = await seedDivision({ pools: 2, teams: 0 });
  await request(app)
    .post(`/api/setup/divisions/${divisionId}/framework`)
    .set('Cookie', adminCookie)
    .send({ slotsPerPool: 4 });

  const { rows } = await db.query(
    `SELECT home_ref, away_ref, kickoff_at FROM fixtures WHERE pool_id IS NOT NULL`,
  );

  const bySlot = new Map<string, Date[]>();
  for (const row of rows) {
    for (const ref of [row.home_ref, row.away_ref]) {
      const key = `${ref.poolId}#${ref.slot}`;
      bySlot.set(key, [...(bySlot.get(key) ?? []), new Date(row.kickoff_at)]);
    }
  }

  for (const [slot, times] of bySlot) {
    const sorted = times.sort((a, b) => a.getTime() - b.getTime());
    for (let i = 1; i < sorted.length; i++) {
      const gapMinutes = (sorted[i]!.getTime() - sorted[i - 1]!.getTime()) / 60000;
      expect(gapMinutes, `${slot} rest gap`).toBeGreaterThanOrEqual(30);
    }
  }
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test --workspace apps/api` with `TEST_DATABASE_URL` set
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 4: Add the endpoint**

In `apps/api/src/routes/events.ts`, following the shape of the existing `auto-assign-pools` route at `:197`:

```ts
  /**
   * Lay out a division's schedule before anyone is in a pool.
   *
   * Produces real pitches and real kickoff times against numbered positions,
   * which is what a draw party draws for. Teams are bound to positions later;
   * nothing here is regenerated when they are.
   */
  router.post('/divisions/:divisionId/framework', ...admin, async (req, res) => {
    const divisionId = req.params.divisionId;
    const parsed = z.object({ slotsPerPool: z.number().int().min(2).max(32) }).safeParse(req.body);
    if (!divisionId || !parsed.success) {
      throw new HttpError(400, 'A number of positions per pool is required.', 'invalid_input');
    }

    const result = await buildAndSaveSchedule(db, {
      divisionId,
      slotsPerPool: parsed.data.slotsPerPool,
    });

    await recordAudit(db, {
      actorUserId: req.session?.userId ?? null,
      entityType: 'division',
      entityId: divisionId,
      action: 'framework_generated',
      after: { slotsPerPool: parsed.data.slotsPerPool },
    });

    res.status(201).json(result);
  });
```

Wire `slotsPerPool` through to the `slotCount` on each pool plan. Match the existing call into `scheduleBuilder` — read how the current generate route invokes it and follow that exactly, including its transaction handling and its warn-before-overwriting behaviour.

- [ ] **Step 5: Run the tests**

Run: `npm test --workspace apps/api` with `TEST_DATABASE_URL` set
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/scheduleBuilder.ts apps/api/src/routes/events.ts apps/api/tests/drawFramework.integration.test.ts
git commit -m "Lay out the day before anyone knows who is playing"
```

---

### Task 8: Bind a team to a slot, and unbind it

**Files:**
- Modify: `apps/api/src/routes/events.ts` (new endpoints, near the pool route at `:244`)
- Test: `apps/api/tests/drawBinding.integration.test.ts` (create)

**Interfaces:**
- Consumes: the framework from Task 7.
- Produces:
  - `PUT /api/events/teams/:teamId/draw { poolId: string, slot: number }` → 204
  - `DELETE /api/events/teams/:teamId/draw` → 204

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/drawBinding.integration.test.ts`:

```ts
it('binds a team into a slot and fills its fixtures', async () => {
  const { teamId, poolId } = await seedFramework({ slotsPerPool: 4 });

  const res = await request(app)
    .put(`/api/events/teams/${teamId}/draw`)
    .set('Cookie', adminCookie)
    .send({ poolId, slot: 3 });

  expect(res.status).toBe(204);

  const { rows } = await db.query(
    `SELECT home_team_id, away_team_id FROM fixtures
      WHERE pool_id = $1
        AND (home_ref->>'slot' = '3' OR away_ref->>'slot' = '3')`,
    [poolId],
  );

  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect([row.home_team_id, row.away_team_id]).toContain(teamId);
  }
});

it('refuses a slot that is already taken', async () => {
  const { teamId, otherTeamId, poolId } = await seedFramework({ slotsPerPool: 4 });
  await request(app).put(`/api/events/teams/${teamId}/draw`)
    .set('Cookie', adminCookie).send({ poolId, slot: 3 });

  const res = await request(app).put(`/api/events/teams/${otherTeamId}/draw`)
    .set('Cookie', adminCookie).send({ poolId, slot: 3 });

  expect(res.status).toBe(409);
});

it('unbinds a team and empties its fixtures again', async () => {
  const { teamId, poolId } = await seedFramework({ slotsPerPool: 4 });
  await request(app).put(`/api/events/teams/${teamId}/draw`)
    .set('Cookie', adminCookie).send({ poolId, slot: 3 });

  const res = await request(app).delete(`/api/events/teams/${teamId}/draw`)
    .set('Cookie', adminCookie);

  expect(res.status).toBe(204);

  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM fixtures
      WHERE home_team_id = $1 OR away_team_id = $1`,
    [teamId],
  );
  expect(rows[0].n).toBe(0);

  const team = await db.query('SELECT draw_slot FROM teams WHERE id = $1', [teamId]);
  expect(team.rows[0].draw_slot).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test --workspace apps/api` with `TEST_DATABASE_URL` set
Expected: FAIL — 404 on both routes.

- [ ] **Step 3: Implement binding**

In `apps/api/src/routes/events.ts`:

```ts
  /**
   * Draw a team into a position.
   *
   * One act: the team joins the pool and takes the position, and the games
   * that position plays get its name. Written rather than resolved on read
   * because a draw resolves once, by hand -- unlike a bracket, which resolves
   * continuously as results land and would go stale if it were stored.
   */
  router.put('/teams/:teamId/draw', ...admin, async (req, res) => {
    const teamId = req.params.teamId;
    const parsed = z
      .object({ poolId: z.string().uuid(), slot: z.number().int().min(1).max(32) })
      .safeParse(req.body);
    if (!teamId || !parsed.success) {
      throw new HttpError(400, 'A pool and a position are required.', 'invalid_input');
    }
    const { poolId, slot } = parsed.data;

    await db.transaction(async (tx) => {
      const before = await tx.query('SELECT pool_id, draw_slot FROM teams WHERE id = $1', [teamId]);
      if (!before.rowCount) throw new HttpError(404, 'No such team.', 'not_found');

      try {
        await tx.query('UPDATE teams SET pool_id = $1, draw_slot = $2 WHERE id = $3', [
          poolId, slot, teamId,
        ]);
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new HttpError(409, 'That position has already been drawn.', 'slot_taken');
        }
        throw error;
      }

      await tx.query(
        `UPDATE fixtures SET home_team_id = $1, updated_at = now()
          WHERE pool_id = $2 AND home_ref->>'kind' = 'drawSlot'
            AND (home_ref->>'slot')::int = $3`,
        [teamId, poolId, slot],
      );
      await tx.query(
        `UPDATE fixtures SET away_team_id = $1, updated_at = now()
          WHERE pool_id = $2 AND away_ref->>'kind' = 'drawSlot'
            AND (away_ref->>'slot')::int = $3`,
        [teamId, poolId, slot],
      );

      await recordAudit(tx, {
        actorUserId: req.session?.userId ?? null,
        entityType: 'team',
        entityId: teamId,
        action: 'drawn',
        before: before.rows[0],
        after: { pool_id: poolId, draw_slot: slot },
      });
    });

    res.status(204).end();
  });

  /** Undo a draw. A name pulled twice at a fundraiser is a certainty. */
  router.delete('/teams/:teamId/draw', ...admin, async (req, res) => {
    const teamId = req.params.teamId;
    if (!teamId) throw new HttpError(400, 'No team specified.', 'invalid_input');

    await db.transaction(async (tx) => {
      const before = await tx.query('SELECT pool_id, draw_slot FROM teams WHERE id = $1', [teamId]);
      if (!before.rowCount) throw new HttpError(404, 'No such team.', 'not_found');

      await tx.query(
        `UPDATE fixtures SET home_team_id = NULL, updated_at = now()
          WHERE home_team_id = $1 AND home_ref->>'kind' = 'drawSlot'`,
        [teamId],
      );
      await tx.query(
        `UPDATE fixtures SET away_team_id = NULL, updated_at = now()
          WHERE away_team_id = $1 AND away_ref->>'kind' = 'drawSlot'`,
        [teamId],
      );
      await tx.query('UPDATE teams SET draw_slot = NULL WHERE id = $1', [teamId]);

      await recordAudit(tx, {
        actorUserId: req.session?.userId ?? null,
        entityType: 'team',
        entityId: teamId,
        action: 'draw_undone',
        before: before.rows[0],
      });
    });

    res.status(204).end();
  });
```

Match `db.transaction` to whatever this codebase actually exposes — read how an existing multi-statement route (the delay endpoint, or the schedule generate route) opens a transaction and follow it exactly.

- [ ] **Step 4: Run the tests**

Run: `npm test --workspace apps/api` with `TEST_DATABASE_URL` set
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/events.ts apps/api/tests/drawBinding.integration.test.ts
git commit -m "Draw a team into a position, and let it be drawn again"
```

---

### Task 9: A fully tied pool does not fall back to draw order

**Files:**
- Modify: `packages/engine/src/standings.ts:56` (the comparator)
- Test: `packages/engine/tests/standings.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `computeStandings` orders teams tied through every tiebreaker deterministically by `teamId`, not by the order they were passed in.

**Context the implementer needs.** `computeStandings` takes a single object — `computeStandings(input: StandingsInput)` — and `StandingsRow` carries **no team name**, only `teamId`. The row already has `needsManualTiebreak: boolean`, documented as "true when the team is still tied after every computable tiebreaker", so the *flagging* half of this is already built and must not be duplicated. The only gap is the order tied rows come out in: a stable sort leaves them in `input.teamIds` order, and after Task 6 that order is the draw. A draw position must never look like a ranking.

- [ ] **Step 1: Write the failing test**

Add to `packages/engine/tests/standings.test.ts`, following the shape of the existing calls in that file for the rest of `StandingsInput`:

```ts
it('does not let the order teams were given rank a tie', () => {
  const table = computeStandings({
    teamIds: ['t-zulu', 't-alpha'],
    results: [],
    scoring: { win: 3, draw: 1, loss: 0, shutoutWinBonus: 1 },
    penaltyPoints: { yellow: 1, red: 2 },
    tiebreakers: ['goalsFor'],
    cards: [],
    adjustments: [],
  });

  expect(table.map((r) => r.teamId)).toEqual(['t-alpha', 't-zulu']);
  expect(table.every((r) => r.needsManualTiebreak)).toBe(true);
});
```

Copy the field names for `scoring`, `penaltyPoints`, `cards` and `adjustments` from an existing call in the file rather than trusting the ones above — drop any that `StandingsInput` does not declare.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/standings.test.ts` from `packages/engine`
Expected: FAIL — order is `['t-zulu', 't-alpha']`, the order they went in.

- [ ] **Step 3: Add the final comparison**

At the end of the comparator chain in `packages/engine/src/standings.ts:56`, after the last tiebreaker:

```ts
    // Everything the rules can settle is settled, and needsManualTiebreak is
    // already set. The rules finish this with rock-paper-scissors, which is
    // not ours to simulate -- so fall back to something stable and visibly
    // arbitrary. Input order would be the draw once a pool is drawn, and a
    // drawn position must never read as a ranking.
    return a.teamId.localeCompare(b.teamId);
```

- [ ] **Step 4: Write the display test**

The other half of "draw order is an input, table order is a result" is that the table renders in table order. Add to `apps/web/tests/standingsColumns.test.tsx`, following how that file already renders the standings table:

```tsx
it('renders the table in table order, not the order teams were drawn', () => {
  render(
    <StandingsTable
      rows={[
        { teamId: 't1', teamName: 'Drawn first', points: 3, rank: 2 },
        { teamId: 't2', teamName: 'Drawn second', points: 9, rank: 1 },
      ]}
    />,
  );

  const names = screen.getAllByTestId('standings-team').map((el) => el.textContent);
  expect(names).toEqual(['Drawn second', 'Drawn first']);
});
```

Match the real component name, prop shape and row fields used elsewhere in that file, and use whatever query the file already uses to read team cells rather than adding a new `data-testid` if one exists.

- [ ] **Step 5: Run both suites**

Run: `npm test --workspace packages/engine` and `npm test --workspace apps/web` from the repo root
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/standings.ts packages/engine/tests/standings.test.ts apps/web/tests/standingsColumns.test.tsx
git commit -m "Stop a drawn position looking like a ranking in a tied pool"
```

---

### Task 10: The framework sheet

**Files:**
- Create: `apps/web/src/components/admin/setup/FrameworkSheet.tsx`
- Modify: `apps/api/src/services/tournamentView.ts` (expose slot profiles)
- Test: `apps/web/tests/frameworkSheet.test.tsx` (create)

**Interfaces:**
- Consumes: fixtures carrying `drawSlot` refs from Task 7.
- Produces: a `SlotProfile` shape returned by the API and rendered by the sheet:

```ts
export interface SlotProfile {
  poolId: string;
  poolName: string;
  slot: number;
  label: string;              // "Poet #3"
  teamId: string | null;      // filled once drawn
  teamName: string | null;
  games: { kickoffAt: string; fieldName: string; opponentLabel: string }[];
  startsInFirstRound: boolean;
  minRestMinutes: number | null;
}
```

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/frameworkSheet.test.tsx`:

```tsx
it('shows what a slot is offering before it has a team', () => {
  render(
    <FrameworkSheet
      slots={[
        { poolId: 'p1', poolName: 'Poet', slot: 3, label: 'Poet #3',
          teamId: null, teamName: null, startsInFirstRound: false,
          minRestMinutes: 70,
          games: [
            { kickoffAt: '2026-08-29T14:35:00Z', fieldName: 'Teamwork', opponentLabel: 'Poet #1' },
            { kickoffAt: '2026-08-29T15:45:00Z', fieldName: 'JP Morgan', opponentLabel: 'Poet #4' },
          ] },
      ]}
    />,
  );

  expect(screen.getByText('Poet #3')).toBeInTheDocument();
  expect(screen.getByText(/bye first round/i)).toBeInTheDocument();
  expect(screen.getByText(/Teamwork/)).toBeInTheDocument();
  expect(screen.queryByText(/1st/)).not.toBeInTheDocument();
});

it('shows the team once it has been drawn', () => {
  render(
    <FrameworkSheet
      slots={[
        { poolId: 'p1', poolName: 'Poet', slot: 3, label: 'Poet #3',
          teamId: 't1', teamName: 'Abbvie', startsInFirstRound: true,
          minRestMinutes: 70, games: [] },
      ]}
    />,
  );

  expect(screen.getByText('Abbvie')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/frameworkSheet.test.tsx` from `apps/web`
Expected: FAIL — the component does not exist.

- [ ] **Step 3: Build the sheet**

Create `apps/web/src/components/admin/setup/FrameworkSheet.tsx`. It takes `slots: SlotProfile[]`, groups by pool, and renders one row per slot: the label (or the drawn team's name), whether it starts in the first round, each game's kickoff time, pitch and opponent label, and the minimum rest.

A slot with `startsInFirstRound: false` shows "bye first round". Every team plays the same number of games — the generator enforces it — so this is a later start, not a missing game. Say it in the copy.

Follow the existing widgets in `apps/web/src/components/admin/setup/` for styling and structure; reuse the tokens already in `styles.css` rather than inventing any. Include a print stylesheet so this page prints cleanly on one sheet — it is handed to a room.

- [ ] **Step 4: Compute the profiles server-side**

In `apps/api/src/services/tournamentView.ts`, add and export:

```ts
export function slotProfiles(
  fixtures: {
    home_ref: TeamRef;
    away_ref: TeamRef;
    home_team_id: string | null;
    away_team_id: string | null;
    kickoff_at: string | null;
    pool_id: string | null;
  }[],
  poolNames: Map<string, string>,
  teamNames: Map<string, string>,
): SlotProfile[] {
  const byKey = new Map<string, SlotProfile>();

  const touch = (poolId: string, slot: number): SlotProfile => {
    const key = `${poolId}#${slot}`;
    let profile = byKey.get(key);
    if (!profile) {
      const poolName = poolNames.get(poolId) ?? '';
      profile = {
        poolId, poolName, slot,
        label: poolName ? `${poolName} #${slot}` : `#${slot}`,
        teamId: null, teamName: null, games: [],
        startsInFirstRound: false, minRestMinutes: null,
      };
      byKey.set(key, profile);
    }
    return profile;
  };

  for (const f of fixtures) {
    const sides = [
      { ref: f.home_ref, teamId: f.home_team_id, opponent: f.away_ref, opponentTeamId: f.away_team_id },
      { ref: f.away_ref, teamId: f.away_team_id, opponent: f.home_ref, opponentTeamId: f.home_team_id },
    ];
    for (const side of sides) {
      if (side.ref.kind !== 'drawSlot') continue;
      const profile = touch(side.ref.poolId, side.ref.slot);
      if (side.teamId) {
        profile.teamId = side.teamId;
        profile.teamName = teamNames.get(side.teamId) ?? null;
      }
      if (f.kickoff_at) {
        profile.games.push({
          kickoffAt: f.kickoff_at,
          fieldName: '',
          opponentLabel:
            side.opponentTeamId
              ? teamNames.get(side.opponentTeamId) ?? ''
              : side.opponent.kind === 'drawSlot'
                ? `${poolNames.get(side.opponent.poolId) ?? ''} #${side.opponent.slot}`.trim()
                : '',
        });
      }
    }
  }

  // Earliest kickoff in each pool is its first round; a slot absent from it
  // has a bye. Every slot plays the same number of games -- the generator
  // enforces it -- so a bye is a later start, never a missing game.
  const earliestByPool = new Map<string, string>();
  for (const profile of byKey.values()) {
    for (const game of profile.games) {
      const current = earliestByPool.get(profile.poolId);
      if (!current || game.kickoffAt < current) earliestByPool.set(profile.poolId, game.kickoffAt);
    }
  }

  for (const profile of byKey.values()) {
    profile.games.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
    profile.startsInFirstRound = profile.games[0]?.kickoffAt === earliestByPool.get(profile.poolId);

    let minRest: number | null = null;
    for (let i = 1; i < profile.games.length; i++) {
      const gap =
        (new Date(profile.games[i]!.kickoffAt).getTime() -
          new Date(profile.games[i - 1]!.kickoffAt).getTime()) / 60000;
      minRest = minRest === null ? gap : Math.min(minRest, gap);
    }
    profile.minRestMinutes = minRest;
  }

  return [...byKey.values()].sort(
    (a, b) => a.poolName.localeCompare(b.poolName) || a.slot - b.slot,
  );
}
```

Fill `fieldName` from the field join the surrounding query already performs — `tournamentView.ts:147` shows the existing `LEFT JOIN` pattern for teams; follow it for fields. Then expose the result on the admin view the setup screen already fetches.

- [ ] **Step 5: Run the tests**

Run: `npm test --workspace apps/web` from the repo root
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/admin/setup/FrameworkSheet.tsx apps/web/tests/frameworkSheet.test.tsx apps/api/src/services/tournamentView.ts
git commit -m "Show what each position is offering before the draw"
```

---

### Task 11: The draw board

**Files:**
- Create: `apps/web/src/components/admin/setup/DrawBoard.tsx`
- Modify: `apps/web/src/components/admin/setup/TeamsWidget.tsx` (link to it)
- Test: `apps/web/tests/drawBoard.test.tsx` (create)

**Interfaces:**
- Consumes: `SlotProfile` from Task 10; `PUT`/`DELETE /api/events/teams/:teamId/draw` from Task 8.
- Produces: no new exported types.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/drawBoard.test.tsx`:

```tsx
it('draws a team into a slot and shows it filled', async () => {
  const put = vi.fn().mockResolvedValue({});
  render(<DrawBoard slots={twoEmptySlots} teams={[{ id: 't1', name: 'Abbvie' }]} api={{ put, delete: vi.fn() }} onChanged={vi.fn()} />);

  await userEvent.click(screen.getByRole('button', { name: /Abbvie/ }));
  await userEvent.click(screen.getByRole('button', { name: /Poet #1/ }));

  expect(put).toHaveBeenCalledWith('/api/events/teams/t1/draw', { poolId: 'p1', slot: 1 });
});

it('undoes a draw', async () => {
  const del = vi.fn().mockResolvedValue({});
  render(<DrawBoard slots={oneFilledSlot} teams={[]} api={{ put: vi.fn(), delete: del }} onChanged={vi.fn()} />);

  await userEvent.click(screen.getByRole('button', { name: /undo/i }));

  expect(del).toHaveBeenCalledWith('/api/events/teams/t1/draw');
});
```

Define `twoEmptySlots` and `oneFilledSlot` as `SlotProfile[]` fixtures at the top of the file, matching the shape in Task 10.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/drawBoard.test.tsx` from `apps/web`
Expected: FAIL — the component does not exist.

- [ ] **Step 3: Build the board**

Create `apps/web/src/components/admin/setup/DrawBoard.tsx`:

```tsx
export default function DrawBoard({
  slots,
  teams,
  api,
  onChanged,
}: {
  slots: SlotProfile[];
  teams: { id: string; name: string }[];
  api: { put: (path: string, body: unknown) => Promise<unknown>;
         delete: (path: string) => Promise<unknown> };
  onChanged: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const undrawn = teams.filter((t) => !slots.some((s) => s.teamId === t.id));

  async function drawInto(slot: SlotProfile) {
    if (!picked || busy) return;
    setBusy(true);
    try {
      await api.put(`/api/events/teams/${picked}/draw`, { poolId: slot.poolId, slot: slot.slot });
      setPicked(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function undo(slot: SlotProfile) {
    if (!slot.teamId || busy) return;
    setBusy(true);
    try {
      await api.delete(`/api/events/teams/${slot.teamId}/draw`);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="draw-board">
      <ul className="draw-board__teams">
        {undrawn.map((team) => (
          <li key={team.id}>
            <button
              type="button"
              aria-pressed={picked === team.id}
              onClick={() => setPicked(team.id)}
            >
              {team.name}
            </button>
          </li>
        ))}
      </ul>

      <ul className="draw-board__slots">
        {slots.map((slot) => (
          <li key={`${slot.poolId}#${slot.slot}`}>
            {slot.teamId ? (
              <>
                <span>{slot.teamName}</span>
                <button type="button" onClick={() => undo(slot)}>Undo</button>
              </>
            ) : (
              <button type="button" disabled={!picked} onClick={() => drawInto(slot)}>
                {slot.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Style it in `apps/web/src/styles.css` using the tokens already there. This is projected in a room at a fundraiser: large type, no settings chrome, high contrast. It is the one admin surface an audience sees.

- [ ] **Step 4: Link it from the setup screen, and show a team its position**

Add an entry point in `TeamsWidget.tsx` next to the existing pool controls, visible only when the division has a framework generated.

Then show the drawn position on the team's own row as a quiet fact — `drawn Poet #3` — never as a column beside its table position, and never with an ordinal. This is the display half of "draw order is an input, table order is a result"; the ordering half is Task 9.

- [ ] **Step 5: Run the tests**

Run: `npm test --workspace apps/web` from the repo root
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/admin/setup/DrawBoard.tsx apps/web/src/components/admin/setup/TeamsWidget.tsx apps/web/tests/drawBoard.test.tsx
git commit -m "Put the draw on a screen the room can watch"
```

---

### Task 12: Prove the 2026 path is untouched

The whole feature is dormant unless someone runs a draw. This task proves it, and is the reason this can be built during a freeze window.

**Files:**
- Test: `apps/api/tests/drawFramework.integration.test.ts` (extend)
- Modify: `docs/BUILD-PLAN-2026.md` (correct the "even pools" claim)

- [ ] **Step 1: Write the test**

Add to `apps/api/tests/drawFramework.integration.test.ts`:

```ts
it('generates a division with no draw exactly as it did before', async () => {
  const { divisionId } = await seedDivision({ pools: 2, teams: 8 });

  const first = await request(app).post(`/api/schedule/divisions/${divisionId}/generate`)
    .set('Cookie', adminCookie).send({});
  expect(first.status).toBe(201);

  const { rows } = await db.query(
    `SELECT home_ref, away_ref, home_team_id, away_team_id, kickoff_at, field_id
       FROM fixtures WHERE pool_id IS NOT NULL ORDER BY kickoff_at, field_id`,
  );

  // Every pool fixture names concrete teams, exactly as before this feature.
  for (const row of rows) {
    expect(row.home_ref.kind).toBe('team');
    expect(row.away_ref.kind).toBe('team');
    expect(row.home_team_id).not.toBeNull();
    expect(row.away_team_id).not.toBeNull();
  }
});
```

Match the generate route's real path and body from the existing tests in `apps/api/tests/`.

- [ ] **Step 2: Run the full suite**

Run: `npm test` from the repo root, with `TEST_DATABASE_URL` set
Expected: PASS. Engine 91+, API 109+, web 58+. A skipped API count means the database was not configured — set it and rerun; this task is meaningless without it.

- [ ] **Step 3: Correct the build plan**

In `docs/BUILD-PLAN-2026.md`, the Tier 4 draw-party entry ends with "Scope it to even pools." That is wrong about the model — it was about the A1–A4 notation, not the mechanism. A single table of eleven has a framework of eleven slots. Replace that paragraph with:

```markdown
  Works for any pool. A single table of eleven playing two games each has a
  framework of eleven positions, and its profiles are more varied, not less,
  because most positions sit out any given round. What does not generalise is
  the A1-A4 notation, which only reads naturally for a small pool.
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/drawFramework.integration.test.ts docs/BUILD-PLAN-2026.md
git commit -m "Prove the day we are actually running is unchanged"
```

---

## Notes for whoever executes this

- **Tasks 1–4 are the engine and are pure.** They run in milliseconds with no database and carry the whole risk of the feature. If something has to be cut, cut from the bottom.
- **Task 2 is the one that matters.** Everything else is plumbing; that one is a live bug that would put a slot on two pitches at once in a printed framework.
- **Task 6 deliberately does nothing clever.** Both arms of its ternary are the same call. It exists so the ordering change and the framework change land in separate commits with separate tests.
- **Three open questions** from the spec are unresolved and none of them block: single-letter pool notation (`A1` versus `A #1`), whether the framework sheet needs a layout distinct from print CSS, and whether the draw board should be publicly viewable. Ask before deciding any of them in code.
