---
target: my landing page
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-08-15T02-27-48Z
slug: apps-web-src-pages-spectator-tsx
---
# Critique — Public spectator board (`/`, `apps/web/src/pages/Spectator.tsx`)

Method: dual-agent (A: design review, blind to detector output · B: deterministic evidence).
Browser visualization skipped — no browser automation exposed (no Playwright/Puppeteer/chromium-cli).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | No "last updated" time; after a failed poll stale scores look fresh. No first-paint skeleton (`loading` false while `event` null) |
| 2 | Match System / Real World | 3 | Division select labelled "Tournament"; `P W D L GF GA` never expanded |
| 3 | User Control and Freedom | 2 | `pickedFixtureId` is a one-way door — no "back to live" |
| 4 | Consistency and Standards | 3 | Pool names inherit the `.glass h2` panel-label whisper, losing the rail's only wayfinding |
| 5 | Error Prevention | 2 | Dash Is A Value Rule unenforced on the public board — `–` and `0` render identically |
| 6 | Recognition Rather Than Recall | 2 | Following marks only the standings row; division scoping must be held in the head |
| 7 | Flexibility and Efficiency | 2 | No URL state on a page whose purpose is being shared |
| 8 | Aesthetic and Minimalist Design | 3 | Strongest axis; deductions for repeated card-rule paragraph and pre-kickoff zeros |
| 9 | Error Recovery | 2 | Network failure renders "No fields have games on them yet" — a data claim answering a network error |
| 10 | Help and Documentation | 2 | Tournament format stated nowhere on the page |
| **Total** | | **24/40** | **Acceptable** |

Applicable maximum 40; no heuristic scored n/a.

## Design Specificity Verdict

Authored for this product, with a generic dashboard skeleton at the edges, and one specificity
failure that outweighs the styling questions.

Product-specific: the Jersey rendering nothing for an unknown kit (a grey shirt is a false
statement about the pitch); the clock's `awaiting` phase refusing to say `0'`; FieldBoard
spanning divisions because pitches don't care which tournament is on them.

Category-interchangeable: `Pulse` (four-tile KPI strip + progress bar) in prime rail real estate;
the three-tab segmented control, which never expresses the tournament's actual structure.

The failure: the composition assumes the tournament is always happening now. `eventDate` is in
the public payload and rendered nowhere on this route.

### Deterministic scan

- Markup scan (Spectator.tsx, spectator/*, StandingsTable, FixtureList, Bracket, Jersey,
  AppHeader): **0 findings, exit 0. Clean.**
- Stylesheet scan (supplementary): 1 finding — `layout-transition` at `spectator.css:510`
  (`transition: width` on the Pulse progress bar).
- Suppressed by config: `side-tab` at `styles.css:988` (`.slot`, admin schedule grid).
  Confirmed false positive for this target — `.slot` appears nowhere in the spectator tree.
  Note: the persisted ignore is not picked up when the detector runs from `apps/web/`.
- `layout-transition` also suspected FP: single 0.6s bar, named in DESIGN.md, already
  suppressed under `prefers-reduced-motion`.

### Live state evidence (running API + database)

- `event.location: null` → header subtitle resolves to the string "2026"
- `announcements: []` → the `role="status"` banner never renders
- `rules.pages: []` → the rules page PRODUCT.md calls "linked from every view" is empty
- Fixtures: **27 scheduled / 3 complete / 0 in_progress** → all live paths unreachable
- **6 of 16 teams** have a jersey set; all in Competitive
- App shell confirmed carrying three font preloads + `theme-color #00467f`

## Priority Issues

### [P0] No date rendered; the board reads as live 15 days before the event
Every temporal signal asserts today ("The day so far", "Kickoff 9:00 AM", pools badged
"In progress"). A captain opening the shared link sees dashes and zeros and concludes the app is
broken. Also breaks the day after the event.
Fix: derive tense from `eventDate`; header subtitle → date + venue; pre-event Spotlight variant
(countdown, first kickoff, team/division counts, donate ask); suppress Pulse zeros; standings
pill → "Not started" when all rows have `played === 0`. Add og:title/description/image —
`index.html` has none, and the link is being pasted into team chats and sponsor email.
Command: `/impeccable onboard`

### [P1] The primary user gets the theme the product predicts will fail in sun
No light mode, no high-contrast option, no `prefers-contrast` handling. Ratios pass on paper
(white 14.75:1, soft white 7.24:1) but ratio is the wrong metric outdoors. Board controls sit
under the stated 48px floor: chip-btn 36px, seg 38px, select 42px (explicitly overriding the
global 48px).
Fix: "Bright sun" toggle swapping `.spectator` custom properties to opaque panels,
`--on-glass-soft` 0.66 → 0.85, persisted in localStorage, defaulted on under
`prefers-contrast: more`. Raise the three controls to 44–48px.
Command: `/impeccable adapt`

### [P1] Division scoping is invisible and mislabelled
Spotlight and FieldBoard span all divisions; tabs, standings and bracket are scoped to one. With
Competitive in the morning and Community in the afternoon this is the normal state for most of
the day. The control is labelled "Tournament".
Fix: rename to "Division"; retitle the panel to name the action; add division to the Spotlight
tag row and each field row; one line of structure above the tabs, from event config.
Command: `/impeccable clarify`

### [P1] An unentered score looks like a real score on the public board
`.fixture.unscored` and the Unscored Hatch exist in `styles.css` but are applied only in
`admin/ResultsPanel.tsx`. `FixtureList` never adds the class. Both `–` and a real `0` render at
700 weight, full white.
Fix: add `unscored` in FixtureList with a board-native treatment (135° hatch at ~5% white; dash
in `--on-glass-soft`). The light-theme rule cannot be reused as-is: `--ink-soft` at 60% opacity
measures 1.59:1 on glass. Soften the Spotlight dashes too.
Command: `/impeccable polish`

### [P2] Picking a fixture is a one-way door; no state is shareable
One tap permanently disables the Spotlight's auto-selection. Division, team, tab and pinned
fixture have no URL representation.
Fix: "Back to live" chip when the pin diverges from auto-selection; auto-clear on completion;
mirror state into the query string with localStorage as fallback.
Command: `/impeccable harden`

## Persona Red Flags

**Jordan (first-timer):** header reads "2026"; "Tournament" select implies two tournaments;
column abbreviations never expanded; format explained only inside the Bracket empty state behind
the third tab; Pulse announces a pool leader at zero games played and prints "1 pts".

**Casey (one hand, sun, weak signal):** seg 38px / chip-btn 36px / select 42px; "Hover or tap a
number for the breakdown" is false on touch (it's a `title` attribute); no last-updated
timestamp; no first-paint skeleton; poller refetches event + every division in full every 20s
with no ETag, no backoff, and no pause when hidden.

**Sam (screen reader + keyboard):** no `<h1>`, no `<main>`; five sections with visible headings
but no accessible names; card counts use `aria-label` on a bare `<span>` (not honoured);
`aria-live="polite"` wraps the entire Spotlight including switch chips; finished pitches are
`disabled` and leave the tab order. Correct: universal 3px focus ring, `prefers-reduced-motion`
honoured, Jersey `alt="" aria-hidden` avoids double-announcement.

**Sponsor / donor:** "Donate" is the smallest text on the page; mission line absent; Community
has no jerseys at all and the Spotlight reflows shorter without them inside a height-locked
layout; sponsor-named pitches don't surface and `.field-name` sits at 75% opacity.

## Minor Observations

- Card-rule paragraph repeats verbatim per pool, spending the One Screen height budget twice.
- Right-rail scroll at 1280px is uncued; Pool B sits below the fold behind an invisible thumb.
- `divisionId` defaults to `divisions[0]` — API array order picks the first-time visitor's view.
- Bracket round names are `<h2>` inside a glass panel, inheriting the panel-label whisper.
- `.notice.error` is the only light-theme surface on the board.
- `index.html` deliberately omits `maximum-scale` so pinch-zoom survives. Preserve.

## Questions to Consider

1. If direct sunlight is the design environment, why is the primary user's surface the one theme
   the product predicts will fail there? What is the navy buying, and for whom?
2. The board has one layout and the tournament has three tenses. What if the front door were
   explicitly Before / Today / After?
3. Standings are computed, never typed — so why is the story still left for the viewer to
   compute? "2nd in Pool A. A draw at 11:25 puts them in the semi-final."
4. What is the shareable artefact — the tournament, or a team?
