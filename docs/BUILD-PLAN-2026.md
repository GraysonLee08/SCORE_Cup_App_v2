# Build plan — SCORE Cup, Saturday 29 August 2026

Written 13 August 2026. **16 days out.**

Source: the tournament director's punchlist (13 Aug), plus two bugs found while
verifying it that they did not report.

## The shape of the next 16 days

| | Date | |
|---|---|---|
| Build window | Thu 13 – Thu 20 Aug | Everything that touches scoring or generation lands here |
| Final schedule generated | ~Fri 21 Aug | Gated on the real team list |
| **Dress rehearsal** | Sat 22 – Sun 23 Aug | Run a fake tournament end to end, on phones, outdoors |
| Rehearsal fixes | Mon 24 Aug | Only what the rehearsal turned up |
| **Freeze** | Tue 25 Aug | No further changes to scoring or schedule code |
| Copy/CSS only | Wed 26 – Fri 28 Aug | Text, colours, links. Nothing structural |
| Tournament | **Sat 29 Aug** | |

The freeze is the important line. A display bug on the day is embarrassing; a
scoring bug is unrecoverable, because the standings are the product. Anything
that writes a score or builds a schedule must be in before the rehearsal, or it
does not go in at all.

## Gates outside the build

These block work but aren't work themselves. Flagged because the plan slips if
they do.

1. **The real team list.** No final schedule until teams and pools are real.
   Everything downstream — pool assignment, generation, printed cards, QR codes
   — waits on it. This is the single longest pole.
2. **Sequencing decision.** Staging currently holds 15 field double-bookings
   from before the field constraint was fixed. Someone has to choose whether
   the two divisions get their own pitches, run one after another, or take
   turns, then rebuild. Changing this reshapes the whole day, so it is not a
   call to make on 28 August.
3. **Production is down.** `scorescupchicago.games` returns 502 — an old vhost
   pointing at deleted ports. Staging is fine. Must be fixed well before the
   day, and ideally before anyone is told the URL.
4. **Database backups.** Documented as a manual command, nothing scheduled.
   Should be automated before real results exist.
5. **Is 15 minutes enough between pools and playoffs?** See Cadence below.
   Director's call.

---

## Tier 1 — correctness bugs (do first, before anything else)

These touch the scoring path, so they need the most soak time before the
rehearsal.

### 1.1 A 0–0 draw cannot be recorded — and unscored games look scored

**Size: M · Risk: highest in the plan · Files: `apps/api/src/routes/ref.ts`,
`apps/web/src/components/admin/ResultsPanel.tsx`, `apps/web/src/pages/RefView.tsx`**

The director reported that opening a game registers it as 0–0. It's subtler and
worse than that:

- Opening the editor *displays* `0–0` where an unscored game shows `–`, but the
  change is not saved. So the data is correct and the screen lies.
- The comparison that decides whether a game changed treats "no score" and
  "0–0" as the same value. So **a genuine nil-nil draw cannot be entered from
  the admin results screen at all.** It silently isn't a change, so no save
  button appears.

Both come from the same root: the system cannot tell "nobody entered anything"
from "it finished nil-nil". Fix:

- Represent an unentered score as null throughout the editor, not 0.
- Counters start blank; the first press sets 0. `–` and `0` become visually
  distinct everywhere.
- New `DELETE /api/ref/fixtures/:fixtureId/score` — nulls both scores, sets
  status back to `scheduled`, audited.
- "Clear result" button with a confirmation naming the game and score.
- The ref view queues score writes offline (`score:<fixtureId>`); the clear
  action must go through the same queue or explicitly refuse when offline.
  Do not let a clear silently vanish on a field with no signal.

**Tests:** enter 0–0 and confirm it saves and appears in standings; clear a
result and confirm the team's played count drops; clear while offline.

### 1.2 Unassigning a field makes the game disappear

**Size: S · Files: `apps/web/src/components/admin/ScheduleGrid.tsx`**

The grid renders a cell per (field, time). A game with no field matches no
cell, so it vanishes with no way to select it again. The director noticed and
was correctly afraid to click away.

Add an **Unassigned** row beneath the field rows holding any game with no field
or no kickoff time, styled as needing attention. Nothing can be lost if there
is always somewhere for it to sit.

### 1.3 The "Highlight" division dropdown does nothing

**Size: S · Files: `apps/web/src/components/admin/ScheduleGrid.tsx`**

`showAll` is computed on line 129 and never used. The filter was never wired
up. Dim the other divisions rather than hiding them — a hidden game is a game
whose pitch clash you cannot see.

---

## Tier 2 — the timing model

Replaces the director's request to type kickoff times directly. Two layers, no
free-text times, no breaks.

Reasoning: the kickoff dropdown only offering existing times is the guardrail
that keeps the day on a readable cadence. The real problem is that the cadence
itself is invisible and frozen.

### 2.1 Cadence settings

**Size: M–L · Risk: medium (feeds generation) · Must land before final generate**

Today the timing exists and works but has no interface at all —
`changeoverMinutes` appears in zero web files, and there is no endpoint to
change any of it. Pool play is hardcoded to 14-minute halves + 2 + 5 = a
35-minute slot; playoffs to 12 + 3 + 5 = 32. **There is currently no way to
change the length of a game.**

Expose per division:

| Setting | Now | |
|---|---|---|
| Half length | 14 (pool) / 12 (playoff) | |
| Half-time | 2 / 3 | |
| Changeover | 5 | Gap before the next game on that pitch — this *is* the "time between rounds" |
| Pool → playoff gap | 15 | Hardcoded default, never surfaced |

- New `PUT /api/setup/divisions/:divisionId/timing`. Stage config is JSONB, so
  no migration; validation bounds already exist in `stageConfig.ts`.
- Store the stage gap on the bracket stage config, since that is the stage
  being pushed back.
- The widget must **show the consequence, not the inputs**: "35-minute slots →
  9:00, 9:35, 10:10, 10:45…" and the resulting end of day. Same principle as
  the playoffs screen.
- Warn plainly that changing this requires a regenerate, and that regenerating
  rebuilds the day.

**On the 15-minute stage gap:** it is not compute time — standings resolve the
instant the last pool game is scored. It is human time: learning you qualified,
walking to another pitch, restarting a team that has been sitting. It is the
tightest transition of the day and the only moment both divisions move at once.
Worth asking the director directly whether it should be 20 or 25.

### 2.2 Delay control

**Size: M · Risk: low (never runs during generation) · Files: new endpoint +
`ScheduleGrid.tsx`**

The only genuine on-the-day time control. Lightning, a long injury, a
first-round overrun.

> Pick a round. Add ten minutes. Everything from there shifts. Gaps preserved.

- New `POST /api/schedule/events/:eventId/delay { fromKickoffAt, minutes }`.
- **Event-wide, not per division.** With divisions taking turns, a delay at
  10:10 must move the other division's 10:45 too — same reasoning that made
  scheduling event-level in the first place.
- **Only `status = 'scheduled'` games move.** A completed game's kickoff time
  is a record of when it was actually played; an in-progress game has already
  started. Moving either would falsify the record.
- Preview before applying: how many games move, the new last kickoff, and a
  warning if it runs past the event's end time. That warning is the moment
  someone decides to shorten halves instead — it needs to arrive *before* the
  decision, not after.
- Reversible: negative minutes undo it, for when the rain stops sooner than
  feared.
- Audited via `recordAudit`.

**Rehearsal must exercise this.** Delay a round mid-run and confirm the public
board, the ref phones and "next up" all agree afterwards.

---

## Tier 3 — the punchlist proper

Ordered by value per hour. Everything here is display-only unless noted, so it
carries far less risk than Tiers 1–2.

### Must land

| # | Item | Size | Notes |
|---|---|---|---|
| 3.1 | **Cards column in standings** (public + admin) | S–M | Engine already counts yellows/reds and already uses them as a tiebreaker — purely a display gap. Add a short "how ties are broken" note. Check the Pool A/B column widths afterwards; may fix or worsen the director's scrollbar item. |
| 3.2 | **Unscored games greyed + scored/unscored/all filter** | S | Pairs naturally with 1.1 — once `–` and `0` are distinct, this is what makes the distinction useful at a glance. |
| 3.3 | **Mobile "On the pitches" wrap** | S | Three-column row squeezes on long names ("JPMorganChase"). Director's own fix is right: teams onto their own line under field + time, below ~600px. |
| 3.4 | **Referee view of the grid** | M | Referee names already show on assigned games. They look absent because referees default to *covering a pitch*, not being assigned per game. Add a referee-by-time layout so rotations and gaps are visible — that is the actual ask. |
| 3.5 | **Pool renaming** | S | Currently auto-named Pool A/B. |
| 3.6 | **Division order** | S | `sort_order` already exists and is already the sort key; there is no UI for it. Lets the director drop the "1) Competitive / 2) Community" naming workaround. |
| 3.7 | **Playoff time-window count** | M | Add total game windows (pool + playoffs) to "What that gives you". Needs the feasibility figures, which already report waves and slots elapsed. This is the number they are actually optimising when sizing the playoffs — worth the extra effort over the rest of this table. |
| 3.8 | **QR code on printed referee cards** | S | A referee who cannot find the site writes on paper, and paper reaches the scores table late. Costs nothing to print. Confirm we generate the cards; if they're made outside the app this is just a URL to hand over. |

### Should land

| # | Item | Size | Notes |
|---|---|---|---|
| 3.9 | Back-to-tournament button next to "My Team" | S | Logo-as-home isn't discoverable. Agreed. |
| 3.10 | "Following" at the top on mobile | S | Rails stack, so it currently lands mid-page. CSS order only. |
| 3.11 | Grid transpose (fields across the top) | S–M | Matches how their planning is already done. |
| 3.12 | Links to SCORES site + donation page | S | It's a fundraiser. |
| 3.13 | Clarify "Games per team before playoffs" | S | Copy only. |

### Cuttable — drop these first if the rehearsal finds anything

| # | Item | Size | Notes |
|---|---|---|---|
| 3.14 | Team colours | M | Genuinely useful for volunteers finding teams, but touches the schema and several display surfaces. First thing to cut. |

---

## Tier 4 — after the tournament

Not because they're bad. Because they don't survive contact with a 16-day
window, and two of them deserve real design.

- **Manual pool seeding, and assigning teams live at a draw party.** The most
  interesting item on the punchlist. Teams currently seed alphabetically. This
  wants to be built properly, not bolted on two weeks out.
- **Scheduled messages.** Needs something running reliably in the background —
  a bigger piece than it appears.
- **Pool A/B desktop scrollbar.** Revisit after the cards column lands; the
  widths change anyway.

---

## Explicitly not building

- **Typing kickoff times directly.** Replaced by 2.1 + 2.2. Free-typed times
  put 10:52 on one pitch while everything else runs on :00/:35, and every
  downstream assumption — rest checks, clash detection, "next up" — degrades
  against a schedule nobody can read.
- **Lunch breaks as a scheduled concept.** Adults can find lunch. The one gap
  that isn't about food — pool to playoffs — is folded into 2.1 as a cadence
  number.
- **Typing over standings.** Standings and playoff entrants stay computed. The
  escape hatch is the existing per-game override plus audited points
  adjustments, both of which show their working. A table that can disagree with
  the games it came from is the failure mode this whole system exists to avoid.

---

## What the rehearsal has to prove

Not "does it work" — it has to prove the specific things that only break under
real conditions:

1. A full day scored end to end, entered on phones, outdoors, in daylight.
2. A 0–0 draw entered, and a wrong result cleared and re-entered.
3. A round delayed mid-run, with the public board and ref phones agreeing after.
4. Pools completing → playoff brackets filling themselves, with no one typing a
   team name.
5. Dark-glass spectator panels read in direct sun. This is untested and is the
   most likely thing to be quietly unusable.
6. A referee arriving cold, finding the site from the QR code, entering a score.

---

## Suggested order of work

1. **1.1 score clear / 0–0** — highest risk, needs the most soak time
2. **1.2, 1.3** — an hour together, removes two sharp edges
3. **2.1 cadence** — before the final schedule is generated
4. **3.1 cards, 3.2 unscored** — visible, low risk, pairs with 1.1
5. **2.2 delay** — before the rehearsal, so the rehearsal can exercise it
6. **3.3–3.8** — the rest of "must land"
7. **3.9–3.13** — as time allows, safe right up to the copy freeze
