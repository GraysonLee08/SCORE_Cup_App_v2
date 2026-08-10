# Open Questions — SCORE Cup 2026

Running list of things we need answered by the **SCORES Director**, the **Tournament Organizer**, and the **Tournament Programmer**.
Status: `OPEN` = unanswered · `PARTIAL` = some of it answered · `ANSWERED` = settled.

Last updated: 2026-08-10 (after Tournament Organizer's rule sheet)

---

## Highest priority

### 1. Concurrent or sequential? — CONTRADICTION
**Status:** OPEN · **Blocking for scheduling, not for build**
The director's email said the two tournaments run **"one after the other."** You've since said it sounds like **concurrent, 2 fields each**, across a 4-field venue. These are completely different days.
- Which is it?
- Are the two divisions genuinely identical, or different (skill level, age, competitive vs. social)?
- Is each division **pinned** to its own 2 fields, or do both draw from all 4?

*Design note: supported either way without a redesign — divisions schedule against a shared event-level field calendar. But we can't produce a real schedule until this is settled.*

### 2. Pool structure — how do 10 teams each play exactly 3 games?
**Status:** OPEN · **Blocking**
The rules say "all teams play 3 pool play games." With 10 teams that's 15 fixtures per division, which is **not** a round robin — 2 pools of 5 would give each team 4 games.
- How are the 10 teams grouped? (Two pools of 5 playing 3 of 4 opponents? Pools of unequal size? One group with a fixed 3-game schedule?)
- If teams within a pool don't all play each other, **head-to-head as the first tiebreaker may not exist** between two tied teams. What happens then — skip to goals for?
- How many teams **advance to knockout**, and how are they seeded?
- Is there a **third-place game**?
- Is there a **consolation bracket**, or is the day over for non-qualifying teams?

### 3. Day logistics for Aug 29
**Status:** PARTIAL
- ✅ Match length: group 14-min halves + 2-min half (30 min); knockout 12-min halves + 3-min half (27 min); no stoppage time.
- ❓ **Changeover gap** between games on the same field — the rules give play time, not slot length.
- ❓ Confirm **4 fields**, all usable all day.
- ❓ **Day window** — first kickoff and hard stop.
- ❓ Minimum **rest gap** between a team's consecutive games.
- ❓ Any blocked-out time (lunch, opening ceremony, awards)?

*We cannot run the feasibility check without the window and the changeover gap.*

---

## Rules and gameplay

### 4. Suspension enforcement — warn or block?
**Status:** OPEN
A red card (or two yellows in a match) bans a player for at least the next match.
- Should the app **warn** the ref and coach that a player is suspended, or actively **block** recording them?
- The **Match Commissioner** can extend a ban. Who is that person, and do they need their own login, or does an admin record it on their behalf?
- Two reds in the tournament = banned for the rest of it. Does that span **both divisions** (i.e. could someone play on teams in both)?

### 5. Digital game card — replace or mirror the paper card?
**Status:** OPEN
Rules require both captains to sign a paper game summary card verifying winner, score, and card counts; once signed it is official.
- Does the app **replace** that with digital captain sign-off, or **mirror** it while paper stays authoritative?
- If the app disagrees with a signed card, which wins?

*Digital sign-off is a genuinely nice feature — captains confirm on the ref's phone — but it changes what "official" means and needs the organizer's blessing.*

### 6. Squad composition — track or just display?
**Status:** OPEN
At least 2 female-identifying players must be on the field at all times; a team short plays correspondingly short.
- Should the app **validate** this (e.g. flag a roster that can't field a legal squad), or simply publish the rule and leave it to refs?
- Roster gender data makes validation possible, but only if rosters are complete.

### 7. Card donations
**Status:** OPEN
Players receiving cards are "encouraged to make a cash or credit card donation."
- Should a recorded card surface a **donation link** (GiveButter) to the player or coach?
- Low effort, directly serves the fundraising purpose — worth confirming it's wanted.

### 8. Field Marshal role
**Status:** OPEN
The rules name Referee, Field Marshal, and Match Commissioner as escalation contacts.
- Does the **Field Marshal** need app access, and if so what can they do?
- Currently we have Admin / Ref / Coach / Participant / Spectator. Field Marshal and Match Commissioner may just be admins.

### 9. Anything the Tournament Programmer needs that we haven't modeled?
**Status:** OPEN
- Any format we haven't anticipated (consolation, Swiss, crossover between divisions)?
- Any constraint on which teams play when (a team needing an early finish, a player on two teams)?
- Any field-specific restriction?

---

## Data and registration

### 10. Participant data handling
**Status:** OPEN (low urgency — **participants are adults**; no COPPA or parental-consent obligations)
- ✅ **Gender identity is gameplay data** — it governs squad legality and PK shooter order. Resolved.
- ❓ Is **date of birth** needed for the tournament (eligibility/waivers), or is it reporting data?
- ❓ **Retention** — we propose auto-deleting rosters 30 days post-event. Confirm.
- ❓ Does anyone besides admin, the owning coach, and teammates need to see roster data?

### 11. GiveButter relationship
**Status:** OPEN
- For 2026, is GiveButter still the official registration path, with app rosters as a supplement?
- Do we need to **import** from GiveButter, or do people re-register in the app?
- Is replacing GiveButter for tournament registration an actual goal, or an idea?

### 12. Rosters are now mandatory — is that achievable?
**Status:** OPEN · **Newly critical**
Player-level card tracking is required by the rules, which means rosters must exist **before** the tournament.
- Realistically, what share of ~200 participants will self-register in three weeks?
- Are coaches reliable enough to complete rosters as backup?
- **Fallback is built in** (free-text card entry for unrostered players, flagged for admin reconciliation), but suspension tracking degrades without rosters.

### 13. Access and credentials
**Status:** OPEN
- Current admin password `ScoresCup312` and DB password `tournament_pass_2024` are **committed to the public GitHub repo** and must be rotated.
- Who besides you needs **admin** access on the day?
- Confirm `scorescup@chicagoscores.org` is the right address for password-reset requests.

---

## Answered / Decided

| Question | Decision | Date |
|---|---|---|
| Codebase approach | **Full rebuild**, optimized for reuse across future tournaments | 2026-08-10 |
| Stack | Vite + React + TS / Express + TS / Postgres / Docker on VPS | 2026-08-10 |
| Admin auth | Named accounts + audit trail on every edit | 2026-08-10 |
| Ref auth | Named accounts, admin-created, assigned to fields (QR idea dropped) | 2026-08-10 |
| Coach auth | Named accounts, admin-created, tied to one team | 2026-08-10 |
| Participant auth | **Self-registration** creates the account; join code gates team membership | 2026-08-10 |
| Spectator auth | **Fully public**, no login, with optional team filter | 2026-08-10 |
| Password reset | Manual — admin generates single-use temp password, emails it. No email provider. | 2026-08-10 |
| Schedule generation | Engine generates; admin can edit any game | 2026-08-10 |
| Pool assignment | Admin sets pool count; auto-balance with manual override | 2026-08-10 |
| Feasibility check | In the core build, not a stretch goal | 2026-08-10 |
| Field allocation | Per-division allowed-field set; empty = shared pool | 2026-08-10 |
| **Cards** | **Player-level — reversed from team-level.** Rules require per-player suspensions. | 2026-08-10 |
| Points | 3 win / 1 tie / 0 loss, **+1 bonus for a shutout win** (not 0–0) | 2026-08-10 |
| Tiebreakers | Head-to-head → goals for → goals against → fewest cards → rock-paper-scissors | 2026-08-10 |
| Pool draws | Allowed | 2026-08-10 |
| Knockout draws | **Straight to penalties**, no overtime; PK scores stored separately from goals | 2026-08-10 |
| Match timing | **Per stage**, not per event (group 30 min, knockout 27 min) | 2026-08-10 |
| Ref offline handling | Light: optimistic UI + localStorage retry queue | 2026-08-10 |
| Environments | Staging stack on a separate port; test tournament before Aug 29 | 2026-08-10 |
| Rules page | Public, admin-editable, linked from every view | 2026-08-10 |
| Big-screen TV display | Stretch goal only | 2026-08-10 |
