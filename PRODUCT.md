# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: the spectator on the public board.** No login, no account, the largest
audience — players between games, families on the sideline, sponsors, and anyone
handed the link. When two roles want incompatible things, the public view wins.

Other confirmed roles, each with a named account:

- **Tournament director / admin** — sets up the event, generates the schedule,
  adjusts it live, corrects results. The client, and the person running the day.
- **Referee** — enters scores and cards from a phone, on a pitch, outdoors, with
  unreliable signal. Assigned to cover a pitch rather than individual games.
- **Coach** — admin-created, tied to one team; manages that team's roster.
- **Participant** — self-registers; a join code gates team membership.

Field Marshal and Match Commissioner are named in the tournament rules as
escalation contacts. Whether they need their own access is undecided; they may
simply be admins.

## Product Purpose

Run the SCORE Cup — America SCORES Chicago's adult charity soccer tournament —
end to end on a single day: event setup, schedule generation, live scoring and
cards, computed standings, playoff brackets, and a public live view anyone can
open without an account. The tournament is a fundraiser for the organisation.

Success is a full day scored correctly, with the standings and brackets filling
themselves and nobody typing a team name into a results table. A display bug on
the day is embarrassing; a scoring bug is unrecoverable, because the standings
are the product.

## Positioning

- **Standings and brackets are computed, never typed.** There is no screen where
  a table can be made to disagree with the games it came from. The only escape
  hatches are a per-game override and an audited points adjustment, both of which
  show their working.
- **The scheduler models the day, not just the fixtures.** Rest gaps between a
  team's own games, per-division field allocation, changeover, and per-stage
  match length feed a feasibility check that says whether the day fits the window
  before anyone commits to it. The finding that made this worth building: past
  about five minutes of rest, a fourth field adds nothing to the finish time.
- **This year's tournament is data.** Team counts, divisions, pools, fields,
  timings, and cadence are all configurable, with the explicit goal of running
  beyond America SCORES Chicago — other affiliates or other tournaments.

## Operating Context

- **Outdoors, one day, four pitches.** The 2026 event runs Saturday 29 August on
  fields named for sponsors and values: JP Morgan, Teamwork, Leadership,
  Commitment. Roughly 200 participants, all adults.
- **Two divisions, run sequentially.** Competitive in the morning (8 teams, two
  pools named "Poet" and "Athlete", 3 games each, 9:00 AM–12:35 PM); Community in
  the afternoon (11 teams, one table, 2 games each, all 11 reach the playoffs,
  1:30 PM–5:55 PM). This schedule has already been published to teams, so its
  start times and pool names are fixed points the app must reproduce, not
  outputs it may re-derive.
- **Scores arrive from a phone in a field.** Referees work in August daylight,
  sometimes gloved, on a connection that may not be there at the moment of entry.
- **Match end is a sign-off ritual.** The referee logs cards at team level during
  play — jerseys carry no numbers, so a referee cannot identify a player they do
  not know. At the whistle the captain attributes each card to a player and signs
  off on the ref's phone, confirming score, penalties, and card counts.
- **Registration lives partly elsewhere.** GiveButter has been the official
  registration path; whether the app supplements, imports from, or replaces it is
  undecided.
- **Deployment.** Docker on a VPS, with a staging stack on a separate port used
  for a full dress rehearsal before the event.

### Timeline (binding for 2026)

| | |
|---|---|
| Dress rehearsal | **Sat 22 – Sun 23 August 2026** — a fake tournament run end to end, on phones, outdoors. Anything that writes a score or builds a schedule lands before this, or does not land |
| Rehearsal fixes | Mon 24 August 2026 — only what the rehearsal turned up |
| Code freeze | **Tue 25 August 2026** — nothing structural, and nothing touching scoring or schedule generation, after this date |
| Copy and CSS only | Wed 26 – Fri 28 August 2026 |
| Tournament | **Sat 29 August 2026** |

Design work planned after the freeze may move text and styling only. See
`docs/BUILD-PLAN-2026.md` for the full plan and current status.

## Capabilities and Constraints

**Confirmed functionality**

- Public spectator view (no login, optional team filter); admin control panel;
  referee phone view; team view for coaches and participants; public,
  admin-editable rules page linked from every view.
- Engine generates the schedule; the admin can edit any game. Pool count is set
  by the admin, with auto-balance and manual override. Pools are renameable, and
  renaming is required — playoff fixtures are published as "Poet 1st v Athlete
  2nd".
- Feasibility check is core, not a stretch goal.
- A team's **position within its pool is what decides its opponents.** The
  generator pairs teams by their index around a circle, not by name. Position is
  currently assigned alphabetically, so the first team by name is A1; there is no
  way to draw a team into a chosen position, and for 2026 the draw is honoured by
  editing the generated games afterwards.
- Event-wide delay control: pick a round, push it and everything after it, gaps
  preserved; only `scheduled` games move.
- Every admin edit is audited.
- Offline handling on the referee view is deliberately light: optimistic UI plus
  a localStorage retry queue.
- The admin writes the day's messages — welcome, lunch, "playoffs in fifteen
  minutes", the awards call — scoped either to the public board or to
  participants' own team pages. A message may carry a publish time and be
  revealed later. **Nothing pushes:** the reveal is a filter applied where the
  message is read, so a scheduled message appears on the next poll after its
  time, give or take one interval, and there is no background worker that can
  fail overnight or send twice.
- Each team's kit is shown to the referee on the match card, so two sides can be
  told apart on a pitch. The same sponsor artwork identifies teams publicly.
- Each captain signs off in their own name box at match end; the name is stored
  with the sign-off as typed, not linked to a roster entry.
- The whole day can be rebuilt from the command line, as an escape hatch for
  when the admin screens are not the fastest way back to a known state.

**Tournament rules the system encodes**

- Points: 3 win / 1 tie / 0 loss, **+1 bonus for a shutout win** (a 0–0 draw does
  not qualify).
- Tiebreakers, in order: head-to-head → goals for → goals against → fewest cards
  → rock-paper-scissors. Card weighting is 1 for a yellow, 2 for a red.
- Pool draws are allowed. Knockout draws go **straight to penalties**, no
  overtime; PK scores are stored separately from goals.
- Match timing is per stage: pool 14-minute halves, knockout 12.
- Cards are tracked **per player**, because the rules require per-player
  suspensions. A red card, or two yellows in a match, bans the player for at
  least the next match; two reds in the tournament ends it for them.
- At least two female-identifying players must be on the field at all times; a
  team short plays correspondingly short. Gender identity is therefore gameplay
  data, not reporting data.

**Technical constraints**

- npm workspaces monorepo: `apps/web` (Vite + React 18 + TypeScript SPA, React
  Router), `apps/api` (Express + TypeScript), `packages/engine` (scheduling,
  standings, and bracket logic, framework-free), PostgreSQL, Docker.
- Session-based auth. Password reset is manual — an admin generates a single-use
  temporary password and emails it. There is no email provider.
- A temporary password may only reach the change-password screen.

**Explicitly undecided — do not resolve these by inventing an answer**

- **Whether the draw party draws teams into a position, not just a pool** — a
  2027 question, deliberately not a 2026 one. Tradition publishes a framework
  before the draw ("A1 v A2 and A3 v A4 at 9:00, A1 v A3 and A2 v A4 at 10:00"),
  and drawing a team into A4 then settles its whole day in the room. The value
  is that the schedule becomes the visible consequence of a witnessed act rather
  than an output nobody saw made. Undecided because it costs the scheduler
  freedom it currently uses for rest gaps and pitch allocation, and because a
  pool of 11 playing 2 games has no such framework to publish — this fits even
  pools, not every division.
- Whether a suspended player about to play is **warned** or **blocked**, and who
  the Match Commissioner is.
- Whether digital sign-off **replaces** the paper game card, and which is
  official if they disagree.
- Whether the app **validates** legal squad composition or only publishes the
  rule.
- Whether a recorded card surfaces a donation link.
- Whether the Field Marshal needs their own access.
- Whether rosters can realistically be complete before the day. A fallback
  exists — free-text card entry for unrostered players, flagged for admin
  reconciliation — but suspension tracking degrades without rosters.
- Roster retention after the event (30-day auto-delete is proposed, unconfirmed).

## Brand Commitments

Binding. Future work may not quietly replace these.

- **America SCORES Chicago's identity.** The navy and red are sampled from the
  organisation's own shield (`--brand: #16406e`, `--accent: #e11b34`), with the
  pencil yellow (`#f5c518`) reserved for focus rings so they stay visible against
  both. Logos live in `apps/web/public/brand/`.
- **Lubalin Graph** as the identity typeface (`apps/web/src/assets/`).
- **Sponsor jersey imagery.** The 19 assets in `apps/web/public/jerseys/`
  identify teams on screen. Sponsor visibility is part of what the fundraiser
  owes its backers, not decoration.
- The organisation's own line, from its materials: *building soccer skills,
  academic achievement, and leadership in underserved communities.*

## Evidence on Hand

Real, and usable:

- Sponsor jersey artwork for 19 teams and the AS-CHI logo set (`apps/web/public/`).
- The 2026 tournament rules sheet, from the tournament organiser.
- The schedule already published to teams, which independently matches the
  bracket the engine generates round for round.
- A staging deployment, and a green suite of 258 tests as of 20 August 2026 —
  engine 91, API 109, web 58. Ninety-three of the API tests run against a real
  database and are skipped, not failed, unless `TEST_DATABASE_URL` is set; a
  test run that reports only 165 has silently not exercised the API.
- `docs/BUILD-PLAN-2026.md` and `docs/OPEN-QUESTIONS.md` — the live plan and the
  running list of what the director and organiser have not yet answered.

Absent, and never to be fabricated:

- **The final team list.** It is the longest pole in the plan; pool assignment,
  generation, printed cards, and QR codes all wait on it. No placeholder team
  names may ship as if real.
- Player rosters, results, standings, and any participant data.
- Testimonials, quotes, attendance figures, fundraising totals, or press.
- The production domain has been down (502 on `scorescupchicago.games`),
  last confirmed on 13 August 2026 and not verified since. Staging has been the
  working deployment. Do not present any URL as live without checking it first.

## Product Principles

1. **Computed truth beats typed truth.** Anything derivable from scored games is
   derived. Where a human must intervene, the intervention is explicit, audited,
   and shows its working.
2. **The public board is the product's face.** It is the surface most people will
   ever see, and it is seen without instruction, login, or help. Where roles
   conflict, it wins.
3. **The scoring path is inviolable.** Correctness there outranks polish
   everywhere else. Changes to it land early, soak, and stop at the freeze.
4. **Nothing can be lost.** A game with no field still has a row; a score entered
   without signal still queues; a destructive action names what it is destroying
   before it happens.
5. **This year is a configuration, not a structure.** Nothing in the design may
   assume 8 teams, two divisions, four pitches, or Chicago.

## Accessibility & Inclusion

- **Direct sunlight is the design environment.** The event is outdoors in August.
  Contrast and legibility must hold in glare — the dark-glass spectator panels
  are specifically untested in direct sun and are the most likely thing to be
  quietly unusable.
- **Minimum 48px touch targets**, because referees wear gloves and are standing.
- **No design may assume a live connection** at the moment of entry.
- Participants are adults, so there is no COPPA or parental-consent obligation.
  Gender identity is collected as gameplay data and must be handled as such.
- Volunteers arrive cold and are not trained on the app. A referee who cannot
  find the site writes the score on paper, and paper reaches the scores table
  late.
