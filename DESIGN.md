# Apex — OIO Racing design system

> **Authority is `packages/tokens/tokens.json`.** It carries the values *and*
> most rules as prose. This file is the readable map; when the two disagree, the
> token file wins and this file is the bug. Nothing downstream re-derives a
> colour, type step or spacing value.
>
> | file | what it is |
> |---|---|
> | `packages/tokens/tokens.json` | authority: values + rules |
> | `packages/video` Storybook, `Apex/Brand Guide` | the visual guide, section by section — rendered from the tokens, so it cannot drift |
> | `HANDOFF.md` | decisions and the *why*, dated |
> | `packages/video/README.md` | leaderboard data contract, caption rules |

## Overview

**Creative North Star: "Grit going in, spark coming out."** A dirt-and-daylight
racing brand that looks like the footage it comes from: hard edges, heavy type,
one colour that means something.

Apex is a dark brand and commits to it. Every surface it defines
is dark, and a surface needing to render light has to add light tokens to
`tokens.json` first, never invent a ground and a hairline locally. Structure
carries meaning: the corner label is the grammar everything else extends, rather
than each new component arriving with its own device. Restraint is the point —
one accent, spent where the payoff is.

**Key Characteristics:**

- Square corners everywhere; the circle is the only round thing and it is fully round
- One mood accent per piece, never two as co-headlines
- All-caps display and labels, enforced in renderers rather than left to callers
- Never italic, at any size, for any reason
- Measured, not eyeballed: contrast, widths and sizes are verified against real renders

## Colors

Dark grounds with a steel neutral family and two mood cores picked one at a
time. Contrast roles below are **measured**, recorded in `color.contrast` in the
token file, and are what each value can actually carry rather than what it was
nominally for.

### Grounds

- **Surface** (`#161412`): the page ground. The default Apex background.
- **Surface 2** (`#1e1b18`): raised panels and cards sitting on the ground.
- **Black** (`#000000`): full-bleed frames and video mattes.

### Neutrals

- **White** (`#ffffff`): primary text, and the boxed half of a corner label on a dark shot. 18.37:1 on Surface.
- **Steel Light** (`#9a9083`): muted labels, eyebrows, section markers, **and all secondary body text**. 5.85:1 on Surface.
- **Steel** (`#6b6355`): large text only (24px+), disabled states, decorative fills. 3.10:1 on Surface and 2.89:1 on Surface 2 — **never body text, and never on Surface 2 at all**.
- **Steel Dark** (`#3a342c`): hairlines, dividers, borders. 1.49:1 — never text, never a meaning-carrying icon.

### Mood cores

- **Spark** (`#F5C200`): payoff and victory. 11.02:1 on Surface, safe at any size.
- **Grit** (`#D2301E`): struggle and mechanical. 3.66:1 on Surface — large text only.

### Support

- **Rust** (`#E07020`): vintage and patina only. Not a mood pick.
- **Flag** (`#4C9F45`): confirmation and pricing signal only. Not a mood pick.

### Named Rules

**The One Accent Rule.** Pick Spark or Grit by mood and use exactly one per
piece. Never both as co-headline colours.

**The Spend It On The Payoff Rule.** The accent marks the thing that *is* the
payoff, never chrome. A page with Spark on its section numbers has none left for
its result.

**The Support Is Not A Mood Rule.** Rust is vintage and patina only, Flag is
confirmation and pricing signal only. Neither substitutes for a core.

**The Measured Contrast Rule.** Body text uses Steel Light. Steel fails AA for
body text on every Apex ground; it was documented as "secondary/muted body text"
until 2026-07-28 and never could carry it. Check `color.contrast` in the token
file before putting a value on text.

## Typography

**Character:** Heavy, wide, uppercase, and unapologetic. Helvetica does the
lifting at every size; the loud faces stay in their lanes. Emphasis comes from
weight, case and colour, never from a slant.

**Body Font:** Helvetica Neue (with Helvetica, Arial, sans-serif)

**Mono Font:** SF Mono (with Menlo, Consolas, monospace)

**Display Font:** Helvetica Neue (with Helvetica, Arial, sans-serif)

Two loud faces stay in their lanes and are never the display face: SignPainter
(vintage script, hero sizes only) and Helvetica Neue Condensed Black
(corner-label numerals and leaderboard digits only).

One scale, twelve rem steps, `caption` `0.75rem` through `heroXl` `10rem`, ~1.25
ratio hand-rounded. Every size is one of those steps. Fluid sizes clamp
*between two named steps* rather than inventing values in between.

### Hierarchy

- **Page heading** (Helvetica Neue, weight 700, uppercase, clamp(2.25rem 7vw 3.625rem), letter-spacing +0.01em, line-height 1.04): the heading for a document, balanced wrap.
- **Section heading** (Helvetica Neue, weight 700, 1.125rem, letter-spacing -0.01em): paired with a mono marker in a corner-label box.
- **Body** (Helvetica Neue, weight 400, 1rem, line-height 1.5): running text.
- **Caption** (Helvetica Neue, weight 400, 0.75rem): tables, notes and labels.
- **Data** (SF Mono, tabular-nums): anything with digits that line up in a column.

### Named Rules

**The Never Italic Rule.** Not for emphasis, not for an aside, not for an empty
state. Weight and colour carry emphasis. Worth a
`:where(i, em, cite) { font-style: normal }` backstop, since markdown and pasted
copy reintroduce it constantly.

**The Shipped Font Rule.** A face not shipped as a file does not exist. Renders
run in headless Chrome, which cannot see macOS system fonts, so an uninstalled
face looks right on a designer's Mac and silently falls back everywhere real.
Check `packages/tokens/fonts/` first. This has already put off-brand text on a
published reel.

**The Numerals Only Rule.** Condensed Black is for corner-label numerals and
leaderboard digits. Its display and punch role was retired 2026-07-28 in favour
of wide Helvetica Bold.

**The Positive Tracking Rule.** Heading tracking is positive. Tightening it
pulls back toward the condensed look the hero decision rejected.

**The Enforced Caps Rule.** Corner labels and captions uppercase in the
renderer, not by asking callers, and before text measurement since the box is
sized from the measured string and caps are wider.

## Elevation

Flat. Depth comes from surface steps and hairlines, not shadows.

- **Ground**: Surface `#161412`, no border
- **Raised**: Surface 2 `#1e1b18` with a 1px Steel Dark border
- **Boxed label**: a filled box that contrasts with its own ground, no border, no shadow

## Components

### Corner label

The system's signature device and the grammar to extend when new furniture needs
structure. Two flush parts, no gap: **left boxed, right plain**. The box sits on
the outer frame edge and contrasts with its own ground — white box on a dark
shot, black box on a light one. The plain side matches the frame.

Left is the fact (year + chassis + model, or event category), right is the name
or sub-fact (driver, car name, owner). If neither a car name nor an owner is
known, omit the right side or skip the label rather than guessing.

- **Shape:** two flush parts, no gap, square corners
- **Padding:** 0.32em 0.55em per part
- **Weight:** 700, all caps, enforced in the renderer
- **Box side:** contrasts with its own ground — white on a dark shot, black on a light one
- **Plain side:** matches the frame colour, not the box

### Section heading

A mono sequence marker in a corner-label box, then the title, with optional
right-aligned meta. Reuses the corner-label grammar so numbered sections read as
part of the system rather than a new device. The marker is a *box*, not an
accent chip — sequence numbers are not a payoff.

- **Marker:** mono, caption size, in a corner-label box
- **Title:** 1.125rem, weight 700
- **Meta:** optional, right-aligned, muted; drops to its own line below 34rem
- **Rule:** 1px Steel Dark under the whole heading

### The circle

Solid fill, never an outlined ring. Contrast-matched rather than defaulted:
black circle with white text on light grounds, white circle with black text on
dark. Scales from a single `--d`; optical centring is frozen as an em ratio per
glyph so it scales instead of being re-tuned per size.

- **Fill:** solid, never an outlined ring
- **Sizing:** everything derives from a single `--d`; change only that
- **Wordmark:** 0.36 · --d
- **Optical centring:** frozen as an em ratio per glyph so it scales

### Data table

Numeric columns are mono and right-aligned so digits line up down the column.

- **Numerals:** SF Mono with `tabular-nums`, right-aligned
- **Rules:** 1px Steel Dark between rows, none after the last
- **Striping:** none
- **Accent:** the winning or decisive row only
- **Overflow:** wrapped in an `overflow-x: auto` container so the page body never scrolls sideways

### Panel

A raised card for grouping related content on the ground.

- **Background:** Surface 2
- **Border:** 1px Steel Dark
- **Shape:** square corners
- **Grid:** `minmax(min(<rem>, 100%), 1fr)` — a bare rem minimum cannot shrink when the user raises their text size, which is a real overflow bug and not a theoretical one

## Do's and Don'ts

### Do

- Read values from `tokens.json` and nowhere else.
- Verify against a real render. Contrast, widths and text sizes have all been wrong when eyeballed.
- Extend the corner-label grammar when new furniture needs structure.
- Use rem-based breakpoints. They scale with the root font, so one rule covers a narrow phone and a normal phone at 200% text zoom.

### Don't

- Invent a light ground. Apex has none; add tokens first.
- Spend the accent on chrome.
- Declare a font the repo does not ship.
- Round a corner, or italicise anything.
- Put Steel `#6b6355` on text, or on Surface 2 at all.

## Audit findings, 2026-07-28

impeccable v4.0.1, against the recap build-record page and the token set. All fixed.

| # | dimension | finding | resolution |
|---|---|---|---|
| 1 | a11y | Steel documented as body text, fails AA on every ground | role corrected in tokens and guide; `color.contrast` added |
| 2 | a11y | no `<main>` landmark, nav and sections unlabelled | landmarks and ARIA added |
| 3 | responsive | nav touch targets 29px | 44px minimum |
| 4 | responsive | 202px overflow at 200% text zoom | `minmax(min(17rem, 100%), 1fr)` |
| 5 | responsive | nowrap chip in an `auto` track escaped the viewport | stacks below `30rem` |
| 6 | theming | — | clean; every hex traces to `tokens.json` |
| 7 | integrity | — | clean; detector reports no findings |

Findings 1 was **system-level**: any surface following the guide inherited it.

## Known gaps

- **No `PRODUCT.md`.** Blocks impeccable's `shape` and `init` flows; refinement commands proceed without it.
- **No light mode.** Deliberate. Adding one means adding tokens, not guessing hexes.
- **Voice & tone** (guide section 07) was never written. Caption voice lives in Brains and `.claude/skills/oio-social-post/`.
- **Spark 700** is 4.46:1 on Surface 2 — clears AA on the ground, just misses it on panels. Avoid for small text there.
