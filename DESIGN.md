---
name: SCORES Cup
description: Match-day tournament system for America SCORES Chicago — a floodlit public board and a sunlit working kit, built from one palette.
colors:
  brand: "#00467f"
  accent: "#e31837"
  focus: "#f5c518"
  ink: "#1a1d21"
  ink-soft: "#5c6670"
  line: "#dfe4e9"
  mist: "#eef2f6"
  surface: "#ffffff"
  page: "#f4f6f8"
  good: "#1a7f4b"
  bad: "#c0392b"
  warn: "#b8860b"
  board-top: "#0d2542"
  board-mid: "#071829"
  board-base: "#04101d"
  glass: "rgba(255, 255, 255, 0.075)"
  glass-strong: "rgba(255, 255, 255, 0.13)"
  glass-line: "rgba(255, 255, 255, 0.155)"
  sun-page: "#071c2e"
  sun-bar: "#0a2338"
  sun-panel: "#12324f"
  sun-panel-strong: "#1d456d"
  sun-inset: "#0c2439"
  sun-active: "#17405f"
  on-glass: "#ffffff"
  on-glass-soft: "rgba(255, 255, 255, 0.66)"
  live-pink: "#ff8a9b"
  ember: "#ff7a55"
  ink-inverse: "#0b2038"
  card-yellow: "#f7d154"
  card-yellow-edge: "#d9b23f"
  pip-yellow: "#f0c419"
  notice-error-bg: "#fdecea"
  notice-error-ink: "#7d241b"
  notice-error-line: "#f3c2bd"
  notice-ok-bg: "#e8f6ee"
  notice-ok-ink: "#14603a"
  notice-ok-line: "#bfe3cf"
  notice-pending-bg: "#fff6e0"
  notice-pending-ink: "#7a5a00"
  notice-pending-line: "#f0dca8"
  slot-hover: "#f4f8fc"
  slot-warn-bg: "#fff8e6"
  slot-warn-edge: "#d9a406"
  row-highlight: "#eaf3fb"
  board-scrim: "rgba(9, 27, 48, 0.62)"
typography:
  scale:
    micro: "0.7rem"
    label: "0.78rem"
    meta: "0.85rem"
    small: "0.92rem"
    control: "1rem"
    base: "17px"
    emphasis: "1.05rem"
    figure: "1.15rem"
    title: "1.2rem"
    stat: "1.35rem"
    heading: "1.5rem"
    stepper: "1.6rem"
    headline: "2rem"
    score-min: "2.6rem"
    score-max: "4.1rem"
  display:
    fontFamily: "'Lubalin Graph', 'Lubalin Graph Std', Rockwell, 'Roboto Slab', Georgia, serif"
    fontSize: "clamp(1.35rem, 2.4vw, 2rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "normal"
  headline:
    fontFamily: "'Lubalin Graph', 'Lubalin Graph Std', Rockwell, 'Roboto Slab', Georgia, serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Lubalin Graph', 'Lubalin Graph Std', Rockwell, 'Roboto Slab', Georgia, serif"
    fontSize: "1.2rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.04em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "1.35rem"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "0.12em"
  score:
    fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "clamp(2.6rem, 6vw, 4.1rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  panel: "14px"
  glass: "16px"
  pill: "999px"
spacing:
  xs: "0.35rem"
  sm: "0.6rem"
  md: "0.9rem"
  lg: "1rem"
  xl: "1.5rem"
  2xl: "2.2rem"
  tap: "48px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "0 1rem"
    height: "{spacing.tap}"
    width: "100%"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 1rem"
    height: "{spacing.tap}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.bad}"
    rounded: "{rounded.lg}"
    padding: "0 1rem"
    height: "{spacing.tap}"
  button-step:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    size: "{spacing.tap}"
  button-card-yellow:
    backgroundColor: "{colors.card-yellow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 1rem"
    height: "{spacing.tap}"
  button-card-red:
    backgroundColor: "{colors.bad}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "0 1rem"
    height: "{spacing.tap}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  admin-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "1.6rem 1.75rem"
  glass-panel:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.on-glass}"
    rounded: "{rounded.glass}"
    padding: "1rem 1.1rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 0.75rem"
    height: "{spacing.tap}"
  input-admin:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "42px"
  tag-live:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.2rem 0.6rem"
  pill:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0.15rem 0.55rem"
  score-display:
    textColor: "{colors.on-glass}"
    typography: "{typography.score}"
  slot:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.35rem 0.45rem"
    height: "52px"
  field-row:
    backgroundColor: "rgba(255, 255, 255, 0.05)"
    textColor: "{colors.on-glass}"
    rounded: "{rounded.xl}"
    padding: "0.6rem 0.75rem"
---

# Design System: SCORES Cup

## Overview

**Creative North Star: "Match Day"**

One Saturday in August, from the first kickoff to the last whistle. The system is
built around the two things that actually happen on that day: a crowd standing in
the sun wanting to know what just happened, and a volunteer with one free hand
recording it. Everything else is downstream of those two moments.

So the system runs two faces of one identity. **The board** is the floodlit face —
a deep navy field, frosted panels, scores large enough to read across a tent, a
live match holding the top of the screen. **The kit** is the working face — white,
hairline-ruled, 48-pixel targets because referees wear gloves, high contrast
because the screen is being read at arm's length in direct sun. They are not two
brands. They are the same navy, the same red, the same pencil yellow, arranged for
two different jobs. Glass only reads well over a deep background, and a referee
squinting at a phone in August daylight needs precisely the opposite of glass.

The personality is a sporting authority that never oversells: the numbers are the
drama, so the interface does not compete with them. Density is generous on the
board and compact in the kit. Ornament earns its place by encoding something real —
a hatched fill means nobody has scored that game yet, a pulsing dot means a match
is running now, a shirt icon means that is literally the shirt to look for on the
pitch. Nothing decorative is allowed to look like data.

> **Committed direction, after the 2026 tournament.** The board goes light. Not
> white throughout: the header and the footer stay Chicago Navy as bands, and
> between them the field becomes light, with the panels keeping their frosted
> treatment in grey rather than white-over-navy. Text inverts to ink.
>
> The reason is the organisation's own site, which is a light page between
> coloured bands — the board currently reads as a different product from the
> one running it. It is also the strongest available answer to the sunlight
> risk, which the referee's white kit already answers and the board does not.
>
> Deliberately not before 29 August 2026: it is CSS-only and carries no scoring
> risk, but it replaces the world every panel, tone and contrast pair on this
> surface was verified against, and the tournament runs on what is built and
> tested. Two things it will have to settle rather than inherit — whether
> Bright Sun still has a job once there is no deep background to escape, and
> whether Live Pink reverts to SCORES Red, which reads correctly on a light
> panel and was only ever a workaround for red going muddy on navy.

**Key Characteristics:**

- Two themes, one palette: floodlit board, sunlit kit.
- Numbers set in tabular figures at every size; digits never shift as scores change.
- Red means *now* or *wrong* — never merely "important".
- Definition from hairlines and whitespace in the kit, from depth and light-catching
  edges on the board.
- Touch targets never below 48px in the field; 42px at a desk.
- Every state that matters has a visible form, including absence: no field, no
  referee, no score.

## Colors

The organisation's own navy and red, taken from the values published on
chicagoscores.org, with a pencil yellow held back for focus so it stays visible
against both.

### Primary

- **Chicago Navy** (`#00467f`): the identity anchor. Fills the app header, primary
  buttons, active navigation, and the left edge of every scheduled game on the
  admin grid. On the board it is the field the whole page sits in, deepened.
- **Board Navy** (`#0d2542` → `#071829` → `#04101d`): the spectator background, a
  163° gradient from top-left to bottom-right. Not a separate brand colour — the
  same navy taken down to where white text and frosted glass can live on it.

### Secondary

- **SCORES Red** (`#e31837`): reserved for *live*. A running match, the pulse of a
  progress bar, the accent bar beside the active sub-page. It is the only colour
  allowed to mean "this is happening right now".
- **Alarm Red** (`#c0392b`): a different job entirely — errors, clashes, a red card,
  a destructive action. Kept distinct from SCORES Red so "live" and "wrong" never
  wear the same colour.

### Tertiary

- **Pencil Yellow** (`#f5c518`): focus rings, and the tint on the row of the team
  you are following. Chosen because it survives against both the navy and the white.
- **Card Yellow** (`#f7d154`, edge `#d9b23f`, pip `#f0c419`): not a UI colour. This
  is a referee's yellow card, and it appears only where a card is being issued,
  counted, or displayed.
- **Live Pink** (`#ff8a9b`): the one colour that exists only on the board — a
  running field's name and a ticking clock. Red at that size on that background
  goes muddy; this is red made legible on glass.

### Neutral

- **Ink** (`#1a1d21`): body text in the kit.
- **Soft Ink** (`#5c6670`): labels, metadata, hints, and column headers.
- **Hairline** (`#dfe4e9`): every border and divider in the kit.
- **Mist** (`#eef2f6`): resting fill for pills, join codes, and hover states.
- **Surface** (`#ffffff`) and **Page** (`#f4f6f8`): card over page; the admin shell
  reverses this and goes white edge to edge.
- **On Glass** (`#ffffff`) and **On Glass Soft** (`rgba(255,255,255,0.66)`): the
  board's two text tones. There is no third.

### Functional Tints

Three-part sets rather than single colours: a wash, a matching edge, and an ink
dark enough to read on the wash. They are not decorative variants of the status
colours above and must not be substituted for them.

- **Error** (`#fdecea` / `#f3c2bd` / `#7d241b`) and **Ok** (`#e8f6ee` / `#bfe3cf`
  / `#14603a`): the two obvious notice states.
- **Pending** (`#fff6e0` / `#f0dca8` / `#7a5a00`): its own state, and the one
  that matters here — a score queued offline is neither success nor failure, and
  showing it as either is a lie to a referee standing on a pitch.
- **Slot warning** (`#fff8e6` wash, `#d9a406` edge): a scheduling warning that may
  be deliberate, as against a clash, which takes Alarm Red and must be fixed.
- **Slot hover** (`#f4f8fc`) and **row highlight** (`#eaf3fb`): the two faint navy
  washes that mark pointer position and the team you are following. On the board
  the following highlight becomes Pencil Yellow at 16% instead, because a pale
  navy disappears against a navy field.

Two more sit outside the tint sets. **Ink Inverse** (`#0b2038`) is the text colour
for anything white-filled on the board — active chips, the segmented control, a
finished tag. **Ember** (`#ff7a55`) is the far end of the progress bar's gradient
from SCORES Red, and appears nowhere else.

### Named Rules

**The Red Means Now Rule.** SCORES Red marks a match in progress and nothing else.
If a thing is merely important, it is navy or it is bold — not red. A board where
three panels are red is a board where nobody can find the game being played.

**The Pencil Yellow Rule.** Yellow is focus and following. It never fills a
surface, never carries a label, and never appears as a brand accent. Its one
decorative appearance — a 9%-opacity wash in the board's bottom glow — is the
limit, not a precedent.

**The Cards Are Not A Palette Rule.** Card Yellow and Alarm Red belong to the
referee's cards. No button, badge, or status may borrow them for an unrelated
meaning; on this product a yellow rectangle is a booking.

## Typography

**Display Font:** Lubalin Graph (Demi / 600), with Rockwell, Roboto Slab, and
Georgia as fallbacks — the organisation's own heading face, self-hosted.
**Body Font:** Poppins, with the system sans stack behind it — the organisation's
own body face, self-hosted.

**Character:** A geometric slab serif over a geometric sans. Lubalin Graph is
warm, round, and slightly civic — it reads as a badge on a shirt, which is exactly
what a tournament heading is. Poppins underneath is neutral enough to disappear
into a table of results and geometric enough to look related rather than borrowed.
The pairing comes from chicagoscores.org and is a brand commitment, not a
preference.

> **Implementation note:** both faces are self-hosted as Latin-subset woff2 in
> `apps/web/public/fonts/`, built by `tools/build-fonts.py`. Two things that
> build does are load-bearing. Poppins has no `tnum` feature and proportional
> digits, so the script rebuilds its digits to a single width — the tabular
> figures this system depends on come from the font file, not from CSS. And
> Lubalin is held as *Regular* standing in for the site's *Demi*, declared
> across `font-weight: 400 800` so no heading renders as a synthetic bold. When
> the Demi file arrives, add it and narrow that range to 400.

### Hierarchy

- **Display** (Lubalin 600, `clamp(1.35rem, 2.4vw, 2rem)`, 1.15): the two team
  names in the board's spotlight — the largest words on any screen, scaled with
  the viewport because the same panel serves a phone and a venue display.
- **Headline** (Lubalin 600, 2rem, 1.2, -0.02em): the admin page title. Drops to
  1.5rem below 900px.
- **Title** (Lubalin 600, 1.2rem, 1.2, -0.01em): card and panel headings.
- **Body** (Poppins 400, 17px, 1.45): everything read as prose. 17px, not 16 —
  this is read outdoors at arm's length. Hints and help text sit at 0.92rem and
  measure no wider than 60ch.
- **Label** (Poppins 700, 0.7–0.85rem, +0.04–0.09em, uppercase): column headers,
  time headings, nav groups, tags, and the board's panel titles. Uppercase is
  confined to this role.
- **Score** (Poppins 800, `clamp(2.6rem, 6vw, 4.1rem)`, tabular figures, -0.03em):
  the spotlight scoreline. Its smaller relatives — team scores at 1.15rem,
  standings figures, stat tiles at 1.35rem — share the tabular treatment.
- **Mono** (system mono stack, 700, +0.12em): the two strings a person has to
  transcribe exactly — a team's join code and an admin-issued temporary
  password. It is here to keep `0` apart from `O` and `1` apart from `l` while
  somebody reads one out across a car park, at 1.35rem for a temporary password
  shown on its own and at body size for a join code set inline. It is the
  system's only monospace, and a code is the only thing that earns it.

### Scale

Thirteen steps plus the 17px base. The six roles above name the *jobs*; these are
the sizes those jobs and everything around them are allowed to take. The small end
is dense because this is an information product read at three distances — a phone
at arm's length, a laptop at a desk, a display across a tent — and each needs its
own quiet tier beneath the body text.

| Step | Size | Where it works |
|---|---|---|
| micro | 0.7rem | Nav group headings, the referee line on a grid slot, stat tile captions |
| label | 0.78rem | Column headers, tags, time headings, key-value terms |
| meta | 0.85rem | Fixture metadata, hints, form labels, the board's panel titles |
| small | 0.92rem | Dense body: notices, list rows, standings cells, admin hints |
| control | 1rem | Buttons, checkboxes, and headings sized to the root rather than the ramp |
| base | 17px | Body prose. Deliberately not 1rem — this is read outdoors at arm's length |
| emphasis | 1.05rem | Inline-editable titles, the spotlight clock, a field's live score |
| figure | 1.15rem | Team scores in a fixture row |
| title | 1.2rem | Card and panel headings |
| stat | 1.35rem | Stat tiles, temporary access codes, the spotlight name floor |
| heading | 1.5rem | `h1` in the kit, and the admin headline on a narrow screen |
| stepper | 1.6rem | The `+` / `−` glyph. Sized by the control, not by the ramp's logic |
| headline | 2rem | The admin page title, and the display ceiling |
| score-min / score-max | 2.6rem / 4.1rem | The spotlight scoreline's clamp endpoints |

### Named Rules

**The Thirteen Steps Rule.** A size that is not on the ramp does not exist. The
stylesheets once held 27 distinct sizes, fifteen of them between 0.68 and 0.98rem
— differences of a third of a pixel that nobody chose and nobody could see. When
a new element needs to sit between two steps, it takes one of them.

**The Numbers Are Not Decoration Rule.** Every figure that can change — scores,
goals for and against, points, card counts, stat tiles, counters — sets in the
body face with `font-variant-numeric: tabular-nums`. The display face never
touches a changing number. A score that shifts sideways when 9 becomes 10 is a
score people stop trusting.

**The No Shouting Rule.** The organisation's own site uses no uppercase runs, and
neither does this. Uppercase belongs to labels at 0.92rem or below, always with
positive tracking, never longer than three words. Headings are mixed case at every
level, including in the admin.

**The Dash Is A Value Rule.** "–" means nobody has entered a score; "0" means it
finished nil–nil. They must never render alike. An unentered figure is Soft Ink;
an entered zero is full Ink at full weight.

## Layout

**The kit** is a single 720px column, centred, with 1rem gutters — a reading width
that holds on a phone and does not sprawl on a laptop. Cards stack at 0.9rem
intervals. The header is sticky at the top with `z-index: 10`.

**The admin** is desktop-first and fills the window: a 248px navigation rail beside
a scrolling content column, inside a `100dvh` shell that itself never scrolls, so
the nav and the page heading stay put while the content moves. One widget is shown
at a time, capped at 1100px (`.widget.wide` releases it), which is what buys the
room for the borderless, whitespace-defined panels. Below 900px the rail becomes a
horizontal scrolling strip; below 860px it becomes a wrapping row of chips and the
shell's fixed height is released, because a fixed-height shell with two scrolling
panes is a desktop idea that traps content on a phone.

**The board** is a named-area grid that reorganises three times. Stacked on a
phone, the order is: full-width spotlight, then *Following*, then the centre rail —
the follow control is the only input on the page and must not land halfway down.
At 880px it becomes two columns; at 1280px it becomes three (`minmax(16rem,20rem)`
/ `minmax(0,1fr)` / `minmax(19rem,25rem)`) and the page height-locks to the
viewport: the page itself stops scrolling and each rail scrolls inside itself, with
thin translucent scrollbars. The right rail is deliberately wide enough that the
standings' Cards column — the tiebreaker the table exists to explain — is not what
scrolls out of sight.

**Rhythm.** 0.35 / 0.6 / 0.9 / 1 / 1.5 / 2.2rem. Card padding is 1rem in the kit
and 1.6–1.75rem in the admin. Board panels sit on a 1rem gap, tightening to 0.75rem
below 880px.

### Named Rules

**The Page Never Scrolls Sideways Rule.** Wide content scrolls inside its own
container, never the document. Every grid column is `minmax(0, 1fr)`, never a bare
`1fr` — `1fr`'s automatic minimum is min-content, so one wide table stretches the
whole column past the screen instead of scrolling within it.

**The One Screen Rule.** At 1280px and above, the board fits one display with no
scrolling. Anything added to it must earn its height from something else, not from
the bottom of the page.

## Elevation & Depth

Depth is theme-specific and each theme uses exactly one mechanism, so the two never
blur together.

**The kit is flat.** Cards are white on a light grey page with a single hairline
border and no shadow. A live game is marked by thickening that border to 2px in
navy — depth is never used to mean state.

**The admin is lifted.** Panels drop their border entirely and float on a two-layer
shadow, borderless and roomy, with definition coming from whitespace rather than
hard edges. This is the one place borders are traded away, and it is deliberate:
showing one widget at a time is what makes the whitespace affordable.

**The board is glass.** Panels are a 7.5%-white fill over the navy gradient with a
22px backdrop blur at 150% saturation, a translucent edge, a deep drop shadow, and
a 1px inset highlight along the top edge — the light-catching edge that makes a
translucent panel read as a physical sheet rather than as washed-out text.

### Shadow Vocabulary

- **Admin lift** (`0 1px 2px rgba(16,32,52,.06), 0 6px 20px rgba(16,32,52,.05)`):
  the only shadow in the light theme. Ambient, not directional.
- **Glass lift** (`0 12px 34px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.14)`):
  every board panel.
- **Live glass** (adds `0 0 0 1px rgba(227,24,55,.18)` and a 45%-opacity red edge):
  the spotlight when a match is running. The only state-driven shadow in the system.

### Bright Sun

The board has a second material, reached from a switch in its header. It is not
a theme and not a preference: it is the answer to the one condition the glass
cannot survive, and it changes the material while leaving the design alone.

Glass spends contrast to buy depth. Outdoors that trade stops paying, because
sunlight falling on the screen adds the same luminance to a panel and to the
text on it, flattening exactly the mid-tones this world leans on — and a ratio
measured indoors describes none of that.

So in bright sun the panels stop being glass: `backdrop-filter` is removed
entirely, panels go opaque (**Sun Panel** `#12324f`, with **Sun Panel Strong**
`#1d456d` for controls and **Sun Inset** `#0c2439` for surfaces that were a 5%
white wash), the background gradient flattens to **Sun Page** `#071c2e`, the
atmospheric glow is hidden, and `--on-glass-soft` rises from 66% to 85% white.
Soft text goes from 7.2:1 on glass to **9.9:1**; white sits at **13.2:1**. The
two smallest type tiers each move up one step on the ramp, and the unscored
hatch doubles in strength.

A stored choice wins permanently and in both directions. With no stored choice,
`prefers-contrast: more` turns it on without the visitor having to find the
switch.

### Named Rules

**The Material Changes, The Design Does Not Rule.** Bright sun may remove
translucency, blur, gradient and glow, and may raise a tone or a type step. It
may not move an element, change a colour's meaning, hide content, or introduce
a shape the standard board does not have. Somebody switching mid-match must
find the same board, in a different material.

**The One Mechanism Rule.** A surface is defined by a hairline, *or* by a shadow,
*or* by glass. Never two. A bordered card with a drop shadow means someone has
mixed the themes.

**The Blur Retreats In Daylight Rule.** Below 880px the glass gets more opaque
(82% navy) and less blurred (12px), because blur is expensive and least legible
exactly where phones are used — outdoors. Where `backdrop-filter` is unsupported,
panels fall back to 90% solid navy. Translucency is never allowed to degrade into
unreadable text.

## Shapes

Rectilinear, softened. The radius is a ladder tied to the size of the surface:
6px for inline controls (grid slots, inline-edited titles, code chips), 8px for
admin controls and header buttons, 10px for the kit's default card, input, and
button, 12px for board rows and segmented controls, 14px for admin panels, 16px
for glass panels. Anything fully round (999px) is a pill: tags, chips, progress
bars, and the follow controls.

Three shapes deliberately refuse the ladder. **Cards** — the referee's — are near
rectangles: 3px radius on the list chip, 1px on the standings pip, at 7×11px and
1.1×1.5rem respectively. They are meant to read as playing cards, not as UI.
**Marks** — the 14×2px rule between the two spotlight scores — take half their own
thickness (2px), which is the same gesture as the pip at its own scale rather than
a step on the ladder. **Jerseys** are unradiused artwork at a fixed 3:4 aspect
ratio, sized by height so the box exists before the image loads.

### Named Rules

**The Radius Follows Size Rule.** Small surfaces take small corners. A 6px radius
on a 16px-tall control and a 16px radius on a full panel are the same gesture at
two scales; a 16px radius on a small control is a different design.

## Components

### Buttons

- **Shape:** gently rounded (10px in the kit, 8px in the admin), full 48px minimum
  height in the field and 42px at a desk.
- **Primary:** navy fill, white text, weight 700, full width in the kit — it is the
  end of a task, so it spans the column. In the admin it shrinks to its content
  with 1.4rem side padding.
- **Ghost:** transparent fill on the standard hairline. The default for anything
  that is not the main action.
- **Danger:** white fill, Alarm Red text and border. Destructive actions never
  arrive pre-filled in red; they announce themselves in outline and confirm in words.
- **Step** (`+` / `−`): a 48px square, 1.6rem glyph. The primary scoring control,
  sized for a gloved thumb.
- **Card buttons:** Card Yellow and Alarm Red fills, set below a hairline rule with
  1.5rem of clearance from the score steppers. A mis-tap here books a player who did
  nothing, so the separation is structural, not cosmetic.
- **Feedback:** `translateY(1px)` on press — the whole system's click feel. Disabled
  drops to 50% opacity (35% on counters). Focus is a 3px Pencil Yellow ring at 2px
  offset, on every interactive element, in both themes.

### Chips and Tags

- **Pill** (kit): Mist fill, 700 weight, 0.78rem. `live` inverts to navy on white;
  `done` to Good Green on white.
- **Tag** (board): uppercase 0.74rem on `glass-strong` with a translucent edge.
  `live` fills SCORES Red; `done` inverts to near-white on Board Navy; `ghost`
  drops to transparent with soft text. A live tag carries a 7px dot that pulses on
  a 1.9s cycle — suppressed entirely under `prefers-reduced-motion`.
- **Chip button / segmented control** (board): pill and 12px-radius respectively,
  resting on 5–6% white, going to solid white with Board Navy text when active.

### Cards and Containers

- **Kit card:** white, 1px hairline, 10px radius, 1rem padding, 0.9rem apart. `live`
  thickens the border to 2px navy; `done` drops to 72% opacity.
- **Admin panel:** white, no border, 14px radius, 1.6rem × 1.75rem padding, admin
  lift shadow, 1.5rem apart.
- **Glass panel:** see Elevation. Nested `.card`s inside a glass panel flatten
  completely — transparent, no border, no padding — because inside a panel the card
  *is* the panel, not a white box floating in one.

### Inputs and Fields

- **Style:** white fill, hairline border, 10px radius, full width, 48px minimum
  height (42px and 8px radius in the admin). Labels sit above in Soft Ink, 0.85rem,
  weight 600, mixed case.
- **Focus:** the Pencil Yellow ring. No colour-shift on the border alone — a ring
  is visible in sunlight where a 1px hue change is not.
- **Notices:** three tinted blocks with matching borders — error (`#fdecea` /
  `#7d241b`), ok (`#e8f6ee` / `#14603a`), pending (`#fff6e0` / `#7a5a00`). Pending
  is its own state because a queued offline write is neither success nor failure.
- **Select on the board:** 8%-white fill with a glass edge; the `option` list is
  drawn by the OS, so options are explicitly set to Board Navy on white.

### Navigation

- **App header:** navy bar, sticky, holding the AS-CHI logo at 34px, the event
  title, and up to three actions. It is the only route to signing in, so the action
  is always visible. Below 430px the subtitle disappears; below 560px the title
  drops to its own row and the actions stay on the first — the logo says where you
  are, the sign-in button must never wrap or be pushed off.
- **Admin tree:** collapsible parents at 42px with a rotating caret (0.12s),
  children indented behind a 2px hairline. An active child loses its fill and takes
  a 2px SCORES Red mark at the left edge instead.
- **Kit tabs:** a horizontally scrolling row, 42px tall, active tab filled navy.

### Signature Components

**The Spotlight.** The board's headline panel: kit, name, and cards on one centre
axis per side, a `clamp`ed scoreline between them, and a clock rule beneath. When
live it takes the red edge and its clock ticks in Live Pink. Empty, it centres a
line in 2.4rem of padding rather than collapsing. This is the one thing read from
across a room, and it is the only panel allowed to set type above 2rem.

**The Jersey.** The team's actual kit as a 3:4 image, because the real shirts carry
more than a colour — two JPMorganChase sides play in different divisions in orange
and royal blue, and three teams are in some shade of navy that a dot would make
identical. Renders *nothing* when a team has no kit on file: an empty space reads
as "not known", while a grey shirt reads as "they are wearing grey". 4.4–6.5rem in
the spotlight, 1.5em inline, always `aria-hidden` with the team name beside it.

**The Slot.** A game on the admin schedule grid: a 52px-minimum block with a 3px
left edge in navy. The edge carries the state — Alarm Red plus a pink wash for a
clash that must be fixed, amber for a warning that may be deliberate, dashed amber
for a game with no referee named. Another division's game dims to 45% rather than
hiding, because it is still occupying that pitch, and hiding it is what let two
tournaments be booked onto the same grass in the first place.

**The Unscored Hatch.** A 135° repeating stripe at 5% Soft Ink over any fixture
nobody has scored, with its dash dropped to 60%. "What is still outstanding" is the
question being asked at the scores table all afternoon, and the answer has to be
visible without clicking.

**The Field Board.** One stacked row per pitch, always stacked — never columns. The
row is constrained by the ~300px rail it sits in, not by the window, so a
width-based media query is the wrong test and was removed. A running pitch names
itself in Live Pink.

## Do's and Don'ts

### Do:

- **Do** keep the two themes whole. Light surfaces for the referee, participant, and
  admin views; the glass board only over the navy gradient, scoped under `.spectator`.
- **Do** set every changing number in tabular figures, at every size.
- **Do** give absence a visible form — an Unassigned row for a game with no pitch,
  italic amber for a missing referee, a hatch for an unscored game, nothing at all
  for an unknown kit.
- **Do** hold 48px touch targets in anything a referee uses outdoors, and 42px in
  the admin.
- **Do** put the Pencil Yellow focus ring on every interactive element in both
  themes, at 3px with 2px offset.
- **Do** let wide tables scroll inside `.table-scroll`, and write grid columns as
  `minmax(0, 1fr)`.
- **Do** state the consequence rather than the input — "35-minute slots → 9:00,
  9:35, 10:10" beats three number fields.
- **Do** suppress the pulse and the progress transition under
  `prefers-reduced-motion`.

### Don't:

- **Don't** put glass, blur, or the dark theme into the referee, participant, or
  admin views. Glass needs a deep background; a phone in August sun needs the
  opposite.
- **Don't** use SCORES Red for anything but a live match, or Alarm Red for anything
  but an error, a clash, or a red card.
- **Don't** borrow Card Yellow or the card shapes for unrelated UI states.
- **Don't** render an unentered score as `0`, or an entered `0` in the unentered
  treatment.
- **Don't** combine a hairline border and a drop shadow on the same surface.
- **Don't** set a heading, sentence, or button label in uppercase; uppercase stops
  at 0.9rem labels.
- **Don't** set the display face on a number that can change.
- **Don't** hide a game to filter a view — dim it. A hidden game is a game whose
  pitch clash nobody can see.
- **Don't** add height to the board above 1280px without taking it from somewhere
  else; the page does not scroll there.
- **Don't** rely on source order to win a CSS conflict in this project. Both the
  admin shell and the spectator board deliberately win on specificity, and the
  stylesheet says so in three places.
