# Draw Slots — Design Spec

**Date:** 2026-08-20
**Status:** Design approved, not yet implemented
**Relates to:** `docs/BUILD-PLAN-2026.md` Tier 4 · `PRODUCT.md` (recorded as undecided for 2027)

---

## 1. Context

America SCORES runs a **Draw Party** as a fundraiser. The schedule is laid out
from the team count *before* anyone is assigned to a pool, published as a
framework of unnamed positions with real pitches and real kickoff times, and
teams are then drawn into those positions in front of a room. What a team is
drawn into settles its whole day: who it plays, when it plays, whether it sits
out the first round.

This is unusual — most leagues do not let a team see the schedule before it is
assigned to one — but it is the standard the organisation has set, and teams
turn up expecting it. The value being sold is the *time profile* of a slot: a
first-round bye, a late start, a long rest.

The app cannot currently express any of this. A team's position within its pool
is what decides its opponents, and that position is assigned alphabetically from
one clause in `scheduleBuilder.ts:126`:

```sql
array_remove(array_agg(t.id ORDER BY t.name), NULL) AS team_ids
```

For 2026 the draw is honoured by hand-editing the generated games afterwards.
This spec removes that workaround.

### What already exists

Most of the machinery is built and is used by the playoff bracket:

- `fixtures.home_ref` / `away_ref` are JSONB rules for who plays, with
  `home_team_id` / `away_team_id` nullable and documented as *"filled in once
  the reference resolves"*. The schema comment says it plainly: this "lets
  bracket games occupy a field and kickoff time before anyone knows who is in
  them."
- `resolveTeamRef` turns a reference into a team or a human label, computed on
  read so a corrected score changes the bracket immediately.
- `generatePoolFixtures` pairs teams **by index in an ordered array** and never
  reads a name. For a pool of four playing three games it already emits exactly
  the six games the traditional framework shows.

The pairing algorithm therefore does not change. What changes is what a pool
fixture points at.

---

## 2. Goals and non-goals

**Goals**

- Generate a division's schedule as a framework of unnamed slots, before pools
  are assigned, with verified rest gaps and real kickoff times.
- Publish each slot's time profile so the room can see what it is drawing for.
- Bind a team to a slot in one audited, reversible act that sets its pool and
  its position together.
- Leave every division that does not run a draw behaving exactly as it does
  today.

**Non-goals**

- Changing how fixtures are paired. The six games a pool of four produces stay
  the six games it produces today.
- Seeding in the competitive sense. A draw is random; nothing here protects
  strong teams or ranks slots by strength.
- Making the draw mandatory. It is one of two ways to fill pools, alongside the
  existing auto-assign.
- Redrawing 2026. Both divisions' schedules are already published to teams.

Enabled **per division**, not event-wide. Nothing here is limited to pools of
four: a single table of eleven playing two games each has a framework of eleven
slots, and its profiles are more varied, not less, because most slots sit out
any given round. An earlier note in `BUILD-PLAN-2026.md` said this only fits
even pools — that was about the A1–A4 notation, not the model, and is wrong
about the model.

---

## 3. The identity bug this depends on

`scheduling.ts:92`:

```ts
/** Teams we actually know. Unresolved bracket references constrain nothing yet. */
function concreteTeams(fixture: Fixture): TeamId[] {
  const teams: TeamId[] = [];
  for (const ref of [fixture.home, fixture.away]) {
    if (ref.kind === 'team') teams.push(ref.teamId);
  }
  return teams;
}
```

This is correct for a bracket: nobody knows who is in the semi-final, so it
constrains nothing. It is **wrong for a draw slot**, which is a real participant
with a real rest requirement from the moment the framework exists. Poet #1 is
one team even before anyone knows which one.

Left as is, every pool game generated over slots would drop out of rest-gap
checking, team-double-booking detection, and the feasibility figures — and the
framework could put Poet #1 at 9:00 and again at 9:35. It would look fine on
screen and be wrong on paper, which is the worst available failure for an
artifact printed and handed to a room.

**The fix:** replace "is this a concrete team?" with "does this ref carry an
identity?", keyed on a stable string.

| Ref kind | Identity | Reason |
|---|---|---|
| `team` | `team:<uuid>` | Known team |
| `drawSlot` | `draw:<poolId>#<n>` | One team, name not yet attached |
| `poolPosition` | none | Depends on results not yet in |
| `bestOfPosition` | none | Same |
| `fixtureWinner` / `fixtureLoser` | none | Same |

Applied in `concreteTeams`, `measureQuality`, and the clash detector in
`conflicts.ts`. This is the first thing to build and the first thing to test.

---

## 4. The model

A new `TeamRef` variant, deliberately named so it cannot be confused with the
one that already exists:

```ts
export type TeamRef =
  | { kind: 'team'; teamId: TeamId }
  | { kind: 'drawSlot'; poolId: PoolId; slot: number }        // drawn into Poet #3
  | { kind: 'poolPosition'; poolId: PoolId; position: number } // finished 3rd in Poet
  | ...
```

`poolPosition` resolves from standings once a pool completes. `drawSlot`
resolves from the draw, before anything is played. Different nouns on purpose —
*slot drawn* versus *position finished* — because otherwise they are one word
apart in every switch statement, and one character apart on the public board.

**Labels.** A draw slot renders as `Poet #1`. Ordinals are reserved for
standings, where `Poet 1st` means won the pool. The draw never renders an
ordinal and the table never renders a `#`.

---

## 5. Data

```sql
ALTER TABLE teams ADD COLUMN draw_slot INTEGER NULL;

CREATE UNIQUE INDEX teams_pool_draw_slot_idx
    ON teams (pool_id, draw_slot)
    WHERE draw_slot IS NOT NULL;

-- A slot number without a pool identifies nothing: Postgres treats NULL pool
-- ids as distinct, so the index above would happily admit two teams both
-- claiming slot 1 of no pool.
ALTER TABLE teams ADD CONSTRAINT teams_draw_slot_needs_pool
    CHECK (draw_slot IS NULL OR pool_id IS NOT NULL);
```

Nullable, because a division that does not run a draw never touches it. The
partial index lets any number of teams sit undrawn while guaranteeing no two
teams occupy one slot.

The migration backfills nothing and rewrites no fixtures. The 2026 event as
generated today is unaffected.

---

## 6. Generation

`generatePoolFixtures` is unchanged in its maths; it receives slot refs instead
of team ids.

`scheduleBuilder.ts:126` orders by `draw_slot`, falling back to name where slots
are not in use, so a division without a draw generates byte-identically to
today.

Generating with the draw enabled produces the **framework**: real pitches, real
kickoff times, verified rest gaps, no names. It is generated once, printed, and
drawn into. It is not regenerated after the draw.

---

## 7. Binding a team to a slot

Binding writes, in one audited transaction:

1. `teams.pool_id` and `teams.draw_slot` — the draw sets both together, since
   the framework exists before pool assignment.
2. `home_team_id` / `away_team_id` on every fixture in that pool whose ref names
   the bound slot.

**Why this writes rather than resolving on read.** Standings and brackets are
deliberately computed on read, because they resolve *continuously* as results
land and a stored copy would go stale the moment a score is corrected. A draw
resolves **once**, by an explicit human act, and re-drawing rewrites it. The
column's own comment describes exactly this moment.

The payoff is containment. `tournamentView.ts:220` filters results on
`home_team_id` being present, and standings, cards, sign-off and the referee
view all key off the same columns. Because binding fills them, the scoring path
never meets a draw slot and is unchanged by this feature — which is what makes
it landable near a freeze.

**Reversibility.** Un-binding clears the slot and nulls those fixture columns,
returning the pool to its framework state. A name pulled twice at a fundraiser
is a certainty, not an edge case.

---

## 8. Draw order is an input; table order is a result

The rule that keeps the two ideas apart:

- The standings table is sorted only by `standings.ts` — points, head-to-head,
  goals for, goals against, cards. The new `ORDER BY draw_slot` belongs to
  schedule generation and must never reach the table.
- `#3` appears only where a team is genuinely unknown: fixtures before the draw,
  the framework sheet, the draw board. Once bound, fixtures show the name.
- After the draw, a team's slot survives as a quiet fact on its own page
  ("drawn Poet #3"), never as a column beside its table position.

**One consequence to handle.** `standings.ts` uses a stable sort, so teams tied
through every tiebreaker currently fall back to insertion order — which after
this change would be draw order rather than alphabetical, making a draw position
look like a ranking. The rules settle that case with rock-paper-scissors, so the
exhausted-tiebreaker case sorts by name and is marked unresolved rather than
silently ordered.

---

## 9. Surfaces

**The framework sheet** — printable, public, exists as soon as generation runs:

```
Poet #3 · bye first round · 9:35 Teamwork, 10:45 JP Morgan · 70 min rest
```

Each slot with its kickoff times, pitches, rest, and whether it starts in round
one. Every team plays the same number of games — the generator enforces it — so
a "bye" is a later start, not a missing game, and is derived from the framework
rather than stored.

This is what the room is bidding on. Without it the draw has no drama and no
fundraising value.

**The draw board** — admin, projectable, used live at the party. The same slots
filling with names as they are pulled: pick a team, pick a slot, bound. Large
type, no settings chrome, undo to hand.

Publishing each slot's profile also makes the draw even-handed: everyone in the
room is drawing against the same visible information rather than whoever studied
the schedule hardest.

---

## 10. Test plan

In build order. Each is a regression against a specific failure.

1. **Identity in the scheduler.** Two fixtures on the same draw slot 20 minutes
   apart raise `insufficient_rest`; the same pair on `fixtureWinner` refs do
   not. Guards the framework's printed times.
2. **Generation over slots.** A pool of four emits the same six pairings as
   today, carrying slot refs.
3. **Binding.** Drawing a team writes pool, slot and both fixture columns, and
   its games then count in standings.
4. **Re-draw.** Un-binding and re-binding moves the team's games and leaves no
   stale team id behind.
5. **Ordering isolation.** A pool whose draw order contradicts its table order
   renders the table in table order.
6. **Null path.** A division with no draw slots generates byte-identically to
   today. This is the test that protects the schedule already published to
   teams.

---

## 11. Landing

The 2026 rehearsal is 22–23 August and the freeze is Tuesday 25 August. This
feature touches schedule generation, which the build plan puts on the wrong side
of that line.

**Recommendation: build all of it now, and leave the 2026 event's path
untouched.** Every behaviour is gated on `draw_slot` being non-null, and test 6
proves the existing path is unchanged. The work soaks while the rehearsal
exercises the schedule actually being run on the 29th, and the draw goes live
for the next event.

Using it for a 2026 draw is a different decision with a different deadline: the
framework would have to be generated and printed before the party. That changes
what must land before the freeze and should be planned against the party's date.

---

## 12. Open questions

- Whether a pool named with a single letter should render `A1` rather than
  `A #1`, matching the notation teams already know from previous years.
- Whether the framework sheet needs a printable layout distinct from the screen
  view, or whether print CSS on the same page is enough.
- Whether the draw board should be reachable by spectators live, or stay an
  admin surface projected in the room.
