# SCORE Cup 2026 — Design Spec

**Date:** 2026-08-10
**Tournament date:** 2026-08-29 (three weeks out)
**Domain:** https://scorescupchicago.games/
**Organization:** America SCORES Chicago — https://www.chicagoscores.org/

---

## 1. Context

SCORE Cup is America SCORES Chicago's **adult fundraising soccer tournament**, run annually. The existing app (`SCORE_Cup_App_v2`) was built for a single 18-team tournament and cannot express this year's format.

**2026 format:** two 10-team tournaments (referred to here as *divisions*) at a 4-field venue. Current understanding is they run **concurrently, 2 fields each** — though the director's email said "one after the other." This contradiction is unresolved and is the top open question. The design deliberately makes the answer a configuration change rather than a redesign.

### Why a rebuild rather than incremental change

The existing app fails on the axis that matters most for reuse: scheduling logic, SQL, and HTTP route handling are interleaved in a single 2,648-line `server.js`. There is no concept of roles, referees, cards, or multiple concurrent tournaments, and the schema hardcodes `tournament_id DEFAULT 1`. The frontend is on `react-scripts@4.0.3` with `webpack@4.44.2` and no lockfiles — on Node 17+ this requires an `--openssl-legacy-provider` workaround because webpack 4 calls the MD4 hash OpenSSL 3 removed, and every build resolves a fresh dependency tree.

### Primary goal

**A reusable tournament platform**, not a 2026-specific app. Team count, field count, game length, day window, pool structure, and playoff format must all be configurable. Next year's tournament should be a new configuration, not a code change.

---

## 2. Non-goals

- Historical records across years. Each event is independent; last year's data can be deleted.
- Replacing GiveButter for donations/fundraising. Only tournament registration moves into this app.
- Native mobile apps. Responsive web only.
- Live streaming, video, or photo galleries.
- Public API for third parties.

---

## 3. Architecture

### 3.1 The engine boundary

The single most important structural decision. The tournament engine is a **pure TypeScript module** with no database access and no HTTP:

```
generateFixtures(config, teams)              -> Fixture[]        // who plays whom
scheduleFixtures(fixtures, resources, rules) -> ScheduledFixture[] // when and where
computeStandings(results, rules)             -> StandingsRow[]   // the table
checkFeasibility(config, resources)          -> FeasibilityReport
```

No Express, no Postgres, no React. Consequences:

- "16 teams, 3 fields, 25-minute slots, 20-minute rest gap" is a unit test that runs in milliseconds with no database.
- Next year's format change is a config object, not a migration.
- The same `computeStandings` drives pool tables, bracket seeding, and every read view — one implementation, no drift.

Everything else in the system is I/O wrapped around these functions.

### 3.2 Stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React + TypeScript |
| Backend | Express + TypeScript |
| Database | PostgreSQL |
| Real-time | WebSocket (`ws`), polling fallback |
| Deploy | Docker Compose + nginx on Hostinger VPS |

Next.js was considered and rejected: its main strengths (SSR, server components) buy little here — there is no SEO value in a tournament scoreboard, and every number on screen is live, so it is client-fetched regardless. Meanwhile App Router caching semantics are a common source of lost time under deadline. WebSockets would also need a custom server. Plain JavaScript was rejected because the engine's config objects are precisely what needs types for a codebase revisited annually after months away.

---

## 4. Domain model

### 4.1 Hierarchy

```
Event  (SCORE Cup 2026 — the day; owns fields, time window, slot length, rest gap)
 └── Division  (one 10-team tournament; optionally pinned to a subset of fields)
      └── Stage  (ordered: pool stage, then bracket stage)
           └── Fixture  (one match)
```

**Event** owns what the divisions share — the field calendar and the day's timing. **Division** is one tournament. Because both divisions schedule against one event-level calendar, sequential and concurrent operation are the same code path: sequential simply means Division B's slots start after A's last one.

**Field allocation per division** is an optional allowed-field set. Empty means the division may use any field (shared pool); set to fields 1–2 pins it there. This covers two divisions on 2 fields each, N divisions sharing competitively, or one division using everything.

### 4.2 Stages as the extension point

A Division is an ordered list of Stages. This year: `[PoolStage, BracketStage]`. A consolation bracket or Swiss stage is a new stage type, not a rewrite.

**PoolStage config:** pool count, team assignment (auto-balance or manual), **games per team** (see 4.6 — 2026 uses 3, which is *not* a full round robin), points for win/draw/loss, **bonus point rules**, ordered tiebreaker list, and **stage-level match timing** (half length, halftime length).

**BracketStage config:** bracket size, teams advancing per pool, third-place game, **draw resolution** (2026: straight to penalties, no overtime), and its own **stage-level match timing** — knockout games are shorter than group games.

Match timing lives on the **stage**, not the event. In 2026, group play is 14-minute halves with a 2-minute halftime (30 minutes) while knockout is 12-minute halves with a 3-minute halftime (27 minutes). An event-level slot length cannot express this.

### 4.3 Unresolved team references

The subtle part. Pool matchups are fully known once teams are assigned to pools. Bracket matchups are **not** — a semifinal is "1st in Pool A vs. 2nd in Pool B" until pools finish; a final is "winner of SF1 vs. winner of SF2."

So each side of a Fixture holds a **team reference** that is either a concrete team or an unresolved pointer:

```ts
type TeamRef =
  | { kind: 'team'; teamId: string }
  | { kind: 'poolPosition'; poolId: string; position: number }
  | { kind: 'fixtureWinner'; fixtureId: string }
  | { kind: 'fixtureLoser'; fixtureId: string }
```

When a stage completes, a resolver walks unresolved references and fills in real teams. This is what allows bracket games to occupy fields and time slots before anyone knows who is playing in them, and why the spectator bracket renders "Winner of SF1" instead of an empty box.

### 4.4 Scheduling

Deliberately separate from fixture generation. Inputs: fixtures, a resource calendar (fields × time slots), and constraints:

- No team plays two games simultaneously
- Minimum rest gap between a team's consecutive games
- Field availability windows
- Division field allocation
- Stage ordering (a division's bracket cannot start before its pools finish)

Admin can override any game's field or time afterward, with conflict warnings.

### 4.5 Feasibility check

A pure function over the same config the scheduler uses, surfaced in the admin setup screen **before** committing:

> "This configuration needs 5h20m across 2 fields. Your window is 4h00m — you are 80 minutes over."

This matters concretely. A 10-team division as 2 pools of 5 is 20 pool games; on 2 fields that is 10 sequential rounds — five hours of pool play at a 30-minute slot, before any bracket. Whether that fits is unknown until we have the day window. The check turns the highest-risk unknown into something resolved in week 1 rather than discovered at 2pm on tournament day.

---

### 4.6 The 2026 rule set

Supplied by the Tournament Organizer. These are **configuration**, not hardcoded logic — but they define the capabilities the engine must have.

**Scoring.** 3 points for a win, 1 for a tie, 0 for a loss, **plus 1 bonus point for winning via shutout**. No shutout point for a 0–0 draw. The bonus-point rule is non-standard and must be expressible in config, not assumed away.

**Tiebreakers**, in order: head-to-head → goals for → goals against → **penalty points (fewest cards)** → rock-paper-scissors (manual, resolved by admin). Note there is **no goal difference** — goals for and goals against are separate, sequential criteria.

**The penalty-points tiebreaker couples cards to standings.** `computeStandings` therefore takes cards as an input alongside results. This is a core signature, not an add-on.

**Pool play: each team plays exactly 3 games.** With 10 teams that is 15 fixtures per division — *not* a round robin (2 pools of 5 would give each team 4 games). Fixture generation must satisfy "each team plays exactly K games" as a general capability.

**Knockout draws go straight to penalties** — no overtime. Best of 5, alternating guy/girl shooters, drawn from the whole roster rather than only players on the field; then sudden death with a new kicker each round until the roster is exhausted, at which point it may restart.

Consequently a fixture stores **penalty-shootout scores separately from goals**. A 1–1 game decided 4–3 on penalties remains a 1–1 draw for goals-for and goals-against purposes, while the winner advances.

**Cards and suspensions.**
- Yellow cards **do not** carry over between matches.
- A red card, or two yellows in the same match, means the team plays down a player for the remainder of that match **and that player is banned for at least the next match**.
- The **Match Commissioner** may extend a ban beyond one match.
- **Two red cards across the tournament** bans the player for the rest of the tournament, and possibly future SCORES events.

Suspension tracking is impossible without player-level cards, which is why cards attach to players (see §5) and rosters are mandatory.

**Squad composition.** 7 field players plus 1 goalkeeper. **At least 2 female-identifying players on the field at all times**; the goalkeeper may count toward this. A team short of female-identifying players plays correspondingly short — with only 1, they field 7 total rather than 8.

This makes **gender identity gameplay data, not reporting data** — it governs squad legality and PK shooter order. That resolves the open question about why the field is collected.

**Other rules** (no offside, no throw-ins, all kicks direct, no slide tackling, 5-yard distance, mandatory shin guards, no metal cleats) do not affect application logic but **must be readable in the app** — see §7.6.

**Official record.** Both captains sign a paper game summary card verifying winner, score, and card counts; once signed, that is official. The app must not contradict this. See open questions on whether digital sign-off replaces or mirrors the card.

**Contact address:** `scorescup@chicagoscores.org` — also the address for password-reset requests (§6.2).

---

## 5. Data model

Tables: `events`, `divisions`, `fields`, `stages`, `pools`, `teams`, `fixtures`, `cards`, `ban_extensions`, `players`, `users`, `team_join_codes`, `standings_adjustments`, `audit_log`, `announcements`.

`fixtures` carries `home_score` / `away_score` **and** separate `home_pk_score` / `away_pk_score`, so a knockout game decided on penalties records both correctly. `ban_extensions` holds Match Commissioner decisions that lengthen a suspension beyond the automatic one match.

### Key decisions

**Standings are computed, never stored.** The existing schema carries `wins`, `losses`, `ties`, `goals_for`, `points`, `games_played` on the `teams` table — derived values written alongside results. Any failed update or manually-corrected score leaves the table silently disagreeing with the games that produced it. Standings become a pure fold over completed fixtures instead. Correcting a score cannot leave the table stale because there is no second copy.

**Standings adjustments.** "Modify any standing" is satisfied by an explicit adjustments mechanism rather than editing a computed table: apply "−3 points, forfeit" against a team and it folds into the calculation as a visible, audited line item. Admin gets the override, the table stays derived, and anyone can see *why* a team's points don't match their results.

**Stage config is JSONB, typed in TypeScript.** Pool counts, tiebreaker order, and bracket size are exactly what changes year to year; columns would mean a migration each time. The TypeScript types are the real schema.

**Cards attach to a player** — fixture, team, player, type, minute. This reverses an earlier team-level decision: the 2026 rules make suspensions player-specific ("banned for at least the next match", "two reds bans them for the tournament"), and the penalty-points tiebreaker feeds standings. Neither is expressible with team-level counts.

**Attribution is two-step, because jerseys have no numbers.** A referee cannot identify a stranger with nothing on their back, and the signed paper game card records card *counts* per team, not names — so the rules themselves leave this gap. It is closed by the only person who can reliably close it: the captain.

1. **During play**, the ref logs the card against a **team** — type, minute, and an optional identifying note ("tall, red headband"). Two taps, no roster lookup, game continues.
2. **At match end**, during the captain sign-off the rules already require, the carded team's captain **attributes each card to a player** from their roster.

A card therefore has a nullable `player_id`: valid and official the moment the ref taps it, enriched at sign-off. This also means the ref's workflow functions with **no roster at all**, and attribution degrades to a typed name rather than failing.

**Suspensions are derived, not stored.** A player's eligibility for a given fixture is computed from their card history and the fixture ordering, plus any explicit **Match Commissioner extension** recorded as its own row. Same principle as standings: no second copy to drift.

**Audit log** records actor, entity, action, before/after, and timestamp for every mutation.

---

## 6. Roles and authentication

| Role | Auth | Capabilities |
|---|---|---|
| Admin | Named account | Everything; all actions audited |
| Ref | Named account, admin-created, assigned to field(s) | Enter scores and cards **for assigned fields only** |
| Coach | Named account, admin-created, tied to one team | Submit and edit that team's roster; team messages |
| Participant | Self-registered account | Team-defaulted view, roster and teammate contacts, own registration details |
| Spectator | None — public | Event-wide live view with optional team filter |

Scoping is enforced **server-side**. A ref's token grants write access to their assigned fields' fixtures, not to whatever the client claims.

### 6.1 Participant registration

Participants self-register, and that registration **is** their account — one form, not "register, then separately create a login." Fields: first name, last name, email, phone, emergency contact first and last name, emergency contact phone, preferred jersey size, gender identity, date of birth, and prior SCORES Cup participation. Team is not typed in; it is derived from the join code below.

**Rosters are mandatory, not optional.** The 2026 rules require player-level card and suspension tracking (§4.6), which is impossible without knowing who is on each team. This raises the stakes on registration turnout — see risks.

**Team join codes.** Each team has a short code the coach shares. Entering it at registration puts the participant on that team. Without this gate, anyone could claim any team and pull up teammates' phone numbers. No approval queue for admins to babysit.

**Coach roster submission is the fallback.** A coach can add players who haven't registered. If such a person later self-registers with the same email, the records **merge** rather than duplicate. Anyone who never registers uses the public spectator view with a team filter. Roster entry is **save-as-you-go**, not submit-once — a coach entering 15 players on a phone will be interrupted.

This year's roster data doubles as the foundation for replacing GiveButter tournament registration in future years; a future self-registration flow writes to the same `players` table.

### 6.2 Password reset — manual, no email provider

There is **no transactional email**. The lockout screen instructs users to email a SCORES address; an admin clicks "generate temp password" on that user, the app displays it once for the admin to paste into their reply. The temp password is **single-use, forces a change on first login, and expires after 7 days**. No delivery-time guarantee is offered.

This removes an entire external dependency (provider account, SMTP config, DNS records, deliverability). It is acceptable because the fallback is strong: a locked-out participant still gets schedule, scores, standings, and bracket from the public spectator view. They lose only teammate contacts and their own registration details — nothing that stops them playing. The lockout screen says so explicitly, so nobody waits on an admin reply for information that is already public.

No registration confirmation email either; participants set their own password during registration, so the reset path serves only those who forget.

---

## 7. The views

### 7.1 Admin

Setup wizard: event → fields → day window → slot length → rest gap → divisions → teams → pools → stage config → **feasibility check** → generate schedule.

Then: schedule grid (field × time) with drag-to-move and live conflict warnings; results editing on any fixture in any stage; standings adjustments; bracket seeding overrides; cards; announcements (tournament-wide and team-targeted); user management including temp-password generation; and the audit log.

### 7.2 Ref

Mobile-first. Shows only assigned fields' fixtures, current game first, next game below.

**Score entry uses increment buttons, not text inputs** — a ref is standing in August sun, possibly wearing gloves, holding a whistle. Knockout fixtures additionally expose a **penalty-shootout entry** when regulation ends level. Submits optimistically with a localStorage retry queue.

**Card entry is team-level and instant** (§5) — type and minute, plus an optional identifying note. No roster lookup mid-game.

**Match-end sign-off.** The ref hands their phone to both captains, who confirm final score, penalty result if any, and card counts — mirroring the paper game card. The carded team's captain **attributes each card to a player** at this point. Each signature is captured with a name and timestamp into the audit log. Whether this *replaces* the paper card or merely mirrors it is an open question for the organizer; the flow is identical either way.

**Suspension warnings.** Before a fixture, the ref view lists any player on either team who is **serving a ban** — the rules make this the referee's problem to enforce, and an app that holds the card history and stays silent about it is worse than useless. The same warning appears in the coach and participant views so a team is not surprised at kickoff.

### 7.3 Participant

Defaults permanently to their team — no filter to reapply each visit. Shows next game with field and kickoff, full schedule, pool table, bracket, **team roster with teammate contacts**, **own registration details (editable**, so a coach's typo is self-serve to fix**)**, and **team-targeted messages**.

### 7.4 Spectator

Public, no login. Event-wide: live scores across all fields, standings per division, bracket, announcements, and an **optional team filter**.

Participant and Spectator share one read layer and component set; the difference is a persisted team default plus the three team-private additions above.

### 7.5 Rules page

Public, reachable from every view, and prominent in the ref and coach views. Carries the full 2026 rule set — slide tackling, squad composition and the female-identifying-player requirement, substitutions, free kicks and distances, no offside, no throw-ins, tie/PK procedure, card consequences, shin guards and footwear, prohibited items, code of conduct, and the `scorescup@chicagoscores.org` contact.

Captains are explicitly responsible for communicating rules to their teams, so this needs to be linkable and readable on a phone. Content is admin-editable rather than hardcoded, since rules change year to year.

### 7.6 TV display — stretch goal only

Large-type auto-rotating standings and scores for a venue monitor. Built only if week 3 has room.

---

## 8. Real-time and offline

WebSocket push from the API. On score submission the server recomputes standings and broadcasts to everyone watching that event; spectator and participant views update without a refresh. **Polling fallback** when the socket drops — a phone sleeping in a pocket and waking on a dead connection is the normal case, not the exception.

Ref submissions use an optimistic UI with a **localStorage retry queue**, so a submit survives a dead zone or an accidental refresh. Scoped deliberately light (roughly half a day, not a full offline-first sync layer) because the venue is in central Chicago with good cell service and probable WiFi. This is insurance, not architecture.

---

## 9. Data protection

Participants are **adults**; this is ordinary event-registration data with no COPPA or parental-consent obligations. Standard handling applies, none of which the current setup provides:

- Postgres bound to the Docker network only, **never published to the host** — the current compose file exposes port `5454`
- Generated credentials in a git-ignored `.env` — the current password `tournament_pass_2024` and admin password `ScoresCup312` are both committed to the public repo and must be rotated
- Roster data readable only by admin, the owning coach, and teammates; never present in ref or spectator API responses
- Automated nightly database backups — none currently exist
- Retention: rosters auto-delete 30 days post-event, so each year starts clean
- No PII in application logs

---

## 10. Infrastructure

**Day zero: the VPS disk is at 100%.** Nothing deploys until it is cleared — almost certainly Docker build cache and orphaned images from prior deploys. First task, executed by the user over SSH with commands provided.

Two Docker Compose stacks on the VPS — **production** and **staging** — on separate ports behind the same nginx, with separate databases. Staging hosts the test tournament and feedback round. Existing nginx config for `scorescupchicago.games` is a usable starting point; SSL via Let's Encrypt.

---

## 11. Visual design

Mirror https://www.chicagoscores.org/ — clean and minimal, white backgrounds, high contrast, bold sentence-case headings, solid-fill buttons with ~4–6px radius, card-based sections with generous whitespace, energetic action photography. Tone is professional but warm and approachable.

The real brand palette must be sampled from the live site. **The existing app's `--primary-color: #0078d7` is a generic Windows blue, not a Chicago SCORES brand color**, and should not be inherited. The Lubalin Graph font in the current repo does match the org's wordmark and is worth carrying forward.

Ref and participant views are **mobile-first**; admin is desktop-first; spectator must work well on both.

---

## 12. Three-week plan

Sequenced so the earliest real deadline and the riskiest unknowns land first.

**Week 1 — foundation and registration.** VPS disk cleanup. Project scaffolding, schema, auth for all roles. Participant registration and coach rosters shipped to staging. *Registration goes live first because people need days to actually use it.*

**Week 2 — engine and day-of views.** Fixture generation, scheduler with feasibility check, standings, brackets, admin setup wizard, ref entry, spectator and participant views. Ends with a **full test tournament on staging**.

**Week 3 — feedback, polish, production.** Act on test-tournament feedback. Apply Chicago SCORES visual design properly. Production deploy with SSL and backups. Dress rehearsal with real Aug 29 data.

TV display pulled in only if week 3 has room.

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| Format still unconfirmed (concurrent vs. sequential contradicts director's email) | Design makes it a config change, not a redesign. Chase as top open question. |
| **Pool structure unknown** — "3 games each" from 10 teams is not a round robin | Engine built for "each team plays exactly K games" as a general capability, so any grouping answer fits. Blocking for producing a real schedule, not for building. |
| Schedule may not fit the day window | Feasibility check in week 1 surfaces this before it becomes a tournament-day problem. Needs the changeover gap and day window to run. |
| **Low registration turnout makes rosters incomplete**, degrading mandatory suspension tracking | Coach roster fallback; free-text card entry for unrostered players, flagged for admin reconciliation. A card is never blocked by a missing roster. |
| **Head-to-head tiebreaker may not exist** if pooled teams don't all play each other | Tiebreaker chain must skip cleanly to the next criterion rather than erroring. Flagged as an open question. |
| Scope: registration, accounts, player-level cards and suspensions were all late additions | Week 1 placement for registration; TV display already cut to stretch. Revisit scope after the week-2 test tournament. |
| VPS disk full | Day-zero task. |
| Leaked credentials in public repo | Rotate all during week 1 setup. |

---

## 14. Open questions

Tracked separately and updated continuously in [`docs/OPEN-QUESTIONS.md`](../../OPEN-QUESTIONS.md). Highest priority:

1. **Concurrent or sequential?** Directly contradicts the director's email.
2. **Pool structure** — how do 10 teams each play exactly 3 games, how many advance, and what happens to head-to-head when two tied teams never met?
3. **Day logistics** — confirm 4 fields, the changeover gap between games, day window, and rest gap. Required to run the feasibility check.
4. **Suspension enforcement** — warn or block; who is the Match Commissioner.
5. **Digital game card** — replace the signed paper card or mirror it.
